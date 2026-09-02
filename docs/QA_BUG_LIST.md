# Phase 2 — QA Bug List

**Project:** Clever Campus ERP SaaS  
**Method:** Static code audit + module route review (no new features tested)  
**Date:** June 26, 2026

---

## Severity legend

| Level | Meaning |
|-------|---------|
| **P0** | Production blocker — must fix before launch |
| **P1** | High — fix before first paying customer |
| **P2** | Medium — fix in first maintenance sprint |
| **P3** | Low — polish / tech debt |

---

## Fixed in this pass ✅

| ID | Issue | Fix |
|----|-------|-----|
| BUG-001 | Student document upload used wrong token key (`accessToken` vs `erp_access_token`) | Fixed — uses `authorizedFetch` + `API_BASE_URL` |
| BUG-002 | Upload URL doubled `/api` when `VITE_API_URL` includes `/api` | Fixed — uses `API_BASE_URL` directly |
| BUG-003 | PDF downloads fail after JWT expiry (no refresh) | Fixed — `pdfUtils` uses `authorizedFetch` |
| BUG-004 | Login pre-filled demo email `admin@iqra.com` | Fixed — empty default |
| BUG-005 | Login skipped refresh token storage (double API call) | Fixed — uses `auth.login()` only |

---

## P0 — Production blockers (remaining)

| ID | Module | Bug | File |
|----|--------|-----|------|
| BUG-010 | Permissions | Custom role permissions saved via `/roles` are **ignored at runtime** — app uses hardcoded `ROLE_PERMISSIONS` | `clever-campus-pro/src/lib/permissions.ts` |
| BUG-011 | Auth | No server-side route enforcement — UI-only guards in `AppShell`; direct URL still mounts components | `AppShell.tsx` |
| BUG-012 | Performance | List endpoints return unbounded datasets — browser freeze at 5k+ students | All list routes + backend services |
| BUG-013 | Email | Password reset email not implemented — forgot-password has no delivery | `auth.service.ts` |

---

## P1 — High priority

| ID | Module | Bug | File |
|----|--------|-----|------|
| BUG-020 | Permissions | `ROLE_ALLOWED_ROUTES` mismatches nav — ACCOUNTANT blocked from `/classes` despite `classes.view`; RECEPTIONIST blocked from `/reports` | `permissions.ts` |
| BUG-021 | Permissions | `SUPER_ADMIN` bypasses all route checks via `isFixedPortal` | `AppShell.tsx` |
| BUG-022 | Classes | No permission guards — CRUD always visible | `classes.tsx` |
| BUG-023 | Transport | Vehicles/Routes tabs use `CrudPage` defaults (`canCreate=true`) | `transport.tsx` |
| BUG-024 | Expenses | Add/Edit not gated by `expenses.manage` | `expenses.tsx` |
| BUG-025 | Payroll | Pay button not permission-gated; `method` field collected but not sent to API | `payroll.tsx` |
| BUG-026 | Fees | `PaymentModal` allows 0 or over-limit payment amounts | `fees.tsx` |
| BUG-027 | Settings | Logo upload stub — "coming soon" | `settings.tsx` |
| BUG-028 | Settings | Any user with route access can edit school settings (no `settings.manage` check) | `settings.tsx` |
| BUG-029 | Exams | Results list truncated to 12 rows with no pagination | `exams.tsx:167` |
| BUG-030 | Exams | Admin exams page has no marks entry UI (teachers use `/teacher` only) | `exams.tsx` |
| BUG-031 | Parents | Create parent can send `schoolId: undefined` → API 400 | `parents.tsx` |
| BUG-032 | Env | No frontend `.env.example` until this pass | Fixed ✅ |

---

## P2 — Medium priority

