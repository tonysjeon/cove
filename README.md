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

Open http://localhost:5173 to see the frontend and backend connection status.
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
2. Confirm the page shows **Backend connected**
3. Open http://localhost:3001/api/health and confirm the response is `{"status":"ok"}`
4. Stop the backend and refresh the frontend to verify the unavailable message

The frontend fetches the health endpoint directly, so this also verifies the browser CORS configuration.

## Live connection

Socket.io shares the backend HTTP server and uses the same `CLIENT_URL` CORS origin.
The frontend keeps one socket instance in `client/src/socket/socket.ts` and uses `VITE_API_URL` for both HTTP and socket connections.
Connection listeners are cleaned up when the app unmounts, and interrupted connections retry automatically.
The API health check runs on page load; the live connection status updates continuously.

To verify reconnection, run the client and server in separate terminals and open two tabs at http://localhost:5173. Both should show **Live connection: Connected**. Stop the backend and check that both statuses change, then restart it and confirm both reconnect without refreshing. Refresh or close one tab and check the server connection and disconnection logs.

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

The room page remembers successful display names in session storage and rejoins after refresh or reconnection. Disconnecting removes the socket from its rooms. The room view confirms your membership and shows the online member list; chat and the timer will be added separately.

Verify with two browser tabs: join the same room with different names, refresh one tab, and restart the backend. Each tab should confirm its own name after reconnecting. Also try an invalid code, a nonexistent code, and a blank display name. Automated socket tests cover validation, room isolation, room switching, and disconnecting during lookup.

## Live presence

Each room displays its online count and member names. `room:presence` sends `{ roomCode, members }`, where each member includes a socket ID, display name, and join timestamp. The server derives this list from active Socket.io room memberships and keeps connection metadata in memory, not PostgreSQL.

Joining, switching rooms, leaving, and disconnecting broadcast the updated list only to the affected rooms. Repeated joins do not duplicate a member, and two users may share a display name because socket IDs identify connections. Refreshing replaces the previous connection; the client clears stale presence while disconnected and receives a fresh list after rejoining.

**Leave room** sends `room:leave`, clears the saved name for that room, and returns home. The server serializes leave requests with pending joins so a delayed lookup cannot leave a departed user in a room.

To verify, open two tabs in one room, join with different names, and confirm both show two members. Leave or close one tab and confirm the other updates to one. Refresh and reconnect to check recovery. Open a different room in another tab to check that lists stay isolated. A lost network connection is removed when Socket.io detects the disconnect through its heartbeat timeout.
