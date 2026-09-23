# cove

## 1. Project Overview

Build a real-time study room web application where users can join a shared room, see who is currently online, send live messages, and use a synchronized Pomodoro timer together.

The goal of this project is not to build a huge social platform. It should stay focused on demonstrating strong backend development, WebSocket communication, shared state synchronization, and clean React state management.

### Core Stack

- React
- TypeScript
- Node.js
- Express
- Socket.io
- PostgreSQL
- Prisma
- Tailwind CSS

### Main Technical Goals

The project should demonstrate:

- real-time client/server communication
- WebSocket event design
- room-based communication
- online presence tracking
- synchronized shared state
- backend API design
- database persistence
- reconnect handling
- clean frontend state management
- separation between REST and Socket.io responsibilities

---

## 2. MVP Scope

The MVP should support four main capabilities:

1. Create and join study rooms
2. See who is currently online
3. Send live room messages
4. Control a synchronized Pomodoro timer

Do not add video calls, file sharing, direct messages, AI features, or complex productivity analytics during the initial implementation.

---

## 3. User Flow

### Landing Page

A user lands on the app and can:

- enter a display name
- create a new study room
- join an existing room using a room code

Example:

```text
Display Name
Tony

[ Create Room ]

or

Room Code
ABC123

[ Join Room ]
```

Creating a room should generate a short shareable room code.

Example:

```text
http://localhost:5173/room/ABC123
```

---

## 4. Room Page

The main room page should contain three major sections.

### Room Header

Display:

- room name
- room code
- copy invite button
- number of connected users

Example:

```text
Algorithms Grind

Room ABC123

4 online
```

### Shared Pomodoro Timer

Display:

```text
FOCUS

24:36

[ Start ] [ Pause ] [ Reset ]

Focus: 25 min
Break: 5 min
```

All connected clients must see the same timer state.

If one user starts the timer, everyone sees it start.

If one user pauses the timer, everyone sees it pause.

If someone refreshes or joins halfway through a session, they should receive the correct current timer value rather than starting from 25:00.

### Member Sidebar

Display all currently connected users.

Example:

```text
Online

● Tony
● Sarah
● Alex
● Maya
```

Presence should update immediately when users:

- join
- leave
- refresh
- disconnect

### Live Chat

Display room messages in chronological order.

Example:

```text
Tony
Anyone working on DP?

Sarah
Yeah, doing coin change right now.

Alex
Same here.
```

Users can type a message and send it without refreshing.

Messages should be broadcast only to users in the same room.

---

## 5. Architecture

Use a simple client/server structure.

```text
cove/
│
├── client/
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── hooks/
│   │   ├── context/
│   │   ├── socket/
│   │   ├── services/
│   │   ├── types/
│   │   └── App.tsx
│   │
│   └── package.json
│
├── server/
│   ├── src/
│   │   ├── routes/
│   │   ├── socket/
│   │   ├── services/
│   │   ├── db/
│   │   ├── types/
│   │   ├── app.ts
│   │   └── server.ts
│   │
│   ├── prisma/
│   │   └── schema.prisma
│   │
│   └── package.json
│
├── .env.example
├── README.md
└── scope.md
```

Do not create unnecessary abstractions early.

Prefer readable feature-based files over enterprise-style architecture.

---

## 6. Backend Responsibilities

Express should handle standard request/response operations.

Socket.io should handle real-time events.

### REST Responsibilities

Use REST for operations such as:

```text
POST /api/rooms
GET /api/rooms/:roomCode
GET /api/rooms/:roomCode/messages
```

Possible future endpoint:

```text
PATCH /api/rooms/:roomCode
```

REST should be used for persisted resource retrieval and creation.

---

## 7. Socket.io Responsibilities

Socket.io should handle:

- joining rooms
- leaving rooms
- presence
- chat messages
- timer updates
- reconnections

Socket rooms should map directly to application room codes.

Example:

```ts
socket.join(roomCode)
```

Then broadcasts can use:

```ts
io.to(roomCode).emit(...)
```

Never broadcast study room events globally.

---

## 8. Socket Event Design

Keep socket event names explicit.

