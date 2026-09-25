# cove

A real-time study room project with a React frontend and an Express backend.

## Requirements

- Node.js 22.12 or newer
- npm
- PostgreSQL 17 or newer

## Local development

```sh
npm install
cp client/.env.example client/.env
cp server/.env.example server/.env
# Set DATABASE_URL to your running PostgreSQL database
npm run db:deploy -w server
npm run dev
```

Open http://localhost:5173 to create or find a room. The header only shows a connection notice while connecting or reconnecting.
The server runs at http://localhost:3001.

To run each service separately, use `npm run dev -w client` and `npm run dev -w server` in separate terminals.

## Environment variables

| File | Variable | Default | Purpose |
| --- | --- | --- | --- |
| `client/.env` | `VITE_API_URL` | `http://localhost:3001` | Backend URL |
| `server/.env` | `DATABASE_URL` | `postgresql://cove@localhost:5433/cove` | PostgreSQL connection |
| `server/.env` | `PORT` | `3001` | Backend port |
| `server/.env` | `CLIENT_URL` | `http://localhost:5173` | Allowed browser origin |

Restart the relevant development server after changing environment variables.

## Structure

```text
client/             React, Vite, and TypeScript frontend
server/             Express and TypeScript backend
  src/app.ts        Application and health route
  src/server.ts     Environment configuration and listener
  test/             HTTP integration test
scope.md            Project scope
```

## Checks and build

```sh
npm run typecheck
npm test
npm run build
```

The build writes to `client/dist` and `server/dist`.
Run the compiled backend with `npm run start -w server`.
Use `npm run preview -w client` to preview the frontend build; set `CLIENT_URL` to the preview origin if checking API connectivity.

## Manual verification

1. Run `npm run dev` and open http://localhost:5173
2. Confirm the page loads and the **Connecting…** notice clears
3. Open http://localhost:3001/api/health and confirm the response is `{"status":"ok"}`
4. Stop the backend and verify the header shows **Reconnecting…**, then restart it and confirm the room recovers

The health endpoint remains available for diagnostics; the interface uses the live socket connection to show connection status.

## Live connection

Socket.io shares the backend HTTP server and uses the same `CLIENT_URL` CORS origin.
The frontend keeps one socket instance in `client/src/socket/socket.ts` and uses `VITE_API_URL` for both HTTP and socket connections.
Connection listeners are cleaned up when the app unmounts, and interrupted connections retry automatically.
A quiet header notice appears only while connecting or reconnecting; a healthy connection needs no badge.

To verify reconnection, run the client and server in separate terminals and open two tabs at http://localhost:5173. The connection notice should clear in both tabs. Stop the backend and check that both statuses change, then restart it and confirm both reconnect without refreshing. Refresh or close one tab and check the server connection and disconnection logs.

## Local PostgreSQL on macOS

Install PostgreSQL with `brew install postgresql@17`, then run these commands from the repo root once:

```sh
export PATH="$(brew --prefix postgresql@17)/bin:$PATH"
mkdir -p .local
initdb -D .local/postgres -U cove --auth=trust --encoding=UTF8 --locale=C
pg_ctl -D .local/postgres -l .local/postgres.log -o '-h localhost -p 5433' start
createdb -h localhost -p 5433 -U cove cove
```

This development database accepts local connections without a password and listens only on localhost. Database files and logs are ignored by Git. Use an authenticated connection string for a hosted database.

For later sessions, start the existing cluster with the `pg_ctl` command above. Stop it with `pg_ctl -D .local/postgres stop`. Do not rerun `initdb` on an existing cluster.

## Room creation

Enter a name on the home page and select **Create room**. The backend trims the name, validates 1–80 characters, and inserts a room with a random six-character code. A database unique constraint and retries handle code collisions, including concurrent requests.

`POST /api/rooms` accepts `{"name":"Algorithms study group"}` and returns HTTP 201 with `{"code":"ABC234","name":"Algorithms study group"}`. Invalid names return 400; database errors return a generic 500 response.

Successful creation navigates to `/room/:roomCode`, where the room is loaded and a display name is requested before joining.

