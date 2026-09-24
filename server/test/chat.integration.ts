import 'dotenv/config'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import test from 'node:test'
import { io as connect } from 'socket.io-client'
import { createApp } from '../src/app.js'
import { createRoomServer } from '../src/socket/rooms.js'
import { createRoom } from '../src/services/rooms.js'
import { getPrisma, disconnectDatabase } from '../src/db/prisma.js'
import type { ChatMessage } from '../src/types/rooms.js'

if (!process.env.TEST_DATABASE_URL) throw new Error('Set TEST_DATABASE_URL to a migrated test database')
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL

test('socket messages persist and history returns only the latest 50 messages in room order', async () => {
  const room = await createRoom('Chat integration')
  const otherRoom = await createRoom('Isolated chat integration')
  const server = createServer(createApp('http://localhost:5173'))
  const io = createRoomServer(server, 'http://localhost:5173')
  server.listen(0, '127.0.0.1'); await once(server, 'listening')
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  const client = connect(url, { autoConnect: false })
  try {
    const connected = once(client, 'connect'); client.connect(); await connected
    await client.timeout(2000).emitWithAck('room:join', { roomCode: room.code, displayName: 'Tony' })
    const result = await client.timeout(2000).emitWithAck('chat:send', { roomCode: room.code, content: 'Saved over the socket' })
    assert.equal(result.success, true)
    await disconnectDatabase()
    const saved = await getPrisma().message.findUniqueOrThrow({ where: { id: result.message.id } })
    assert.equal(saved.content, 'Saved over the socket')
    assert.equal(saved.senderName, 'Tony')
    const other = await getPrisma().room.findUniqueOrThrow({ where: { code: otherRoom.code } })
    await getPrisma().message.create({ data: { roomId: other.id, senderName: 'Alex', content: 'Other room only' } })
    await getPrisma().message.createMany({ data: Array.from({ length: 55 }, (_, index) => ({
      roomId: saved.roomId, senderName: 'History', content: `History ${index}`,
      createdAt: new Date(Date.UTC(2000, 0, 1, 0, 0, index)),
    })) })
    const response = await fetch(`${url}/api/rooms/${room.code.toLowerCase()}/messages`)
    assert.equal(response.status, 200)
    const history = await response.json() as ChatMessage[]
    assert.equal(history.length, 50)
    assert.equal(history[0].content, 'History 6')
    assert.equal(history[49].id, saved.id)
    assert.ok(history.every(message => message.roomId === saved.roomId))
    const separate = await (await fetch(`${url}/api/rooms/${otherRoom.code}/messages`)).json() as ChatMessage[]
    assert.deepEqual(separate.map(message => message.content), ['Other room only'])
    assert.equal((await fetch(`${url}/api/rooms/bad/messages`)).status, 400)
    const missing = await createRoom('Missing chat room')
    await getPrisma().room.delete({ where: { code: missing.code } })
    assert.equal((await fetch(`${url}/api/rooms/${missing.code}/messages`)).status, 404)
  } finally {
    client.disconnect()
    await new Promise<void>(resolve => io.close(() => resolve()))
    await getPrisma().room.deleteMany({ where: { code: { in: [room.code, otherRoom.code] } } })
    await disconnectDatabase()
  }
})
