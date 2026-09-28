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
import { postgresRoomLifetimeStore } from '../src/services/room-lifetime-store.js'
import { postgresTimerStore } from '../src/services/timer-store.js'
import { getPrisma, disconnectDatabase } from '../src/db/prisma.js'
import { ROOM_LIFETIME_MS } from '../src/services/room-lifetime.js'

if (!process.env.TEST_DATABASE_URL) throw new Error('Set TEST_DATABASE_URL to a migrated test database')
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL

test('room expiry persists, protects active sockets, cascades data, and closes HTTP and socket access', async () => {
  const room = await createRoom('Expiry integration')
  const unused = await createRoom('Unused integration')
  const codes = [room.code, unused.code]
  const db = getPrisma()
  const scopedStore = {
    ...postgresRoomLifetimeStore,
    recover: async (expiresAt: Date) => { await db.room.updateMany({ where: { code: { in: codes }, expiresAt: null }, data: { expiresAt } }) },
    expired: async (now: Date) => (await postgresRoomLifetimeStore.expired(now)).filter(code => codes.includes(code)),
  }
  const server = createServer(createApp('http://localhost:5173', createRoom, code => io.roomLifetime!.lookup(code)))
  const io = createRoomServer(server, 'http://localhost:5173', undefined, undefined, postgresTimerStore, scopedStore)
  await io.timerReady
  server.listen(0, '127.0.0.1'); await once(server, 'listening')
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  const a = connect(url, { autoConnect: false }); const b = connect(url, { autoConnect: false })
  try {
    const record = await db.room.findUniqueOrThrow({ where: { code: room.code } })
    assert.ok(Math.abs(record.expiresAt!.getTime() - record.createdAt.getTime() - ROOM_LIFETIME_MS) < 1000, `created=${record.createdAt.toISOString()} expires=${record.expiresAt?.toISOString()}`)
    const connected = Promise.all([once(a, 'connect'), once(b, 'connect')]); a.connect(); b.connect(); await connected
    for (const client of [a, b]) assert.equal((await client.timeout(2000).emitWithAck('room:join', { roomCode: room.code, displayName: 'Expiry tester' })).success, true)
    await io.roomLifetime!.lookup(room.code) // Drain presence writes.
    assert.equal((await db.room.findUniqueOrThrow({ where: { code: room.code } })).expiresAt, null)
    await db.room.update({ where: { code: room.code }, data: { expiresAt: new Date(0) } })
    await io.roomLifetime!.sweep()
    assert.equal((await db.room.findUniqueOrThrow({ where: { code: room.code } })).expiresAt, null)
    await a.timeout(2000).emitWithAck('room:leave'); await io.roomLifetime!.lookup(room.code)
    assert.equal((await db.room.findUniqueOrThrow({ where: { code: room.code } })).expiresAt, null)
    await b.timeout(2000).emitWithAck('timer:start', { roomCode: room.code })
    await b.timeout(2000).emitWithAck('music:command', { roomCode: room.code, command: { action: 'play' } })
    await db.message.create({ data: { roomId: record.id, senderName: 'Fixture', content: 'Expired fixture history' } })
    await b.timeout(2000).emitWithAck('room:leave'); await io.roomLifetime!.lookup(room.code)
    const deadline = (await db.room.findUniqueOrThrow({ where: { code: room.code } })).expiresAt!
    assert.ok(Math.abs(deadline.getTime() - Date.now() - ROOM_LIFETIME_MS) < 5000)
    await db.room.updateMany({ where: { code: { in: codes } }, data: { expiresAt: new Date(0) } })
    assert.equal((await fetch(`${url}/api/rooms/${room.code}`)).status, 410)
    assert.equal((await fetch(`${url}/api/rooms/${room.code}/messages`)).status, 410)
    assert.deepEqual(await a.timeout(2000).emitWithAck('room:join', { roomCode: room.code, displayName: 'Too late' }), { success: false, error: 'ROOM_CLOSED' })
    await io.roomLifetime!.sweep()
    assert.equal(await db.room.count({ where: { code: { in: codes } } }), 0)
    assert.equal(await db.message.count({ where: { roomId: record.id } }), 0)
    assert.equal(await db.timerState.count({ where: { roomId: record.id } }), 0)
    assert.equal(await db.roomCode.count({ where: { code: { in: codes } } }), 2)
    await assert.rejects(db.room.create({ data: { name: 'Cannot reuse', reservedCode: { create: { code: room.code } } } }))
  } finally {
    a.disconnect(); b.disconnect()
    await new Promise<void>(resolve => io.close(() => resolve()))
    await io.roomLifetime!.dispose(); await io.stopTimers()
    await db.room.deleteMany({ where: { code: { in: codes } } })
    await db.roomCode.deleteMany({ where: { code: { in: codes } } })
    await disconnectDatabase()
  }
})