### Client -> Server

```text
room:join
room:leave

chat:send

timer:start
timer:pause
timer:reset
timer:skip
```

### Server -> Client

```text
room:joined
room:userJoined
room:userLeft
room:presence

chat:newMessage

timer:state
```

Avoid vague event names such as:

```text
update
change
message
data
```

---

## 9. Join Room Event

Client sends:

```ts
{
  roomCode: "ABC123",
  displayName: "Tony"
}
```

Server should:

1. validate the room exists
2. associate socket ID with user information
3. join the Socket.io room
4. update room presence
5. send current timer state
6. send updated online members to everyone

Possible acknowledgement:

```ts
{
  success: true,
  room: {...},
  timer: {...}
}
```

---

## 10. Presence Model

Presence should initially remain in server memory.

Example:

```ts
type ConnectedUser = {
  socketId: string
  displayName: string
  joinedAt: Date
}
```

Possible structure:

```ts
Map<string, Map<string, ConnectedUser>>
```

Where:

```text
roomCode -> socketId -> ConnectedUser
```

Do not store socket IDs in PostgreSQL.

They are temporary connection state.

---

## 11. Disconnect Handling

Listen for:

```ts
socket.on("disconnect", ...)
```

The server must determine which room the socket belonged to and remove that user from presence.

Then emit the new member list:

```ts
io.to(roomCode).emit("room:presence", users)
```

The UI should update without requiring a refresh.

---

## 12. Chat

### Sending

Client emits:

```ts
socket.emit("chat:send", {
  roomCode,
  content
})
```

The server should already know which display name belongs to the socket.

Do not trust a username supplied with every chat message.

### Message Object

Use a structure similar to:

```ts
type Message = {
  id: string
  roomId: string
  senderName: string
  content: string
  createdAt: string
}
```

### Persistence

Persist chat messages in PostgreSQL.

When someone enters a room:

1. fetch recent messages through REST
2. subscribe to new messages through Socket.io

This demonstrates a useful hybrid model:

```text
Historical state -> REST
Live updates -> WebSocket
```

Initially load the most recent 50 messages.

---

## 13. Shared Timer

The shared timer is the most important real-time systems component.

Do not synchronize the timer by broadcasting a new number every second.

Instead, make the server authoritative over timer state.

Use timestamps.

---

## 14. Timer State Model

Example:

```ts
type TimerState = {
  mode: "focus" | "break"
  status: "running" | "paused"
  durationSeconds: number
  remainingSeconds: number
  startedAt: number | null
}
```

When paused:

```text
remainingSeconds = exact remaining time
startedAt = null
```

When running:

```text
remainingSeconds = remaining time at moment of start
startedAt = Date.now()
```

---

## 15. Timer Calculation

Suppose:

```text
remainingSeconds = 1500
startedAt = 10:00:00
```

At 10:05:00, calculate:

```ts
elapsed = currentTime - startedAt
remaining = remainingSeconds - elapsed
```

This prevents timer drift.

Each client can render the countdown locally while using the server state as the source of truth.

---

## 16. Timer Start

User clicks Start.

Client emits:

```text
timer:start
```

Server:

1. verifies timer is currently paused
2. records `startedAt`
3. changes status to `running`
4. broadcasts the new timer state

Example:

```ts
io.to(roomCode).emit("timer:state", timer)
```

---

## 17. Timer Pause

When pause is requested:

1. calculate elapsed time
2. calculate current remaining seconds
3. set `remainingSeconds`
4. set `startedAt = null`
5. set status to `paused`
6. broadcast state

---

## 18. Timer Reset

Reset should restore the current mode's full duration.

Focus:

```text
25 minutes
```

Break:

```text
5 minutes
```

Initial implementation can hardcode these durations.

Room-specific customization can be added later.

---

## 19. Timer Completion

Clients should not independently decide that the shared timer changed modes.

The server must remain authoritative.

The server can maintain a lightweight timeout when the timer starts.

When the countdown completes:

```text
focus -> break
break -> focus
```

Then emit the new timer state to the room.

If the timeout becomes complicated, a short interval on the server checking active timers is acceptable for the MVP.

