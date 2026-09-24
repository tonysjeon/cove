import assert from 'node:assert/strict'
import { once } from 'node:events'
import type { AddressInfo } from 'node:net'
import test from 'node:test'
import { createApp } from '../src/app.js'

test('room creation trims names and rejects invalid input before saving', async () => {
  const saved: string[] = []
  const server = createApp('http://localhost:5173', async name => {
    saved.push(name)
    return { name, code: 'ABC234' }
  }).listen(0, '127.0.0.1')
  await once(server, 'listening')
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/rooms`
  try {
    const response = await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '  Study group  ' }),
    })
    assert.equal(response.status, 201)
    assert.deepEqual(await response.json(), { name: 'Study group', code: 'ABC234' })
    for (const name of [undefined, null, 42, {}, '', '   ', 'a'.repeat(81)]) {
      const invalid = await fetch(url, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }),
      })
      assert.equal(invalid.status, 400)
    }
    const malformed = await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{bad',
    })
    assert.equal(malformed.status, 400)
    assert.deepEqual(await malformed.json(), { error: 'Invalid JSON body' })
    assert.deepEqual(saved, ['Study group'])
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  }
})
