# ResolveX API

The API uses Node.js built-in HTTP and SQLite modules, so it has no external package dependencies. Use Node.js 22.13 or newer.

From `backend`, run:

```powershell
npm run dev
```

The API listens on `http://127.0.0.1:3001` by default. It creates `database/resolvex.sqlite` on first start and inserts sample tickets if the database is empty.
On the first visit, the frontend guides you through creating the initial administrator account. Use a password with at least 12 characters. Public account setup closes after that account is created.

Passwords are stored as scrypt hashes. Login sessions use random, server-side tokens stored hashed in SQLite and sent to the browser only in `HttpOnly`, `SameSite=Strict` cookies. Sessions expire after 12 hours. Configure `FRONTEND_ORIGINS` as a comma-separated list when the frontend origin differs from the local Vite defaults.

## Endpoints

- `GET /api/health` — API health check
- `GET /api/auth/state` — check initial setup and current session
- `POST /api/auth/setup` — create the first administrator and sign in
- `POST /api/auth/login` — sign in
- `POST /api/auth/logout` — end the current session
- `GET /api/tickets` — list tickets
- `GET /api/tickets/:id` — retrieve one ticket
- `POST /api/tickets` — create a ticket (`title`, `customer`, `description`, `category`, and `priority` required; `status` defaults to `Open`)
- `PUT /api/tickets/:id` — replace a ticket; requires all ticket fields
- `PATCH /api/tickets/:id` — update one or more ticket fields
- `DELETE /api/tickets/:id` — delete a ticket (returns `204 No Content`)
- `GET /api/profile` — read the signed-in user's profile
- `PUT /api/profile` — update the signed-in user's display name

Ticket categories are `Technical`, `Billing`, `Account`, and `General`; priorities are `Low`, `Medium`, `High`, and `Critical`; statuses are `Open`, `Pending`, and `Resolved`. All ticket endpoints require an authenticated session.

The Vite development server proxies `/api` requests to this API. To point a built frontend at another API origin, set `VITE_API_BASE_URL` to that server's `/api` URL when building.

Run API tests with `npm test`.
