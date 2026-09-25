export type TimerState = {
  mode: 'focus' | 'break'
  status: 'running' | 'paused'
  durationSeconds: number
  remainingSeconds: number
  startedAt: number | null
  revision: number
}
export type TimerUpdate = { roomCode: string; timer: TimerState; serverNow: number }
export type TimerAction = 'start' | 'pause' | 'reset'
export type TimerResult =
  | { success: true; state: TimerUpdate }
  | { success: false; error: 'NOT_IN_ROOM' | 'TIMER_ALREADY_RUNNING' | 'TIMER_ALREADY_PAUSED' | 'TIMER_FAILED' }
type TimerCommand = (input: { roomCode: string }, acknowledge: (result: TimerResult) => void) => void

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
  'timer:start': TimerCommand
  'timer:pause': TimerCommand
  'timer:reset': TimerCommand
  'chat:send': (input: { roomCode: string; content: string }, acknowledge: (result: SendResult) => void) => void
  'room:leave': (acknowledge: (result: LeaveResult) => void) => void
  'room:join': (input: { roomCode: string; displayName: string }, acknowledge: (result: JoinResult) => void) => void
}

export interface ServerToClientEvents {
  'timer:state': (update: TimerUpdate) => void
  'chat:newMessage': (update: ChatUpdate) => void
  'room:presence': (presence: Presence) => void
}
export interface SocketData { roomCode?: string; displayName?: string; joinedAt?: string }
