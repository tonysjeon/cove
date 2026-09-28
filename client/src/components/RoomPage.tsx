import { useEffect, useRef, useState, type FormEvent } from 'react'
import Chat from './Chat'
import RoomActions from './RoomActions'
import RoomWelcome from './RoomWelcome'
import { joinRoomSession } from '../socket/room-session'
import Timer from './Timer'
import StudySeats from './StudySeats'
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
  const [connected, setConnected] = useState(socket.connected)
  const [loadError, setLoadError] = useState('')
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [name, setName] = useState(() => savedName(roomCode))
  const [namePromptOpen, setNamePromptOpen] = useState(!name)
  const [requestedName, setRequestedName] = useState('')
  const [joinedName, setJoinedName] = useState('')
  const [status, setStatus] = useState('')
  const [showRejoinNotice, setShowRejoinNotice] = useState(false)
  const [joinError, setJoinError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [members, setMembers] = useState<ConnectedUser[]>([])
  const [enteringRoom, setEnteringRoom] = useState(false)
  const roomTitle = useRef<HTMLHeadingElement>(null)
  const focusAfterJoin = useRef(false)
  const awaitingRoom = !!room && !joinedName && !namePromptOpen && !loadError

  useEffect(() => {
    setShowRejoinNotice(false)
    if (!awaitingRoom) return
    // Keep brief reconnects quiet without delaying membership recovery or disabling controls.
    const timeout = window.setTimeout(() => setShowRejoinNotice(true), 2000)
    return () => window.clearTimeout(timeout)
  }, [awaitingRoom, roomCode])

  useEffect(() => {
    if (joinedName && focusAfterJoin.current) {
      roomTitle.current?.focus()
      focusAfterJoin.current = false
    }
  }, [joinedName])

  useEffect(() => {
    function presence(update: Presence) {
      if (update.roomCode === roomCode) setMembers(update.members)
    }
    const clear = () => { setMembers([]); setConnected(false) }
    const connect = () => setConnected(true)
    setConnected(socket.connected)
    socket.on('connect', connect)
    socket.on('room:presence', presence)
    socket.on('disconnect', clear)
    return () => {
      socket.off('connect', connect)
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
        if (active) setLoadError(controller.signal.aborted ? 'Loading timed out — please try again' : error instanceof TypeError ? 'We couldn’t reach your room — please try again' : error instanceof Error ? error.message : 'Unable to load the room')
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
        if (!result.success) { setJoinError(errors[result.error]); setNamePromptOpen(true); return }
        setEnteringRoom(focusAfterJoin.current)
        setJoinedName(result.displayName)
        setNamePromptOpen(false)
        try { sessionStorage.setItem(`cove:name:${roomCode}`, result.displayName) } catch { /* Storage is optional. */ }
      },
    })
  }, [room, roomCode, requestedName, attempt])

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!socket.connected || status) return
    const displayName = name.trim()
    if (!displayName || displayName.length > 30) {
      setJoinError(errors.INVALID_DISPLAY_NAME)
      return
    }
    focusAfterJoin.current = true
    setJoinError('')
    setStatus('Joining room…')
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

  const showWelcome = !!room && !loadError && namePromptOpen && !joinedName

  return (
    <section className="room-page" aria-labelledby="room-title">
      {loadError ? <div className="room-notice"><h1 id="room-title">Let’s try that again</h1><p role="alert">{loadError}</p><button type="button" onClick={() => setLoadAttempt(value => value + 1)}>Retry room</button></div>
        : !room ? <div className="room-notice"><h1 id="room-title">Making room for you…</h1><p role="status">Loading your space</p></div> : <>
        <div className="room-space">
        <div className="room-identity">
          <h1 ref={roomTitle} id="room-title" tabIndex={-1}>{room.name}</h1>
          <div className="room-identity-actions">
            <RoomActions key={room.code} roomCode={room.code} joined={!!joinedName} showOptions={!showWelcome} onLeave={leave} />
          </div>

        </div>
        {showWelcome && <RoomWelcome name={name} onNameChange={setName} onSubmit={submit}
          status={status} error={joinError} connected={connected} />}
        <div className="room-screen" hidden={showWelcome}>
        <div className={`room-layout${enteringRoom ? ' is-entering' : ''}`} onAnimationEnd={event => {
          if (event.target === event.currentTarget) setEnteringRoom(false)
        }}>
          <div className="room-main">
            {awaitingRoom && showRejoinNotice && <p className="room-rejoining" role="status">{!connected ? 'Reconnecting to your room…' : status || 'Joining your room…'}</p>}
            <Timer key={`timer:${roomCode}`} roomCode={roomCode} joined={!!joinedName}>
              <StudySeats members={members} ownSocketId={socket.id} joinedName={joinedName} />
            </Timer>
            <Chat key={`chat:${roomCode}`} roomCode={roomCode} joined={!!joinedName} />
          </div>

        </div>
        </div>
        </div>
      </>}
    </section>
  )
}
