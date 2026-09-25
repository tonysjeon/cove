import 'dotenv/config'
import { createServer } from 'node:http'
import { createRoomServer } from './socket/rooms.js'
import { createApp } from './app.js'
import { postgresTimerStore } from './services/timer-store.js'
import { disconnectDatabase } from './db/prisma.js'

const port = Number(process.env.PORT || 3001)
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be an integer between 1 and 65535')
}

const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173'
const app = createApp(clientUrl)
const server = createServer(app)
const io = createRoomServer(server, clientUrl, undefined, undefined, postgresTimerStore)
await io.timerReady

server.listen(port, () => {
  console.log(`cove server listening on http://localhost:${port}`)
})

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, async () => {
    await io.stopTimers()
    io.close(() => { void disconnectDatabase() })
  })
}
