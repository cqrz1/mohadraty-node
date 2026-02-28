# Mohadraty Node.js (Express + MSSQL)

Migrated educational portal from ASP.NET Web Forms to Node.js with server-rendered EJS views, SQL Server backend, file uploads, and admin RBAC.

## Stack
- Node.js 20+
- Express
- EJS
- Sequelize + tedious (SQL Server)
- express-session
- multer

## Core Features
- Student login by `student_id + exact student_name`.
- Admin login by `admin_name + admin_id`.
- Student dashboard filtered by academic year + major.
- Professor/lectures/sheets access checks per student constraints.
- Full admin management for students/professors/lectures/sheets.
- File uploads with extension validation:
  - photos: `.jpg/.jpeg/.png`
  - lectures: `.pdf/.ppt/.pptx`
  - sheets: `.pdf/.docx`
- Cascade cleanup of files on delete operations.
- Arabic RTL UI.

## RBAC (Admin Roles)
- Roles in `admins.role`:
  - `superadmin`
  - `admin`
- Super Admin can:
  - Add/edit/delete admins
  - Manage all resources (including delete-sensitive actions)
- Regular Admin can:
  - Add admins (as `admin` only)
  - Edit professors
  - Add lectures/sheets
  - View data
- Privilege escalation protections are enforced in middleware + service layer.

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
- Update DB credentials for your SQL Server instance

3. Prepare database:
- Fresh setup:
  - run `scripts/mssql-migration-seed.sql`
- Existing DB upgrade (RBAC only):
  - run `scripts/mssql-admin-rbac-migration.sql`

4. Validate config:
```bash
npm run check
```

5. Start server:
```bash
npm start
```

Open: `http://localhost:3000`

## Default Seed Accounts
- Super Admin:
  - username: `admin`
  - password: `1`
- Admin:
  - username: `superadmin`
  - password: `2024`
- Student:
  - `student_id=21141611`, `student_name=طالب تجريبي`

## Useful Scripts
- `npm start` - run production server
- `npm run dev` - run with nodemon
- `npm run check` - local health/config checks

## Notes
- `.env` is ignored from git. Use `.env.example` for safe sharing.
- Ensure SQL Server service is running (`SQLEXPRESS`) before starting app.
- Uploaded files are stored under:
  - `ProfessorsImages/`
  - `uploads/lectures/`
  - `uploads/sheets/`
