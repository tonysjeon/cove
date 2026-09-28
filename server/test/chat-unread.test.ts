import assert from 'node:assert/strict'
import test from 'node:test'
import { updateUnread, type UnreadState } from '../../client/src/chat/unread.js'

const empty = (): UnreadState => ({ seen: new Set(), unread: new Set() })

test('closed chat counts each new message once', () => {
  let state = updateUnread(empty(), { type: 'received', id: 'one', open: false })
  state = updateUnread(state, { type: 'received', id: 'one', open: false })
  state = updateUnread(state, { type: 'received', id: 'two', open: false })
  assert.equal(state.unread.size, 2)
})

test('opening clears the badge and duplicate delivery cannot restore it', () => {
  let state = updateUnread(empty(), { type: 'received', id: 'one', open: false })
  state = updateUnread(state, { type: 'read' })
  state = updateUnread(state, { type: 'received', id: 'one', open: false })
  assert.equal(state.unread.size, 0)
})

test('messages received with chat open stay read after closing', () => {
  let state = updateUnread(empty(), { type: 'received', id: 'one', open: true })
  state = updateUnread(state, { type: 'received', id: 'one', open: false })
  assert.equal(state.unread.size, 0)
})

test('own messages do not leave a badge regardless of acknowledgement order', () => {
  for (const sentFirst of [true, false]) {
    let state = empty()
    const received = { type: 'received' as const, id: 'own', open: false }
    const sent = { type: 'sent' as const, id: 'own' }
    state = updateUnread(state, sentFirst ? sent : received)
    state = updateUnread(state, sentFirst ? received : sent)
    assert.equal(state.unread.size, 0)
  }
})
