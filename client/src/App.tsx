import { useEffect } from 'react'

import { socket } from './socket/socket'
import CreateRoom from './components/CreateRoom'
import JoinRoom from './components/JoinRoom'
import RoomPage from './components/RoomPage'
import CoveBuddy from './components/CoveBuddy'

export default function App() {
  useEffect(() => {
    socket.connect()
    return () => { socket.disconnect() }
  }, [])

  const roomCode = window.location.pathname.match(/^\/room\/([^/]+)\/?$/)?.[1]

  return (
    <div className={`app-shell ${roomCode ? 'study-shell' : 'home-shell'}`}>
      <a className="skip-link" href="#main-content">Skip to content</a>
      <header className="site-header">
        <a className="brand" href="/" aria-label="cove home">
          cove
        </a>
      </header>
      <main id="main-content" tabIndex={-1}>
        {roomCode ? <RoomPage roomCode={roomCode.toUpperCase()} /> : <div className="home-layout">
          <section className="home-intro" aria-labelledby="welcome-title">
            <div className="intro-text">
              <h1 id="welcome-title">Make yourself at home.</h1>
              <p className="intro-copy">A little space to focus, catch up, and get things done together.</p>
            </div>
            <div className="buddy-note" aria-hidden="true">
              <div className="buddy-portrait"><CoveBuddy className="hero-buddy" /></div>
            </div>
          </section>
          <section className="entry-panel" aria-label="Create or find a room">
            <div className="entry-option"><CreateRoom /></div>
            <div className="entry-option"><JoinRoom /></div>
          </section>
          <p className="home-note">No accounts. Just you and your people.</p>
        </div>}
      </main>
      {roomCode && <footer className="site-footer">A little focus, in good company.</footer>}
    </div>
  )
}
