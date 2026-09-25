import { useState, type FormEvent } from 'react'
import { apiUrl } from '../config'

export default function CreateRoom() {
  const [name, setName] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return
    const trimmedName = name.trim()
    if (!trimmedName || trimmedName.length > 80) {
      setError('Enter a room name between 1 and 80 characters')
      return
    }
    setPending(true)
    setError('')
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10000)
    try {
      const response = await fetch(`${apiUrl}/api/rooms`, {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmedName }),
      })
      if (!response.ok) throw new Error('Could not create your room — please try again')
      const room: unknown = await response.json()
      if (!room || typeof room !== 'object' || !('code' in room) ||
          typeof room.code !== 'string' || !/^[A-HJ-NP-Z2-9]{6}$/.test(room.code)) {
        throw new Error('The server returned an invalid room code')
      }
      window.location.assign(`/room/${room.code}`)
    } catch (error) {
      setError(controller.signal.aborted ? 'We couldn’t confirm your room was created — please try again' : error instanceof Error ? error.message : 'Could not create your room')
      setPending(false)
    } finally {
      clearTimeout(timeout)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="room-form" aria-labelledby="create-title">
      <div className="form-heading"><span className="section-mark" aria-hidden="true">+</span><h2 id="create-title">Make a little space</h2><p>Start a room and invite your favorite people.</p></div>
      <label htmlFor="room-name">Room name</label>
      <input id="room-name" aria-invalid={!!error} aria-describedby={error ? 'create-error' : undefined} value={name} onChange={event => setName(event.target.value)}
        maxLength={80} required placeholder="e.g. The afternoon club" disabled={pending} />
      <button type="submit" disabled={pending}>{pending ? 'Creating…' : 'Create room'}</button>
      {error && <p id="create-error" role="alert">{error}</p>}
    </form>
  )
}
