-- Jobs brought in from the old system (MyMobileWorkers) become ordinary closed jobs, so they show
-- on the Jobs list and open into the same job view as every other job. Each history row keeps the
-- job it became, so it is converted once and no longer listed twice.
ALTER TABLE job_history ADD COLUMN workflow_run_id TEXT;
CREATE INDEX IF NOT EXISTS idx_job_history_run ON job_history(workflow_run_id);
