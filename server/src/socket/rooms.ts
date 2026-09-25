import type { Server as HttpServer } from 'node:http'
import { Server } from 'socket.io'
import { memoryTimerStore, type TimerStore } from '../services/timer-store.js'
import { createTimers } from '../services/timers.js'
import { saveMessage } from '../services/messages.js'
import { getRoom, normalizeRoomCode } from '../services/rooms.js'
import type { ClientToServerEvents, ServerToClientEvents, SocketData, ConnectedUser } from '../types/rooms.js'

export function createRoomServer(server: HttpServer, clientUrl: string, findRoom = getRoom, persistMessage = saveMessage, timerStore: TimerStore = memoryTimerStore()) {
  const io = new Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>(server, {
    cors: { origin: clientUrl },
  })
  const timers = createTimers(update => io.to(update.roomCode).emit('timer:state', update), () => Date.now(), timerStore)
  const timerReady = timers.restore()
  server.once('close', () => timers.dispose())

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
        await timerReady
        const timerState = await timers.snapshot(roomCode)
        if (!socket.connected) return
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
        socket.emit('timer:state', timerState)
      }).catch(error => {
        console.error('Room join failed', error)
        if (socket.connected) acknowledge({ success: false, error: 'JOIN_FAILED' })
      })
    })
    for (const action of ['start', 'pause', 'reset'] as const) {
      socket.on(`timer:${action}`, (input, acknowledge) => {
        if (typeof acknowledge !== 'function') return
        pending = pending.then(async () => {
          if (!socket.connected) return
          const roomCode = normalizeRoomCode(input?.roomCode)
          if (!roomCode || socket.data.roomCode !== roomCode || !socket.rooms.has(roomCode)) {
            acknowledge({ success: false, error: 'NOT_IN_ROOM' })
            return
          }
          await timerReady
          acknowledge(await timers.act(roomCode, action))
        }).catch(error => {
          console.error('Timer action failed', error)
          if (socket.connected) acknowledge({ success: false, error: 'TIMER_FAILED' })
        })
      })
    }
    socket.on('chat:send', (input, acknowledge) => {
      if (typeof acknowledge !== 'function') return
      pending = pending.then(async () => {
        if (!socket.connected) return
        const roomCode = normalizeRoomCode(input?.roomCode)
        const { displayName } = socket.data
        if (!roomCode || socket.data.roomCode !== roomCode || !socket.rooms.has(roomCode) || !displayName) {
          acknowledge({ success: false, error: 'NOT_IN_ROOM' })
          return
        }
        const content = typeof input?.content === 'string' ? input.content.trim() : ''
        if (!content || content.length > 500) {
          acknowledge({ success: false, error: 'INVALID_MESSAGE' })
          return
        }
        const message = await persistMessage(roomCode, displayName, content)
        io.to(roomCode).emit('chat:newMessage', { roomCode, message })
        if (socket.connected) acknowledge({ success: true, message })
      }).catch(error => {
        console.error('Chat send failed', error)
        if (socket.connected) acknowledge({ success: false, error: 'SEND_FAILED' })
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
  return Object.assign(io, { timerReady, stopTimers: timers.dispose })
}
