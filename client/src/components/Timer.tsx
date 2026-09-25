import { useEffect, useRef, useState } from 'react'
import { socket } from '../socket/socket'
import type { TimerAction, TimerUpdate } from '../../../server/src/types/rooms'

type ReceivedTimer = { update: TimerUpdate; receivedAt: number }

export default function Timer({ roomCode, joined }: { roomCode: string; joined: boolean }) {
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
  if (!received || !timer) return <p className="timer-status" role="status">Loading shared timer…</p>
  // Anchor to server time on receipt, then use a monotonic browser clock.
  const elapsedAtReceipt = timer.status === 'running' && timer.startedAt !== null
    ? Math.max(0, received.update.serverNow - timer.startedAt) : 0
  const elapsedSinceReceipt = timer.status === 'running' ? Math.max(0, now - received.receivedAt) : 0
  const seconds = Math.max(0, Math.ceil(timer.remainingSeconds - (elapsedAtReceipt + elapsedSinceReceipt) / 1000))
  const display = `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`
  return (
    <section className={`timer ${timer.mode === 'break' ? 'is-break' : ''}`} aria-label="Shared Pomodoro timer">
      <div className="timer-heading"><span className="eyebrow">A moment, together</span><h2>{timer.mode === 'focus' ? 'Time to focus' : 'Take a breather'}</h2></div>
      <p className="timer-value" role="timer" aria-label={`${timer.mode} time remaining`}>{display}</p>
      <p className="timer-status" role="status">{seconds === 0 && timer.status === 'running' ? 'Waiting for the next session…' : timer.status === 'running' ? 'You’ve got this' : 'Ready when you are'}</p>
      <div className="timer-controls">
        <button type="button" disabled={pending || timer.status === 'running'} onClick={() => act('start')}>Start</button>
        <button className="button-secondary" type="button" disabled={pending || timer.status === 'paused'} onClick={() => act('pause')}>Pause</button>
        <button className="button-quiet" type="button" disabled={pending} onClick={() => act('reset')}>Reset</button>
      </div>
      <p className="timer-caption">25 min focus <span aria-hidden="true">·</span> 5 min break</p>
      {error && <p role="alert">{error}</p>}
    </section>
  )
}