---

## 20. Late Join Behavior

This is an important correctness requirement.

Suppose a user joins when the timer has already been running for 12 minutes.

The server sends:

```ts
{
  status: "running",
  remainingSeconds: 1500,
  startedAt: ...
}
```

The new client calculates the actual current time remaining.

It should immediately show approximately:

```text
13:00
```

not:

```text
25:00
```

---

## 21. Database Schema

Use Prisma.

Initial models:

```prisma
model Room {
  id        String    @id @default(cuid())
  code      String    @unique
  name      String
  createdAt DateTime  @default(now())

  messages Message[]
  timer    TimerState?
}

model Message {
  id         String   @id @default(cuid())
  roomId     String
  senderName String
  content    String
  createdAt  DateTime @default(now())

  room Room @relation(fields: [roomId], references: [id], onDelete: Cascade)
}

model TimerState {
  id               String   @id @default(cuid())
  roomId           String   @unique
  mode             String
  status           String
  durationSeconds  Int
  remainingSeconds Int
  startedAt        DateTime?
  updatedAt        DateTime @updatedAt

  room Room @relation(fields: [roomId], references: [id], onDelete: Cascade)
}
```

Timer state may initially be kept in memory if that makes the first implementation simpler.

However, persisting it is preferable once the basic socket implementation works.

---

## 22. Room Codes

Generate simple human-readable room codes.

Example:

```text
A7K2QF
```

Use:

- uppercase letters
- numbers
- length around 6 characters

Avoid confusing characters if desired:

```text
0
O
I
1
```

Check the database for collisions before creating a room.

---

## 23. Frontend State

Keep state responsibilities separated.

Example:

```text
RoomContext
    room metadata

SocketContext
    Socket.io connection

Presence state
    connected members

Chat state
    messages

Timer state
    synchronized timer
```

Do not place the entire application into one giant context.

---

## 24. Socket Connection

Create one socket instance for the application.

Example:

```text
src/socket/socket.ts
```

Do not create a new Socket.io connection inside every component.

---

## 25. React Hooks

Useful custom hooks could include:

```text
useSocket
useRoom
usePresence
useChat
useTimer
```

Only introduce hooks when they simplify repeated logic.

Do not create wrappers purely for abstraction.

---

## 26. Frontend Pages

Initial routes:

```text
/
```

Landing/create/join page.

```text
/room/:roomCode
```

Main study room.

Optional:

```text
/room/:roomCode/join
```

if joining requires entering a name first.

---

## 27. Suggested Room Layout

Desktop:

```text
------------------------------------------------------
| Study Room                          ABC123 | 4 Online |
------------------------------------------------------
|                                      |              |
|              TIMER                   |   MEMBERS    |
|                                      |              |
|              24:32                   | ● Tony       |
|                                      | ● Sarah      |
|       Start   Pause   Reset          | ● Alex       |
|                                      |              |
|--------------------------------------|              |
|                                      |              |
|               CHAT                   |              |
|                                      |              |
| Tony: Anyone doing DP?               |              |
| Sarah: Yeah                          |              |
|                                      |              |
| [ Type a message... ]       [Send]   |              |
------------------------------------------------------
```

Mobile can stack the sections vertically.

---

## 28. Validation

Validate all socket inputs on the backend.

Examples:

Room code:

```text
must be valid
must exist
```

Display name:

```text
1-30 characters
```

Chat message:

```text
1-500 characters
```

Trim whitespace.

Reject empty messages.

Never trust the client to provide authoritative room or user state.

---

## 29. Error Handling

The backend should emit or acknowledge meaningful errors.

Example:

```ts
{
  success: false,
  error: "Room not found"
}
```

Possible errors:

```text
ROOM_NOT_FOUND
INVALID_DISPLAY_NAME
INVALID_MESSAGE
NOT_IN_ROOM
TIMER_ALREADY_RUNNING
```

Frontend should show readable messages rather than silently failing.

---

## 30. Reconnection

Socket.io will attempt reconnection automatically.

When a socket reconnects, the frontend should rejoin the current study room.

Store enough temporary client state to know:

