-- The staff number, skills and the team account live on the payroll employee.
-- Jobs, leave and the van are looked up through user_id. There is no second staff list.

ALTER TABLE employees ADD COLUMN staff_number TEXT;
ALTER TABLE employees ADD COLUMN skills_json TEXT;
ALTER TABLE employees ADD COLUMN user_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_employees_staff_number
  ON employees(tenant_id, staff_number) WHERE staff_number IS NOT NULL AND staff_number != '';
CREATE UNIQUE INDEX IF NOT EXISTS idx_employees_user
  ON employees(tenant_id, user_id) WHERE user_id IS NOT NULL AND user_id != '';
