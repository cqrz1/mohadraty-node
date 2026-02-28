/*
  Professor Teaching Scope migration for existing databases
  - Creates dbo.professor_teaching_scopes if missing
  - Backfills combinations from professors.academic_year + professors.major
*/

SET NOCOUNT ON;

IF COL_LENGTH('dbo.professors', 'academic_year') IS NOT NULL
BEGIN
  ALTER TABLE dbo.professors ALTER COLUMN academic_year NVARCHAR(255) NULL;
END
GO

IF COL_LENGTH('dbo.professors', 'major') IS NOT NULL
BEGIN
  ALTER TABLE dbo.professors ALTER COLUMN major NVARCHAR(255) NULL;
END
GO

IF OBJECT_ID(N'dbo.professor_teaching_scopes', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.professor_teaching_scopes (
    scope_id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    professor_id INT NOT NULL,
    academic_year NVARCHAR(50) NOT NULL,
    major NVARCHAR(100) NOT NULL,
    CONSTRAINT FK_professor_teaching_scopes_professors
      FOREIGN KEY (professor_id) REFERENCES dbo.professors(professor_id) ON DELETE CASCADE
  );
END
GO

IF NOT EXISTS (
  SELECT 1
  FROM sys.indexes
  WHERE name = N'UQ_professor_teaching_scope'
    AND object_id = OBJECT_ID(N'dbo.professor_teaching_scopes')
)
BEGIN
  CREATE UNIQUE INDEX UQ_professor_teaching_scope
    ON dbo.professor_teaching_scopes (professor_id, academic_year, major);
END
GO

;WITH Normalized AS (
  SELECT
    p.professor_id,
    REPLACE(REPLACE(ISNULL(p.academic_year, N''), NCHAR(1548), N'|'), N',', N'|') AS years_raw,
    REPLACE(REPLACE(ISNULL(p.major, N''), NCHAR(1548), N'|'), N',', N'|') AS majors_raw
  FROM dbo.professors p
), ParsedPairs AS (
  SELECT
    n.professor_id,
    LTRIM(RTRIM(y.value)) AS academic_year,
    LTRIM(RTRIM(m.value)) AS major
  FROM Normalized n
  CROSS APPLY STRING_SPLIT(n.years_raw, N'|') y
  CROSS APPLY STRING_SPLIT(n.majors_raw, N'|') m
)
INSERT INTO dbo.professor_teaching_scopes (professor_id, academic_year, major)
SELECT DISTINCT p.professor_id, p.academic_year, p.major
FROM ParsedPairs p
WHERE p.academic_year <> N''
  AND p.major <> N''
  AND NOT EXISTS (
    SELECT 1
    FROM dbo.professor_teaching_scopes s
    WHERE s.professor_id = p.professor_id
      AND s.academic_year = p.academic_year
      AND s.major = p.major
  );
GO
