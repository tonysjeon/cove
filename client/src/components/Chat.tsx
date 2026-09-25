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
  const generation = useRef(0)

  useEffect(() => {
    function receive(update: ChatUpdate) {
      if (update.roomCode === roomCode) setMessages(current => mergeMessages(current, [update.message]))
    }
    function disconnected() {
      generation.current++
      if (inFlight.current) setSendError('Delivery is unconfirmed — check the chat before trying again')
      inFlight.current = false
      setSending(false)
    }
    socket.on('chat:newMessage', receive)
    socket.on('disconnect', disconnected)
    return () => {
      generation.current++
      inFlight.current = false
      socket.off('chat:newMessage', receive)
      socket.off('disconnect', disconnected)
    }
  }, [roomCode])

  useEffect(() => {
    if (!joined) return
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 8000)
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
        clearTimeout(timeout)
        if (active) setLoading(false)
      }
    }
    void load()
    return () => { active = false; clearTimeout(timeout); controller.abort() }
  }, [roomCode, joined, retry])

  useEffect(() => { end.current?.scrollIntoView({ block: 'nearest' }) }, [messages])

  function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const content = draft.trim()
    if (!joined || !socket.connected || inFlight.current) return
    if (!content || content.length > 500) { setSendError('Enter a message between 1 and 500 characters'); return }
    const current = ++generation.current
    inFlight.current = true
    setSending(true)
    setSendError('')
    socket.timeout(8000).emit('chat:send', { roomCode, content }, (error, result) => {
      if (current !== generation.current) return
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

  if (!joined && !messages.length && !draft) return null
  return (
    <section className="chat" aria-label="Room chat">
      <header className="panel-heading"><div><h2>Room chat</h2><p className="panel-description">A hello, a small win, or just a little encouragement.</p></div><span className="chat-symbol" aria-hidden="true">↗</span></header>
      {loading && joined && <p role="status">Loading recent messages…</p>}
      {historyError && <p role="alert">{historyError} <button type="button" disabled={!joined} onClick={() => setRetry(value => value + 1)}>Retry history</button></p>}
      {!loading && !historyError && !messages.length && <div className="chat-empty"><span aria-hidden="true">✳</span><p>Every good session starts with a hello.</p><small>Be the first to say something.</small></div>}
      <div className="chat-messages" role="log" aria-label="Room messages" aria-live="polite">
        {messages.map(message => <article key={message.id} className="chat-message">
          <header><strong>{message.senderName}</strong> <time dateTime={message.createdAt} title={new Date(message.createdAt).toLocaleString()}>
            {new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </time></header>
          <p>{message.content}</p>
        </article>)}
        <div ref={end} />
      </div>
      <form onSubmit={send} className="chat-compose">
        <label className="sr-only" htmlFor="chat-message">Message</label>
        <textarea id="chat-message" value={draft} onChange={event => setDraft(event.target.value)} maxLength={500}
          rows={2} required disabled={!joined || sending} placeholder="Say hello, share a little progress…" />
        <button type="submit" disabled={!joined || sending || !draft.trim()}>{sending ? 'Sending…' : 'Send message'} <span aria-hidden="true">↑</span></button>
      </form>
      {!joined && <p role="status">Reconnect to send messages</p>}
      {sendError && <p role="alert">{sendError}</p>}
    </section>
  )
}
