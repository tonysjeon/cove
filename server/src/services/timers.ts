import type { TimerAction, TimerResult, TimerState, TimerUpdate } from '../types/rooms.js'

const durations = { focus: 25 * 60, break: 5 * 60 }

export function remainingSeconds(timer: TimerState, now: number) {
  const elapsed = timer.status === 'running' && timer.startedAt !== null ? Math.max(0, now - timer.startedAt) / 1000 : 0
  return Math.max(0, timer.remainingSeconds - elapsed)
}

export function createTimers(broadcast: (update: TimerUpdate) => void, now = () => Date.now()) {
  const states = new Map<string, TimerState>()
  const timeouts = new Map<string, ReturnType<typeof setTimeout>>()
  function cancel(roomCode: string) {
    clearTimeout(timeouts.get(roomCode))
    timeouts.delete(roomCode)
  }
  function read(roomCode: string): TimerState {
    let timer = states.get(roomCode)
    if (!timer) {
      timer = { mode: 'focus', status: 'paused', durationSeconds: durations.focus, remainingSeconds: durations.focus, startedAt: null, revision: 0 }
      states.set(roomCode, timer)
    }
    if (timer.status === 'running' && remainingSeconds(timer, now()) === 0) {
      cancel(roomCode)
      const mode = timer.mode === 'focus' ? 'break' : 'focus'
      timer = { mode, status: 'paused', durationSeconds: durations[mode], remainingSeconds: durations[mode], startedAt: null, revision: timer.revision + 1 }
      states.set(roomCode, timer)
      broadcast({ roomCode, timer: { ...timer }, serverNow: now() })
    }
    return timer
  }
  function snapshot(roomCode: string): TimerUpdate {
    return { roomCode, timer: { ...read(roomCode) }, serverNow: now() }
  }
  function schedule(roomCode: string) {
    cancel(roomCode)
    const timer = read(roomCode)
    if (timer.status !== 'running') return
    const timeout = setTimeout(() => {
      timeouts.delete(roomCode)
      // Recheck timestamps if the timeout fired early or the wall clock moved.
      if (read(roomCode).status === 'running') schedule(roomCode)
    }, Math.ceil(remainingSeconds(timer, now()) * 1000))
    timeout.unref()
    timeouts.set(roomCode, timeout)
  }
  function act(roomCode: string, action: TimerAction): TimerResult {
    const timer = read(roomCode)
    if (action === 'start' && timer.status === 'running') return { success: false, error: 'TIMER_ALREADY_RUNNING' }
    if (action === 'pause' && timer.status === 'paused') return { success: false, error: 'TIMER_ALREADY_PAUSED' }
    cancel(roomCode)
    if (action === 'start') {
      timer.status = 'running'
      timer.startedAt = now()
    } else {
      timer.remainingSeconds = action === 'reset' ? timer.durationSeconds : remainingSeconds(timer, now())
      timer.status = 'paused'
      timer.startedAt = null
    }
    timer.revision++
    if (timer.status === 'running') schedule(roomCode)
    const state = snapshot(roomCode)
    broadcast(state)
    return { success: true, state }
  }
  return { snapshot, act, dispose: () => { for (const room of timeouts.keys()) cancel(room); states.clear() } }
}
