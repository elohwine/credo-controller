-- ============================================================================
-- IdenEx Credentis - Workflow Execution Tracking
-- Verifiable Trust Infrastructure for Africa's Digital Economy
-- 
-- Schema for workflow run tracking, step execution, and triggers.
-- Provides complete audit trail for compliance and debugging.
-- Copyright 2024-2026 IdenEx Credentis
-- ============================================================================

-- Workflow Runs: track execution of workflows
CREATE TABLE IF NOT EXISTS workflow_runs (
  id TEXT PRIMARY KEY,
  workflow_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  status TEXT DEFAULT 'pending',  -- 'pending', 'running', 'completed', 'failed', 'paused', 'cancelled'
  input TEXT,                      -- JSON input data
  output TEXT,                     -- JSON output/state after completion
  error TEXT,                      -- Error message if failed
  trigger_type TEXT,               -- 'manual', 'webhook', 'schedule', 'workflow'
  trigger_ref TEXT,                -- Reference to trigger source (webhook ID, parent workflow, etc.)
  current_step INTEGER DEFAULT 0,
  total_steps INTEGER DEFAULT 0,
  started_at DATETIME,
  completed_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE CASCADE
);

-- Workflow Steps: track individual action execution within a run
CREATE TABLE IF NOT EXISTS workflow_steps (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  step_index INTEGER NOT NULL,
  action_name TEXT NOT NULL,
  config TEXT,                     -- JSON action config
  status TEXT DEFAULT 'pending',   -- 'pending', 'running', 'completed', 'failed', 'skipped'
  input_state TEXT,                -- JSON state before step
  output_state TEXT,               -- JSON state after step
  error TEXT,
  duration_ms INTEGER,
  started_at DATETIME,
  completed_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (run_id) REFERENCES workflow_runs(id) ON DELETE CASCADE
);

-- Workflow Triggers: define automatic triggers for workflows
CREATE TABLE IF NOT EXISTS workflow_triggers (
  id TEXT PRIMARY KEY,
  workflow_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  trigger_type TEXT NOT NULL,      -- 'webhook', 'schedule', 'event'
  trigger_config TEXT,             -- JSON config (cron expression, event type, etc.)
  is_active INTEGER DEFAULT 1,
  last_triggered_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE CASCADE
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_workflow_runs_workflow ON workflow_runs(workflow_id);
CREATE INDEX IF NOT EXISTS idx_workflow_runs_tenant ON workflow_runs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_workflow_runs_status ON workflow_runs(status);
CREATE INDEX IF NOT EXISTS idx_workflow_steps_run ON workflow_steps(run_id);
CREATE INDEX IF NOT EXISTS idx_workflow_triggers_workflow ON workflow_triggers(workflow_id);
