import assert from 'node:assert/strict'
import { once } from 'node:events'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import test from 'node:test'
import { io as connect } from 'socket.io-client'
import { createRoomServer } from '../src/socket/rooms.js'
import type { TimerUpdate } from '../src/types/rooms.js'

test('timer actions require membership and synchronize only the current room including late joins', async () => {
  const server = createServer()
  const io = createRoomServer(server, 'http://localhost:5173', async code => ({ code, name: code }))
  server.listen(0, '127.0.0.1'); await once(server, 'listening')
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  const clients = Array.from({ length: 3 }, () => connect(url, { autoConnect: false }))
  const [a, b, other] = clients
  const outsiderStates: TimerUpdate[] = []
  other.on('timer:state', update => outsiderStates.push(update))
  const join = (client: typeof a, code: string) => client.timeout(2000).emitWithAck('room:join', { roomCode: code, displayName: 'Tester' })
  try {
    const connected = Promise.all(clients.map(client => once(client, 'connect')))
    clients.forEach(client => client.connect()); await connected
    assert.deepEqual(await a.timeout(2000).emitWithAck('timer:start', { roomCode: 'ABC234' }), { success: false, error: 'NOT_IN_ROOM' })
    const initial = once(a, 'timer:state'); await join(a, 'ABC234')
    assert.equal((await initial)[0].timer.remainingSeconds, 1500)
    const separate = once(other, 'timer:state'); await join(other, 'DEF567'); await separate
    const started = once(a, 'timer:state')
    const start = await a.timeout(2000).emitWithAck('timer:start', { roomCode: 'ABC234' })
    assert.equal(start.success, true)
    assert.equal((await started)[0].timer.status, 'running')
    const late = once(b, 'timer:state'); await join(b, 'ABC234')
    const snapshot = (await late)[0] as TimerUpdate
    assert.equal(snapshot.timer.startedAt, start.state.timer.startedAt)
    assert.ok(snapshot.serverNow >= start.state.serverNow)
    const paused = once(a, 'timer:state')
    await b.timeout(2000).emitWithAck('timer:pause', { roomCode: 'ABC234' })
    assert.equal((await paused)[0].timer.status, 'paused')
    assert.deepEqual(await b.timeout(2000).emitWithAck('timer:reset', { roomCode: 'DEF567' }), { success: false, error: 'NOT_IN_ROOM' })
    const reset = once(a, 'timer:state')
    await b.timeout(2000).emitWithAck('timer:reset', { roomCode: 'ABC234' })
    assert.equal((await reset)[0].timer.remainingSeconds, 1500)
    assert.equal(outsiderStates.length, 1)
    await b.timeout(2000).emitWithAck('room:leave')
    assert.deepEqual(await b.timeout(2000).emitWithAck('timer:start', { roomCode: 'ABC234' }), { success: false, error: 'NOT_IN_ROOM' })
  } finally {
    clients.forEach(client => client.disconnect())
    await new Promise<void>(resolve => io.close(() => resolve()))
  }
})
