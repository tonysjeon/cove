import type { Socket } from 'socket.io-client'
import type { ClientToServerEvents, JoinResult, ServerToClientEvents } from '../../../server/src/types/rooms'

type RoomSocket = Socket<ServerToClientEvents, ClientToServerEvents>

/** Own one membership attempt and cancel retries and stale acknowledgements on cleanup. */
export function joinRoomSession(socket: RoomSocket, roomCode: string, displayName: string, callbacks: {
  waiting: (status: string) => void
  result: (result: JoinResult) => void
}, retryDelay = 1500) {
  let active = true
  let generation = 0
  let retry: ReturnType<typeof setTimeout> | undefined
  function join() {
    clearTimeout(retry)
    if (!active || !socket.connected) return
    const current = ++generation
    callbacks.waiting('Joining room…')
    socket.timeout(8000).emit('room:join', { roomCode, displayName }, (error, result) => {
      if (!active || current !== generation) return
      if (error || (!result.success && result.error === 'JOIN_FAILED')) {
        callbacks.waiting('Unable to join — retrying…')
        retry = setTimeout(join, retryDelay)
        return
      }
      callbacks.result(result)
    })
  }
  function disconnected() {
    generation++
    clearTimeout(retry)
    callbacks.waiting('Disconnected — waiting to rejoin…')
  }
  socket.on('connect', join)
  socket.on('disconnect', disconnected)
  if (socket.connected) join()
  else callbacks.waiting('Waiting for a connection…')
  return () => {
    active = false
    clearTimeout(retry)
    socket.off('connect', join)
    socket.off('disconnect', disconnected)
  }
}