```text
roomCode
displayName
```

Using `sessionStorage` is sufficient for the MVP.

After reconnecting:

```text
socket connect
    ->
emit room:join again
    ->
receive latest presence
    ->
receive authoritative timer state
```

---

## 31. Development Phases

Codex should build this project incrementally.

Do not implement the entire application in one pass.

### Phase 1 - Project Setup

Create:

```text
client/
server/
```

Configure:

- React
- TypeScript
- Vite
- Express
- Socket.io
- CORS
- environment variables

Create a basic health endpoint:

```text
GET /api/health
```

Expected:

```json
{
  "status": "ok"
}
```

Confirm the React frontend can communicate with the backend.

### Phase 2 - Basic Socket Connection

Add Socket.io server.

Connect React client.

Display connection state somewhere temporarily:

```text
Connected
```

Log:

```text
socket connected
socket disconnected
```

No rooms yet.

### Phase 3 - Room Creation

Implement PostgreSQL and Prisma.

Create the Room model.

Implement:

```text
POST /api/rooms
```

Request:

```json
{
  "name": "Algorithms Grind"
}
```

Response:

```json
{
  "code": "ABC123",
  "name": "Algorithms Grind"
}
```

Frontend should navigate to:

```text
/room/ABC123
```

### Phase 4 - Join Room

Implement:

```text
GET /api/rooms/:roomCode
```

Build the join flow.

User enters:

```text
displayName
roomCode
```

Then client connects to that Socket.io room.

### Phase 5 - Presence

Implement:

```text
room:join
room:leave
room:presence
```

Show connected users in real time.

Test with multiple browser tabs.

Expected behavior:

```text
Tab 1 joins -> Tony appears
Tab 2 joins -> Sarah appears for both users
Tab 2 closes -> Sarah disappears for Tony
```

### Phase 6 - Live Chat

Implement the Message model.

Add:

```text
GET /api/rooms/:roomCode/messages
```

Then implement:

```text
chat:send
chat:newMessage
```

Persist every accepted message.

Test across multiple clients.

### Phase 7 - Shared Timer

Create server-side room timer state.

Implement:

```text
timer:start
timer:pause
timer:reset
timer:state
```

Use timestamps rather than per-second socket broadcasts.

Verify two browser tabs remain synchronized.

### Phase 8 - Timer Persistence

Persist timer state using PostgreSQL.

On server restart:

1. load saved timer state
2. calculate current remaining duration
3. restore room timer

Handle the case where the timer would have completed while the server was unavailable.

### Phase 9 - Reconnection

Implement Socket.io reconnection handling.

Verify:

```text
disconnect Wi-Fi / stop backend
restart connection
```

User should:

- reconnect
- rejoin the room
- regain current presence
- regain current timer state

### Phase 10 - UI Polish

Add:

- responsive layout
- room copy button
- timer progress indicator
- timestamps
- chat auto-scroll
- empty states
- connection indicator
- basic loading states
- error messages

Avoid spending significant time on visual polish before the real-time functionality works.

---

## 32. Testing

At minimum, test manually with multiple browser tabs.

### Presence

```text
User joins
User leaves
User refreshes
User reconnects
```

### Chat

```text
Two users send messages
Messages appear immediately
Messages persist after refresh
Messages stay isolated between rooms
```

### Timer

```text
Start timer from Client A
Client B starts counting down

Pause from Client B
Client A pauses

Join from Client C after 30 seconds
Client C sees correct remaining time

Reset from Client C
Everyone resets
```

### Room Isolation

Create:

```text
Room A
Room B
```

Verify that:

```text
Room A chat does not appear in Room B

Room A users do not appear in Room B

Room A timer does not affect Room B
```

This is a critical test.

---

## 33. Automated Testing

After the MVP works, add backend tests for:

- room creation
- invalid room codes
- message validation
- timer calculations

Timer calculations should preferably be isolated into pure functions.

Example:

```ts
getRemainingSeconds(timer, now)
```

This makes time-related behavior much easier to test.

---

## 34. Non-Goals

Do not build these in the initial version:

