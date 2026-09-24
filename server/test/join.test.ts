import assert from 'node:assert/strict'
import { once } from 'node:events'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import test from 'node:test'
import { io as connect } from 'socket.io-client'
import { createApp } from '../src/app.js'
import { createRoomServer } from '../src/socket/rooms.js'
import type { JoinResult } from '../src/types/rooms.js'

const rooms = new Map([
  ['ABC234', { code: 'ABC234', name: 'Algorithms' }],
  ['DEF567', { code: 'DEF567', name: 'Reading' }],
])
const findRoom = async (code: string) => rooms.get(code) || null

test('room lookup normalizes codes and distinguishes invalid and missing rooms', async () => {
  const server = createApp('http://localhost:5173', undefined, findRoom).listen(0, '127.0.0.1')
  await once(server, 'listening')
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/rooms/`
  try {
    const found = await fetch(url + 'abc234')
    assert.equal(found.status, 200)
    assert.deepEqual(await found.json(), rooms.get('ABC234'))
    const invalid = await fetch(url + 'bad')
    assert.equal(invalid.status, 400)
    assert.deepEqual(await invalid.json(), { error: 'INVALID_ROOM_CODE' })
    const missing = await fetch(url + 'ZZZZZZ')
    assert.equal(missing.status, 404)
    assert.deepEqual(await missing.json(), { error: 'ROOM_NOT_FOUND' })
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  }
})

test('socket joins validate identity, isolate rooms, switch membership, and clean up disconnects', async () => {
  const server = createServer()
  const io = createRoomServer(server, 'http://localhost:5173', findRoom)
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  const a = connect(url, { autoConnect: false, transports: ['websocket'] })
  const b = connect(url, { autoConnect: false, transports: ['websocket'] })
  const join = (client: typeof a, input: unknown) => client.timeout(2000).emitWithAck('room:join', input) as Promise<JoinResult>
  try {
    const connected = Promise.all([once(a, 'connect'), once(b, 'connect')])
    a.connect(); b.connect()
    await connected
    const serverA = io.sockets.sockets.get(a.id!)!
    assert.deepEqual(await join(a, null), { success: false, error: 'INVALID_ROOM_CODE' })
    for (const displayName of ['', '   ', 'a'.repeat(31), 12, {}]) {
      assert.deepEqual(await join(a, { roomCode: 'ABC234', displayName }), {
        success: false, error: 'INVALID_DISPLAY_NAME',
      })
    }
    assert.deepEqual(await join(a, { roomCode: 'ZZZZZZ', displayName: 'Tony' }), {
      success: false, error: 'ROOM_NOT_FOUND',
    })
    assert.equal(serverA.rooms.size, 1)
    assert.deepEqual(await join(a, { roomCode: ' abc234 ', displayName: ' Tony ' }), {
      success: true, room: rooms.get('ABC234'), displayName: 'Tony',
    })
    assert.deepEqual(serverA.data, { roomCode: 'ABC234', displayName: 'Tony' })
    await join(b, { roomCode: 'DEF567', displayName: 'Sarah' })
    assert.deepEqual([...io.sockets.adapter.rooms.get('ABC234')!], [a.id])
    assert.deepEqual([...io.sockets.adapter.rooms.get('DEF567')!], [b.id])
    await join(a, { roomCode: 'DEF567', displayName: 'Tony' })
    assert.equal(io.sockets.adapter.rooms.has('ABC234'), false)
    assert.equal(io.sockets.adapter.rooms.get('DEF567')!.size, 2)
    const disconnected = once(serverA, 'disconnect')
    a.disconnect()
    await disconnected
    assert.equal(io.sockets.adapter.rooms.get('DEF567')!.size, 1)
  } finally {
    a.disconnect(); b.disconnect()
    await new Promise<void>(resolve => io.close(() => resolve()))
  }
})

test('disconnecting during lookup cannot create a stale room membership', async () => {
  let resolveLookup!: (room: { code: string; name: string }) => void
  let started!: () => void
  const lookupStarted = new Promise<void>(resolve => { started = resolve })
  const server = createServer()
  const io = createRoomServer(server, 'http://localhost:5173', async () => {
    started()
    return new Promise(resolve => { resolveLookup = resolve })
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const client = connect(`http://127.0.0.1:${(server.address() as AddressInfo).port}`, { autoConnect: false })
  try {
    const connected = once(client, 'connect'); client.connect(); await connected
    const serverSocket = io.sockets.sockets.get(client.id!)!
    client.emit('room:join', { roomCode: 'ABC234', displayName: 'Tony' }, () => {})
    await lookupStarted
    const disconnected = once(serverSocket, 'disconnect'); client.disconnect(); await disconnected
    resolveLookup(rooms.get('ABC234')!)
    await new Promise<void>(resolve => setImmediate(resolve))
    assert.equal(io.sockets.adapter.rooms.has('ABC234'), false)
  } finally {
    client.disconnect()
    await new Promise<void>(resolve => io.close(() => resolve()))
  }
})
