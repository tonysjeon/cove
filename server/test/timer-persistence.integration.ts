import 'dotenv/config'
import assert from 'node:assert/strict'
import test from 'node:test'
import { createRoom } from '../src/services/rooms.js'
import { createTimers, remainingSeconds } from '../src/services/timers.js'
import { postgresTimerStore } from '../src/services/timer-store.js'
import { getPrisma, disconnectDatabase } from '../src/db/prisma.js'

if (!process.env.TEST_DATABASE_URL) throw new Error('Set TEST_DATABASE_URL to a migrated test database')
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL

test('PostgreSQL timers survive service and connection restarts including expired countdowns', async () => {
  const running = await createRoom('Running timer test')
  const paused = await createRoom('Paused timer test')
  let now = Date.now()
  let timers = createTimers(() => {}, () => now, postgresTimerStore)
  try {
    await timers.act(running.code, 'start')
    await timers.act(paused.code, 'start')
    now += 12345
    await timers.act(paused.code, 'pause')
    await timers.dispose()
    await disconnectDatabase()
    now += 60000
    timers = createTimers(() => {}, () => now, postgresTimerStore)
    await timers.restore()
    assert.equal(remainingSeconds((await timers.snapshot(running.code)).timer, now), 1427.655)
    const savedPause = (await timers.snapshot(paused.code)).timer
    assert.equal(savedPause.status, 'paused')
    assert.equal(savedPause.remainingSeconds, 1487.655)
    await timers.dispose()
    now += 1500 * 1000
    timers = createTimers(() => {}, () => now, postgresTimerStore)
    await timers.restore()
    const expired = (await timers.snapshot(running.code)).timer
    assert.equal(expired.mode, 'break')
    assert.equal(expired.status, 'paused')
    assert.equal(expired.remainingSeconds, 300)
    assert.equal((await postgresTimerStore.load(running.code))!.revision, expired.revision)
    await timers.act(paused.code, 'reset')
    assert.equal((await postgresTimerStore.load(paused.code))!.remainingSeconds, 1500)
  } finally {
    await timers.dispose()
    await getPrisma().room.deleteMany({ where: { code: { in: [running.code, paused.code] } } })
    await disconnectDatabase()
  }
})
