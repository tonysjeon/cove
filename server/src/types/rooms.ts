export type Room = { code: string; name: string }
export type JoinResult =
  | { success: true; room: Room; displayName: string }
  | { success: false; error: 'INVALID_ROOM_CODE' | 'INVALID_DISPLAY_NAME' | 'ROOM_NOT_FOUND' | 'JOIN_FAILED' }

export type ConnectedUser = { socketId: string; displayName: string; joinedAt: string }
export type Presence = { roomCode: string; members: ConnectedUser[] }
export type LeaveResult = { success: true } | { success: false; error: 'LEAVE_FAILED' }

export interface ClientToServerEvents {
  'room:leave': (acknowledge: (result: LeaveResult) => void) => void
  'room:join': (input: { roomCode: string; displayName: string }, acknowledge: (result: JoinResult) => void) => void
}

export interface ServerToClientEvents {
  'room:presence': (presence: Presence) => void
}
export interface SocketData { roomCode?: string; displayName?: string; joinedAt?: string }
