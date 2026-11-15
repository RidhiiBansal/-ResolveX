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

## Deploy on Render

The root `render.yaml` defines a static frontend and a Node API. Push the repository to GitHub, create a Render account, then choose **New + → Blueprint** and connect this repository. Review the services and deploy them; after the frontend is live, open its URL and create the initial administrator.

The API uses a 1 GB persistent disk for SQLite and a paid `0.5c-512mb` web-service plan. Render requires a paid web service for persistent disks. The frontend is a static site. If you change either service name in `render.yaml`, update the matching API URL and allowed frontend origin there too.

## Validation

```powershell
npm run lint
npm run build
```
