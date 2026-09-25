import type { TimerAction, TimerResult, TimerState, TimerUpdate } from '../types/rooms.js'
import { memoryTimerStore, type TimerStore } from './timer-store.js'

const durations = { focus: 25 * 60, break: 5 * 60 }

export function remainingSeconds(timer: TimerState, now: number) {
  const elapsed = timer.status === 'running' && timer.startedAt !== null ? Math.max(0, now - timer.startedAt) / 1000 : 0
  return Math.max(0, timer.remainingSeconds - elapsed)
}

export function createTimers(broadcast: (update: TimerUpdate) => void, now = () => Date.now(), store: TimerStore = memoryTimerStore()) {
  const states = new Map<string, TimerState>()
  const timeouts = new Map<string, ReturnType<typeof setTimeout>>()
  const pending = new Map<string, Promise<unknown>>()
  let closed = false

  function serialize<T>(roomCode: string, operation: () => Promise<T>): Promise<T> {
    if (closed) return Promise.reject(new Error('Timer service is closed'))
    const task = (pending.get(roomCode) || Promise.resolve()).catch(() => {}).then(operation)
    pending.set(roomCode, task)
    const cleanup = () => { if (pending.get(roomCode) === task) pending.delete(roomCode) }
    void task.then(cleanup, cleanup)
    return task
  }
  function cancel(roomCode: string) {
    clearTimeout(timeouts.get(roomCode))
    timeouts.delete(roomCode)
  }
  function update(roomCode: string, timer: TimerState): TimerUpdate {
    return { roomCode, timer: { ...timer }, serverNow: now() }
  }
  function schedule(roomCode: string, timer: TimerState, retry = false) {
    cancel(roomCode)
    if (closed || timer.status !== 'running') return
    const timeout = setTimeout(() => {
      timeouts.delete(roomCode)
      void serialize(roomCode, () => read(roomCode)).catch(error => {
        console.error('Timer completion failed', error)
        if (!closed) schedule(roomCode, timer, true)
      })
    }, retry ? 1000 : Math.max(1, Math.ceil(remainingSeconds(timer, now()) * 1000)))
    timeout.unref()
    timeouts.set(roomCode, timeout)
  }
  async function commit(roomCode: string, timer: TimerState) {
    // Acknowledgements and broadcasts must never advertise a state that was not saved.
    await store.save(roomCode, timer)
    states.set(roomCode, timer)
    schedule(roomCode, timer)
    const state = update(roomCode, timer)
    if (!closed) broadcast(state)
    return state
  }
  async function read(roomCode: string): Promise<TimerState> {
    let timer = states.get(roomCode)
    if (!timer) {
      timer = await store.load(roomCode) || {
        mode: 'focus', status: 'paused', durationSeconds: durations.focus,
        remainingSeconds: durations.focus, startedAt: null, revision: 0,
      }
      states.set(roomCode, timer)
    }
    if (timer.status === 'running' && remainingSeconds(timer, now()) === 0) {
      const mode = timer.mode === 'focus' ? 'break' : 'focus'
      timer = { mode, status: 'paused', durationSeconds: durations[mode], remainingSeconds: durations[mode], startedAt: null, revision: timer.revision + 1 }
      await commit(roomCode, timer)
    } else {
      schedule(roomCode, timer)
    }
    return timer
  }
  function snapshot(roomCode: string) {
    return serialize(roomCode, async () => update(roomCode, await read(roomCode)))
  }
  function act(roomCode: string, action: TimerAction): Promise<TimerResult> {
    return serialize(roomCode, async () => {
      const timer = { ...await read(roomCode) }
      if (action === 'start' && timer.status === 'running') return { success: false, error: 'TIMER_ALREADY_RUNNING' }
      if (action === 'pause' && timer.status === 'paused') return { success: false, error: 'TIMER_ALREADY_PAUSED' }
      if (action === 'start') {
        timer.status = 'running'
        timer.startedAt = now()
      } else {
        timer.remainingSeconds = action === 'reset' ? timer.durationSeconds : remainingSeconds(timer, now())
        timer.status = 'paused'
        timer.startedAt = null
      }
      timer.revision++
      return { success: true, state: await commit(roomCode, timer) }
    })
  }
  return {
    snapshot, act,
    restore: async () => { for (const code of await store.runningRooms()) await snapshot(code) },
    dispose: async () => {
      closed = true
      for (const code of timeouts.keys()) cancel(code)
      await Promise.allSettled(pending.values())
      states.clear()
    },
  }
}
