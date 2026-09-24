import { useEffect, useState, type FormEvent } from 'react'
import { apiUrl } from '../config'
import { socket } from '../socket/socket'
import type { Room, JoinResult } from '../../../server/src/types/rooms'

const errors: Record<Extract<JoinResult, { success: false }>['error'], string> = {
  INVALID_ROOM_CODE: 'Enter a valid six-character room code',
  INVALID_DISPLAY_NAME: 'Enter a display name between 1 and 30 characters',
  ROOM_NOT_FOUND: 'This room does not exist',
  JOIN_FAILED: 'Unable to join the room — please try again',
}

function savedName(roomCode: string) {
  try { return sessionStorage.getItem(`cove:name:${roomCode}`) || '' } catch { return '' }
}

export default function RoomPage({ roomCode }: { roomCode: string }) {
  const [room, setRoom] = useState<Room | null>(null)
  const [loadError, setLoadError] = useState('')
  const [name, setName] = useState(() => savedName(roomCode))
  const [requestedName, setRequestedName] = useState('')
  const [joinedName, setJoinedName] = useState('')
  const [status, setStatus] = useState('')
  const [joinError, setJoinError] = useState('')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    let active = true
    async function loadRoom() {
      try {
        const response = await fetch(`${apiUrl}/api/rooms/${encodeURIComponent(roomCode)}`, {
          signal: controller.signal,
        })
        if (response.status === 404) throw new Error('This room does not exist')
        if (response.status === 400) throw new Error('This room code is invalid')
        if (!response.ok) throw new Error('Unable to load the room — please refresh to try again')
        const data = await response.json() as Room
        if (active) { setRoom(data); setRequestedName(savedName(roomCode)) }
      } catch (error) {
        if (active) setLoadError(error instanceof Error ? error.message : 'Unable to load the room')
      }
    }
    void loadRoom()
    return () => { active = false; controller.abort() }
  }, [roomCode])

  useEffect(() => {
    if (!room || !requestedName) return
    let active = true
    let generation = 0
    function join() {
      const current = ++generation
      setJoinedName('')
      setStatus('Joining room…')
      setJoinError('')
      socket.timeout(8000).emit('room:join', { roomCode, displayName: requestedName }, (error, result) => {
        if (!active || current !== generation) return
        setStatus('')
        if (error) { setJoinError('Joining timed out — please try again'); return }
        if (!result.success) { setJoinError(errors[result.error]); return }
        setJoinedName(result.displayName)
        try { sessionStorage.setItem(`cove:name:${roomCode}`, result.displayName) } catch { /* Storage is optional. */ }
      })
    }
    function disconnected() {
      generation++
      setJoinedName('')
      setStatus('Disconnected — waiting to rejoin…')
    }
    socket.on('connect', join)
    socket.on('disconnect', disconnected)
    if (socket.connected) join()
    else setStatus('Waiting for a connection…')
    return () => {
      active = false
      socket.off('connect', join)
      socket.off('disconnect', disconnected)
    }
  }, [room, roomCode, requestedName, attempt])

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const displayName = name.trim()
    if (!displayName || displayName.length > 30) {
      setJoinError(errors.INVALID_DISPLAY_NAME)
      return
    }
    setRequestedName(displayName)
    setAttempt(value => value + 1)
  }

  return (
    <section>
      {loadError ? <p role="alert">{loadError}</p> : !room ? <p role="status">Loading room…</p> : <>
        <h2>{room.name}</h2>
        <p>Room {room.code}</p>
        {joinedName ? <p role="status">Joined as {joinedName}</p> : <form onSubmit={submit} className="create-room">
          <label htmlFor="display-name">Display name</label>
          <input id="display-name" value={name} onChange={event => setName(event.target.value)} maxLength={30} required />
          <button type="submit" disabled={!socket.connected || !!status}>Join room</button>
        </form>}
        {status && <p role="status">{status}</p>}
        {joinError && <p role="alert">{joinError}</p>}
      </>}
      <p><a href="/">Back to home</a></p>
    </section>
  )
}
