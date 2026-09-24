import assert from 'node:assert/strict'
import { once } from 'node:events'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import test from 'node:test'
import { io as connect, type Socket } from 'socket.io-client'
import { createRoomServer } from '../src/socket/rooms.js'
import type { Presence } from '../src/types/rooms.js'

function nextPresence(socket: Socket, count: number) {
  return new Promise<Presence>((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.off('room:presence', receive)
      reject(new Error(`Timed out waiting for ${count} members`))
    }, 2000)
    function receive(presence: Presence) {
      if (presence.members.length !== count) return
      clearTimeout(timeout)
      socket.off('room:presence', receive)
      resolve(presence)
    }
    socket.on('room:presence', receive)
  })
}

test('presence stays room-scoped across joins, repeated joins, switches, leaves, and disconnects', async () => {
  const server = createServer()
  const io = createRoomServer(server, 'http://localhost:5173', async code => ({ code, name: code }))
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  const clients = Array.from({ length: 3 }, () => connect(url, { autoConnect: false, transports: ['websocket'] }))
  const [a, b, c] = clients
  const observed: Presence[][] = [[], [], []]
  clients.forEach((client, index) => client.on('room:presence', update => observed[index].push(update)))
  const join = (client: Socket, roomCode: string, displayName: string) =>
    client.timeout(2000).emitWithAck('room:join', { roomCode, displayName })
  try {
    const connected = Promise.all(clients.map(client => once(client, 'connect')))
    clients.forEach(client => client.connect())
    await connected

    const initial = nextPresence(a, 1)
    await join(a, 'ABC234', 'Tony')
    const first = await initial
    assert.equal(first.members[0].socketId, a.id)
    assert.equal(first.members[0].displayName, 'Tony')
    assert.ok(Number.isFinite(Date.parse(first.members[0].joinedAt)))

    const both = [nextPresence(a, 2), nextPresence(b, 2)]
    await join(b, 'ABC234', 'Tony') // Display names do not identify connections.
    for (const update of await Promise.all(both)) {
      assert.equal(new Set(update.members.map(member => member.socketId)).size, 2)
    }
    const repeated = nextPresence(a, 2)
    await join(a, 'ABC234', 'Tony')
    const unchanged = await repeated
    assert.equal(unchanged.members.find(member => member.socketId === a.id)!.joinedAt, first.members[0].joinedAt)

    const separate = nextPresence(c, 1)
    await join(c, 'DEF567', 'Alex')
    assert.equal((await separate).roomCode, 'DEF567')
    assert.ok(observed[0].every(update => update.roomCode === 'ABC234'))
    assert.ok(observed[2].every(update => update.roomCode === 'DEF567'))

    const switched = [nextPresence(a, 1), nextPresence(c, 2), nextPresence(b, 2)]
    await join(b, 'DEF567', 'Sarah')
    const [oldRoom, newRoom] = await Promise.all(switched)
    assert.deepEqual(oldRoom.members.map(member => member.socketId), [a.id])
    assert.deepEqual(new Set(newRoom.members.map(member => member.socketId)), new Set([b.id, c.id]))

    const left = nextPresence(c, 1)
    assert.deepEqual(await b.timeout(2000).emitWithAck('room:leave'), { success: true })
    assert.deepEqual((await left).members.map(member => member.socketId), [c.id])
    assert.deepEqual(io.sockets.sockets.get(b.id!)!.data, {})
    assert.deepEqual(await b.timeout(2000).emitWithAck('room:leave'), { success: true })

    const rejoined = [nextPresence(a, 2), nextPresence(b, 2)]
    await join(b, 'ABC234', 'Sarah')
    await Promise.all(rejoined)
    const disconnected = nextPresence(a, 1)
    b.disconnect()
    assert.deepEqual((await disconnected).members.map(member => member.socketId), [a.id])

    const empty = once(io.sockets.sockets.get(a.id!)!, 'disconnect')
    a.disconnect()
    await empty
    assert.equal(io.sockets.adapter.rooms.has('ABC234'), false)
    assert.equal(io.sockets.adapter.rooms.get('DEF567')!.size, 1)
  } finally {
    clients.forEach(client => client.disconnect())
    await new Promise<void>(resolve => io.close(() => resolve()))
  }
})

test('leaving while a join is pending removes the eventual membership', async () => {
  const server = createServer()
  let finishLookup!: (room: { code: string; name: string }) => void
  let lookupStarted!: () => void
  const started = new Promise<void>(resolve => { lookupStarted = resolve })
  const io = createRoomServer(server, 'http://localhost:5173', async () => {
    lookupStarted()
    return new Promise(resolve => { finishLookup = resolve })
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const client = connect(`http://127.0.0.1:${(server.address() as AddressInfo).port}`, { autoConnect: false })
  try {
    const connected = once(client, 'connect'); client.connect(); await connected
    const joined = client.timeout(2000).emitWithAck('room:join', { roomCode: 'ABC234', displayName: 'Tony' })
    await started
    const left = client.timeout(2000).emitWithAck('room:leave')
    finishLookup({ code: 'ABC234', name: 'Study' })
    await joined
    assert.deepEqual(await left, { success: true })
    assert.equal(io.sockets.adapter.rooms.has('ABC234'), false)
    assert.deepEqual(io.sockets.sockets.get(client.id!)!.data, {})
  } finally {
    client.disconnect()
    await new Promise<void>(resolve => io.close(() => resolve()))
  }
})
