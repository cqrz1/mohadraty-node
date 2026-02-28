/*
  Admin RBAC migration for existing databases
  - Adds admins.role if missing
  - Migrates legacy role values (superadmin -> owner)
  - Enforces 4-level role constraint
  - Ensures at least one owner account exists
*/

SET NOCOUNT ON;

IF COL_LENGTH('dbo.admins', 'role') IS NULL
BEGIN
  ALTER TABLE dbo.admins ADD role NVARCHAR(20) NULL;
END
GO

IF EXISTS (
  SELECT 1
  FROM sys.check_constraints
  WHERE name = N'CK_admins_role'
    AND parent_object_id = OBJECT_ID(N'dbo.admins')
)
BEGIN
  ALTER TABLE dbo.admins DROP CONSTRAINT CK_admins_role;
END
GO

UPDATE dbo.admins
SET role = CASE
  WHEN role IS NULL OR LTRIM(RTRIM(role)) = N'' THEN CASE WHEN admin_id = 1 THEN N'owner' ELSE N'admin' END
  WHEN LOWER(LTRIM(RTRIM(role))) = N'superadmin' THEN N'owner'
  WHEN LOWER(LTRIM(RTRIM(role))) = N'owner' THEN N'owner'
  WHEN LOWER(LTRIM(RTRIM(role))) IN (N'assistant_owner', N'assistant-owner', N'assistantowner') THEN N'assistant_owner'
  WHEN LOWER(LTRIM(RTRIM(role))) = N'manager' THEN N'manager'
  WHEN LOWER(LTRIM(RTRIM(role))) = N'admin' THEN N'admin'
  ELSE N'admin'
END;
GO

ALTER TABLE dbo.admins ALTER COLUMN role NVARCHAR(20) NOT NULL;
GO

ALTER TABLE dbo.admins WITH CHECK
ADD CONSTRAINT CK_admins_role CHECK (role IN (N'owner', N'assistant_owner', N'manager', N'admin'));
GO

IF NOT EXISTS (SELECT 1 FROM dbo.admins WHERE role = N'owner')
BEGIN
  IF EXISTS (SELECT 1 FROM dbo.admins WHERE admin_id = 1)
    UPDATE dbo.admins SET role = N'owner', admin_name = COALESCE(NULLIF(admin_name, N''), N'owner') WHERE admin_id = 1;
  ELSE
  BEGIN
    IF COLUMNPROPERTY(OBJECT_ID(N'dbo.admins'), N'admin_id', 'IsIdentity') = 1
      INSERT INTO dbo.admins (admin_name, role) VALUES (N'owner', N'owner');
    ELSE
      INSERT INTO dbo.admins (admin_id, admin_name, role) VALUES (1, N'owner', N'owner');
  END
END
GO

IF OBJECT_ID(N'dbo.admin_audit_logs', N'U') IS NULL
BEGIN
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
END
GO

IF NOT EXISTS (
  SELECT 1
  FROM sys.indexes
  WHERE name = N'IX_admin_audit_logs_actor_admin_id'
    AND object_id = OBJECT_ID(N'dbo.admin_audit_logs')
)
BEGIN
  CREATE INDEX IX_admin_audit_logs_actor_admin_id ON dbo.admin_audit_logs(actor_admin_id);
END
GO

IF NOT EXISTS (
  SELECT 1
  FROM sys.indexes
  WHERE name = N'IX_admin_audit_logs_created_at'
    AND object_id = OBJECT_ID(N'dbo.admin_audit_logs')
)
BEGIN
  CREATE INDEX IX_admin_audit_logs_created_at ON dbo.admin_audit_logs(created_at DESC);
END
GO

-- Example Owner creation (if needed manually):
-- INSERT INTO dbo.admins (admin_name, role) VALUES (N'main_owner', N'owner');
