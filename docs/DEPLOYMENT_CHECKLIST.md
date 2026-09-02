# Deployment & Launch Checklists — Clever Campus ERP

---

## Deployment checklist

### Infrastructure
- [ ] Provision VPS or cloud instance (min 2 vCPU, 4GB RAM for first 5 schools)
- [ ] Install Docker + Docker Compose
- [ ] Configure domain DNS (`app.` and `api.` subdomains)
- [ ] Obtain SSL certificates (see `deploy/docs/SSL_SETUP.md`)
- [ ] Copy `deploy/nginx/clever-campus.conf` to server
- [ ] Configure firewall (allow 80, 443; block 5432 externally)

### Environment
- [ ] Copy `backend/.env.production.example` → `.env`
- [ ] Generate 64-char `JWT_SECRET`
- [ ] Set `DATABASE_URL` with connection limit
- [ ] Set `CORS_ORIGINS` to production frontend URL
- [ ] Set `NODE_ENV=production`
- [ ] Copy `clever-campus-pro/.env.example` → `.env.production`
- [ ] Set `VITE_API_URL=https://api.yourdomain.com/api`

### Database
- [ ] Create PostgreSQL database (managed recommended: RDS, DO, Supabase)
- [ ] Run `npx prisma migrate deploy`
- [ ] Run initial seed OR create super admin manually
- [ ] Verify indexes applied
- [ ] Configure daily backup cron (`deploy/scripts/backup-postgres.sh`)
- [ ] Test backup restore on staging

### Application
- [ ] `docker compose up -d --build`
- [ ] Verify `GET /api/health/ready` returns 200
- [ ] Verify `GET /api/health/live` returns 200
- [ ] Test login flow
- [ ] Test file upload + download
- [ ] Test PDF generation
- [ ] Verify Swagger is disabled (404 on `/api/docs`)

### Security (from SECURITY_REPORT.md)
- [ ] Rotate all secrets from development
- [ ] Confirm Helmet headers active
- [ ] Confirm rate limiting active
- [ ] Confirm CORS restricted
- [ ] Remove demo credentials from seed

### Monitoring
- [ ] Configure uptime monitor on `/api/health/ready` (UptimeRobot, Better Stack, etc.)
- [ ] Set up log aggregation (Docker logs → file or cloud)
- [ ] Configure alert on health check failure
- [ ] Optional: Sentry DSN for error tracking

---

## Launch checklist (first customer)

### Pre-launch (1 week before)
- [ ] Fix P0 bugs (see QA_BUG_LIST.md)
- [ ] Run performance seed on staging
- [ ] Benchmark critical endpoints (< 2s for lists with pagination)
- [ ] Manual QA pass for SCHOOL_ADMIN workflow
- [ ] Manual QA pass for TEACHER + PARENT portals
- [ ] Verify SaaS billing flow (plan assign, subscription status)
- [ ] Test impersonation start/stop + audit log

### Launch day
- [ ] Final database backup
- [ ] Deploy production build
- [ ] Smoke test all critical paths
- [ ] Create first school tenant
- [ ] Create school admin account
- [ ] Verify school data isolation (create 2 schools, cross-check)
- [ ] Send go-live communication to customer

### Post-launch (first 48 hours)
- [ ] Monitor error logs
- [ ] Monitor response times
- [ ] Monitor disk usage (uploads volume)
- [ ] Monitor database size and connection count
- [ ] Collect customer feedback
- [ ] Hotfix process documented

---

## Docker quick start

```bash
# 1. Set secrets
cp backend/.env.production.example backend/.env
# Edit JWT_SECRET, POSTGRES_PASSWORD, etc.

# 2. Build and run
docker compose up -d --build

# 3. Verify
curl http://localhost:3000/api/health/ready
curl http://localhost:8080/
```

---

## Rollback procedure

```bash
# 1. Stop current deployment
docker compose down

# 2. Restore database from backup
gunzip -c /var/backups/clever-campus/latest.sql.gz | psql $DATABASE_URL

# 3. Deploy previous image tag
docker compose up -d
```

---

## Monitoring endpoints

| Endpoint | Purpose | Expected |
|----------|---------|----------|
| `GET /api/health/live` | Process alive | 200, `{ status: "ok" }` |
| `GET /api/health/ready` | DB connected | 200, `{ database: "connected" }` |
| `GET /api/health` | Combined (legacy) | 200 or 503 |

Configure uptime monitors at **60s interval** on `/api/health/ready`.

---

## File reference

| File | Purpose |
|------|---------|
| `docker-compose.yml` | Full stack (postgres + backend + frontend) |
| `backend/Dockerfile` | NestJS production image |
| `clever-campus-pro/Dockerfile` | Nginx static frontend |
| `deploy/nginx/clever-campus.conf` | Production reverse proxy |
| `deploy/nginx/frontend.conf` | Frontend container nginx |
| `deploy/scripts/backup-postgres.sh` | Daily DB backup |
| `deploy/docs/SSL_SETUP.md` | HTTPS setup guide |
| `backend/.env.production.example` | Backend production env template |
| `clever-campus-pro/.env.example` | Frontend env template |
