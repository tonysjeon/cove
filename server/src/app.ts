import cors from 'cors'
import express, { type ErrorRequestHandler } from 'express'
import { createRoom } from './services/rooms.js'

export function createApp(clientUrl: string, saveRoom = createRoom) {
  const app = express()
  app.use(cors({ origin: clientUrl }))
  app.use(express.json())
  app.get('/api/health', (_request, response) => {
    response.json({ status: 'ok' })
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
