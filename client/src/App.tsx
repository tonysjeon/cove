import { useEffect, useState } from 'react'

const apiUrl = (import.meta.env.VITE_API_URL || 'http://localhost:3001').replace(/\/$/, '')

export default function App() {
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

  return (
    <main>
      <p className="eyebrow">A shared space to focus</p>
      <h1>cove</h1>
      <p>Settle in and make time for what matters.</p>
      <p className="status" role="status">{status}</p>
    </main>
  )
}
