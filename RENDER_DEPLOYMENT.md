# Clever Campus ERP — Render demo / testing deployment

This guide prepares a **split-service** demo on Render:

- Frontend: `https://clever-campus-frontend.onrender.com`
- Backend: `https://clever-campus-api.onrender.com`
- PostgreSQL: Render Postgres

Existing Docker Compose (`docker-compose.yml`, `DOCKER.md`) is unchanged and remains the VPS/self-host path.

This document does **not** mean the app is already live on Render. You must create the services.

---

## Architecture notes (read first)

| Piece | How it runs on Render |
| --- | --- |
| Backend | Native Node 22 Web Service (`backend/`) |
| Frontend | Native Node 22 Web Service (`frontend/`) — TanStack Start SSR |
| Database | Render PostgreSQL (`DATABASE_URL`) |
| Redis | **Not required.** `REDIS_URL` is reserved; app code does not use Redis yet |
| Uploads | Local disk under `UPLOAD_DIR` (ephemeral on free/starter) |
| Email | Resend and/or SMTP. Resend `@resend.dev` can only mail the Resend account email until you verify a domain |

**Do not deploy the Docker Compose stack on Render** for this demo. Native Node services are simpler and cheaper. Keep Docker for a future VPS.

---

## SECTION 1 — GitHub preparation

1. Create a GitHub repository (private is fine).
2. Confirm these files are **not** committed: `backend/.env`, `frontend/.env`, real API keys.
3. Push `main` (or your working branch) to GitHub.
4. You will connect that repo when creating Render services.

Suggested commit (run locally when you are ready):

```bash
git add RENDER_DEPLOYMENT.md backend frontend docker-compose.yml .gitignore
git status
```

Do not commit secrets.

---

## SECTION 2 — Create PostgreSQL on Render

1. Render Dashboard → **New** → **PostgreSQL**.
2. Name: `clever-campus-db`.
3. Region: closest to you.
4. Plan: Starter (or the lowest available paid plan; free Postgres is no longer generally available).
5. Create the database.
6. Copy the **Internal Database URL** for the backend on Render, or the **External Database URL** if you need to connect from your laptop.
7. Append query params if missing:

```
?schema=public&connection_limit=5&sslmode=require
```

Wait until the database status is **Available** before starting the API.

---

## SECTION 3 — Create the backend service

1. Render Dashboard → **New** → **Web Service**.
2. Connect the GitHub repository.
3. Settings:

| Field | Value |
| --- | --- |
| Name | `clever-campus-api` |
| Region | Same as Postgres |
| Root directory | `backend` |
| Runtime | Node |
| Instance type | Free or Starter |
| Build command | `npm ci && npx prisma generate && npm run build` |
| Start command | `npm run start:render` |
| Health check path | `/api/health/ready` |

`start:render` runs `prisma migrate deploy` then `node dist/main.js`.

### Backend environment variables

Set these in the Render service **Environment** tab. Replace the placeholder URLs after the frontend exists (you can save a temporary frontend URL and update both services once).

```
NODE_ENV=production
PORT=10000
HOST=0.0.0.0
DATABASE_URL=<Internal Database URL from Section 2>
JWT_SECRET=<at least 32 random characters>
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_DAYS=7
CORS_ORIGINS=https://clever-campus-frontend.onrender.com
FRONTEND_URL=https://clever-campus-frontend.onrender.com
EMAIL_PROVIDER=resend
RESEND_API_KEY=<your Resend key>
EMAIL_FROM=Clever Campus <beth.t@example.com>
RESEND_FROM=Clever Campus <beth.t@example.com>
EMAIL_FROM_NAME=Clever Campus
EMAIL_FROM_LOCAL=onboarding
EMAIL_FROM_DOMAIN=resend.dev
UPLOAD_DIR=uploads
REDIS_URL=
```

Optional SMTP (needed to send OTP to users other than the Resend account email):

```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=<gmail address>
SMTP_PASS=<gmail app password>
SMTP_FROM=<same gmail address>
SMTP_FROM_NAME=Clever Campus
```

