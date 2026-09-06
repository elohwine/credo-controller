-- Migration 049: persist OpenID4VP protocol state for callback correlation.
-- The protocol state is only a transport correlation value; verification still
-- requires the bound Credo verification session and its protocol checks.

ALTER TABLE presentation_requests ADD COLUMN protocol_state TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_presentation_requests_protocol_state
  ON presentation_requests(protocol_state)
  WHERE protocol_state IS NOT NULL;

INSERT OR IGNORE INTO schema_migrations (version, applied_at)
VALUES (49, CURRENT_TIMESTAMP);
