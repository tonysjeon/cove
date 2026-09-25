import { useEffect, useRef, useState, type FormEvent } from 'react'
import { mergeMessages } from '../chat/messages'
import { apiUrl } from '../config'
import { socket } from '../socket/socket'
import type { ChatMessage, ChatUpdate } from '../../../server/src/types/rooms'


export default function Chat({ roomCode, joined }: { roomCode: string; joined: boolean }) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState('')
  const [historyError, setHistoryError] = useState('')
  const [loading, setLoading] = useState(true)
  const [retry, setRetry] = useState(0)
  const end = useRef<HTMLDivElement>(null)
  const inFlight = useRef(false)

  useEffect(() => {
    function receive(update: ChatUpdate) {
      if (update.roomCode === roomCode) setMessages(current => mergeMessages(current, [update.message]))
    }
    socket.on('chat:newMessage', receive)
    return () => { socket.off('chat:newMessage', receive) }
  }, [roomCode])

  useEffect(() => {
    if (!joined) return
    const controller = new AbortController()
    let active = true
    setLoading(true)
    setHistoryError('')
    async function load() {
      try {
        const response = await fetch(`${apiUrl}/api/rooms/${encodeURIComponent(roomCode)}/messages`, { signal: controller.signal })
        if (!response.ok) throw new Error('Could not load recent messages')
        const history = await response.json() as ChatMessage[]
        if (active) setMessages(current => mergeMessages(current, history))
      } catch {
        if (active) setHistoryError('Could not load recent messages')
      } finally {
        if (active) setLoading(false)
      }
    }
    void load()
    return () => { active = false; controller.abort() }
  }, [roomCode, joined, retry])

  useEffect(() => { end.current?.scrollIntoView({ block: 'nearest' }) }, [messages])

  function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const content = draft.trim()
    if (!joined || !socket.connected || inFlight.current) return
    if (!content || content.length > 500) { setSendError('Enter a message between 1 and 500 characters'); return }
    inFlight.current = true
    setSending(true)
    setSendError('')
    socket.timeout(8000).emit('chat:send', { roomCode, content }, (error, result) => {
      inFlight.current = false
      setSending(false)
      if (error) { setSendError('Delivery is unconfirmed — check the chat before trying again'); return }
      if (!result.success) {
        setSendError(result.error === 'INVALID_MESSAGE' ? 'Enter a message between 1 and 500 characters'
          : result.error === 'NOT_IN_ROOM' ? 'Rejoin the room before sending a message' : 'Could not send your message — please try again')
        return
      }
      setMessages(current => mergeMessages(current, [result.message]))
      setDraft('')
    })
  }

  if (!joined && !messages.length) return null
  return (
    <section className="chat" aria-label="Room chat">
      <h3>Chat</h3>
      {loading && joined && <p role="status">Loading recent messages…</p>}
      {historyError && <p role="alert">{historyError} <button type="button" onClick={() => setRetry(value => value + 1)}>Retry history</button></p>}
      {!loading && !historyError && !messages.length && <p>No messages yet — start the conversation</p>}
      <div className="chat-messages" role="log" aria-label="Room messages" aria-live="polite">
        {messages.map(message => <article key={message.id} className="chat-message">
          <header><strong>{message.senderName}</strong> <time dateTime={message.createdAt} title={new Date(message.createdAt).toLocaleString()}>
            {new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </time></header>
          <p>{message.content}</p>
        </article>)}
        <div ref={end} />
      </div>
      <form onSubmit={send} className="create-room">
        <label htmlFor="chat-message">Message</label>
        <textarea id="chat-message" value={draft} onChange={event => setDraft(event.target.value)} maxLength={500}
          rows={3} required disabled={!joined || sending} placeholder="Share what you’re working on" />
        <button type="submit" disabled={!joined || sending || !draft.trim()}>{sending ? 'Sending…' : 'Send message'}</button>
      </form>
      {!joined && <p role="status">Reconnect to send messages</p>}
      {sendError && <p role="alert">{sendError}</p>}
    </section>
  )
}