| ID | Module | Bug | File |
|----|--------|-----|------|
| BUG-040 | All lists | No error state UI on failed API loads | attendance, exams, payroll, library, reports, classes |
| BUG-041 | Forms | Weak validation — only name required on teachers/staff/parents | `teachers.tsx`, `staff.tsx`, `parents.tsx` |
| BUG-042 | Library | Issue form — no validation on book/student/due date | `library.tsx` |
| BUG-043 | Transport | Assignment form — no validation | `transport.tsx` |
| BUG-044 | Reports | CSV/PDF exports from in-memory data — incomplete at scale | `reports.tsx` |
| BUG-045 | AppShell | Global search placeholder non-functional | `AppShell.tsx` |
| BUG-046 | Fees | Dead inline `printInvoice()` HTML generator coexists with PDF API | `fees.tsx` |
| BUG-047 | Super Admin | Many tabs use fixed limits (100/200) without pagination UI | `super-admin.tsx` |
| BUG-048 | CrudPage | Defaults `canCreate/canEdit/canDelete` to `true` when omitted | `CrudPage.tsx` |

---

## P3 — Low priority

| ID | Module | Bug |
|----|--------|-----|
| BUG-050 | Exams | Print uses `window.print()` not PDF |
| BUG-051 | Parent portal | Uses `window.location.href` instead of router |
| BUG-052 | Subjects | Duplicated in classes tab and `/subjects` route |
| BUG-053 | Login | Forgot-password UI works but email never arrives |

---

## Module QA matrix

| Module | Create | Edit | Delete | Search | Filters | Export | PDF | Notifications | Permissions |
|--------|--------|------|--------|--------|---------|--------|-----|-----------------|-------------|
| Students | ✅ | ✅ | ✅ | ⚠️ client | ⚠️ client | — | ✅ | ✅ admission | ⚠️ |
| Parents | ⚠️ schoolId | ✅ | ✅ | ⚠️ client | — | — | — | — | ⚠️ |
| Teachers | ✅ | ✅ | ✅ | ⚠️ client | — | — | — | — | ⚠️ |
| Staff | ✅ | ✅ | ✅ | ⚠️ client | — | — | — | — | ⚠️ |
| Classes | ✅ | ✅ | ✅ | — | — | — | — | — | ❌ unguarded |
| Attendance | ✅ | ✅ | — | — | ✅ date | — | — | ✅ | ✅ mark gate |
| Exams | ✅ | ✅ | ✅ | — | — | — | ✅ | ✅ | ⚠️ |
| Fees | ✅ | ✅ | — | ⚠️ client | ✅ status | — | ✅ | ✅ | ⚠️ |
| Payroll | ✅ | ⚠️ pay | — | — | ✅ month | — | ✅ | ✅ | ⚠️ |
| Expenses | ⚠️ unguarded | ⚠️ | ✅ | ⚠️ client | ✅ | ✅ CSV | ✅ | — | ⚠️ |
| Library | ✅ | ✅ | ✅ | ⚠️ client | — | — | — | — | ✅ books |
| Transport | ⚠️ unguarded | ⚠️ | ✅ | — | — | — | — | — | ⚠️ |
| Communication | ✅ | ✅ | ✅ | ⚠️ client | — | ✅ CSV | — | ✅ publish | ✅ |
| Reports | — | — | — | — | ✅ tabs | ✅ CSV | ✅ | — | ⚠️ route block |
| Settings | ⚠️ unguarded | ✅ | — | — | — | — | — | ✅ toggles | ❌ |
| Super Admin | ✅ | ✅ | ✅ | ✅ | ✅ | — | — | — | ⚠️ UI only |
| Users | ✅ | ✅ | ✅ | ✅ server | ✅ | — | — | — | ✅ |

**Legend:** ✅ Works · ⚠️ Partial/issue · ❌ Missing/broken

---

## Recommended pre-launch QA (manual)

1. Login as each role → verify allowed routes only
2. Create student → upload document → download document
3. Record fee payment → download invoice PDF + receipt PDF
4. Mark attendance for class → verify parent notification
5. Create exam → enter marks (teacher portal) → view results → PDF report card
6. Generate payroll → mark paid → salary slip PDF
7. Super admin: create school → assign plan → impersonate → verify isolation
8. Token expiry: wait 15min → verify auto-refresh on API calls and PDF download
9. Load test school (`npm run seed:perf`) → open students/fees/attendance pages

---

*Total open bugs: 38 (5 fixed, 4 P0, 13 P1, 9 P2, 4 P3)*
