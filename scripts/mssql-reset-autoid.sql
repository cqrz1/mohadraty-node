/*
  Reset database data + enforce auto-generated admin_id.
  - Converts dbo.admins.admin_id to IDENTITY if needed (preserving existing IDs)
  - Clears all business data
  - Reseeds identity tables
  - Creates one default owner account
*/

SET NOCOUNT ON;

IF OBJECT_ID(N'dbo.admins', N'U') IS NOT NULL
   AND COLUMNPROPERTY(OBJECT_ID(N'dbo.admins'), N'admin_id', 'IsIdentity') = 0
BEGIN
  DECLARE @studentsAdminFk SYSNAME;
  DECLARE @dropFkSql NVARCHAR(MAX);

  SELECT TOP (1) @studentsAdminFk = fk.name
  FROM sys.foreign_keys fk
  WHERE fk.parent_object_id = OBJECT_ID(N'dbo.students')
    AND fk.referenced_object_id = OBJECT_ID(N'dbo.admins');

  IF @studentsAdminFk IS NOT NULL
  BEGIN
    SET @dropFkSql = N'ALTER TABLE dbo.students DROP CONSTRAINT [' + @studentsAdminFk + N']';
    EXEC sp_executesql @dropFkSql;
  END

  CREATE TABLE dbo.admins_new (
    admin_id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    admin_name NVARCHAR(50) NOT NULL,
    role NVARCHAR(20) NOT NULL,
    CONSTRAINT CK_admins_new_role CHECK (role IN (N'owner', N'assistant_owner', N'manager', N'admin'))
  );

  IF EXISTS (SELECT 1 FROM dbo.admins)
  BEGIN
    SET IDENTITY_INSERT dbo.admins_new ON;
    INSERT INTO dbo.admins_new (admin_id, admin_name, role)
    SELECT
      admin_id,
      admin_name,
      CASE
        WHEN role IS NULL OR LTRIM(RTRIM(role)) = N'' THEN CASE WHEN admin_id = 1 THEN N'owner' ELSE N'admin' END
        WHEN LOWER(LTRIM(RTRIM(role))) = N'superadmin' THEN N'owner'
        WHEN LOWER(LTRIM(RTRIM(role))) IN (N'owner', N'assistant_owner', N'assistant-owner', N'assistantowner', N'manager', N'admin')
          THEN CASE
            WHEN LOWER(LTRIM(RTRIM(role))) IN (N'assistant-owner', N'assistantowner') THEN N'assistant_owner'
            ELSE LOWER(LTRIM(RTRIM(role)))
          END
        ELSE N'admin'
      END
    FROM dbo.admins;
    SET IDENTITY_INSERT dbo.admins_new OFF;
  END

  DROP TABLE dbo.admins;
  EXEC sp_rename N'dbo.admins_new', N'admins';

  IF EXISTS (
    SELECT 1
    FROM sys.check_constraints
    WHERE parent_object_id = OBJECT_ID(N'dbo.admins')
      AND name = N'CK_admins_new_role'
  )
  BEGIN
    EXEC sp_rename N'dbo.CK_admins_new_role', N'CK_admins_role', N'OBJECT';
  END

  IF OBJECT_ID(N'dbo.students', N'U') IS NOT NULL
  BEGIN
    ALTER TABLE dbo.students WITH CHECK
      ADD CONSTRAINT FK_students_admins FOREIGN KEY (admin_id) REFERENCES dbo.admins(admin_id);
  END
END
GO

/* Clear data in FK-safe order */
IF OBJECT_ID(N'dbo.professor_teaching_scopes', N'U') IS NOT NULL DELETE FROM dbo.professor_teaching_scopes;
IF OBJECT_ID(N'dbo.lectures', N'U') IS NOT NULL DELETE FROM dbo.lectures;
IF OBJECT_ID(N'dbo.sheets', N'U') IS NOT NULL DELETE FROM dbo.sheets;
IF OBJECT_ID(N'dbo.students', N'U') IS NOT NULL DELETE FROM dbo.students;
IF OBJECT_ID(N'dbo.professors', N'U') IS NOT NULL DELETE FROM dbo.professors;
IF OBJECT_ID(N'dbo.admin_audit_logs', N'U') IS NOT NULL DELETE FROM dbo.admin_audit_logs;
IF OBJECT_ID(N'dbo.admins', N'U') IS NOT NULL DELETE FROM dbo.admins;
GO

/* Reset identity values */
IF OBJECT_ID(N'dbo.admins', N'U') IS NOT NULL
   AND COLUMNPROPERTY(OBJECT_ID(N'dbo.admins'), N'admin_id', 'IsIdentity') = 1
  DBCC CHECKIDENT ('dbo.admins', RESEED, 0) WITH NO_INFOMSGS;

IF OBJECT_ID(N'dbo.professors', N'U') IS NOT NULL
  DBCC CHECKIDENT ('dbo.professors', RESEED, 0) WITH NO_INFOMSGS;

IF OBJECT_ID(N'dbo.professor_teaching_scopes', N'U') IS NOT NULL
  DBCC CHECKIDENT ('dbo.professor_teaching_scopes', RESEED, 0) WITH NO_INFOMSGS;

IF OBJECT_ID(N'dbo.lectures', N'U') IS NOT NULL
  DBCC CHECKIDENT ('dbo.lectures', RESEED, 0) WITH NO_INFOMSGS;

IF OBJECT_ID(N'dbo.sheets', N'U') IS NOT NULL
  DBCC CHECKIDENT ('dbo.sheets', RESEED, 0) WITH NO_INFOMSGS;

IF OBJECT_ID(N'dbo.admin_audit_logs', N'U') IS NOT NULL
  DBCC CHECKIDENT ('dbo.admin_audit_logs', RESEED, 0) WITH NO_INFOMSGS;
GO

/* Create default owner (ID becomes 1) */
IF OBJECT_ID(N'dbo.admins', N'U') IS NOT NULL
BEGIN
  INSERT INTO dbo.admins (admin_name, role)
  VALUES (N'owner', N'owner');
END
GO
