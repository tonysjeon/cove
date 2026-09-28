import assert from 'node:assert/strict'
import { once } from 'node:events'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import test from 'node:test'
import { io as connect } from 'socket.io-client'
import { createRoomServer } from '../src/socket/rooms.js'
import type { MusicUpdate } from '../src/music/catalog.js'

test('music controls, snapshots, and broadcasts require membership and remain scoped to one room', async () => {
  const server = createServer()
  const io = createRoomServer(server, 'http://localhost:5173', async code => ({ code, name: 'Radio test' }))
  server.listen(0, '127.0.0.1'); await once(server, 'listening')
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  const clients = Array.from({ length: 3 }, () => connect(url, { autoConnect: false }))
  const [a, b, other] = clients
  const outside: MusicUpdate[] = []
  other.on('music:state', update => outside.push(update))
  const join = (client: typeof a, code: string) => client.timeout(2000).emitWithAck('room:join', { roomCode: code, displayName: 'Radio tester' })
  const command = (client: typeof a, action: unknown, roomCode = 'ABC234') => client.timeout(2000).emitWithAck('music:command', { roomCode, command: action })
  try {
    const connected = Promise.all(clients.map(client => once(client, 'connect')))
    clients.forEach(client => client.connect()); await connected
    assert.deepEqual(await command(a, { action: 'play' }), { success: false, error: 'NOT_IN_ROOM' })
    assert.deepEqual(await a.timeout(2000).emitWithAck('music:sync', { roomCode: 'ABC234' }), { success: false, error: 'NOT_IN_ROOM' })
    const initial = once(a, 'music:state'); await join(a, 'ABC234')
    assert.equal((await initial)[0].music.status, 'paused')
    const separate = once(other, 'music:state'); await join(other, 'DEF567'); await separate
    for (const invalid of [null, {}, { action: 'seek' }, { action: 'station', stationId: 'https://bad.example/audio.mp3' }]) {
      assert.deepEqual(await command(a, invalid), { success: false, error: 'INVALID_MUSIC_COMMAND' })
    }
    const started = once(a, 'music:state')
    const result = await command(a, { action: 'play' })
    assert.equal(result.success, true)
    assert.equal((await started)[0].music.status, 'playing')
    const late = once(b, 'music:state'); await join(b, 'ABC234')
    assert.deepEqual((await late)[0].music, result.state.music)
    const switched = once(b, 'music:state')
    await command(a, { action: 'station', stationId: 'afternoon' })
    assert.equal((await switched)[0].music.stationId, 'afternoon')
    const paused = once(a, 'music:state')
    await command(b, { action: 'pause' })
    assert.equal((await paused)[0].music.status, 'paused')
    const sync = await b.timeout(2000).emitWithAck('music:sync', { roomCode: 'ABC234' })
    assert.equal(sync.state.music.stationId, 'afternoon')
    assert.equal(sync.state.music.status, 'paused')
    const skipped = once(b, 'music:state')
    await command(a, { action: 'next' })
    await skipped
    const previous = once(b, 'music:state')
    const rewound = await command(a, { action: 'previous' })
    assert.equal(rewound.success, true)
    assert.equal((await previous)[0].music.offsetSeconds, 0)
    assert.equal(rewound.state.music.status, 'paused')
    assert.equal(outside.length, 1)
    assert.deepEqual(await command(b, { action: 'next' }, 'DEF567'), { success: false, error: 'NOT_IN_ROOM' })
    assert.deepEqual(await command(b, { action: 'previous' }, 'DEF567'), { success: false, error: 'NOT_IN_ROOM' })
    await b.timeout(2000).emitWithAck('room:leave')
    assert.deepEqual(await command(b, { action: 'play' }), { success: false, error: 'NOT_IN_ROOM' })
  } finally {
    clients.forEach(client => client.disconnect())
    await new Promise<void>(resolve => io.close(() => resolve()))
  }
})
