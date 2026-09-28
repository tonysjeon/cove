import { useEffect, useRef } from 'react'
import Chat from './Chat'

type Props = { roomCode: string; joined: boolean; open: boolean; onClose: () => void; onUnreadCountChange: (count: number) => void }

export default function ChatSidebar({ roomCode, joined, open, onClose, onUnreadCountChange }: Props) {
  const sidebarRef = useRef<HTMLElement>(null)

  useEffect(() => {
    if (!open) return
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const sidebar = sidebarRef.current
    const focusFrame = requestAnimationFrame(() => {
      sidebar?.querySelector<HTMLButtonElement>('.chat-close')?.focus({ preventScroll: true })
    })
    return () => {
      cancelAnimationFrame(focusFrame)
      if (sidebar?.contains(document.activeElement)) opener?.focus({ preventScroll: true })
    }
  }, [open])

  return <aside ref={sidebarRef} id="room-chat-sidebar" className={`chat-sidebar${open ? ' is-open' : ''}`} aria-label="Chat" inert={!open} aria-hidden={!open}
    onTransitionEnd={event => {
      if (open && event.target === event.currentTarget && event.propertyName === 'transform') {
        event.currentTarget.querySelector<HTMLButtonElement>('.chat-close')?.focus({ preventScroll: true })
      }
    }}
    onKeyDown={event => {
      if (event.key === 'Escape') { event.preventDefault(); onClose() }
    }}>
    <Chat roomCode={roomCode} joined={joined} open={open} onClose={onClose} onUnreadCountChange={onUnreadCountChange} />
  </aside>
}
