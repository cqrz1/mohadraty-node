/*
  Admin RBAC migration for existing databases
  - Adds admins.role
  - Fills missing values
  - Ensures at least one superadmin account exists
*/

SET NOCOUNT ON;

IF COL_LENGTH('dbo.admins', 'role') IS NULL
BEGIN
  ALTER TABLE dbo.admins ADD role NVARCHAR(20) NULL;
END
GO

UPDATE dbo.admins
SET role = CASE WHEN admin_id = 1 THEN N'superadmin' ELSE N'admin' END
WHERE role IS NULL OR LTRIM(RTRIM(role)) = N'';
GO

IF NOT EXISTS (
  SELECT 1
  FROM sys.check_constraints
  WHERE name = N'CK_admins_role'
    AND parent_object_id = OBJECT_ID(N'dbo.admins')
)
BEGIN
  ALTER TABLE dbo.admins WITH NOCHECK
  ADD CONSTRAINT CK_admins_role CHECK (role IN (N'superadmin', N'admin'));
END
GO

ALTER TABLE dbo.admins ALTER COLUMN role NVARCHAR(20) NOT NULL;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.admins WHERE role = N'superadmin')
BEGIN
  IF EXISTS (SELECT 1 FROM dbo.admins WHERE admin_id = 1)
    UPDATE dbo.admins SET role = N'superadmin', admin_name = N'admin' WHERE admin_id = 1;
  ELSE
    INSERT INTO dbo.admins (admin_id, admin_name, role) VALUES (1, N'admin', N'superadmin');
END
GO

-- Example superadmin creation (if you need another one manually):
-- INSERT INTO dbo.admins (admin_id, admin_name, role) VALUES (3000, N'main_super', N'superadmin');
