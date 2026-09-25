import assert from 'node:assert/strict'
import test from 'node:test'
import { createTimers, remainingSeconds } from '../src/services/timers.js'
import { memoryTimerStore } from '../src/services/timer-store.js'

test('restart restores running and paused state and resolves elapsed sessions', async () => {
  let now = 1000
  const store = memoryTimerStore()
  let timers = createTimers(() => {}, () => now, store)
  await timers.act('running', 'start')
  await timers.act('paused', 'start')
  now += 12345
  await timers.act('paused', 'pause')
  await timers.dispose()
  now += 60000
  timers = createTimers(() => {}, () => now, store)
  try {
    await timers.restore()
    assert.equal(remainingSeconds((await timers.snapshot('running')).timer, now), 1427.655)
    assert.equal((await timers.snapshot('paused')).timer.remainingSeconds, 1487.655)
    assert.equal((await timers.snapshot('paused')).timer.status, 'paused')
    await timers.dispose()
    now += 1500 * 1000
    timers = createTimers(() => {}, () => now, store)
    await timers.restore()
    assert.equal((await timers.snapshot('running')).timer.mode, 'break')
    assert.equal((await timers.snapshot('running')).timer.remainingSeconds, 300)
    assert.equal((await store.load('running'))!.status, 'paused')
  } finally { await timers.dispose() }
})

test('failed saves neither broadcast nor replace the last saved state and later actions recover', async () => {
  const store = memoryTimerStore()
  let fail = false
  let broadcasts = 0
  const timers = createTimers(() => { broadcasts++ }, () => 1000, {
    ...store,
    save: async (code, timer) => { if (fail) throw new Error('Offline'); await store.save(code, timer) },
  })
  try {
    await timers.act('A', 'start')
    fail = true
    await assert.rejects(timers.act('A', 'pause'), /Offline/)
    assert.equal(broadcasts, 1)
    assert.equal((await timers.snapshot('A')).timer.status, 'running')
    assert.equal((await store.load('A'))!.status, 'running')
    fail = false
    assert.equal((await timers.act('A', 'pause')).success, true)
    assert.equal(broadcasts, 2)
  } finally { await timers.dispose() }
})

test('concurrent actions for one room are serialized across clients', async () => {
  const store = memoryTimerStore()
  const timers = createTimers(() => {}, () => 1000, store)
  try {
    const results = await Promise.all([timers.act('A', 'start'), timers.act('A', 'start'), timers.act('A', 'pause')])
    assert.equal(results[0].success, true)
    assert.deepEqual(results[1], { success: false, error: 'TIMER_ALREADY_RUNNING' })
    assert.equal(results[2].success, true)
    assert.equal((await store.load('A'))!.status, 'paused')
    assert.equal((await store.load('A'))!.revision, 2)
  } finally { await timers.dispose() }
})
