import type { Server as HttpServer } from 'node:http'
import { Server } from 'socket.io'
import { getRoom, normalizeRoomCode } from '../services/rooms.js'
import type { ClientToServerEvents, ServerToClientEvents, SocketData, ConnectedUser } from '../types/rooms.js'

export function createRoomServer(server: HttpServer, clientUrl: string, findRoom = getRoom) {
  const io = new Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>(server, {
    cors: { origin: clientUrl },
  })
  function broadcastPresence(roomCode: string) {
    const members: ConnectedUser[] = []
    for (const socketId of io.sockets.adapter.rooms.get(roomCode) || []) {
      const member = io.sockets.sockets.get(socketId)
      if (member?.data.displayName && member.data.joinedAt) {
        members.push({ socketId, displayName: member.data.displayName, joinedAt: member.data.joinedAt })
      }
    }
    io.to(roomCode).emit('room:presence', { roomCode, members })
  }

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
        const previousRoom = socket.data.roomCode
        if (previousRoom && previousRoom !== roomCode) {
          await socket.leave(previousRoom)
          broadcastPresence(previousRoom)
        }
        await socket.join(roomCode)
        if (!socket.connected) { await socket.leave(roomCode); return }
        socket.data.joinedAt = previousRoom === roomCode && socket.data.joinedAt
          ? socket.data.joinedAt : new Date().toISOString()
        socket.data.roomCode = roomCode
        socket.data.displayName = displayName
        acknowledge({ success: true, room, displayName })
        broadcastPresence(roomCode)
      }).catch(error => {
        console.error('Room join failed', error)
        if (socket.connected) acknowledge({ success: false, error: 'JOIN_FAILED' })
      })
    })
    socket.on('room:leave', acknowledge => {
      if (typeof acknowledge !== 'function') return
      pending = pending.then(async () => {
        if (!socket.connected) return
        const roomCode = socket.data.roomCode
        if (roomCode) {
          await socket.leave(roomCode)
          socket.data = {}
          broadcastPresence(roomCode)
        }
        acknowledge({ success: true })
      }).catch(error => {
        console.error('Room leave failed', error)
        if (socket.connected) acknowledge({ success: false, error: 'LEAVE_FAILED' })
      })
    })
    socket.on('disconnect', reason => {
      const roomCode = socket.data.roomCode
      socket.data = {}
      if (roomCode) broadcastPresence(roomCode)
      console.log(`socket disconnected: ${socket.id} (${reason})`)
    })
  })
  return io
}