- video calls
- screen sharing
- direct messages
- friend systems
- OAuth
- complex profiles
- file uploads
- calendars
- AI assistants
- collaborative documents
- notifications
- mobile applications
- Redis
- Kubernetes
- microservices

They add complexity without strengthening the core project enough to justify them initially.

---

## 35. Optional V2 Features

Only consider these after the MVP is stable.

### Timer Settings

Allow room owners to configure:

```text
Focus duration
Short break
Long break
```

### Room Ownership

Introduce an owner role.

Owner can:

```text
rename room
change timer settings
clear timer
remove users
```

### Study Sessions

Track completed Pomodoros.

Example:

```text
Today

Tony      4 sessions
Sarah     3 sessions
Alex      2 sessions
```

### Room History

Store:

```text
session start
session completion
session type
duration
```

This could support basic productivity analytics.

### Redis

If demonstrating scalability becomes important, add Redis later for:

```text
presence
Socket.io pub/sub
shared timer state
```

Then multiple Node.js server instances could communicate through the Socket.io Redis adapter.

Do not add Redis before the single-server version works.

---

## 36. Deployment

Suggested deployment structure:

```text
Frontend
Vercel

Backend
Railway / Render / Fly.io

Database
Neon / Supabase PostgreSQL
```

Make sure the backend host supports persistent WebSocket connections.

Environment variables:

```env
DATABASE_URL=
CLIENT_URL=
PORT=
```

Frontend:

```env
VITE_API_URL=
```

---

## 37. README Goals

The README should emphasize the system design rather than simply listing features.

Include:

```text
Real-time architecture
Socket event flow
Presence implementation
Timer synchronization design
REST vs WebSocket responsibilities
Database schema
Reconnection strategy
Local development setup
```

A useful architecture diagram:

```text
               React Client
              /           \
             /             \
         REST API       Socket.io
            |               |
            |               |
        Express -------- Node Server
            |
       PostgreSQL
```

For timer synchronization:

```text
User presses Start
        |
        v
Client emits timer:start
        |
        v
Server updates authoritative state
        |
        v
Server broadcasts timer:state
        |
        v
All clients calculate countdown locally
```

---

## 38. Completion Criteria

The MVP is complete when all of the following work:

- users can create study rooms
- users can join by room code
- users choose a display name
- multiple users can join the same room
- all users see live presence
- users disappear when disconnected
- users can send live messages
- messages persist in PostgreSQL
- users receive recent chat history after joining
- one shared Pomodoro timer exists per room
- timer actions synchronize across clients
- joining users receive the correct current timer
- refreshing does not permanently break room membership
- reconnecting restores room state
- separate rooms remain completely isolated
- frontend is usable on desktop and mobile

---

## 39. Codex Development Rules

When implementing this project:

1. Work through the phases sequentially.
2. Do not implement future phases unless the current phase works.
3. Keep code straightforward and readable.
4. Avoid unnecessary design patterns or abstractions.
5. Do not introduce Redis, Docker, authentication, or microservices unless explicitly requested.
6. Prefer TypeScript types for all socket event payloads.
7. Keep the server authoritative over shared room state.
8. Do not broadcast timer updates every second.
9. Use timestamps to derive countdown state.
10. Keep REST retrieval separate from real-time socket updates.
11. Validate all client-provided data on the backend.
12. Test real-time features using at least two browser sessions before moving on.
13. After each phase, summarize:
    - files created
    - files changed
    - functionality added
    - manual test steps
    - remaining known issues
14. Stop after each major phase so the implementation can be reviewed before continuing.

---

## 40. First Codex Task

Start with **Phase 1 only**.

Create the initial monorepo-style project structure with:

- React
- Vite
- TypeScript frontend
- Node.js
- Express
- TypeScript backend
- environment variable support
- CORS
- `/api/health` endpoint
- frontend API health check

Do not implement Socket.io, PostgreSQL, rooms, chat, or the timer yet.

Once Phase 1 is working, provide:

1. the resulting folder structure
2. commands to run the client and server
3. environment variables required
4. a brief explanation of the setup
5. manual verification steps

Then stop and wait for the next implementation instruction.
