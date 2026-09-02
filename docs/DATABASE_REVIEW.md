# Phase 3 — Database Review

**Project:** Clever Campus ERP SaaS  
**ORM:** Prisma + PostgreSQL  
**Date:** June 26, 2026

---

## 1. Indexes

### Existing (well covered)
- All major FK columns indexed (`schoolId`, `studentId`, `classId`, etc.)
- Unique constraints on business keys (`schoolId + admissionNo`, `schoolId + invoiceNo`, etc.)
- Audit/notification indexes on `createdAt`, `status`, `channel`

### Added this pass (composite)
| Model | Index | Query pattern |
|-------|-------|---------------|
| Student | `[schoolId, status]` | Active student lists |
| Student | `[schoolId, classId, sectionId]` | Class roster |
| StudentAttendance | `[schoolId, date]` | Daily attendance |
| StudentAttendance | `[schoolId, classId, date]` | Class attendance report |
| FeeInvoice | `[schoolId, status]` | Defaulters |
| FeePayment | `[paymentDate]` | Payment date reports |
| Mark | `[schoolId, examId]` | Exam results |
| Notice | `[schoolId, isPublished]` | Published notices |

### Recommended (future)
| Index | Reason |
|-------|--------|
| `GIN (fullName gin_trgm_ops)` on Student | ILIKE search at 5k+ rows |
| `[schoolId, month, year, status]` on FeeInvoice | Combined defaulter + period filter |
| Partial index on `RefreshToken WHERE revokedAt IS NULL` | Active session lookup |

---

## 2. Foreign keys

Prisma enforces FK relations on all `@relation` fields. Verified models link correctly to `School` as tenant root.

| Relation | onDelete | Assessment |
|----------|----------|------------|
| SchoolSubscription → School | Cascade | ✅ Correct |
| RefreshToken → User | Cascade | ✅ Correct |
| UserNotification → User | Cascade | ✅ Correct |
| Most School → * relations | Restrict (default) | ✅ Prevents orphan data |
| Student → Class/Section | Restrict | ✅ Must reassign before delete |

### Gaps
| Issue | Risk | Recommendation |
|-------|------|----------------|
| `SaasInvoice → School` no cascade | Orphan invoices if school hard-deleted | Use soft-delete on School (status=INACTIVE) — already implemented |
| `User → School` optional | Super admin has null schoolId | ✅ By design |
| No FK from NotificationLog → School | Nullable schoolId | ✅ OK for platform events |

---

## 3. Cascades

**Safe pattern in use:** Soft deletes (Student status=INACTIVE) rather than hard deletes when related records exist.

**Hard delete guards:**
- Student permanent delete blocked if invoices or marks exist (`students.service.ts`)
- School delete should be super-admin only with cascade review

**Recommendation:** Add `onDelete: Cascade` only where explicitly desired (RefreshToken, UserNotification already correct). Do NOT cascade School → Student (multi-tenant safety).

---

## 4. Multi-tenant isolation

| Check | Status |
|-------|--------|
| All tenant tables have `schoolId` | ✅ |
| Services use `assertSchoolAccess()` | ✅ 17 services |
| Unique constraints scoped to `schoolId` | ✅ |
| Super admin cross-tenant access | ✅ By design |

**Risk:** New modules must include `schoolId` filter — add to PR checklist.

---

## 5. Migration safety

| Item | Status | Notes |
|------|--------|-------|
| Migration history | ✅ | 4 migrations in `prisma/migrations/` |
| `prisma migrate deploy` in Docker | ✅ | Used in Dockerfile CMD |
| Seed script | ✅ | `prisma/seed.ts` for dev |
| Performance seed | ✅ | `seed-performance.ts` — staging only |
| Rollback strategy | ⚠️ | Manual — no down migrations documented |

### Production migration procedure
```bash
# 1. Backup first
./deploy/scripts/backup-postgres.sh

# 2. Apply migrations
npx prisma migrate deploy

# 3. Verify
curl http://localhost:3000/api/health/ready
```

**Never use `prisma db push` in production** — use `migrate deploy`.

---

## 6. Backup strategy

| Component | Strategy |
|-----------|----------|
| PostgreSQL | Daily `pg_dump` via `deploy/scripts/backup-postgres.sh` |
| Retention | 14 days default (`RETENTION_DAYS` env) |
| Uploads volume | Docker volume `uploads_data` — separate file backup |
| Point-in-time | Enable WAL archiving on managed PostgreSQL (RDS/DO) for production |

### Cron setup
```cron
0 2 * * * DATABASE_URL="..." /opt/clever-campus/deploy/scripts/backup-postgres.sh >> /var/log/clever-campus-backup.log 2>&1
```

### Restore test
```bash
gunzip -c backup.sql.gz | psql $DATABASE_URL
```

**Recommendation:** Test restore monthly on staging.

---

## 7. Connection pooling

For production, use PgBouncer or Prisma connection limit:

```
DATABASE_URL="postgresql://user:pass@host:5432/db?connection_limit=20"
```

For serverless/high-concurrency: use Prisma Accelerate or PgBouncer in transaction mode.

---

## 8. Data integrity checks (pre-launch)

```sql
-- Orphan students (no school)
SELECT COUNT(*) FROM "Student" s LEFT JOIN "School" sc ON s."schoolId" = sc.id WHERE sc.id IS NULL;

-- Invoices exceeding total
SELECT COUNT(*) FROM "FeeInvoice" WHERE "paidAmount" > "totalAmount";

-- Duplicate admission numbers (should be 0)
SELECT "schoolId", "admissionNo", COUNT(*) FROM "Student" GROUP BY 1,2 HAVING COUNT(*) > 1;
```

---

## Summary

| Area | Grade | Notes |
|------|-------|-------|
| Indexes | B+ | Good base + composites added; search index pending |
| Foreign keys | A | Properly defined |
| Cascades | A- | Conservative, safe for SaaS |
| Migration safety | B | Needs documented rollback |
| Backups | B+ | Script provided; needs cron + restore test |
| Tenant isolation | A | Consistent pattern |
