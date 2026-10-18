-- A person's own activity log: who they shared a card with and for which step, which
-- cards they were given, which cards an organisation withdrew, and the shares they turned
-- down. One row per event, written once and never edited, so the phone and the website can
-- answer "who has my data, what did I share, and for what" without reading the API trace.
--
-- Only names are kept: claim names, card type names, the step, the signed job line.
-- No claim values, no presentation or credential material (handoff §30).

CREATE TABLE IF NOT EXISTS holder_activity (
  id TEXT PRIMARY KEY,
  wallet_tenant_id TEXT NOT NULL,
  -- shared | share_verified | share_refused | share_declined | card_received | card_withdrawn
  kind TEXT NOT NULL,
  org_tenant_id TEXT,
  org_name TEXT,
  -- One plain line for the step: "Sign off this job · Job FR-123 · 450"
  purpose_label TEXT,
  stage_action TEXT,
  workflow_run_id TEXT,
  request_id TEXT,
  -- Job or request reference the person recognises (FR-…, PO-…)
  reference TEXT,
  requested_types_json TEXT NOT NULL DEFAULT '[]',
  requested_claims_json TEXT NOT NULL DEFAULT '[]',
  shared_claims_json TEXT NOT NULL DEFAULT '[]',
  withheld_claims_json TEXT NOT NULL DEFAULT '[]',
  signed_line TEXT,
  -- shared | verified | refused | declined | received | replaced | withdrawn
  outcome TEXT NOT NULL,
  reason TEXT,
  -- Natural key of the thing this row is about (presentation request id, inbox offer id,
  -- credential id) so a retry or a backfill does not write the same event twice.
  source_id TEXT,
  occurred_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_holder_activity_wallet_time
  ON holder_activity (wallet_tenant_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_holder_activity_wallet_org
  ON holder_activity (wallet_tenant_id, org_tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_holder_activity_source
  ON holder_activity (wallet_tenant_id, kind, source_id)
  WHERE source_id IS NOT NULL;
