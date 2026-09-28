import { useEffect, useRef, useState } from 'react'

export default function RoomActions({ roomCode, joined, showOptions, onLeave }: { roomCode: string; joined: boolean; showOptions: boolean; onLeave: () => void }) {
  const [open, setOpen] = useState(false)
  const container = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
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
  useEffect(() => { if (!showOptions) setOpen(false) }, [showOptions])
  useEffect(() => { if (fallback) { input.current?.focus(); input.current?.select() } }, [fallback])

  useEffect(() => {
    if (!open) return
    function outside(event: PointerEvent) {
      if (event.target instanceof Node && !container.current?.contains(event.target)) setOpen(false)
    }
    function escape(event: KeyboardEvent) {
      if (event.key === 'Escape') { setOpen(false); trigger.current?.focus() }
    }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('pointerdown', outside)
      document.removeEventListener('keydown', escape)
    }
  }, [open])

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

  return <div ref={container} className="room-actions" onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false)
  }}>
    <span className="room-code">Room <strong>{roomCode}</strong></span>
    <button ref={trigger} className={`room-actions-toggle button-quiet${showOptions ? ' is-visible' : ''}`} type="button" disabled={!showOptions} aria-hidden={!showOptions} aria-label="Room options" aria-expanded={open} aria-controls="room-options" onClick={() => setOpen(value => !value)}>
      <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><circle cx="4" cy="10" r="1.5" /><circle cx="10" cy="10" r="1.5" /><circle cx="16" cy="10" r="1.5" /></svg>
    </button>
    {showOptions && open && <div id="room-options" className="room-options" role="group" aria-label="Room actions">
      <button type="button" onClick={() => void copy()} disabled={pending}>
        <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">{copied
          ? <path d="m4 10 4 4 8-8" />
          : <><rect x="7" y="7" width="9" height="10" rx="2" /><path d="M12 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h2" /></>}
        </svg>
        {pending ? 'Copying…' : copied ? 'Link copied' : 'Copy invite link'}
      </button>
      <button type="button" disabled={!joined} onClick={onLeave}>
        <svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M8 3H4a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h4M8 10h9m-3-3 3 3-3 3" /></svg>
        Leave room
      </button>
      {fallback && <div className="invite-fallback">
        <label htmlFor="invite-link">Copy this invite link</label>
        <input ref={input} id="invite-link" autoComplete="off" value={link} readOnly onFocus={event => event.target.select()} />
      </div>}
    </div>}
    <span className="sr-only" role="status">{copied ? 'Invite link copied' : ''}</span>
  </div>
}
