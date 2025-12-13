CREATE TABLE IF NOT EXISTS workflows (
  id TEXT PRIMARY KEY,
  tenant_id TEXT,
  name TEXT,
  category TEXT,
  provider TEXT,
  description TEXT,
  input_schema TEXT,
  actions TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_workflows_category ON workflows(category);
