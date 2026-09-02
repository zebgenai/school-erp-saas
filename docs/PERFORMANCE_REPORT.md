# Phase 1 — Performance Optimization Report

**Project:** Clever Campus ERP SaaS  
**Target load:** 5,000 students · 500 teachers · 100 staff · 50,000 attendance · 20,000 invoices · 10,000 payments  
**Date:** June 26, 2026

---

## Test tooling

| Tool | Command | Purpose |
|------|---------|---------|
| Performance seed | `npm run seed:perf` | Populate staging DB with target volumes |
| API benchmark | `npm run benchmark -- http://localhost:3000/api <JWT>` | Time critical endpoints |

---

## Executive summary

The ERP is **functionally complete** but **not optimized for production-scale datasets**. Most list and report endpoints load entire tables into memory with deep Prisma includes. At target volumes, several endpoints will exceed acceptable response times (>3s) and risk browser OOM on the frontend.

**Estimated impact at target load (single school, no pagination):**

| Endpoint | Est. rows loaded | Est. response time | Risk |
|----------|------------------|-------------------|------|
| `GET /students` | 5,000 | 2–8s | High |
| `GET /fees/invoices` | 20,000 + payments | 10–30s | Critical |
| `GET /attendance` | 50,000 | 15–45s | Critical |
| `GET /reports/fees` | 20,000 + nested | 15–40s | Critical |
| `GET /reports/attendance` | 50,000 | 20–60s | Critical |
| `GET /reports/dashboard-summary` | Full day attendance + month invoices | 5–15s | High |
| `POST /fees/invoices/bulk` (500 students) | ~1,500–2,000 DB round-trips | 30–120s | Critical |
| `POST /attendance/bulk` (class of 40) | ~120 queries | 2–5s | Medium |
| `GET /exams/:id/results` | All class students + marks | 3–10s | High |

---

## Critical bottlenecks

### 1. No pagination on list endpoints
**Affected:** students, teachers, staff, parents, fees/invoices, attendance, payroll, expenses, library, transport, communication, exams, timetable.

Only `/users`, `/notifications`, and super-admin school users paginate.

**Fix:** Add `page` + `limit` to all query DTOs; default `limit=50`; return `{ data, total, page, limit }`. Frontend: server-side pagination (no UI redesign — reuse existing table components with page controls).

### 2. N+1 bulk write loops

| Location | Pattern | Impact |
|----------|---------|--------|
| `fees.service.ts:190-241` | Per-student invoice create + duplicate check | O(n) queries |
| `attendance.service.ts:80-136` | Per-record student lookup + upsert | O(n) queries |
| `exams.service.ts:248-282` | Per-mark student validation + upsert | O(n) queries |
| `reports.service.ts:597-621` | 12 sequential monthly invoice fetches | 12× full scans |
| `super-admin.service.ts:96-130` | 12× revenue + 24× growth counts | 36 queries |

**Fix:** Use `createMany`, `$transaction` batching, `groupBy`/`aggregate` for reports.

### 3. Heavy Prisma includes

**Worst:** `invoiceInclude` loads ALL payments per invoice on list endpoints.

```typescript
// fees.service.ts — loads every payment for every invoice
payments: { orderBy: { paymentDate: 'desc' } }
```

**Fix:** Split list vs detail includes; list endpoint: `{ student: { select: { fullName, admissionNo } } }` only; payments on `GET /fees/invoices/:id`.

### 4. Report endpoints load full datasets

`reports.service.ts` — fees, attendance, students, profit-loss all use unbounded `findMany` + in-memory aggregation.

**Fix:** Use Prisma `aggregate`, `groupBy`, raw SQL for summaries; paginate detail exports.

### 5. Single-student result rebuilds entire class

`exams.service.ts:320` — `getStudentResult()` calls `buildClassResults()` for all students.

**Fix:** Query marks for one student only.

---

## Database indexes added (this pass)

Composite indexes added to `schema.prisma`:

| Model | Index | Benefit |
|-------|-------|---------|
| Student | `[schoolId, status]`, `[schoolId, classId, sectionId]` | Filtered lists |
| StudentAttendance | `[schoolId, date]`, `[schoolId, classId, date]` | Daily/class reports |
| FeeInvoice | `[schoolId, status]` | Defaulter queries |
| FeePayment | `[paymentDate]` | Date-range reports |
| Mark | `[schoolId, examId]` | Exam results |
| Notice | `[schoolId, isPublished]` | Published notices |

**Apply:** `npx prisma migrate dev --name production_indexes` or `prisma db push`

**Future:** Add `pg_trgm` GIN index on `Student.fullName` for ILIKE search at scale.

---

## Memory usage risks

| Area | Risk |
|------|------|
| Frontend list pages | Loads full API response into React state — 20k invoices ≈ 50–100MB JSON |
| PDF generation | Loads full report data server-side before PDFKit render |
| Bulk notifications | Sequential fan-out holds connections open |

---

## Recommended optimization priority

| Priority | Task | Effort |
|----------|------|--------|
| P0 | Pagination on students, fees/invoices, attendance | 2–3 days |
| P0 | Remove nested payments from invoice list include | 2 hours |
| P0 | Batch bulk invoice/attendance/marks writes | 1–2 days |
| P1 | Report endpoints → aggregate queries | 2–3 days |
| P1 | Fix single-student exam result query | 2 hours |
| P2 | Connection pooling (`?connection_limit=20` in DATABASE_URL) | 30 min |
| P2 | Redis cache for dashboard summary (5-min TTL) | 1 day |
| P3 | pg_trgm search indexes | 4 hours |

---

## Frontend performance notes

- All list pages filter client-side — unusable at 5k+ rows
- Only `/users` and super-admin school users paginate
- Reports CSV/PDF export from in-memory data — incomplete at scale

---

*Run `npm run seed:perf` on staging, then `npm run benchmark` to capture baseline timings before optimization.*
