# ResolveX frontend

## Run locally

In the first terminal, start the API:

```powershell
Set-Location .\backend
npm run dev
```

In a second terminal, start the React app:

```powershell
Set-Location .\frontend
npm run dev
```

Vite forwards `/api` requests to `http://127.0.0.1:3001`. Start the API before opening the app. Set `VITE_API_BASE_URL` to a different API `/api` URL when building for another environment.

On the first run, create the initial administrator account in the app. Passwords must be at least 12 characters. Later visits show the sign-in form; sign out from **Settings**.

## Deploy on Vercel

The root `vercel.json` defines two services: `frontend` serves `/`, and the `backend` function handles `/api/*`. The browser calls the API through that public same-origin route, so the services do not need a binding. Leave `VITE_API_BASE_URL` unset in Vercel to use `/api`.

1. Import the repository into Vercel from its root.
2. Install the Neon Postgres integration from the Vercel Marketplace, select its Free plan, and connect it to the project so Vercel provides `DATABASE_URL` to the backend.
3. Deploy or redeploy the project after the integration has added `DATABASE_URL`.
4. Before opening the deployed app, back up `database/resolvex.sqlite`, link the Vercel CLI to the project, install the backend dependencies, and run the one-time migration with production environment variables:

   ```powershell
   vercel link
   npm --prefix backend ci
   vercel env run -e production -- npm --prefix backend run db:migrate:sqlite
   ```

   The migration reads the SQLite file without changing it, preserves IDs and records, and aborts rather than overwriting conflicting PostgreSQL rows. If the deployed app has already initialized Neon with sample data, identical rows are left unchanged; conflicting rows stop the migration for manual review.

The migration command receives `DATABASE_URL` from Vercel without writing it to a local file. Keep database credentials in environment variables; never commit them. The backend continues using SQLite for local development when `DATABASE_URL` is unset.

## Deploy on Render

The root `render.yaml` defines a static frontend and a Node API. Push the repository to GitHub, create a Render account, then choose **New + → Blueprint** and connect this repository. Review the services and deploy them; after the frontend is live, open its URL and create the initial administrator.

The API uses a 1 GB persistent disk for SQLite and a paid `0.5c-512mb` web-service plan. Render requires a paid web service for persistent disks. The frontend is a static site. If you change either service name in `render.yaml`, update the matching API URL and allowed frontend origin there too.

## Validation

```powershell
npm run lint
npm run build
```
