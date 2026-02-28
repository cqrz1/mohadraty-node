/*
  Mohadraty SQL Server migration + seed
  Target: SQL Server 2017+
*/

SET NOCOUNT ON;

IF OBJECT_ID(N'dbo.sheets', N'U') IS NOT NULL DROP TABLE dbo.sheets;
IF OBJECT_ID(N'dbo.lectures', N'U') IS NOT NULL DROP TABLE dbo.lectures;
IF OBJECT_ID(N'dbo.students', N'U') IS NOT NULL DROP TABLE dbo.students;
IF OBJECT_ID(N'dbo.professors', N'U') IS NOT NULL DROP TABLE dbo.professors;
IF OBJECT_ID(N'dbo.admins', N'U') IS NOT NULL DROP TABLE dbo.admins;
GO

CREATE TABLE dbo.admins (
  admin_id INT NOT NULL PRIMARY KEY,
  admin_name NVARCHAR(50) NOT NULL,
  role NVARCHAR(20) NOT NULL,
  CONSTRAINT CK_admins_role CHECK (role IN (N'superadmin', N'admin'))
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
  academic_year NVARCHAR(50) NULL,
  major NVARCHAR(100) NULL
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

/* Seeds */
INSERT INTO dbo.admins (admin_id, admin_name, role)
VALUES
  (1, N'admin', N'superadmin'),
  (2024, N'superadmin', N'admin');

INSERT INTO dbo.students (student_id, student_name, academic_year, major, student_photo, admin_id)
VALUES
  (21141611, N'طالب تجريبي', N'الفرقة الأولى', N'نظم ومعلومات الأعمال', N'/ProfessorsImages/default.png', 1),
  (21141612, N'طالبة تجريبية', N'الفرقة الثانية', N'محاسبة ومراجعة', N'/ProfessorsImages/default.png', 1);

INSERT INTO dbo.professors (professor_name, subject_name, professor_photo, academic_year, major)
VALUES
  (N'د. أحمد محمد', N'مقدمة في نظم المعلومات', N'/ProfessorsImages/default.png', N'الفرقة الأولى', N'نظم ومعلومات الأعمال'),
  (N'د. سارة علي', N'المحاسبة المالية', N'/ProfessorsImages/default.png', N'الفرقة الثانية', N'محاسبة ومراجعة');

INSERT INTO dbo.lectures (lecture_name, lecture_date, lecture_file, professor_id)
VALUES
  (N'المحاضرة الأولى', CAST(GETDATE() AS DATE), N'uploads/lectures/sample-lecture.pdf', 1);

INSERT INTO dbo.sheets (sheet_name, sheet_date, sheet_file, professor_id)
VALUES
  (N'شيت 1', CAST(GETDATE() AS DATE), N'uploads/sheets/sample-sheet.pdf', 1);
GO