Render sets `PORT`. The app also reads `process.env.PORT`. You may leave `PORT` unset and Render will inject it.

### After first successful deploy

Seed a super admin (one time):

```bash
# From Render Shell on the API service, or locally against the External DB URL:
npx prisma db seed
```

Default seed login (change immediately): `atifcyber7@gmail.com` / `SuperAdmin@123`

---

## SECTION 4 — Create the frontend service

1. Render Dashboard → **New** → **Web Service**.
2. Same GitHub repository.
3. Settings:

| Field | Value |
| --- | --- |
| Name | `clever-campus-frontend` |
| Region | Same as API |
| Root directory | `frontend` |
| Runtime | Node |
| Instance type | Free or Starter |
| Build command | `npm ci && npm run build` |
| Start command | `npm start` |
| Health check path | `/health` |

### Frontend environment variables

`VITE_*` variables are baked in at **build** time. Set them **before** the first build, and trigger a **manual rebuild** after any change.

```
NODE_ENV=production
VITE_API_URL=https://clever-campus-api.onrender.com/api
API_PROXY_TARGET=https://clever-campus-api.onrender.com
```

Use your real backend hostname. Include `/api` on `VITE_API_URL`. Do **not** include `/api` on `API_PROXY_TARGET`.

---

## SECTION 5 — Connect frontend and backend URLs

After both services have public URLs:

1. Backend `CORS_ORIGINS` = exact frontend origin, for example `https://clever-campus-frontend.onrender.com` (no trailing slash).
2. Backend `FRONTEND_URL` = same origin (used for password-reset links).
3. Frontend `VITE_API_URL` = `https://<api-host>/api`.
4. Frontend `API_PROXY_TARGET` = `https://<api-host>`.
5. Redeploy **frontend** after changing `VITE_*`.
6. Redeploy **backend** after changing CORS / FRONTEND_URL.

CORS does not allow `*` and does not fall back to localhost in production.

---

## SECTION 6 — Resend configuration

OTP login emails go through Resend (or SMTP fallback).

- `beth.t@example.com` can **only** send to the email on your Resend account.
- To send OTP to arbitrary Gmail / school users you must either:
  1. Verify a domain at [resend.com/domains](https://resend.com/domains) and set `EMAIL_FROM` / `RESEND_FROM` to an address on that domain, or
  2. Configure Gmail SMTP (`SMTP_*`) so the backend can fall back when Resend rejects the recipient.

Do not use `example.com`, `localhost`, or `FRONTEND_URL` as the From address.

---

## SECTION 7 — Testing checklist

After both services are live:

1. Open the frontend HTTPS URL.
2. Sign in with a valid user (seed super admin or a school user).
3. Confirm OTP email arrives (Resend account inbox, or SMTP recipient).
4. Enter the 6-digit code and confirm you reach the dashboard.
5. Refresh the page — session should persist (access token in localStorage).
6. Wait for access token expiry (or call `POST /api/auth/refresh`) and confirm the app stays signed in.
7. Log out and confirm `/api/auth/me` returns 401.
8. Create a student.
9. Generate a fee invoice.
10. Record a fee payment.
11. Upload a student document or school logo.
12. Open a report / PDF.
13. Confirm a non-admin role cannot open Super Admin screens.

**Upload caveat:** files live on the API instance disk. A Render free/starter redeploy or sleep cycle **deletes them**. This is expected for demo. Production should use S3-compatible object storage later.

**Free web services** spin down after idle time. First request after sleep can take 30–60s.

---

## Commands used by Render (reference)

Backend:

```bash
npm ci && npx prisma generate && npm run build
npm run start:render
```

Frontend:

```bash
npm ci && npm run build
npm start
```

Local validation (already intended to be run in this repo):

```bash
cd backend && npx prisma generate && npm run build
cd frontend && npm run typecheck && npm run build
```

---

## Rollback / Docker

To run the full stack on a VPS instead, use `DOCKER.md` and `docker-compose.yml`. That path is independent of Render.
