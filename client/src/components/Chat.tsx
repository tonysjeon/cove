import { useEffect, useReducer, useRef, useState, type FormEvent } from 'react'
import { updateUnread } from '../chat/unread'
import { mergeMessages } from '../chat/messages'
import { apiUrl } from '../config'
import { socket } from '../socket/socket'
import type { ChatMessage, ChatUpdate } from '../../../server/src/types/rooms'


export default function Chat({ roomCode, joined, open, onClose, onUnreadCountChange }: { roomCode: string; joined: boolean; open: boolean; onClose: () => void; onUnreadCountChange: (count: number) => void }) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [draft, setDraft] = useState('')
  const [unread, dispatchUnread] = useReducer(updateUnread, { seen: new Set<string>(), unread: new Set<string>() })
  const chatOpen = useRef(open)
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
    chatOpen.current = open
    if (!open) return
    dispatchUnread({ type: 'read' })
    const frame = requestAnimationFrame(jumpToLatest)
    return () => cancelAnimationFrame(frame)
  }, [open])

  useEffect(() => { onUnreadCountChange(unread.unread.size) }, [unread.unread.size, onUnreadCountChange])

  useEffect(() => {
    function receive(update: ChatUpdate) {
      if (update.roomCode !== roomCode) return
      setMessages(current => mergeMessages(current, [update.message]))
      dispatchUnread({ type: 'received', id: update.message.id, open: chatOpen.current })
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
      dispatchUnread({ type: 'sent', id: result.message.id })
      following.current = true
      setMessages(current => mergeMessages(current, [result.message]))
      setDraft('')
    })
  }

  if (!joined && !messages.length && !draft) return null
  return (
    <section className="chat" aria-label="Room chat">
      <header className="panel-heading chat-heading"><h2 id="chat-title">Room chat</h2><button className="chat-close button-quiet" type="button" onClick={onClose} aria-label="Close chat"><svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="m5 5 10 10M15 5 5 15" /></svg></button></header>
      {loading && joined && <p role="status">Loading messages…</p>}
      {historyError && <p role="alert">{historyError} <button type="button" disabled={!joined} onClick={() => setRetry(value => value + 1)}>Retry</button></p>}

      <div ref={messageList} className="chat-messages" tabIndex={0} onScroll={event => {
        const list = event.currentTarget
        following.current = list.scrollHeight - list.scrollTop - list.clientHeight < 64
        if (following.current) setNewMessages(false)
      }} role="log" aria-label="Room messages" aria-live="polite">
        {!loading && !historyError && !messages.length && <p className="chat-empty">No messages yet</p>}
        <div className="chat-transcript">
        {messages.map(message => <article key={message.id} className="chat-message">
          <span className="chat-avatar" data-tone={Array.from(message.senderName).reduce((value, character) => value + character.codePointAt(0)!, 0) % 3} aria-hidden="true">{Array.from(message.senderName)[0]?.toUpperCase()}</span>
          <div className="chat-message-body">
          <header><strong>{message.senderName}</strong> <time dateTime={message.createdAt} title={new Date(message.createdAt).toLocaleString()}>
            {new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </time></header>
          <p>{message.content}</p>
          </div>
        </article>)}
        </div>
      </div>
      {newMessages && <button className="jump-latest button-secondary" type="button" onClick={jumpToLatest}>New messages <span aria-hidden="true">↓</span></button>}
      <form onSubmit={send} className="chat-compose">
        <label className="sr-only" htmlFor="chat-message">Message</label>
        <textarea ref={composer} id="chat-message" autoComplete="off" aria-describedby="compose-help" value={draft} onChange={event => setDraft(event.target.value)} maxLength={500}
          onKeyDown={event => {
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && !event.nativeEvent.isComposing) {
              event.preventDefault()
              event.currentTarget.form?.requestSubmit()
            }
          }} rows={2} required disabled={!joined || sending} placeholder="Write a message…" />
        <span className="sr-only" id="compose-help">Ctrl or Command + Enter to send</span>
        <button className="chat-send" type="submit" aria-label={sending ? 'Sending message' : 'Send message'} title="Send message" disabled={!joined || sending || !draft.trim()}>
          {sending ? 'Sending…' : 'Send'}
          <svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="m3 3 14 7-14 7 3-7-3-7Zm3 7h11" /></svg>
        </button>
      </form>
      {!joined && <p role="status">Reconnect to send messages</p>}
      {sendError && <p role="alert">{sendError}</p>}
    </section>
  )
}