Schema and SQL migrations are in `server/prisma`. Generate a schema change with `npm run db:migrate -w server -- --name describe_change`; apply committed migrations with `npm run db:deploy -w server`. Development, build, typecheck, and test commands generate Prisma Client automatically.

Database integration tests use a separate database and remove only the rooms they create:

```sh
createdb -h localhost -p 5433 -U cove cove_test
DATABASE_URL=postgresql://cove@localhost:5433/cove_test npm run db:deploy -w server
TEST_DATABASE_URL=postgresql://cove@localhost:5433/cove_test npm run test:integration -w server
```

The root dependency overrides select patched `deepmerge-ts` and `mysql2` releases for Prisma's CLI dependencies. Reassess these overrides when upgrading Prisma.

## Room lookup and joining

Use **Find room** on the home page or open a shared `/room/:roomCode` link. Codes are trimmed and normalized to uppercase. `GET /api/rooms/:roomCode` returns the room name and code, 400 for invalid codes, or 404 for missing rooms.

Enter a display name of 1–30 characters to join. The client sends `room:join` with `{ roomCode, displayName }` and waits for acknowledgement. The server validates the inputs and room existence, joins the matching Socket.io room, and stores the name and room code on the socket. A socket belongs to only one study room at a time; switching rooms removes the prior membership.

The room page remembers successful display names in session storage and rejoins after refresh or reconnection. Disconnecting removes the socket from its rooms. The room view confirms your membership and shows the online member list; the shared timer is available to all joined members.

Verify with two browser tabs: join the same room with different names, refresh one tab, and restart the backend. Each tab should confirm its own name after reconnecting. Also try an invalid code, a nonexistent code, and a blank display name. Automated socket tests cover validation, room isolation, room switching, and disconnecting during lookup.

## Live presence

Each room displays its online count and member names. `room:presence` sends `{ roomCode, members }`, where each member includes a socket ID, display name, and join timestamp. The server derives this list from active Socket.io room memberships and keeps connection metadata in memory, not PostgreSQL.

Joining, switching rooms, leaving, and disconnecting broadcast the updated list only to the affected rooms. Repeated joins do not duplicate a member, and two users may share a display name because socket IDs identify connections. Refreshing replaces the previous connection; the client clears stale presence while disconnected and receives a fresh list after rejoining.

**Leave room** sends `room:leave`, clears the saved name for that room, and returns home. The server serializes leave requests with pending joins so a delayed lookup cannot leave a departed user in a room.

To verify, open two tabs in one room, join with different names, and confirm both show two members. Leave or close one tab and confirm the other updates to one. Refresh and reconnect to check recovery. Open a different room in another tab to check that lists stay isolated. A lost network connection is removed when Socket.io detects the disconnect through its heartbeat timeout.

## Room chat

Joined users can send messages of 1–500 characters. The backend trims content, verifies socket membership, takes the sender name from the socket, and saves each accepted message in PostgreSQL before broadcasting it to that room. The client retains the draft on a send failure and does not automatically retry a send with an uncertain acknowledgement.

`chat:send` accepts `{ roomCode, content }` and acknowledges success with the saved message or a validation/persistence error. `chat:newMessage` carries `{ roomCode, message }` only to members of that room. `GET /api/rooms/:roomCode/messages` returns the latest 50 persisted messages in chronological order. Room codes are shareable access links, not authenticated permissions; anyone with a code can retrieve that room's recent history.

The client subscribes to live updates before loading history, merges by message ID to avoid duplicates or losing messages during the history request, and reloads recent history after reconnecting. A reconnect retrieves the latest 50 messages; older missed messages are not paginated yet. The chat shows sender names, timestamps, loading/error states, and an empty state.

Apply the message migration with `npm run db:deploy -w server` before starting the backend. For verification, join one room in two tabs, send messages in both directions, and refresh to confirm history persists. Use a different room to check isolation. Tests cover membership and content validation, sender spoofing, persistence failures, live/history merging, room isolation, and the 50-message history limit.

## Shared Pomodoro timer

Each room has a 25-minute focus timer and a 5-minute break timer. Any joined member can start, pause, or reset it. Reset pauses the current mode at its full duration. When a countdown completes, the server switches modes and pauses until someone starts the next session.

