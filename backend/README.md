# School ERP SaaS Backend

Production foundation for a multi-school ERP SaaS.

## Stack

- NestJS + TypeScript
- PostgreSQL
- Prisma ORM
- JWT Authentication
- Role-Based Access Control
- schoolId-based multi-tenancy

## Setup

```bash
npm install
cp .env.example .env
# Update DATABASE_URL and JWT_SECRET in .env
npx prisma migrate dev --name init
npm run seed
npm run start:dev
```

## Test APIs

```http
GET http://localhost:3000/health
POST http://localhost:3000/auth/login
GET http://localhost:3000/auth/me
```

Demo login after seed:

```json
{
  "email": "admin@iqra.com",
  "password": "Admin@123"
}
```

Super Admin login:

```json
{
  "email": "superadmin@schoolerp.com",
  "password": "SuperAdmin@123"
}
```

## Important production rule

Every school-specific query must filter by `schoolId`. Never expose passwords in responses.
