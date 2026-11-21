-- What has already been said about a job that is stuck, so each problem is announced once,
-- then summed up once a day and once a week, never once an hour.
--   scope 'run'    subject = the job (kind: failed, overdue, unassigned, stalled)
--   scope 'intake' subject = a job waiting to be booked (kind: waiting)
--   scope 'day'    subject = the date of the daily summary
--   scope 'week'   subject = the week of the weekly summary
-- A row for a job is removed when the job stops being stuck, so if it gets stuck again it is announced again.
CREATE TABLE IF NOT EXISTS job_attention_log (
  org_tenant_id TEXT NOT NULL,
  scope TEXT NOT NULL CHECK (scope IN ('run', 'intake', 'day', 'week')),
  subject TEXT NOT NULL,
  kind TEXT NOT NULL,
  notified_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (org_tenant_id, scope, subject, kind)
);

CREATE INDEX IF NOT EXISTS idx_job_attention_log_notified ON job_attention_log (scope, notified_at);