The server owns timer state and timestamps. `timer:start`, `timer:pause`, and `timer:reset` require membership in the supplied room and acknowledge success or a readable error. `timer:state` is sent on joins and state changes, including completion, only to the affected room. Countdown ticks are rendered locally instead of broadcast each second. The client anchors the countdown to server time and uses a monotonic clock between updates, avoiding dependence on the user's wall-clock setting. Network latency can still cause small display differences.

Late joins and reconnects receive the current authoritative state. Pause retains fractional seconds, preventing repeated pause/resume actions from adding time. Timers continue while a room is empty. Timer state is saved in PostgreSQL and recovered when the backend restarts.

Verify with two tabs: start in one, pause in the other, and reset from either. Join another tab while running and confirm its remaining time matches. Another room's timer should remain unchanged. Automated tests use a controlled clock to verify both mode transitions, delayed completion, cancelled timeouts, pause/resume math, membership validation, and room isolation.

## Timer persistence and recovery

Apply committed migrations with `npm run db:deploy -w server` before starting the backend. Timer actions and mode transitions are saved before acknowledgement or broadcast. Per-room queues serialize timer changes from different sockets so concurrent controls cannot overwrite each other in the single-server deployment.

Startup loads running timers and reschedules completion using their saved timestamps. If a session ended during downtime, the server saves the next mode at its full duration, paused; it does not simulate additional sessions that nobody started. Paused timers load on demand and preserve fractional remaining seconds. Reset is also persisted. Graceful shutdown drains pending timer writes before disconnecting the database.

If a save fails, the previous state remains authoritative and the action returns an error. Failed automatic completions retry after one second. Startup fails if running timers cannot be loaded, rather than silently resetting them. This design supports one backend process; coordination across multiple servers is not implemented.

Verification: start a timer, restart the backend, and confirm it resumes with elapsed downtime deducted. Repeat with a paused timer and confirm it remains paused at the same value. Automated recovery tests cover PostgreSQL reconnection, expired sessions, fractional timing, concurrent controls, and failed saves.

## Connection recovery

Room loading and chat history requests time out after eight seconds and offer retry buttons. A room opened while the backend is offline reloads automatically when the socket connects. Membership retries transient failures while connected and ignores acknowledgements from earlier connections; invalid names and missing rooms remain visible for correction.

Disconnecting clears presence and timer controls until membership is restored. Chat retains its loaded messages and unsent draft. An interrupted send shows an unconfirmed-delivery message, preserves the draft, and ignores stale acknowledgements. It never automatically resends; check the restored history before sending again to avoid duplicates. Drafts are held in memory and do not survive a page refresh.

To verify recovery, join a room, enter an unsent draft, and stop the backend. Confirm the draft remains visible and controls are disabled. Open the same room in a second tab while offline, then restart the backend. The first tab should rejoin with its draft intact, restore presence and timer state, and reload history; the second should load the room without a refresh. Automated membership tests cover transient retries, permanent errors, stale acknowledgements, and cleanup.

## Interface and accessibility

The home page and room share a warm neutral palette, soft green accents, and responsive layouts. Desktop rooms keep the timer and chat beside the member list; narrow screens stack them. Connection notices only appear while connecting or reconnecting, keeping the header quiet when everything is working.

**Copy invite** copies a link built from the current site origin. If clipboard access is unavailable, a selected read-only field offers the link for manual copying. The timer progress bar reflects server-authoritative session time, with focus and break colors and accessible progress values.

Chat scrolls within its own message list. Reading older messages pauses automatic scrolling and exposes **New messages** when updates arrive. **Ctrl + Enter** or **⌘ + Enter** sends a message; Enter inserts a new line. Focus returns to the composer after sending. Forms have associated labels and error descriptions, controls have visible keyboard focus, and the page has a skip-to-content link.

Verify desktop and narrow mobile layouts, keyboard navigation, invite copying, empty states, invalid codes, and two-tab timer and chat updates. Check that loading history does not move the entire page, and new messages do not interrupt reading older chat.
