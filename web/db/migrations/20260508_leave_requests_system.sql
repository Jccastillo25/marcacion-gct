-- Leave Types and Requests System
-- Created: 2026-05-08

-- ============================================================================
-- leave_types
-- ============================================================================
CREATE TABLE IF NOT EXISTS leave_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT DEFAULT '#6366f1',
  requires_approval BOOLEAN DEFAULT true,
  max_days_per_year INT DEFAULT 15,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT unique_leave_type_name UNIQUE (company_id, name)
);

CREATE INDEX idx_leave_types_company_id ON leave_types(company_id);
CREATE INDEX idx_leave_types_is_active ON leave_types(is_active);

-- ============================================================================
-- leave_requests
-- ============================================================================
CREATE TABLE IF NOT EXISTS leave_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  leave_type_id UUID NOT NULL REFERENCES leave_types(id) ON DELETE RESTRICT,

  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  days_requested NUMERIC(5, 2) DEFAULT 1,
  reason TEXT,

  status TEXT DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),

  approved_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  rejection_reason TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT valid_date_range CHECK (start_date <= end_date),
  CONSTRAINT unique_pending_leave UNIQUE (employee_id, leave_type_id, start_date, end_date)
    WHERE status = 'pending'
);

CREATE INDEX idx_leave_requests_company_id ON leave_requests(company_id);
CREATE INDEX idx_leave_requests_employee_id ON leave_requests(employee_id);
CREATE INDEX idx_leave_requests_status ON leave_requests(status);
CREATE INDEX idx_leave_requests_date_range ON leave_requests(start_date, end_date);
CREATE INDEX idx_leave_requests_created_at ON leave_requests(created_at DESC);

-- ============================================================================
-- Row-Level Security (RLS)
-- ============================================================================

ALTER TABLE leave_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_requests ENABLE ROW LEVEL SECURITY;

-- leave_types: readable by all company members, writable by admins
CREATE POLICY "Users can view leave_types in their company"
  ON leave_types FOR SELECT
  USING (is_member_of(company_id));

CREATE POLICY "Admins can manage leave_types"
  ON leave_types FOR ALL
  USING (is_company_admin(company_id))
  WITH CHECK (is_company_admin(company_id));

-- leave_requests: employees can view/create their own, admins can manage all
CREATE POLICY "Users can view leave_requests in their company"
  ON leave_requests FOR SELECT
  USING (is_member_of(company_id));

CREATE POLICY "Employees can create their own leave_requests"
  ON leave_requests FOR INSERT
  WITH CHECK (
    is_member_of(company_id) AND
    employee_id = (
      SELECT id FROM employees
      WHERE email = auth.jwt() ->> 'email'
        AND company_id = leave_requests.company_id
      LIMIT 1
    )
  );

CREATE POLICY "Admins can approve/reject leave_requests"
  ON leave_requests FOR UPDATE
  USING (is_company_admin(company_id))
  WITH CHECK (is_company_admin(company_id));

-- ============================================================================
-- Insert default leave types for seed companies
-- ============================================================================

INSERT INTO leave_types (company_id, name, description, color, requires_approval, max_days_per_year)
SELECT
  id,
  type,
  desc,
  color,
  requires_approval,
  max_days
FROM (
  SELECT id FROM companies WHERE is_active = true
) companies,
LATERAL (
  VALUES
    ('Vacaciones', 'Período de descanso anual', '#10b981', true, 15),
    ('Enfermedad', 'Licencia por enfermedad', '#ef4444', true, 30),
    ('Asuntos Personales', 'Permiso para asuntos personales', '#f59e0b', true, 3),
    ('Maternidad/Paternidad', 'Licencia por nacimiento', '#8b5cf6', true, 30),
    ('Duelo', 'Licencia por fallecimiento de familiar', '#6366f1', true, 3)
) AS types(type, desc, color, requires_approval, max_days)
ON CONFLICT (company_id, name) DO NOTHING;
