import 'dotenv/config'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import type { AddressInfo } from 'node:net'
import test from 'node:test'
import { createApp } from '../src/app.js'
import { getPrisma, disconnectDatabase } from '../src/db/prisma.js'

if (!process.env.TEST_DATABASE_URL) throw new Error('Set TEST_DATABASE_URL to a migrated test database')
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL

test('concurrent room creation persists distinct codes across database connections', async () => {
  const server = createApp('http://localhost:5173').listen(0, '127.0.0.1')
  await once(server, 'listening')
  const codes: string[] = []
  try {
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/rooms`
    const responses = await Promise.all(Array.from({ length: 5 }, (_, index) => fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: `Integration room ${index}` }),
    })))
    for (const response of responses) {
      assert.equal(response.status, 201)
      const room = await response.json() as { code: string; name: string }
      assert.match(room.code, /^[A-HJ-NP-Z2-9]{6}$/)
      codes.push(room.code)
    }
    assert.equal(new Set(codes).size, 5)
    const lookup = await fetch(`${url}/${codes[0].toLowerCase()}`)
    assert.equal(lookup.status, 200)
    assert.equal((await lookup.json() as { code: string }).code, codes[0])
    await disconnectDatabase()
    const rooms = await getPrisma().room.findMany({ where: { code: { in: codes } } })
    assert.equal(rooms.length, 5)
    assert.ok(rooms.every(room => room.name.startsWith('Integration room ')))
  } finally {
    await getPrisma().room.deleteMany({ where: { code: { in: codes } } })
    await disconnectDatabase()
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  }
})
