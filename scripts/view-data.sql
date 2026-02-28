USE [education_db];
GO

SELECT admin_id, admin_name FROM dbo.admins ORDER BY admin_id;
SELECT student_id, student_name, academic_year, major FROM dbo.students ORDER BY student_id;
SELECT professor_id, professor_name, subject_name, academic_year, major FROM dbo.professors ORDER BY professor_id;
SELECT lecture_id, lecture_name, lecture_date, professor_id FROM dbo.lectures ORDER BY lecture_id;
SELECT sheet_id, sheet_name, sheet_date, professor_id FROM dbo.sheets ORDER BY sheet_id;
