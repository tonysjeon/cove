import { io, type Socket } from 'socket.io-client'
import type { ClientToServerEvents, ServerToClientEvents } from '../../../server/src/types/rooms'
import { apiUrl } from '../config'

export const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(apiUrl, { autoConnect: false })

if (import.meta.env.DEV) {
  import.meta.hot?.dispose(() => socket.disconnect())
}
