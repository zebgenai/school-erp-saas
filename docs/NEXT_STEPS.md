# Next Steps

## 1. Setup backend

```bash
cd backend
npm install
cp .env.example .env
```

Update `.env` with your PostgreSQL password.

## 2. Create database

Create a PostgreSQL database named:

```text
school_erp_saas
```

## 3. Run migration and seed

```bash
npx prisma migrate dev --name init
npm run seed
npm run start:dev
```

## 4. Test login

POST `/api/auth/login`

```json
{
  "email": "admin@iqra.com",
  "password": "Admin@123"
}
```

## 5. Then build next modules

After auth foundation is stable:

1. Classes & Sections module
2. Students module
3. Fee module
4. Attendance module
5. Exams & Results module
