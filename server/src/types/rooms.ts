export type ChatMessage = { id: string; roomId: string; senderName: string; content: string; createdAt: string }
export type ChatUpdate = { roomCode: string; message: ChatMessage }
export type SendResult =
  | { success: true; message: ChatMessage }
  | { success: false; error: 'NOT_IN_ROOM' | 'INVALID_MESSAGE' | 'SEND_FAILED' }

export type Room = { code: string; name: string }
export type JoinResult =
  | { success: true; room: Room; displayName: string }
  | { success: false; error: 'INVALID_ROOM_CODE' | 'INVALID_DISPLAY_NAME' | 'ROOM_NOT_FOUND' | 'JOIN_FAILED' }

export type ConnectedUser = { socketId: string; displayName: string; joinedAt: string }
export type Presence = { roomCode: string; members: ConnectedUser[] }
export type LeaveResult = { success: true } | { success: false; error: 'LEAVE_FAILED' }

export interface ClientToServerEvents {
  'chat:send': (input: { roomCode: string; content: string }, acknowledge: (result: SendResult) => void) => void
  'room:leave': (acknowledge: (result: LeaveResult) => void) => void
  'room:join': (input: { roomCode: string; displayName: string }, acknowledge: (result: JoinResult) => void) => void
}

export interface ServerToClientEvents {
  'chat:newMessage': (update: ChatUpdate) => void
  'room:presence': (presence: Presence) => void
}
export interface SocketData { roomCode?: string; displayName?: string; joinedAt?: string }
