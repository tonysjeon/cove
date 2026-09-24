import { io } from 'socket.io-client'
import { apiUrl } from '../config'

export const socket = io(apiUrl, { autoConnect: false })

if (import.meta.env.DEV) {
  import.meta.hot?.dispose(() => socket.disconnect())
}
