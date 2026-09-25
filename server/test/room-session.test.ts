import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import test from 'node:test'
import { joinRoomSession } from '../../client/src/socket/room-session'

function fixture() {
  const events = new EventEmitter()
  const acknowledgements: ((error: Error | null, result?: unknown) => void)[] = []
  const socket = Object.assign(events, {
    connected: true,
    timeout: () => ({ emit: (_event: string, _payload: unknown, ack: typeof acknowledgements[number]) => acknowledgements.push(ack) }),
  })
  const statuses: string[] = []
  const results: unknown[] = []
  const dispose = joinRoomSession(socket as unknown as Parameters<typeof joinRoomSession>[0], 'ABCDEF', 'Ada', {
    waiting: status => statuses.push(status), result: result => results.push(result),
  }, 5)
  return { socket, acknowledgements, statuses, results, dispose }
}
const success = { success: true, room: { code: 'ABCDEF', name: 'Study' }, displayName: 'Ada' }

test('rejoin ignores acknowledgements from a disconnected membership attempt', () => {
  const f = fixture()
  try {
    f.socket.connected = false
    f.socket.emit('disconnect')
    f.socket.connected = true
    f.socket.emit('connect')
    f.acknowledgements[0](null, success)
    assert.equal(f.results.length, 0)
    f.acknowledgements[1](null, success)
    assert.deepEqual(f.results, [success])
  } finally { f.dispose() }
})

test('transient failures retry while permanent failures let the user correct their input', async () => {
  const f = fixture()
  try {
    f.acknowledgements[0](null, { success: false, error: 'JOIN_FAILED' })
    await new Promise(resolve => setTimeout(resolve, 25))
    assert.equal(f.acknowledgements.length, 2)
    f.acknowledgements[1](null, { success: false, error: 'ROOM_NOT_FOUND' })
    await new Promise(resolve => setTimeout(resolve, 25))
    assert.equal(f.acknowledgements.length, 2)
    assert.deepEqual(f.results, [{ success: false, error: 'ROOM_NOT_FOUND' }])
  } finally { f.dispose() }
})

test('cleanup cancels retry timers and ignores pending acknowledgements', async () => {
  const f = fixture()
  f.acknowledgements[0](new Error('timeout'))
  f.dispose()
  await new Promise(resolve => setTimeout(resolve, 25))
  f.acknowledgements[0](null, success)
  assert.equal(f.acknowledgements.length, 1)
  assert.equal(f.results.length, 0)
  assert.equal(f.socket.listenerCount('connect'), 0)
  assert.equal(f.socket.listenerCount('disconnect'), 0)
})
