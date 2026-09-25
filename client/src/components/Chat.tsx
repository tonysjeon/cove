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
  const messageList = useRef<HTMLDivElement>(null)
  const composer = useRef<HTMLTextAreaElement>(null)
  const following = useRef(true)
  const focusComposer = useRef(false)
  const [newMessages, setNewMessages] = useState(false)
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

  function jumpToLatest() {
    if (messageList.current) messageList.current.scrollTop = messageList.current.scrollHeight
    following.current = true
    setNewMessages(false)
  }
  useEffect(() => {
    if (following.current) jumpToLatest()
    else setNewMessages(true)
  }, [messages])
  useEffect(() => {
    if (!sending && focusComposer.current) {
      composer.current?.focus()
      focusComposer.current = false
    }
  }, [sending])

  function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const content = draft.trim()
    if (!joined || !socket.connected || inFlight.current) return
    if (!content || content.length > 500) { setSendError('Enter a message between 1 and 500 characters'); return }
    const current = ++generation.current
    inFlight.current = true
    focusComposer.current = true
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
      following.current = true
      setMessages(current => mergeMessages(current, [result.message]))
      setDraft('')
    })
  }

  if (!joined && !messages.length && !draft) return null
  return (
    <section className="chat" aria-label="Room chat">
      <header className="panel-heading"><div><h2>Room chat</h2><p className="panel-description">A hello, a small win, or just a little encouragement.</p></div><svg className="chat-symbol" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 4h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-5 3v-3a2 2 0 0 1-2-2V7a3 3 0 0 1 3-3Z" /><path d="M7 9h10M7 13h6" /></svg></header>
      {loading && joined && <p role="status">Loading recent messages…</p>}
      {historyError && <p role="alert">{historyError} <button type="button" disabled={!joined} onClick={() => setRetry(value => value + 1)}>Retry history</button></p>}
      {!loading && !historyError && !messages.length && <div className="chat-empty"><span aria-hidden="true">✳</span><p>Every good session starts with a hello.</p><small>Be the first to say something.</small></div>}
      <div ref={messageList} className="chat-messages" tabIndex={0} onScroll={event => {
        const list = event.currentTarget
        following.current = list.scrollHeight - list.scrollTop - list.clientHeight < 64
        if (following.current) setNewMessages(false)
      }} role="log" aria-label="Room messages" aria-live="polite">
        {messages.map(message => <article key={message.id} className="chat-message">
          <header><strong>{message.senderName}</strong> <time dateTime={message.createdAt} title={new Date(message.createdAt).toLocaleString()}>
            {new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </time></header>
          <p>{message.content}</p>
        </article>)}
      </div>
      {newMessages && <button className="jump-latest button-secondary" type="button" onClick={jumpToLatest}>New messages <span aria-hidden="true">↓</span></button>}
      <form onSubmit={send} className="chat-compose">
        <label className="sr-only" htmlFor="chat-message">Message</label>
        <textarea ref={composer} id="chat-message" aria-describedby="compose-help" value={draft} onChange={event => setDraft(event.target.value)} maxLength={500}
          onKeyDown={event => {
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && !event.nativeEvent.isComposing) {
              event.preventDefault()
              event.currentTarget.form?.requestSubmit()
            }
          }} rows={2} required disabled={!joined || sending} placeholder="Say hello, share a little progress…" />
        <div className="compose-actions"><span id="compose-help">Ctrl / ⌘ + Enter to send</span><button type="submit" disabled={!joined || sending || !draft.trim()}>{sending ? 'Sending…' : 'Send message'} <span aria-hidden="true">↑</span></button></div>
      </form>
      {!joined && <p role="status">Reconnect to send messages</p>}
      {sendError && <p role="alert">{sendError}</p>}
    </section>
  )
}
