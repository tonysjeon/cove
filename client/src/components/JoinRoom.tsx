import { useState, type FormEvent } from 'react'

export default function JoinRoom() {
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const roomCode = code.trim().toUpperCase()
    if (!/^[A-HJ-NP-Z2-9]{6}$/.test(roomCode)) {
      setError('Enter a valid six-character room code')
      return
    }
    window.location.assign(`/room/${roomCode}`)
  }
  return (
    <form onSubmit={submit} className="room-form" aria-labelledby="join-title">
      <div className="form-heading"><h2 id="join-title">Already have a room?</h2><p>Pull up a chair. Your friends are waiting.</p></div>
      <label htmlFor="room-code">Room code</label>
      <input id="room-code" aria-invalid={!!error} aria-describedby={error ? 'code-error' : undefined} value={code} onChange={event => setCode(event.target.value)}
        className="code-input" required autoCapitalize="characters" spellCheck={false} placeholder="ABC234" />
      <button className="button-secondary" type="submit">Find room <span aria-hidden="true">→</span></button>
      {error && <p id="code-error" role="alert">{error}</p>}
    </form>
  )
}
