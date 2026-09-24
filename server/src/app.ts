import cors from 'cors'
import express, { type ErrorRequestHandler } from 'express'
import { createRoom, getRoom, normalizeRoomCode } from './services/rooms.js'

export function createApp(clientUrl: string, saveRoom = createRoom, findRoom = getRoom) {
  const app = express()
  app.use(cors({ origin: clientUrl }))
  app.use(express.json())
  app.get('/api/health', (_request, response) => {
    response.json({ status: 'ok' })
  })
  app.get('/api/rooms/:roomCode', async (request, response) => {
    const code = normalizeRoomCode(request.params.roomCode)
    if (!code) { response.status(400).json({ error: 'INVALID_ROOM_CODE' }); return }
    const room = await findRoom(code)
    if (!room) { response.status(404).json({ error: 'ROOM_NOT_FOUND' }); return }
    response.json(room)
  })
  app.post('/api/rooms', async (request, response) => {
    const name: unknown = request.body?.name
    if (typeof name !== 'string' || !name.trim() || name.trim().length > 80) {
      response.status(400).json({ error: 'Room name must be between 1 and 80 characters' })
      return
    }
    const room = await saveRoom(name.trim())
    response.status(201).json(room)
  })

  const handleError: ErrorRequestHandler = (error, _request, response, _next) => {
    if (error.type === 'entity.parse.failed') {
      response.status(400).json({ error: 'Invalid JSON body' })
      return
    }
    if (error.type === 'entity.too.large') {
      response.status(413).json({ error: 'Request body is too large' })
      return
    }
    console.error('Request failed', error)
    response.status(500).json({ error: 'Unable to complete the request' })
  }
  app.use(handleError)
  return app
}
