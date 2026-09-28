import { useEffect, useRef, useState, type FormEvent } from 'react'
import CoveBuddy from './CoveBuddy'

const greetings = ['Welcome', 'What’s your name?']

type Props = {
  name: string
  status: string
  error: string
  connected: boolean
  onNameChange: (name: string) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
}

export default function RoomWelcome({ name, status, error, connected, onNameChange, onSubmit }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [messageIndex, setMessageIndex] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 1 : 0)

  useEffect(() => {
    inputRef.current?.focus({ preventScroll: true })
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
    const greeting = window.setTimeout(() => setMessageIndex(1), 1500)
    const finish = () => {
      if (!reducedMotion.matches) return
      window.clearTimeout(greeting)
      setMessageIndex(1)
    }
    finish()
    reducedMotion.addEventListener('change', finish)
    return () => {
      window.clearTimeout(greeting)
      reducedMotion.removeEventListener('change', finish)
    }
  }, [])

  return (
    <div className="room-welcome">
      <h2 className="sr-only" id="welcome-title">Join room</h2>
      <div className="welcome-greeting">
        <CoveBuddy />
        <div className="welcome-messages" aria-live="polite" aria-atomic="true">
          {greetings.map((message, index) => (
            <div className={`welcome-speech${index === messageIndex ? ' is-active' : ''}`} key={message} aria-hidden={index !== messageIndex}>
              <p>{message}</p>
            </div>
          ))}
        </div>
      </div>
      <form onSubmit={onSubmit} className="room-form">
        <label className="sr-only" htmlFor="display-name">Display name</label>
        <input ref={inputRef} id="display-name" aria-invalid={!!error} aria-describedby={error ? 'name-error' : undefined}
          value={name} onChange={event => onNameChange(event.target.value)} maxLength={30} required autoComplete="off"
          placeholder="Display name" disabled={!!status} />
        {error && <p id="name-error" role="alert">{error}</p>}
        <p className="welcome-status" role="status">{status || (!connected ? 'Connecting to your room…' : '')}</p>
        <div className="welcome-actions">
          {name.trim() && <button type="submit" disabled={!connected || !!status}>{status ? 'Joining…' : 'Join room'} <span aria-hidden="true">→</span></button>}
        </div>
      </form>
    </div>
  )
}
