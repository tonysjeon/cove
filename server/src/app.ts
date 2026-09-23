import cors from 'cors'
import express from 'express'

export function createApp(clientUrl: string) {
  const app = express()
  app.use(cors({ origin: clientUrl }))
  app.use(express.json())
  app.get('/api/health', (_request, response) => {
    response.json({ status: 'ok' })
  })
  return app
}
