# cove

A real-time study room project with a React frontend and an Express backend.

## Requirements

- Node.js 22.12 or newer
- npm

## Local development

```sh
npm install
cp client/.env.example client/.env
cp server/.env.example server/.env
npm run dev
```

Open http://localhost:5173 to see the frontend and backend connection status.
The server runs at http://localhost:3001.

To run each service separately, use `npm run dev -w client` and `npm run dev -w server` in separate terminals.

## Environment variables

| File | Variable | Default | Purpose |
| --- | --- | --- | --- |
| `client/.env` | `VITE_API_URL` | `http://localhost:3001` | Backend URL |
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
