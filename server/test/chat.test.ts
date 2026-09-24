import assert from 'node:assert/strict'
import { once } from 'node:events'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import test from 'node:test'
import { io as connect } from 'socket.io-client'
import { createRoomServer } from '../src/socket/rooms.js'
import { mergeMessages } from '../../client/src/chat/messages.js'
import type { ChatMessage } from '../src/types/rooms.js'

const message: ChatMessage = { id: 'one', roomId: 'room', senderName: 'Tony', content: 'Hello', createdAt: '2026-09-24T00:00:00.000Z' }

test('history merges with live and acknowledged messages without loss or duplicates', () => {
  const newer = { ...message, id: 'two', createdAt: '2026-09-24T00:01:00.000Z' }
  const live = mergeMessages([], [newer])
  const history = mergeMessages(live, [message, newer])
  assert.deepEqual(mergeMessages(history, [newer]), [message, newer])
})

test('chat validates membership and content and broadcasts only after persistence', async () => {
  const server = createServer()
  let finishSave!: (message: ChatMessage) => void
  let started!: () => void
  const saving = new Promise<void>(resolve => { started = resolve })
  let shouldFail = false
  const io = createRoomServer(server, 'http://localhost:5173', async code => ({ code, name: 'Study' }),
    async (roomCode, senderName, content) => {
      assert.equal(roomCode, 'ABC234'); assert.equal(senderName, 'Tony'); assert.equal(content, 'Hello')
      if (shouldFail) throw new Error('Test persistence failure')
      started()
      return new Promise(resolve => { finishSave = resolve })
    })
  server.listen(0, '127.0.0.1'); await once(server, 'listening')
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  const a = connect(url, { autoConnect: false })
  const b = connect(url, { autoConnect: false })
  const other = connect(url, { autoConnect: false })
  const clients = [a, b, other]
  const received = clients.map(() => [] as unknown[])
  clients.forEach((client, index) => client.on('chat:newMessage', update => received[index].push(update)))
  const send = (input: unknown) => a.timeout(2000).emitWithAck('chat:send', input)
  try {
    const connected = Promise.all(clients.map(client => once(client, 'connect')))
    clients.forEach(client => client.connect()); await connected
    assert.deepEqual(await send({ roomCode: 'ABC234', content: 'Hello' }), { success: false, error: 'NOT_IN_ROOM' })
    await a.timeout(2000).emitWithAck('room:join', { roomCode: 'ABC234', displayName: 'Tony' })
    await b.timeout(2000).emitWithAck('room:join', { roomCode: 'ABC234', displayName: 'Sarah' })
    await other.timeout(2000).emitWithAck('room:join', { roomCode: 'DEF567', displayName: 'Alex' })
    assert.deepEqual(await send({ roomCode: 'DEF567', content: 'Hello' }), { success: false, error: 'NOT_IN_ROOM' })
    for (const content of ['', '   ', 'a'.repeat(501), 4, null, {}]) {
      assert.deepEqual(await send({ roomCode: 'ABC234', content }), { success: false, error: 'INVALID_MESSAGE' })
    }
    const delivery = once(b, 'chat:newMessage')
    const result = send({ roomCode: 'ABC234', content: ' Hello ', senderName: 'Forged' })
    await saving
    assert.deepEqual(received, [[], [], []])
    finishSave(message)
    assert.deepEqual(await result, { success: true, message })
    assert.deepEqual((await delivery)[0], { roomCode: 'ABC234', message })
    assert.equal(received[0].length, 1); assert.equal(received[1].length, 1); assert.equal(received[2].length, 0)
    shouldFail = true
    assert.deepEqual(await send({ roomCode: 'ABC234', content: 'Hello' }), { success: false, error: 'SEND_FAILED' })
    assert.equal(received[0].length, 1)
    await a.timeout(2000).emitWithAck('room:leave')
    assert.deepEqual(await send({ roomCode: 'ABC234', content: 'Hello' }), { success: false, error: 'NOT_IN_ROOM' })
  } finally {
    clients.forEach(client => client.disconnect())
    await new Promise<void>(resolve => io.close(() => resolve()))
  }
})
