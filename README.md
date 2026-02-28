# Mohadraty Node.js (Express + MSSQL)

Migrated educational portal from ASP.NET Web Forms to Node.js with server-rendered EJS views, SQL Server backend, file uploads, and admin RBAC.

## Creators
- Abdullah Assiri
- Abdulrahman Gamal

## نظرة سريعة
- بوابة تعليمية بواجهة عربية RTL.
- تسجيل دخول طلاب وإدارة بنفس منطق المشروع الأصلي.
- SQL Server + Sequelize + جلسات `express-session`.
- رفع ملفات للمحاضرات والشيتات وصور المستخدمين.

## Tech Stack
- Node.js 20+
- Express
- EJS
- Sequelize + `tedious` (MSSQL)
- express-session
- multer

## Core Features
- Student login using `student_id + exact student_name` (trim-aware).
- Admin login using `admin_name + admin_id`.
- Dashboard filter by student `academic_year + major`.
- Access control on professor/lectures/sheets based on student scope.
- Admin CRUD for students/professors/lectures/sheets.
- Upload validation:
  - Photos: `.jpg/.jpeg/.png`
  - Lectures: `.pdf/.ppt/.pptx`
  - Sheets: `.pdf/.docx`
- Cleanup files when related DB records are deleted.
- Admin pages support server-side search + pagination.
- CSRF protection, security headers (`helmet`), and rate limiting for login/security-sensitive flows.
- Admin audit logging for create/update/delete operations.

## Admin RBAC
- Roles are stored in `admins.role`:
  - `superadmin`
  - `admin`
- `superadmin`:
  - Full access to all admin routes.
  - Can add/edit/delete admins.
  - Can perform sensitive deletes.
- `admin`:
  - Can add admins as regular `admin` only.
  - Can manage professors/lectures/sheets within allowed actions.
  - Cannot delete admins or modify superadmin role/account.

## Project Structure
```text
src/
  config/
  controllers/
  middlewares/
  models/
  routes/
  services/
views/
public/
scripts/
ProfessorsImages/
uploads/
```

## Quick Start
1. Install dependencies:
```bash
npm install
```

2. Configure environment:
- Copy `.env.example` to `.env`
- Update SQL Server settings (host/instance/port/user/password/database)

3. Create/upgrade database:
- Fresh database:
  - Run `scripts/mssql-migration-seed.sql`
- RBAC upgrade on existing DB:
  - Run `scripts/mssql-admin-rbac-migration.sql`

4. Validate configuration:
```bash
npm run check
```

5. Start app:
```bash
npm start
```

Open `http://localhost:3000`.

## Default Seed Accounts
- Super Admin: `admin` / `1`
- Admin: `superadmin` / `2024`
- Student: `21141611` / `طالب تجريبي`

## Scripts
- `npm start` - run server
- `npm run dev` - run with nodemon
- `npm run check` - environment and DB checks

## Notes
- `.env` is ignored from Git for safety.
- Static/upload paths kept compatible with old system:
  - `ProfessorsImages/`
  - `uploads/lectures/`
  - `uploads/sheets/`
- For SQL Server Express, ensure services are running:
  - `MSSQL$SQLEXPRESS`
  - `SQLBrowser`
