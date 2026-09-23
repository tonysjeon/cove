import assert from 'node:assert/strict'
import { once } from 'node:events'
import type { AddressInfo } from 'node:net'
import test from 'node:test'
import { createApp } from '../src/app.js'

test('health endpoint returns JSON and allows the configured client origin', async () => {
  const origin = 'http://localhost:5173'
  const server = createApp(origin).listen(0, '127.0.0.1')
  await once(server, 'listening')
  try {
    const { port } = server.address() as AddressInfo
    const response = await fetch(`http://127.0.0.1:${port}/api/health`, {
      headers: { Origin: origin },
    })
    assert.equal(response.status, 200)
    assert.match(response.headers.get('content-type') || '', /application\/json/)
    assert.equal(response.headers.get('access-control-allow-origin'), origin)
    assert.deepEqual(await response.json(), { status: 'ok' })
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  }
})
