import assert from 'node:assert/strict'
import test from 'node:test'
import { createRoomLifetime, RoomClosedError, ROOM_LIFETIME_MS as DAY, type RoomLifetimeStore } from '../src/services/room-lifetime.js'

function fixture() {
  let time = 1000
  let occupied = false
  let fail = false
  const rooms = new Map<string, { code: string; name: string; expiresAt: Date | null }>([['ABC234', { code: 'ABC234', name: 'Study', expiresAt: new Date(time + DAY) }]])
  const reserved = new Set(rooms.keys())
  const store: RoomLifetimeStore = {
    read: async code => rooms.has(code) ? { ...rooms.get(code)! } : null,
    reserved: async code => reserved.has(code),
    occupied: async code => { rooms.get(code)!.expiresAt = null },
    empty: async (code, date) => {
      if (fail) throw new Error('Database offline')
      const room = rooms.get(code)
      if (room && room.expiresAt === null) room.expiresAt = date
    },
    recover: async date => { for (const room of rooms.values()) if (room.expiresAt === null) room.expiresAt = date },
    expired: async date => [...rooms.values()].filter(room => room.expiresAt !== null && room.expiresAt <= date).map(room => room.code),
    remove: async code => { rooms.delete(code) },
  }
  const create = () => createRoomLifetime(store, { occupied: () => occupied, now: () => time, remove: async (_code, remove) => remove() })
  return { rooms, store, create, setTime: (value: number) => { time = value }, setOccupied: (value: boolean) => { occupied = value }, setFail: (value: boolean) => { fail = value } }
}

test('quiet occupied rooms stay open and the deadline starts only after the last member leaves', async () => {
  const f = fixture(); const life = f.create()
  try {
    await life.join('ABC234', async () => f.setOccupied(true))
    f.setTime(3 * DAY); await life.sweep()
    assert.equal(f.rooms.get('ABC234')!.expiresAt, null)
    f.setOccupied(false); await life.presence('ABC234')
    assert.equal(f.rooms.get('ABC234')!.expiresAt!.getTime(), 4 * DAY)
    f.setTime(3 * DAY + 1000); await life.presence('ABC234')
    assert.equal(f.rooms.get('ABC234')!.expiresAt!.getTime(), 4 * DAY)
    await life.join('ABC234', async () => f.setOccupied(true))
    assert.equal(f.rooms.get('ABC234')!.expiresAt, null)
    f.setTime(5 * DAY); await life.sweep()
    assert.ok(await life.lookup('ABC234'))
  } finally { await life.dispose() }
})

test('unused rooms expire at the deadline and old codes remain closed after deletion', async () => {
  const f = fixture(); const life = f.create()
  try {
    f.setTime(DAY + 1000)
    await assert.rejects(life.join('ABC234', async () => assert.fail('Must not join')), RoomClosedError)
    assert.equal(f.rooms.size, 0)
    await assert.rejects(life.lookup('ABC234'), RoomClosedError)
    assert.equal(await life.lookup('DEF567'), null)
  } finally { await life.dispose() }
})

test('restart preserves empty deadlines and gives previously occupied rooms time to reconnect', async () => {
  const f = fixture(); let life = f.create()
  await life.initialize(); assert.equal(f.rooms.get('ABC234')!.expiresAt!.getTime(), 1000 + DAY)
  await life.join('ABC234', async () => f.setOccupied(true)); await life.dispose()
  f.setOccupied(false); f.setTime(4000); life = f.create()
  try {
    await life.initialize()
    assert.equal(f.rooms.get('ABC234')!.expiresAt!.getTime(), 4000 + DAY)
    f.setTime(8000); await life.dispose(); life = f.create(); await life.initialize()
    assert.equal(f.rooms.get('ABC234')!.expiresAt!.getTime(), 4000 + DAY)
  } finally { await life.dispose() }
})

test('cleanup waits for a pending join and never deletes its newly occupied room', async () => {
  const f = fixture(); const life = f.create()
  // Simulate a stale expiry candidate fetched before the join cleared its deadline.
  f.store.expired = async () => ['ABC234']
  let release!: () => void; let entered!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  const entering = new Promise<void>(resolve => { entered = resolve })
  try {
    const join = life.join('ABC234', async () => { entered(); await gate; f.setOccupied(true) })
    await entering
    f.setTime(2 * DAY)
    const sweep = life.sweep()
    release(); await join; await sweep
    assert.ok(f.rooms.has('ABC234'))
    assert.equal(f.rooms.get('ABC234')!.expiresAt, null)
  } finally { release(); await life.dispose() }
})

test('a failed or abandoned join cannot leave an immortal room and failed presence writes retain the original deadline', async () => {
  const f = fixture(); const life = f.create()
  try {
    await assert.rejects(life.join('ABC234', async () => { throw new Error('Join cancelled') }), /cancelled/)
    assert.equal(f.rooms.get('ABC234')!.expiresAt!.getTime(), 1000 + DAY)
    await life.join('ABC234', async () => f.setOccupied(true))
    f.setOccupied(false); f.setTime(2000); f.setFail(true)
    await assert.rejects(life.presence('ABC234'), /offline/)
    f.setTime(8000); f.setFail(false); await life.sweep()
    assert.equal(f.rooms.get('ABC234')!.expiresAt!.getTime(), 2000 + DAY)
    f.setTime(2000 + DAY); await life.sweep()
    assert.equal(f.rooms.size, 0)
  } finally { await life.dispose() }
})


test('a deletion that wins the race prevents a queued join from resurrecting the room', async () => {
  const f = fixture(); const life = f.create()
  let release!: () => void; let deleting!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  const started = new Promise<void>(resolve => { deleting = resolve })
  f.store.remove = async code => { deleting(); await gate; f.rooms.delete(code) }
  try {
    f.setTime(2 * DAY)
    const sweep = life.sweep(); await started
    const join = life.join('ABC234', async () => assert.fail('Must stay closed'))
    const rejected = assert.rejects(join, RoomClosedError)
    release(); await sweep; await rejected
    assert.equal(f.rooms.size, 0)
  } finally { release(); await life.dispose() }
})
