import assert from 'node:assert/strict'
import test from 'node:test'
import { createMusic } from '../src/services/music.js'
import { musicStations, musicTracks, resolveMusic, type MusicUpdate } from '../src/music/catalog.js'
import { existsSync } from 'node:fs'

test('room music preserves position through pauses, joins, track changes, and repeated station cycles', () => {
  let now = 1000
  const updates: MusicUpdate[] = []
  const radio = createMusic(update => updates.push(update), () => now)
  try {
    assert.equal(radio.snapshot('A').music.status, 'paused')
    radio.act('A', { action: 'play' })
    now += 30_000
    assert.equal(resolveMusic(radio.snapshot('A').music, now).position, 30)
    radio.act('A', { action: 'pause' })
    now += 80_000
    assert.equal(resolveMusic(radio.snapshot('A').music, now).position, 30)
    radio.act('A', { action: 'play' })
    now += 5000
    assert.equal(resolveMusic(radio.snapshot('A').music, now).position, 35)
    const next = radio.act('A', { action: 'next' })
    assert.equal(resolveMusic(next.music, now).track.id, 'cat-caffe')
    assert.equal(resolveMusic(next.music, now).position, 0)
    radio.act('A', { action: 'station', stationId: 'rain' })
    const cycle = resolveMusic(radio.snapshot('A').music, now).duration
    now += (cycle * 100 + 10) * 1000
    assert.ok(Math.abs(resolveMusic(radio.snapshot('A').music, now).position - 10) < .00001)
    assert.equal(radio.snapshot('B').music.status, 'paused')
    assert.equal(updates.length, 5)
    const copy = radio.snapshot('A')
    copy.music.stationId = 'cafe'
    assert.equal(radio.snapshot('A').music.stationId, 'rain')
  } finally { radio.dispose() }
})

test('empty rooms retain the radio during brief reconnects and are eventually released', t => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'] })
  const radio = createMusic(() => {})
  try {
    radio.act('A', { action: 'station', stationId: 'afternoon' })
    radio.presence('A', false)
    t.mock.timers.tick(30_000)
    radio.presence('A', true)
    t.mock.timers.tick(60_000)
    assert.equal(radio.snapshot('A').music.stationId, 'afternoon')
    radio.presence('A', false)
    t.mock.timers.tick(60_000)
    assert.equal(radio.snapshot('A').music.stationId, 'cafe')
  } finally { radio.dispose() }
})

test('previous returns to the prior song and never wraps back from the first song', () => {
  let now = 1000
  const radio = createMusic(() => {}, () => now)
  try {
    for (const station of musicStations) {
      radio.act('A', { action: 'station', stationId: station.id })
      for (const action of ['pause', 'play'] as const) {
        radio.act('A', { action })
        now += 5000
        const first = radio.snapshot('A')
        assert.deepEqual(radio.act('A', { action: 'previous' }), first)
        radio.act('A', { action: 'next' })
        now += 5000
        assert.equal(resolveMusic(radio.snapshot('A').music, now).trackIndex, 1)
        const previous = radio.act('A', { action: 'previous' })
        const resolved = resolveMusic(previous.music, now)
        assert.equal(resolved.track.id, station.tracks[0])
        assert.equal(resolved.trackIndex, 0)
        assert.equal(resolved.position, 0)
        assert.equal(previous.music.status, action === 'play' ? 'playing' : 'paused')
      }
      const duration = resolveMusic(radio.snapshot('A').music, now).duration
      now += (duration * 3 + 5) * 1000
      const wrapped = radio.snapshot('A')
      assert.equal(resolveMusic(wrapped.music, now).trackIndex, 0)
      assert.deepEqual(radio.act('A', { action: 'previous' }), wrapped)
    }
  } finally { radio.dispose() }
})

test('every station has local audio and every track boundary resolves to the next recording', () => {
  for (const track of musicTracks) {
    assert.ok(existsSync(new URL(`../../client/public/music/${track.id}.mp3`, import.meta.url)))
    assert.ok(track.duration > 0)
  }
  for (const station of musicStations) {
    const first = musicTracks.find(track => track.id === station.tracks[0])!
    const state = { stationId: station.id, status: 'playing' as const, offsetSeconds: 0, startedAt: 0, revision: 1 }
    assert.equal(resolveMusic(state, first.duration * 1000).track.id, station.tracks[1])
  }
})
