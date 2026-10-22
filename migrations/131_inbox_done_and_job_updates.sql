-- How long finished items stay under Done, per person and per inbox.
-- inbox_scope is 'personal' or the organisation tenant id of an organisation inbox.
CREATE TABLE IF NOT EXISTS inbox_preferences (
  owner_tenant_id TEXT NOT NULL,
  inbox_scope TEXT NOT NULL,
  done_days INTEGER NOT NULL DEFAULT 7,
  updated_at TEXT,
  PRIMARY KEY (owner_tenant_id, inbox_scope)
);

CREATE INDEX IF NOT EXISTS idx_wallet_pending_offers_tenant_resolved
  ON wallet_pending_offers (tenant_id, resolved_at);

-- When a job finishes or is cancelled, everyone who had a step on it gets one update card.
-- Every writer of workflow_runs is covered, and the insert reaches WhatsApp through
-- wallet_inbox_whatsapp_insert (migration 130). The NOT EXISTS keeps it to one card per person.
CREATE TRIGGER IF NOT EXISTS workflow_run_finished_inbox
AFTER UPDATE OF status, output ON workflow_runs
WHEN (
  NEW.status IN ('completed', 'cancelled')
  AND COALESCE(OLD.status, '') NOT IN ('completed', 'cancelled')
) OR (
  upper(COALESCE(CASE WHEN json_valid(NEW.output) THEN json_extract(NEW.output, '$.workflowStage') END, '')) IN ('COMPLETED', 'CANCELLED', 'REVOKED')
  AND upper(COALESCE(CASE WHEN json_valid(OLD.output) THEN json_extract(OLD.output, '$.workflowStage') END, '')) NOT IN ('COMPLETED', 'CANCELLED', 'REVOKED')
)
BEGIN
  INSERT INTO wallet_pending_offers (
    id, tenant_id, issuer_tenant_id, source_type, source_id, credential_type, offer_uri,
    title, body, metadata, workflow_run_id, created_at
  )
  SELECT
    lower(hex(randomblob(16))),
    actors.tenant_id,
    NEW.tenant_id,
    'workflow_update',
    'run:' || NEW.id || ':finished',
    'WorkflowUpdate',
    '',
    CASE WHEN info.outcome = 'cancelled'
      THEN COALESCE('Job ' || info.ref, 'Your job') || ' was cancelled'
      ELSE COALESCE('Job ' || info.ref, 'Your job') || ' is complete'
    END,
    CASE WHEN info.outcome = 'cancelled'
      THEN 'This job was stopped. Nothing more is needed from you.'
      ELSE 'Every step is done. Nothing more is needed from you.'
    END,
    json_object(
      'workflowRunId', NEW.id,
      'outcome', info.outcome,
      'reference', info.ref,
      'orgTenantId', NEW.tenant_id,
      'orgName', (SELECT name FROM organizations WHERE tenant_id = NEW.tenant_id LIMIT 1)
    ),
    NEW.id,
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  FROM (
    SELECT DISTINCT tenant_id
    FROM wallet_pending_offers
    WHERE workflow_run_id = NEW.id
      AND source_type IN (
        'workflow_stage_action', 'workflow_assignment', 'requisition_stage_action',
        'workflow_request_assignment', 'ap_workflow_assignment'
      )
  ) AS actors,
  (
    SELECT
      CASE
        WHEN NEW.status = 'cancelled'
          OR upper(COALESCE(CASE WHEN json_valid(NEW.output) THEN json_extract(NEW.output, '$.workflowStage') END, '')) IN ('CANCELLED', 'REVOKED')
        THEN 'cancelled'
        ELSE 'completed'
      END AS outcome,
      CASE WHEN json_valid(NEW.input) THEN COALESCE(
        NULLIF(trim(json_extract(NEW.input, '$.poNumber')), ''),
        NULLIF(trim(json_extract(NEW.input, '$.reference')), ''),
        NULLIF(trim(json_extract(NEW.input, '$.jobReference')), '')
      ) END AS ref
  ) AS info
  WHERE NOT EXISTS (
    SELECT 1 FROM wallet_pending_offers done
    WHERE done.tenant_id = actors.tenant_id
      AND done.source_type = 'workflow_update'
      AND done.source_id = 'run:' || NEW.id || ':finished'
  );
END;
