import type { Room } from '../types/rooms.js'

export const ROOM_LIFETIME_MS = 24 * 60 * 60 * 1000
export class RoomClosedError extends Error {
  constructor() { super('This room has closed'); this.name = 'RoomClosedError' }
}
export interface RoomLifetimeStore {
  read(code: string): Promise<(Room & { expiresAt: Date | null }) | null>
  reserved(code: string): Promise<boolean>
  occupied(code: string): Promise<void>
  empty(code: string, expiresAt: Date): Promise<void>
  recover(expiresAt: Date): Promise<void>
  expired(now: Date): Promise<string[]>
  remove(code: string, now: Date): Promise<void>
}

// One coordinator per backend process serializes joins, presence writes, and expiry.
export function createRoomLifetime(store: RoomLifetimeStore, options: {
  occupied: (code: string) => boolean
  remove: (code: string, remove: () => Promise<void>) => Promise<void>
  now?: () => number
}) {
  const now = options.now ?? Date.now
  const pending = new Map<string, Promise<unknown>>()
  const dirty = new Map<string, number>()
  let interval: ReturnType<typeof setInterval> | undefined
  let sweeping: Promise<void> | undefined
  let closed = false
  function serialize<T>(code: string, operation: () => Promise<T>): Promise<T> {
    if (closed) return Promise.reject(new Error('Room lifetime service is closed'))
    const task = (pending.get(code) ?? Promise.resolve()).catch(() => {}).then(operation)
    pending.set(code, task)
    const cleanup = () => { if (pending.get(code) === task) pending.delete(code) }
    void task.then(cleanup, cleanup)
    return task
  }
  async function reconcile(code: string, emptySince: number) {
    try {
      if (options.occupied(code)) await store.occupied(code)
      else await store.empty(code, new Date(emptySince + ROOM_LIFETIME_MS))
      dirty.delete(code)
    } catch (error) {
      if (!dirty.has(code)) dirty.set(code, emptySince)
      throw error
    }
  }
  async function read(code: string) {
    const room = await store.read(code)
    if (!room) {
      if (await store.reserved(code)) throw new RoomClosedError()
      return null
    }
    if (room.expiresAt && room.expiresAt.getTime() <= now() && !options.occupied(code)) {
      await options.remove(code, () => store.remove(code, new Date(now())))
      throw new RoomClosedError()
    }
    return { code: room.code, name: room.name }
  }
  function presence(code: string) {
    const emptySince = now()
    const wasOccupied = options.occupied(code)
    return serialize(code, async () => {
      // A delayed join notification must not start the empty countdown using
      // its old timestamp; the actual leave notification owns that deadline.
      if (!wasOccupied || options.occupied(code)) await reconcile(code, dirty.get(code) ?? emptySince)
    })
  }
  async function sweep() {
    if (closed) return
    if (sweeping) return sweeping
    sweeping = (async () => {
      for (const [code, since] of dirty) await serialize(code, () => reconcile(code, since))
      for (const code of await store.expired(new Date(now()))) {
        await serialize(code, async () => {
          if (options.occupied(code)) { await reconcile(code, now()); return }
          try { await read(code) } catch (error) { if (!(error instanceof RoomClosedError)) throw error }
        })
      }
    })()
    try { await sweeping } finally { sweeping = undefined }
  }
  return {
    lookup: (code: string) => serialize(code, () => read(code)),
    async join(code: string, operation: (room: Room) => Promise<void>) {
      return serialize(code, async () => {
        const room = await read(code)
        if (!room) return false
        await store.occupied(code)
        dirty.delete(code)
        try { await operation(room) }
        finally { if (!options.occupied(code)) await reconcile(code, now()) }
        return true
      })
    },
    presence, sweep,
    async initialize() {
      // Empty-room deadlines survive restarts. Previously occupied rooms receive
      // a fresh empty-room deadline so reconnects cannot race startup cleanup.
      await store.recover(new Date(now() + ROOM_LIFETIME_MS))
      interval = setInterval(() => { void sweep().catch(error => console.error('Room cleanup failed', error)) }, 60_000)
      interval.unref()
    },
    async dispose() {
      clearInterval(interval)
      // Let a sweep finish before preventing it from enqueueing more work.
      await sweeping?.catch(() => {})
      closed = true
      await Promise.allSettled(pending.values())
    },
  }
}
