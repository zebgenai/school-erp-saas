# Clever Campus ERP — Docker Deployment Guide

Production-ready Docker setup for the Clever Campus ERP stack: **React (TanStack Start) + NestJS + PostgreSQL + Redis + Nginx**.

For a **Render** (native Node) demo, see `RENDER_DEPLOYMENT.md`. Do not replace this Docker stack; it remains the VPS path.

---

## Architecture

```
                    ┌─────────────────────────────────────┐
  Browser :80  ───► │  nginx (reverse proxy)              │
                    │  /api/*     → backend:3000          │
                    │  /uploads/* → backend:3000          │
                    │  /*         → frontend:80           │
                    └──────────┬───────────────┬──────────┘
                               │               │
                    ┌──────────▼───┐   ┌───────▼────────┐
                    │  frontend    │   │  backend       │
                    │  nginx + SSR │   │  NestJS        │
                    └──────────────┘   └───────┬────────┘
                                               │
                              ┌────────────────┼────────────────┐
                              │                │                │
                       ┌──────▼──────┐  ┌──────▼──────┐  ┌──────▼──────┐
                       │  postgres   │  │   redis     │  │  uploads    │
                       │  (volume)   │  │  (volume)   │  │  (volume)   │
                       └─────────────┘  └─────────────┘  └─────────────┘
```

| Service   | Internal port | Host port (default) | Purpose                          |
|-----------|---------------|---------------------|----------------------------------|
| nginx     | 80            | 80                  | Public entry point               |
| frontend  | 80            | —                   | Static assets + TanStack SSR     |
| backend   | 3000          | —                   | NestJS API                       |
| postgres  | 5432          | —                   | PostgreSQL database              |
| redis     | 6379          | —                   | Redis (prepared for future use)  |

**Network:** All services join `clever_campus_net` (bridge).

**Volumes:**
- `postgres_data` — database files
- `redis_data` — Redis AOF persistence
- `uploads_data` — backend file uploads (`/app/uploads`)

