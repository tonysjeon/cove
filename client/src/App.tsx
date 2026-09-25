import { useEffect, useState } from 'react'

import { apiUrl } from './config'
import { socket } from './socket/socket'
import CreateRoom from './components/CreateRoom'
import JoinRoom from './components/JoinRoom'
import RoomPage from './components/RoomPage'

export default function App() {
  const [connection, setConnection] = useState(socket.connected ? 'Connected' : 'Connecting…')

  useEffect(() => {
    const onConnect = () => setConnection('Connected')
    const onDisconnect = () => setConnection('Disconnected — reconnecting…')
    const onConnectError = () => setConnection('Unable to connect — retrying…')

    socket.on('connect', onConnect)
    socket.on('disconnect', onDisconnect)
    socket.on('connect_error', onConnectError)
    socket.connect()

    return () => {
      socket.off('connect', onConnect)
      socket.off('disconnect', onDisconnect)
      socket.off('connect_error', onConnectError)
      socket.disconnect()
    }
  }, [])

  const [status, setStatus] = useState('Checking connection…')

  useEffect(() => {
    if (connection !== 'Connected') {
      setStatus('Waiting for the backend…')
      return
    }
    setStatus('Checking connection…')
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 5000)
    let active = true

    async function checkHealth() {
      try {
        const response = await fetch(`${apiUrl}/api/health`, { signal: controller.signal })
        if (!response.ok) throw new Error('Health check failed')
        const data: unknown = await response.json()
        if (!data || typeof data !== 'object' || !('status' in data) || data.status !== 'ok') {
          throw new Error('Unexpected health response')
        }
        if (active) setStatus('Backend connected')
      } catch {
        if (active) setStatus('Backend health check failed')
      } finally {
        window.clearTimeout(timeout)
      }
    }

    void checkHealth()
    return () => {
      active = false
      window.clearTimeout(timeout)
      controller.abort()
    }
  }, [connection])

  const roomCode = window.location.pathname.match(/^\/room\/([^/]+)\/?$/)?.[1]

  return (
    <main>
      <p className="eyebrow">A shared space to focus</p>
      <h1>cove</h1>
      <p>Settle in and make time for what matters.</p>
      {roomCode ? <RoomPage roomCode={roomCode.toUpperCase()} /> : <><CreateRoom /><JoinRoom /></>}
      <p className="status" role="status">API health: {status}</p>
      <p className="status" role="status">Live connection: {connection}</p>
    </main>
  )
}
