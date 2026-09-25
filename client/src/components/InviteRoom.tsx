import { useEffect, useRef, useState } from 'react'

export default function InviteRoom({ roomCode }: { roomCode: string }) {
  const [copied, setCopied] = useState(false)
  const [fallback, setFallback] = useState(false)
  const [pending, setPending] = useState(false)
  const reset = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const input = useRef<HTMLInputElement>(null)
  const active = useRef(true)
  const link = `${window.location.origin}/room/${roomCode}`

  useEffect(() => {
    active.current = true
    return () => { active.current = false; clearTimeout(reset.current) }
  }, [])
  useEffect(() => { if (fallback) { input.current?.focus(); input.current?.select() } }, [fallback])

  async function copy() {
    if (pending) return
    setPending(true)
    setCopied(false)
    clearTimeout(reset.current)
    try {
      await navigator.clipboard.writeText(link)
      if (!active.current) return
      setFallback(false)
      setCopied(true)
      reset.current = setTimeout(() => setCopied(false), 3000)
    } catch {
      if (active.current) setFallback(true)
    } finally {
      if (active.current) setPending(false)
    }
  }

  return <div className="invite-room">
    <div className="invite-actions">
      <span className="room-code">Room <strong>{roomCode}</strong></span>
      <button className="button-secondary" type="button" onClick={() => void copy()} disabled={pending}>
        <svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><rect x="7" y="7" width="9" height="10" rx="2" /><path d="M12 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h2" /></svg>
        {pending ? 'Copying…' : copied ? 'Link copied!' : 'Copy invite'}
      </button>
    </div>
    <span className="sr-only" role="status">{copied ? 'Invite link copied. Send it to a friend.' : ''}</span>
    {fallback && <div className="invite-fallback">
      <label htmlFor="invite-link">Copy this link to invite a friend</label>
      <input ref={input} id="invite-link" value={link} readOnly onFocus={event => event.target.select()} />
    </div>}
  </div>
}