---

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) 4.x+ (Windows/macOS) or Docker Engine 24+ (Linux)
- [Docker Compose](https://docs.docker.com/compose/) v2
- 4 GB+ RAM recommended for builds

---

## Installation

1. **Clone the repository** and open the project root.

2. **Create environment file:**

   ```bash
   cp .env.example .env
   ```

3. **Edit `.env`** — at minimum set strong values for:
   - `POSTGRES_PASSWORD`
   - `JWT_SECRET` (32+ random characters)

4. **Optional:** Review production templates:
   - `backend/.env.production`
   - `frontend/.env.production`

---

## Build

Build all images:

```bash
npm run docker:build
# or
docker compose build
```

Build individual services:

```bash
docker compose build backend
docker compose build frontend
```

Validate compose configuration:

```bash
docker compose config
```

---

## Run

Start all services in detached mode:

```bash
npm run docker:start
# or
docker compose up -d
```

Open the application:

- **App:** http://localhost
- **API health:** http://localhost/api/health/live
- **API readiness (DB):** http://localhost/api/health/ready

View logs:

```bash
npm run docker:logs
# or
docker compose logs -f backend
```

Stop services:

```bash
npm run docker:stop
```

Restart:

```bash
npm run docker:restart
```

Remove containers **and volumes** (destructive — deletes DB and uploads):

```bash
npm run docker:clean
```

---

## Production Deployment

### 1. Server preparation

- Linux VPS with Docker installed
- Domain pointed to server IP
- Firewall: allow ports 80 and 443

### 2. Environment

Copy `.env.example` to `.env` and set production values:

```env
FRONTEND_URL=https://YOUR_DOMAIN
BACKEND_URL=https://YOUR_DOMAIN/api
CORS_ORIGINS=https://YOUR_DOMAIN
VITE_API_URL=/api
POSTGRES_PASSWORD=<hex-or-alphanumeric-password>
JWT_SECRET=<64-char-random-secret>
```

`POSTGRES_PASSWORD` is placed inside `DATABASE_URL`. Use `openssl rand -hex 24` so the URL stays valid.

Configure SMTP for email notifications:

```env
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=...
SMTP_PASS=...
SMTP_FROM=noreply@yourdomain.com
```

### 3. HTTPS (TLS)

1. Obtain certificates (e.g. Let's Encrypt) and place in `deploy/nginx/ssl/`:
   - `fullchain.pem`
   - `privkey.pem`

2. Mount the HTTPS config in `docker-compose.yml`:

   ```yaml
   nginx:
     ports:
       - "80:80"
       - "443:443"
     volumes:
       - ./deploy/nginx/docker.conf:/etc/nginx/conf.d/default.conf:ro
       - ./deploy/nginx/docker-ssl.conf:/etc/nginx/conf.d/ssl.conf:ro
       - ./deploy/nginx/ssl:/etc/nginx/ssl:ro
   ```

3. Update `FRONTEND_URL` and `CORS_ORIGINS` to `https://...`

See also `deploy/nginx/clever-campus.conf` for host-level nginx (non-Docker) deployment.

### 4. Deploy

Enable Docker on boot, then build and start:

```bash
sudo systemctl enable docker
docker compose build
docker compose up -d
docker compose ps
```

Prisma migrations run automatically on backend startup (`prisma migrate deploy`). To run them manually:

```bash
docker compose exec backend ./node_modules/.bin/prisma migrate deploy
```

### 5. Seed data (first run only)

```bash
docker compose exec backend npx prisma db seed
```

---

## Updating Containers

Pull latest code, rebuild, and restart with zero-downtime rolling (single-node):

```bash
git pull
docker compose build backend frontend
docker compose up -d --no-deps backend
docker compose up -d --no-deps frontend
docker compose up -d nginx
```

Database migrations run automatically on backend startup (`prisma migrate deploy`).

---

## Backup Volumes

### PostgreSQL

```bash
docker compose exec -T postgres pg_dump -U clevercampus school_erp_saas > backup_$(date +%Y%m%d).sql
```

Or use the included script:

```bash
bash deploy/scripts/backup-postgres.sh
```

### Uploads

```bash
docker run --rm -v clever-campus_uploads_data:/data -v $(pwd):/backup alpine \
  tar czf /backup/uploads_$(date +%Y%m%d).tar.gz -C /data .
```

### Restore PostgreSQL

```bash
cat backup.sql | docker compose exec -T postgres psql -U clevercampus school_erp_saas
```

---

## Troubleshooting

### `docker compose config` fails

- Ensure `.env` exists with `POSTGRES_PASSWORD`, `JWT_SECRET`, `FRONTEND_URL`, and `CORS_ORIGINS` set.

### Backend unhealthy / won't start

```bash
docker compose logs backend
```

Common causes:
- Database not ready — wait for postgres healthcheck
- Invalid `DATABASE_URL` or credentials
- Migration failure — check Prisma migration logs

### Frontend blank page

```bash
docker compose logs frontend
```

- Verify `VITE_API_URL=/api` was set at **build** time (rebuild after changing)
- Check browser network tab for `/api` requests

### Nginx 502 Bad Gateway

```bash
docker compose ps
docker compose logs nginx backend frontend
```

Ensure backend and frontend healthchecks pass before nginx starts.

### Uploads not persisting

Confirm `uploads_data` volume is mounted:

```bash
docker volume inspect clever-campus_uploads_data
```

### Port 80 already in use

Change in `.env`:

```env
HTTP_PORT=8080
```

Then access http://localhost:8080

### Reset everything

```bash
npm run docker:clean
npm run docker:build
npm run docker:start
```

---

## Health Checks

| Service  | Endpoint                         |
|----------|----------------------------------|
| nginx    | `GET /nginx-health`              |
| frontend | `GET /health`                    |
| backend  | `GET /api/health/live` (liveness) |
| backend  | `GET /api/health/ready` (DB)     |
| postgres | `pg_isready`                     |
| redis    | `redis-cli ping`                 |

---

## Development vs Docker

Local development continues to use:

- Frontend: `cd frontend && npm run dev` (port 5173)
- Backend: `cd backend && npm run start:dev` (port 3000)

Docker is for **production deployment only** — no application business logic is changed.
