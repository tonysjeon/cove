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
    <form onSubmit={submit} className="create-room">
      <h2>Join a room</h2>
      <label htmlFor="room-code">Room code</label>
      <input id="room-code" value={code} onChange={event => setCode(event.target.value)}
        required autoCapitalize="characters" spellCheck={false} placeholder="ABC234" />
      <button type="submit">Find room</button>
      {error && <p role="alert">{error}</p>}
    </form>
  )
}
