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

## Validation

```powershell
npm run lint
npm run build
```
