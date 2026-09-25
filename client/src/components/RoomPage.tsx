import { useEffect, useState, type FormEvent } from 'react'
import Chat from './Chat'
import { joinRoomSession } from '../socket/room-session'
import Timer from './Timer'
import { apiUrl } from '../config'
import { socket } from '../socket/socket'
import type { Room, JoinResult, ConnectedUser, Presence } from '../../../server/src/types/rooms'

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
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [name, setName] = useState(() => savedName(roomCode))
  const [requestedName, setRequestedName] = useState('')
  const [joinedName, setJoinedName] = useState('')
  const [status, setStatus] = useState('')
  const [joinError, setJoinError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [members, setMembers] = useState<ConnectedUser[]>([])

  useEffect(() => {
    function presence(update: Presence) {
      if (update.roomCode === roomCode) setMembers(update.members)
    }
    const clear = () => setMembers([])
    socket.on('room:presence', presence)
    socket.on('disconnect', clear)
    return () => {
      socket.off('room:presence', presence)
      socket.off('disconnect', clear)
    }
  }, [roomCode])

  useEffect(() => {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 8000)
    let active = true
    let loaded = false
    setLoadError('')
    async function loadRoom() {
      try {
        const response = await fetch(`${apiUrl}/api/rooms/${encodeURIComponent(roomCode)}`, {
          signal: controller.signal,
        })
        if (response.status === 404) throw new Error('This room does not exist')
        if (response.status === 400) throw new Error('This room code is invalid')
        if (!response.ok) throw new Error('Unable to load the room — please try again')
        const data = await response.json() as Room
        if (active) { loaded = true; setRoom(data); setRequestedName(savedName(roomCode)) }
      } catch (error) {
        if (active) setLoadError(controller.signal.aborted ? 'Loading timed out — please try again' : error instanceof Error ? error.message : 'Unable to load the room')
      } finally {
        clearTimeout(timeout)
      }
    }
    void loadRoom()
    const retryLoad = () => { if (!loaded) setLoadAttempt(value => value + 1) }
    socket.on('connect', retryLoad)
    return () => { active = false; clearTimeout(timeout); controller.abort(); socket.off('connect', retryLoad) }
  }, [roomCode, loadAttempt])

  useEffect(() => {
    if (!room || !requestedName) return
    return joinRoomSession(socket, roomCode, requestedName, {
      waiting(status) {
        setJoinedName('')
        setMembers([])
        setStatus(status)
        setJoinError('')
      },
      result(result) {
        setStatus('')
        if (!result.success) { setJoinError(errors[result.error]); return }
        setJoinedName(result.displayName)
        try { sessionStorage.setItem(`cove:name:${roomCode}`, result.displayName) } catch { /* Storage is optional. */ }
      },
    })
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

  function leave() {
    try { sessionStorage.removeItem(`cove:name:${roomCode}`) } catch { /* Storage is optional. */ }
    setRequestedName('')
    setJoinedName('')
    setMembers([])
    setStatus('Leaving room…')
    // Disconnect even if acknowledgement is lost, so leaving cannot trigger a rejoin.
    socket.timeout(3000).emit('room:leave', () => {
      socket.disconnect()
      window.location.assign('/')
    })
  }

  return (
    <section>
      {loadError ? <p role="alert">{loadError} <button type="button" onClick={() => setLoadAttempt(value => value + 1)}>Retry room</button></p> : !room ? <p role="status">Loading room…</p> : <>
        <h2>{room.name}</h2>
        <p>Room {room.code}</p>
        <Timer key={`timer:${roomCode}`} roomCode={roomCode} joined={!!joinedName} />
        {joinedName ? <>
          <p role="status">Joined as {joinedName}</p>
          <aside className="members" aria-label="Online members">
            <h3 aria-live="polite">{members.length} online</h3>
            <ul>{members.map(member => <li key={member.socketId}>
              <span aria-hidden="true" className="online-dot" />
              {member.displayName}{member.socketId === socket.id && ' (you)'}
            </li>)}</ul>
          </aside>
          <button type="button" onClick={leave}>Leave room</button>
        </> : <form onSubmit={submit} className="create-room">
          <label htmlFor="display-name">Display name</label>
          <input id="display-name" value={name} onChange={event => setName(event.target.value)} maxLength={30} required />
          <button type="submit" disabled={!socket.connected || !!status}>Join room</button>
        </form>}
        <Chat key={`chat:${roomCode}`} roomCode={roomCode} joined={!!joinedName} />
        {status && <p role="status">{status}</p>}
        {joinError && <p role="alert">{joinError}</p>}
      </>}
      <p><a href="/">Back to home</a></p>
    </section>
  )
}
