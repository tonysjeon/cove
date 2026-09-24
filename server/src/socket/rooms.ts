import type { Server as HttpServer } from 'node:http'
import { Server } from 'socket.io'
import { getRoom, normalizeRoomCode } from '../services/rooms.js'
import type { ClientToServerEvents, ServerToClientEvents, SocketData } from '../types/rooms.js'

export function createRoomServer(server: HttpServer, clientUrl: string, findRoom = getRoom) {
  const io = new Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>(server, {
    cors: { origin: clientUrl },
  })
  io.on('connection', socket => {
    console.log(`socket connected: ${socket.id}`)
    // Serialize joins so a slower lookup cannot overwrite a later room choice.
    let pending = Promise.resolve()
    socket.on('room:join', (input, acknowledge) => {
      if (typeof acknowledge !== 'function') return
      pending = pending.then(async () => {
        if (!socket.connected) return
        const roomCode = normalizeRoomCode(input?.roomCode)
        if (!roomCode) { acknowledge({ success: false, error: 'INVALID_ROOM_CODE' }); return }
        const displayName = typeof input?.displayName === 'string' ? input.displayName.trim() : ''
        if (!displayName || displayName.length > 30) {
          acknowledge({ success: false, error: 'INVALID_DISPLAY_NAME' })
          return
        }
        const room = await findRoom(roomCode)
        if (!socket.connected) return
        if (!room) { acknowledge({ success: false, error: 'ROOM_NOT_FOUND' }); return }
        if (socket.data.roomCode && socket.data.roomCode !== roomCode) {
          await socket.leave(socket.data.roomCode)
        }
        await socket.join(roomCode)
        socket.data.roomCode = roomCode
        socket.data.displayName = displayName
        acknowledge({ success: true, room, displayName })
      }).catch(error => {
        console.error('Room join failed', error)
        if (socket.connected) acknowledge({ success: false, error: 'JOIN_FAILED' })
      })
    })
    socket.on('disconnect', reason => {
      console.log(`socket disconnected: ${socket.id} (${reason})`)
    })
  })
  return io
}
