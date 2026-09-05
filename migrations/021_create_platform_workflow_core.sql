-- Platform remodeling foundation.
-- These tables sit above existing commerce/finance workflows and are intentionally
-- tenant-scoped without coupling to a particular industry module.

CREATE TABLE IF NOT EXISTS organizations (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  registration_number TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_platform_organizations_tenant
  ON organizations(tenant_id);

CREATE TABLE IF NOT EXISTS departments (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  parent_department_id TEXT,
  name TEXT NOT NULL,
  code TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (parent_department_id) REFERENCES departments(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_platform_departments_org
  ON departments(organization_id);

CREATE TABLE IF NOT EXISTS people (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  subject_id TEXT,
  display_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_platform_people_org
  ON people(organization_id);
CREATE INDEX IF NOT EXISTS idx_platform_people_subject
  ON people(subject_id);

CREATE TABLE IF NOT EXISTS organization_memberships (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  person_id TEXT NOT NULL,
  department_id TEXT,
  title TEXT,
  membership_status TEXT NOT NULL DEFAULT 'active',
  joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  left_at DATETIME,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (person_id) REFERENCES people(id) ON DELETE CASCADE,
  FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_platform_membership_person
  ON organization_memberships(organization_id, person_id);

CREATE TABLE IF NOT EXISTS roles (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  permissions TEXT NOT NULL DEFAULT '[]',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_platform_role_name
  ON roles(organization_id, name);

CREATE TABLE IF NOT EXISTS authority_grants (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  person_id TEXT NOT NULL,
  role_id TEXT,
  authority_type TEXT NOT NULL,
  scope_json TEXT NOT NULL DEFAULT '{}',
  source_credential_id TEXT,
  valid_from DATETIME,
  valid_until DATETIME,
  status TEXT NOT NULL DEFAULT 'active',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (person_id) REFERENCES people(id) ON DELETE CASCADE,
  FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_platform_authority_person
  ON authority_grants(organization_id, person_id, status);

CREATE TABLE IF NOT EXISTS delegations (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  delegator_person_id TEXT NOT NULL,
  delegate_person_id TEXT NOT NULL,
  scope_json TEXT NOT NULL DEFAULT '{}',
  source_credential_id TEXT,
  valid_from DATETIME NOT NULL,
  valid_until DATETIME,
  status TEXT NOT NULL DEFAULT 'active',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (delegator_person_id) REFERENCES people(id) ON DELETE CASCADE,
  FOREIGN KEY (delegate_person_id) REFERENCES people(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_platform_delegation_delegate
  ON delegations(organization_id, delegate_person_id, status);

CREATE TABLE IF NOT EXISTS requests (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  requester_person_id TEXT NOT NULL,
  department_id TEXT,
  request_type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  amount NUMERIC,
  currency TEXT,
  priority TEXT NOT NULL DEFAULT 'normal',
  status TEXT NOT NULL DEFAULT 'draft',
  workflow_id TEXT,
  workflow_run_id TEXT,
  target_module TEXT,
  context_json TEXT NOT NULL DEFAULT '{}',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  submitted_at DATETIME,
  completed_at DATETIME,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (requester_person_id) REFERENCES people(id) ON DELETE RESTRICT,
  FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_platform_requests_org_status
  ON requests(organization_id, status, created_at);
CREATE INDEX IF NOT EXISTS idx_platform_requests_requester
  ON requests(requester_person_id, created_at);

CREATE TABLE IF NOT EXISTS request_items (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL,
  item_type TEXT NOT NULL DEFAULT 'line_item',
  description TEXT NOT NULL,
  quantity NUMERIC NOT NULL DEFAULT 1,
  unit_price NUMERIC,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  FOREIGN KEY (request_id) REFERENCES requests(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_platform_request_items_request
  ON request_items(request_id);

CREATE TABLE IF NOT EXISTS request_approvals (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL,
  approver_person_id TEXT,
  delegated_from_person_id TEXT,
  approval_type TEXT NOT NULL DEFAULT 'standard',
  decision TEXT NOT NULL DEFAULT 'pending',
  comment TEXT,
  evidence_json TEXT NOT NULL DEFAULT '{}',
  decided_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (request_id) REFERENCES requests(id) ON DELETE CASCADE,
  FOREIGN KEY (approver_person_id) REFERENCES people(id) ON DELETE SET NULL,
  FOREIGN KEY (delegated_from_person_id) REFERENCES people(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_platform_request_approvals_request
  ON request_approvals(request_id, decision);

CREATE TABLE IF NOT EXISTS request_events (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  actor_person_id TEXT,
  from_status TEXT,
  to_status TEXT,
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (request_id) REFERENCES requests(id) ON DELETE CASCADE,
  FOREIGN KEY (actor_person_id) REFERENCES people(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_platform_request_events_request
  ON request_events(request_id, created_at);

CREATE TABLE IF NOT EXISTS field_assignments (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  request_id TEXT,
  assignee_person_id TEXT NOT NULL,
  location_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'assigned',
  scheduled_start DATETIME,
  scheduled_end DATETIME,
  started_at DATETIME,
  completed_at DATETIME,
  evidence_json TEXT NOT NULL DEFAULT '{}',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (request_id) REFERENCES requests(id) ON DELETE SET NULL,
  FOREIGN KEY (assignee_person_id) REFERENCES people(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_platform_field_assignments_request
  ON field_assignments(request_id, status);
