export type Room = { code: string; name: string }
export type JoinResult =
  | { success: true; room: Room; displayName: string }
  | { success: false; error: 'INVALID_ROOM_CODE' | 'INVALID_DISPLAY_NAME' | 'ROOM_NOT_FOUND' | 'JOIN_FAILED' }

export interface ClientToServerEvents {
  'room:join': (input: { roomCode: string; displayName: string }, acknowledge: (result: JoinResult) => void) => void
}

export interface ServerToClientEvents {}
export interface SocketData { roomCode?: string; displayName?: string }
