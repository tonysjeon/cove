import 'dotenv/config'
import { createApp } from './app.js'

const port = Number(process.env.PORT || 3001)
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be an integer between 1 and 65535')
}

const app = createApp(process.env.CLIENT_URL || 'http://localhost:5173')
const server = app.listen(port, () => {
  console.log(`cove server listening on http://localhost:${port}`)
})

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => server.close())
}
