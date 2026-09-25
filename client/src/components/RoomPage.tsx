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
    <section className="room-page" aria-labelledby="room-title">
      <a className="back-link" href="/"><span aria-hidden="true">←</span> Home</a>
      {loadError ? <div className="room-notice"><h1 id="room-title">Let’s try that again</h1><p role="alert">{loadError}</p><button type="button" onClick={() => setLoadAttempt(value => value + 1)}>Retry room</button></div>
        : !room ? <div className="room-notice"><h1 id="room-title">Making room for you…</h1><p role="status">Loading your space</p></div> : <>
        <header className="room-header">
          <div><p className="eyebrow">Your shared space</p><h1 id="room-title">{room.name}</h1><p>A little company makes a difference.</p></div>
          <span className="room-code">Room <strong>{room.code}</strong></span>
        </header>
        <div className="room-layout">
          <div className="room-main">
            {!joinedName && <section className="welcome-panel">
              <span className="section-mark" aria-hidden="true">☀</span>
              <h2>{requestedName && !joinError ? 'Saving your seat' : 'Come on in'}</h2>
              <p>{requestedName && !joinError ? 'We’ll bring you back into the room as soon as we can.' : 'What should your friends call you?'}</p>
              <form onSubmit={submit} className="room-form">
                <label htmlFor="display-name">Display name</label>
                <input id="display-name" value={name} onChange={event => setName(event.target.value)} maxLength={30} required autoComplete="nickname" placeholder="Your name" />
                <button type="submit" disabled={!socket.connected || !!status}>Join room</button>
              </form>
              {status && <p className="inline-status" role="status">{status}</p>}
              {joinError && <p role="alert">{joinError}</p>}
            </section>}
            <Timer key={`timer:${roomCode}`} roomCode={roomCode} joined={!!joinedName} />
            <Chat key={`chat:${roomCode}`} roomCode={roomCode} joined={!!joinedName} />
          </div>
          <aside className="members" aria-label="Online members">
            <header className="panel-heading"><h2>In good company</h2><span className="member-count" aria-label={`${members.length} online`}>{members.length}</span></header>
            {joinedName ? <>
              <p className="panel-description">Here with you right now</p>
              <ul>{members.map(member => <li key={member.socketId}>
                <span className="avatar" aria-hidden="true">{Array.from(member.displayName)[0].toUpperCase()}<span className="online-dot" /></span>
                <span className="member-name">{member.displayName}{member.socketId === socket.id && <small>you</small>}</span>
              </li>)}</ul>
              {members.length === 1 && <p className="quiet-note">The first one here. Invite a friend to join you.</p>}
              <div className="membership-actions"><p className="sr-only" role="status">Joined as {joinedName}</p><button className="button-quiet" type="button" onClick={leave}>Leave room <span aria-hidden="true">↗</span></button></div>
            </> : <p className="quiet-note">{requestedName ? 'Reconnecting with your room…' : 'Join the room to see who’s here.'}</p>}
            <div className="room-note"><span aria-hidden="true">✳</span><p>You don’t have to do it all.<br />Just a little, together.</p></div>
          </aside>
        </div>
      </>}
    </section>
  )
}
