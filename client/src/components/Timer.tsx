import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { socket } from '../socket/socket'
import StudyBackdrop from './StudyBackdrop'
import type { TimerAction, TimerUpdate } from '../../../server/src/types/rooms'

type ReceivedTimer = { update: TimerUpdate; receivedAt: number }

export default function Timer({ roomCode, joined, children, stereo }: { roomCode: string; joined: boolean; children?: ReactNode; stereo?: ReactNode }) {
  const progressGradient = useId()
  const [received, setReceived] = useState<ReceivedTimer | null>(null)
  const [now, setNow] = useState(() => performance.now())
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const inFlight = useRef(false)
  const generation = useRef(0)

  function receive(update: TimerUpdate) {
    if (update.roomCode !== roomCode) return
    const receivedAt = performance.now()
    setReceived(previous => previous && previous.update.timer.revision > update.timer.revision
      ? previous : { update, receivedAt })
    setNow(receivedAt)
  }

  useEffect(() => {
    function clear() {
      generation.current++
      inFlight.current = false
      setPending(false)
      setReceived(null)
      setError('')
    }
    socket.on('timer:state', receive)
    socket.on('disconnect', clear)
    return () => {
      generation.current++
      socket.off('timer:state', receive)
      socket.off('disconnect', clear)
    }
  }, [roomCode])

  const timer = received?.update.timer
  useEffect(() => {
    if (!joined || timer?.status !== 'running') return
    const interval = window.setInterval(() => setNow(performance.now()), 200)
    return () => window.clearInterval(interval)
  }, [joined, timer?.status])

  function act(action: TimerAction) {
    if (!joined || !socket.connected || inFlight.current) return
    inFlight.current = true
    setPending(true)
    setError('')
    const current = generation.current
    socket.timeout(5000).emit(`timer:${action}`, { roomCode }, (failure, result) => {
      if (current !== generation.current) return
      inFlight.current = false
      setPending(false)
      if (failure) { setError('Timer update was not confirmed — check the timer before trying again'); return }
      if (!result.success) {
        setError(result.error === 'NOT_IN_ROOM' ? 'Rejoin the room to control the timer'
          : result.error === 'TIMER_ALREADY_RUNNING' ? 'The timer is already running'
          : result.error === 'TIMER_ALREADY_PAUSED' ? 'The timer is already paused' : 'Could not update the timer')
        return
      }
      receive(result.state)
    })
  }

  if (!joined) return null
  if (!received || !timer) return <div className="timer timer-loading" role="status">Getting the timer ready…</div>
  // Anchor to server time on receipt, then use a monotonic browser clock.
  const elapsedAtReceipt = timer.status === 'running' && timer.startedAt !== null
    ? Math.max(0, received.update.serverNow - timer.startedAt) : 0
  const elapsedSinceReceipt = timer.status === 'running' ? Math.max(0, now - received.receivedAt) : 0
  const seconds = Math.max(0, Math.ceil(timer.remainingSeconds - (elapsedAtReceipt + elapsedSinceReceipt) / 1000))
  const progress = Math.min(100, Math.max(0, (1 - seconds / timer.durationSeconds) * 100))
  const display = `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`
  return (
    <section className={`timer ${timer.mode === 'break' ? 'is-break' : ''}`} aria-label="Shared Pomodoro timer">
      <div className="study-stage">
      <StudyBackdrop />
      <div className="timer-body">
      <div className="alarm-clock">
        <svg className="alarm-clock-hardware" viewBox="0 0 260 280" fill="none" aria-hidden="true">
          <path d="m62 230-14 46M198 230l14 46M78 48 61 28m121 20 17-20M130 44V11" stroke="var(--room-wood)" strokeWidth="10" strokeLinecap="round" />
          <path d="M23 44C17 23 29 4 49 3c18-2 34 2 45 12Z" fill="var(--room-clock)" /><path d="M166 15c11-10 27-14 45-12 20 1 32 20 26 41Z" fill="var(--room-clock)" />
          <path d="M117 9h26" stroke="var(--room-clock)" strokeWidth="9" strokeLinecap="round" />
        </svg>
        <div className="timer-dial">
        <svg className="timer-ring" viewBox="0 0 320 320" role="progressbar" aria-label="Session progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.floor(progress)} aria-valuetext={`${Math.floor(progress)} percent complete`}>
          <defs><linearGradient id={progressGradient} x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="var(--progress-start)" /><stop offset="100%" stopColor="var(--progress-end)" /></linearGradient></defs>
          <circle className="timer-ring-track" cx="160" cy="160" r="150" />
          <circle className="timer-ring-fill" stroke={`url(#${progressGradient})`} cx="160" cy="160" r="150" pathLength="100" strokeDasharray="100 100" strokeDashoffset={100 - progress} opacity={progress > 0 ? 1 : 0} transform="rotate(-90 160 160)" />
        </svg>
        <p className="timer-value" role="timer" aria-label={`${timer.mode} time remaining`}>{display}</p>
        <h2 className="clock-mode">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">{timer.mode === 'focus'
            ? <><path d="M4 14v-3a8 8 0 0 1 16 0v3" /><rect x="3" y="12" width="4" height="8" rx="2" /><rect x="17" y="12" width="4" height="8" rx="2" /></>
            : <><path d="M5 9h12v6a5 5 0 0 1-5 5h-2a5 5 0 0 1-5-5V9Zm12 1h2a3 3 0 0 1 0 6h-2M8 3v3m5-3v3M4 22h15" /></>}
          </svg>
          {timer.mode === 'focus' ? 'Focus' : 'Break'}
        </h2>
        </div>
      </div>
      <div className="study-desk" aria-hidden="true"><span /><span /></div>
      <div className="timer-controls">
        <button className="timer-toggle" type="button" disabled={pending} onClick={() => act(timer.status === 'running' ? 'pause' : 'start')}>
          <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">{timer.status === 'running'
            ? <><path d="M7 5v10M13 5v10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" /></>
            : <path d="m7 4 9 6-9 6V4Z" fill="currentColor" />}
          </svg>
          {timer.status === 'running' ? 'Pause' : 'Start'}
        </button>
        <button className="timer-reset button-quiet" type="button" disabled={pending} onClick={() => act('reset')} aria-label="Reset timer" title="Reset timer">
          <svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M4 7a6 6 0 1 1 0 6M4 3v4h4" /></svg>
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
      </div>
      {stereo}
      </div>
      {children}
    </section>
  )
}
