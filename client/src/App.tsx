import { useEffect, useState } from 'react'

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

  const roomCode = window.location.pathname.match(/^\/room\/([^/]+)\/?$/)?.[1]

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">Skip to content</a>
      <header className="site-header">
        <a className="brand" href="/" aria-label="cove home">
          <svg viewBox="0 0 32 32" aria-hidden="true">
            <path fill="#7b8e6c" d="M10 5a8 8 0 0 0-8 8v6a8 8 0 0 0 8 8 2 2 0 0 0 0-4 4 4 0 0 1-4-4v-6a4 4 0 0 1 4-4 2 2 0 0 0 0-4Z" />
            <path fill="#c49475" d="M22 5a8 8 0 0 1 8 8v6a8 8 0 0 1-8 8 2 2 0 0 1 0-4 4 4 0 0 0 4-4v-6a4 4 0 0 0-4-4 2 2 0 0 1 0-4Z" />
            <circle fill="#d9bb90" cx="16" cy="16" r="4.5" />
          </svg>
          cove<span className="brand-dot">.</span>
        </a>
        <span className="connection-status" role="status">
          {connection !== 'Connected' && <span className="connection-notice">
            <span className="status-dot" aria-hidden="true" />
            {connection === 'Connecting…' ? 'Connecting…' : 'Reconnecting…'}
          </span>}
        </span>
      </header>
      <main id="main-content" tabIndex={-1}>
        {roomCode ? <RoomPage roomCode={roomCode.toUpperCase()} /> : <div className="home-layout">
          <section className="home-intro" aria-labelledby="welcome-title">
            <p className="eyebrow">Better, together</p>
            <h1 id="welcome-title">A little focus.<br /><span>A little company.</span></h1>
            <p className="intro-copy">A cozy corner for you and your friends to study, work, and make a little progress.</p>
            <div className="home-illustration" aria-hidden="true">
              <svg viewBox="0 0 400 190" fill="none">
                <ellipse cx="193" cy="165" rx="160" ry="9" fill="#e7e7dc" />
                <path d="M60 153V87a51 51 0 0 1 102 0v66" fill="#e4b99b" />
                <path d="M77 153V91a34 34 0 0 1 68 0v62" fill="#f4dcc5" />
                <path d="M166 129h130v30H166z" fill="#84947a" />
                <path d="M173 121h113v9H173z" fill="#d4dbca" />
                <path d="M182 108h93v13h-93z" fill="#f5eee1" stroke="#b8b6a4" strokeWidth="2" />
                <path d="M204 57h48v43a13 13 0 0 1-13 13h-22a13 13 0 0 1-13-13V57Z" fill="#e9c9ab" />
                <path d="M252 65h9a13 13 0 0 1 0 26h-9" stroke="#bf9574" strokeWidth="7" />
                <path d="M220 44c-11-13 10-12 0-26m17 26c-11-13 10-12 0-26" stroke="#b6b8a7" strokeWidth="2" strokeLinecap="round" />
                <path d="m312 158-8-35h42l-8 35" fill="#d2b09a" />
                <path d="M325 124V67m0 36c-25 0-30-19-27-29 20 0 29 15 27 29Zm0-14c24-1 31-22 28-32-20 3-30 17-28 32Z" fill="#91a184" stroke="#75876b" strokeWidth="2" />
              </svg>
            </div>
            <p className="home-note">Your own room. A shared timer. Good company.</p>
          </section>
          <div className="entry-panel">
            <CreateRoom />
            <div className="form-divider"><span>or meet your friends</span></div>
            <JoinRoom />
            <p className="entry-note">No accounts. Just a name and a place to settle in.</p>
          </div>
        </div>}
      </main>
      <footer className="site-footer"><span>A shared space to focus</span><span>Take it one session at a time</span></footer>
    </div>
  )
}
