import { useEffect, useState } from 'react'

import { apiUrl } from './config'
import { socket } from './socket/socket'
import CreateRoom from './components/CreateRoom'

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
        if (active) setStatus('Backend unavailable — check that the server is running, then refresh')
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
  }, [])

  const roomCode = window.location.pathname.match(/^\/room\/([A-HJ-NP-Z2-9]{6})\/?$/)?.[1]

  return (
    <main>
      <p className="eyebrow">A shared space to focus</p>
      <h1>cove</h1>
      <p>Settle in and make time for what matters.</p>
      {roomCode ? (
        <section>
          <h2>Room {roomCode}</h2>
          <p>Room links are ready to share — joining rooms is coming next</p>
          <a href="/">Back to home</a>
        </section>
      ) : <CreateRoom />}
      <p className="status" role="status">API health: {status}</p>
      <p className="status" role="status">Live connection: {connection}</p>
    </main>
  )
}
