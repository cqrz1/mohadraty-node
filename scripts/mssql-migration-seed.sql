/*
  Mohadraty SQL Server migration + seed
  Target: SQL Server 2017+
*/

SET NOCOUNT ON;

IF OBJECT_ID(N'dbo.admin_audit_logs', N'U') IS NOT NULL DROP TABLE dbo.admin_audit_logs;
IF OBJECT_ID(N'dbo.sheets', N'U') IS NOT NULL DROP TABLE dbo.sheets;
IF OBJECT_ID(N'dbo.lectures', N'U') IS NOT NULL DROP TABLE dbo.lectures;
IF OBJECT_ID(N'dbo.professor_teaching_scopes', N'U') IS NOT NULL DROP TABLE dbo.professor_teaching_scopes;
IF OBJECT_ID(N'dbo.students', N'U') IS NOT NULL DROP TABLE dbo.students;
IF OBJECT_ID(N'dbo.professors', N'U') IS NOT NULL DROP TABLE dbo.professors;
IF OBJECT_ID(N'dbo.admins', N'U') IS NOT NULL DROP TABLE dbo.admins;
GO

CREATE TABLE dbo.admins (
  admin_id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
  admin_name NVARCHAR(50) NOT NULL,
  role NVARCHAR(20) NOT NULL,
  CONSTRAINT CK_admins_role CHECK (role IN (N'owner', N'assistant_owner', N'manager', N'admin'))
);
GO

CREATE TABLE dbo.students (
  student_id INT NOT NULL PRIMARY KEY,
  student_name NVARCHAR(50) NOT NULL,
  academic_year NVARCHAR(50) NOT NULL,
  major NVARCHAR(50) NOT NULL,
  student_photo NVARCHAR(255) NULL,
  admin_id INT NOT NULL,
  CONSTRAINT FK_students_admins FOREIGN KEY (admin_id) REFERENCES dbo.admins(admin_id)
);
GO

CREATE TABLE dbo.professors (
  professor_id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
  professor_name NVARCHAR(50) NOT NULL,
  subject_name NVARCHAR(50) NOT NULL,
  professor_photo NVARCHAR(255) NULL,
  academic_year NVARCHAR(255) NULL,
  major NVARCHAR(255) NULL
);
GO

CREATE TABLE dbo.professor_teaching_scopes (
  scope_id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
  professor_id INT NOT NULL,
  academic_year NVARCHAR(50) NOT NULL,
  major NVARCHAR(100) NOT NULL,
  CONSTRAINT FK_professor_teaching_scopes_professors FOREIGN KEY (professor_id) REFERENCES dbo.professors(professor_id) ON DELETE CASCADE,
  CONSTRAINT UQ_professor_teaching_scope UNIQUE (professor_id, academic_year, major)
);
GO

CREATE TABLE dbo.lectures (
  lecture_id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
  lecture_name NVARCHAR(50) NOT NULL,
  lecture_date DATE NOT NULL,
  lecture_file NVARCHAR(255) NOT NULL,
  professor_id INT NOT NULL,
  CONSTRAINT FK_lectures_professors FOREIGN KEY (professor_id) REFERENCES dbo.professors(professor_id)
);
GO

CREATE TABLE dbo.sheets (
  sheet_id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
  sheet_name NVARCHAR(50) NOT NULL,
  sheet_date DATE NOT NULL,
  sheet_file NVARCHAR(255) NOT NULL,
  professor_id INT NOT NULL,
  CONSTRAINT FK_sheets_professors FOREIGN KEY (professor_id) REFERENCES dbo.professors(professor_id)
);
GO

CREATE TABLE dbo.admin_audit_logs (
  log_id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
  actor_admin_id INT NULL,
  action NVARCHAR(100) NOT NULL,
  target_type NVARCHAR(50) NULL,
  target_id NVARCHAR(100) NULL,
  details NVARCHAR(1000) NULL,
  ip_address NVARCHAR(64) NULL,
  user_agent NVARCHAR(255) NULL,
  created_at DATETIME2 NOT NULL CONSTRAINT DF_admin_audit_logs_created_at DEFAULT SYSUTCDATETIME()
);
GO

CREATE INDEX IX_admin_audit_logs_actor_admin_id ON dbo.admin_audit_logs(actor_admin_id);
CREATE INDEX IX_admin_audit_logs_created_at ON dbo.admin_audit_logs(created_at DESC);
GO

/* Seeds */
INSERT INTO dbo.admins (admin_name, role)
VALUES
  (N'owner', N'owner'),
  (N'assistant', N'assistant_owner'),
  (N'manager', N'manager'),
  (N'admin', N'admin');

INSERT INTO dbo.students (student_id, student_name, academic_year, major, student_photo, admin_id)
VALUES
  (21141611, N'Student One', N'Year 1', N'BIS', N'/ProfessorsImages/default.png', 4),
  (21141612, N'Student Two', N'Year 2', N'Accounting', N'/ProfessorsImages/default.png', 4);

INSERT INTO dbo.professors (professor_name, subject_name, professor_photo, academic_year, major)
VALUES
  (N'Dr. Ahmed', N'Intro to Information Systems', N'/ProfessorsImages/default.png', N'Year 1|Year 2', N'BIS'),
  (N'Dr. Sara', N'Financial Accounting', N'/ProfessorsImages/default.png', N'Year 4', N'Accounting');

INSERT INTO dbo.professor_teaching_scopes (professor_id, academic_year, major)
VALUES
  (1, N'Year 1', N'BIS'),
  (1, N'Year 2', N'BIS'),
  (2, N'Year 4', N'Accounting');

INSERT INTO dbo.lectures (lecture_name, lecture_date, lecture_file, professor_id)
VALUES
  (N'Lecture 1', CAST(GETDATE() AS DATE), N'uploads/lectures/sample-lecture.pdf', 1);

INSERT INTO dbo.sheets (sheet_name, sheet_date, sheet_file, professor_id)
VALUES
  (N'Sheet 1', CAST(GETDATE() AS DATE), N'uploads/sheets/sample-sheet.pdf', 1);
GO
