# ResolveX — Smart Support Ticket Management System

ResolveX is a modern, responsive, full-stack support ticket management system designed for fast customer issue resolution, status tracking, and team collaboration.

Built with a **React 19 (Vite)** frontend and a lightweight **Node.js** backend, it supports zero-dependency **SQLite** for local development and **Neon PostgreSQL** for serverless production deployments.

---

## 🚀 Features

- **Ticket Lifecycle Management**: Create, view, edit, categorize, prioritize, and track tickets through `Open`, `Pending`, and `Resolved` states.
- **Interactive Dashboard**: Real-time stats, ticket metrics, and breakdown charts built with Recharts.
- **Secure Authentication**:
  - First-run initial administrator creation wizard.
  - Strong scrypt password hashing.
  - Secure server-side sessions with `HttpOnly` and `SameSite` cookies.
  - Role-based access control.
- **Search & Filtering**: Quick search and filter by category (`Technical`, `Billing`, `Account`, `General`) and priority (`Low`, `Medium`, `High`, `Critical`).
- **Dual-Database Support**:
  - Local: Built-in Node.js SQLite (no extra database installation required).
  - Production: Neon Serverless PostgreSQL with automated migration scripts.

---

## 🛠️ Tech Stack

- **Frontend**: React 19, Vite, React Router, Recharts, Lucide React, Axios
- **Backend**: Node.js (>=22.13), Native HTTP, `pg` (PostgreSQL client)
- **Database**: SQLite (local) / Neon PostgreSQL (production)
- **Deployment**: Vercel (Multi-Service / Serverless) or Render (Blueprint)

---

## 📂 Project Structure

```text
ResolveX/
├── backend/                  # Node.js API backend
│   ├── api/index.js          # Vercel serverless entrypoint
│   ├── src/
│   │   ├── app.js            # Request handling & routing
│   │   ├── auth.js           # scrypt password hashing & session auth
│   │   ├── database.js       # Database abstraction (SQLite / PostgreSQL)
│   │   ├── migrate-sqlite-to-postgres.js # One-time migration script
│   │   ├── postgres-schema.js # Neon PostgreSQL schema definitions
│   │   └── server.js         # Local standalone HTTP server
│   └── test/api.test.js      # Backend integration tests
├── database/                 # SQLite schema & local database files
│   ├── resolvex.sqlite       # Local SQLite database
│   └── schema.sql            # Base SQLite schema
├── frontend/                 # React 19 Vite application
│   ├── src/
│   │   ├── App.jsx           # Main UI & ticket management views
│   │   ├── api.js            # Axios client with credentials
│   │   └── index.css         # Styling & responsive design
│   └── vite.config.js        # Vite configuration & dev proxy
├── render.yaml               # Render Blueprint configuration
├── vercel.json               # Vercel multi-service configuration
└── README.md                 # Project documentation
```

---

## 💻 Local Development Setup

### Prerequisites
- Node.js **>= 22.13.0**
- npm

### 1. Clone the repository
```bash
git clone https://github.com/RidhiiBansal/-ResolveX.git
cd -ResolveX
```

### 2. Start the Backend API
In your first terminal:
```bash
cd backend
npm install
npm run dev
```
The API starts at `http://127.0.0.1:3001` and automatically provisions the SQLite database with seed tickets.

### 3. Start the Frontend
In a second terminal:
```bash
cd frontend
npm install
npm run dev
```
Open `http://localhost:5173` in your browser. On first launch, follow the prompt to create your initial administrator account.

---

## 🚢 Deployment

### Option A: Deploy to Vercel with Neon PostgreSQL (Recommended)

1. **Import Project to Vercel**:
   - Go to [vercel.com](https://vercel.com) and click **Add New... → Project**.
   - Select your imported GitHub repository: `RidhiiBansal/-ResolveX`.
   - Keep root as `./`. Vercel will detect `vercel.json`.

2. **Add Neon Postgres Integration**:
   - In Vercel, navigate to the **Integrations** or **Storage** tab.
   - Install the **Neon Postgres** integration (Free Plan) and link it to your project.
   - This automatically configures `DATABASE_URL` in your production environment.

3. **Deploy**:
   - Click **Deploy**. Vercel deploys the frontend and creates the `/api` serverless functions.

4. **Migrate Local Data (Optional)**:
   To transfer existing tickets from your local SQLite database to Neon PostgreSQL:
   ```powershell
   npx vercel link
   npm --prefix backend ci
   npx vercel env run -e production -- npm --prefix backend run db:migrate:sqlite
   ```

---

### Option B: Deploy to Render (Blueprint)

1. Push this repository to GitHub.
2. Go to [dashboard.render.com](https://dashboard.render.com).
3. Click **New + → Blueprint** and select this repository.
4. Render will read `render.yaml` and configure:
   - `resolvex-api`: Web service running Node.js with a persistent disk for SQLite.
   - `resolvex-web`: Static site hosting the React frontend.
5. Click **Apply** to deploy both services.

---

## 🧪 Testing

Run backend tests:
```bash
cd backend
npm test
```

Run frontend linting & production build:
```bash
cd frontend
npm run lint
npm run build
```
