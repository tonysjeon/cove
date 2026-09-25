import assert from 'node:assert/strict'
import test from 'node:test'
import { createTimers, remainingSeconds } from '../src/services/timers.js'
import type { TimerUpdate } from '../src/types/rooms.js'

test('timer preserves fractional time on pause and resume and resets without drift', async () => {
  let now = 1000
  const updates: TimerUpdate[] = []
  const timers = createTimers(update => updates.push(update), () => now)
  try {
    assert.equal((await timers.snapshot('A')).timer.remainingSeconds, 1500)
    assert.equal((await timers.act('A', 'start')).success, true)
    assert.deepEqual((await timers.act('A', 'start')), { success: false, error: 'TIMER_ALREADY_RUNNING' })
    now += 12345
    const late = (await timers.snapshot('A'))
    assert.equal(remainingSeconds(late.timer, late.serverNow), 1487.655)
    await timers.act('A', 'pause')
    assert.equal((await timers.snapshot('A')).timer.remainingSeconds, 1487.655)
    now += 20000
    assert.equal(remainingSeconds((await timers.snapshot('A')).timer, now), 1487.655)
    await timers.act('A', 'start')
    now += 1000
    assert.equal(remainingSeconds((await timers.snapshot('A')).timer, now), 1486.655)
    await timers.act('A', 'reset')
    assert.equal((await timers.snapshot('A')).timer.status, 'paused')
    assert.equal((await timers.snapshot('A')).timer.remainingSeconds, 1500)
    assert.equal((await timers.snapshot('B')).timer.revision, 0)
    assert.equal(updates.length, 4)
  } finally { await timers.dispose() }
})

test('completion is server-authoritative and cancelled timeouts cannot change a reset timer', async t => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 1000 })
  const updates: TimerUpdate[] = []
  const timers = createTimers(update => updates.push(update))
  try {
    await timers.act('A', 'start')
    t.mock.timers.tick(1500 * 1000)
    assert.equal((await timers.snapshot('A')).timer.mode, 'break')
    assert.equal((await timers.snapshot('A')).timer.status, 'paused')
    assert.equal((await timers.snapshot('A')).timer.remainingSeconds, 300)
    assert.equal(updates.length, 2)
    await timers.act('A', 'start')
    t.mock.timers.tick(300 * 1000)
    assert.equal((await timers.snapshot('A')).timer.mode, 'focus')
    await timers.act('A', 'start')
    await timers.act('A', 'reset')
    const count = updates.length
    t.mock.timers.tick(1500 * 1000)
    assert.equal((await timers.snapshot('A')).timer.mode, 'focus')
    assert.equal(updates.length, count)
  } finally { await timers.dispose() }
})

test('a late snapshot resolves completion even before a delayed timeout runs', async () => {
  let now = 0
  const timers = createTimers(() => {}, () => now)
  try {
    await timers.act('A', 'start')
    now = 1600 * 1000
    const snapshot = (await timers.snapshot('A'))
    assert.equal(snapshot.timer.mode, 'break')
    assert.equal(snapshot.timer.status, 'paused')
    assert.equal(snapshot.timer.remainingSeconds, 300)
  } finally { await timers.dispose() }
})
