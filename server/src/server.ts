import 'dotenv/config'
import { createServer } from 'node:http'
import { Server } from 'socket.io'
import { createApp } from './app.js'
import { disconnectDatabase } from './db/prisma.js'

const port = Number(process.env.PORT || 3001)
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be an integer between 1 and 65535')
}

const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173'
const app = createApp(clientUrl)
const server = createServer(app)
const io = new Server(server, { cors: { origin: clientUrl } })

io.on('connection', socket => {
  console.log(`socket connected: ${socket.id}`)
  socket.on('disconnect', reason => {
    console.log(`socket disconnected: ${socket.id} (${reason})`)
  })
})

server.listen(port, () => {
  console.log(`cove server listening on http://localhost:${port}`)
})

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    io.close(() => { void disconnectDatabase() })
  })
}
