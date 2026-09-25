import { getPrisma } from '../db/prisma.js'
import type { TimerState } from '../types/rooms.js'

export interface TimerStore {
  load(roomCode: string): Promise<TimerState | null>
  save(roomCode: string, timer: TimerState): Promise<void>
  runningRooms(): Promise<string[]>
}

export function memoryTimerStore(): TimerStore {
  const timers = new Map<string, TimerState>()
  return {
    load: async code => timers.has(code) ? { ...timers.get(code)! } : null,
    save: async (code, timer) => { timers.set(code, { ...timer }) },
    runningRooms: async () => [...timers].filter(([, timer]) => timer.status === 'running').map(([code]) => code),
  }
}

export const postgresTimerStore: TimerStore = {
  async load(code) {
    const record = await getPrisma().timerState.findFirst({ where: { room: { code } } })
    if (!record) return null
    if (!['focus', 'break'].includes(record.mode) || !['running', 'paused'].includes(record.status)) {
      throw new Error('Invalid persisted timer state')
    }
    return {
      mode: record.mode as TimerState['mode'], status: record.status as TimerState['status'],
      durationSeconds: record.durationSeconds, remainingSeconds: record.remainingSeconds,
      startedAt: record.startedAt?.getTime() ?? null, revision: record.revision,
    }
  },
  async save(code, timer) {
    const room = await getPrisma().room.findUniqueOrThrow({ where: { code }, select: { id: true } })
    const data = { ...timer, startedAt: timer.startedAt === null ? null : new Date(timer.startedAt) }
    await getPrisma().timerState.upsert({ where: { roomId: room.id }, create: { ...data, roomId: room.id }, update: data })
  },
  async runningRooms() {
    const timers = await getPrisma().timerState.findMany({ where: { status: 'running' }, select: { room: { select: { code: true } } } })
    return timers.map(timer => timer.room.code)
  },
}
