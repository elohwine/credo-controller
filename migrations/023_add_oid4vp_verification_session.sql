-- Bind platform presentation requests to Credo's verifier session.
-- This is protocol correlation state, not credential/presentation payload.

ALTER TABLE presentation_requests ADD COLUMN protocol TEXT NOT NULL DEFAULT 'openid4vp';
ALTER TABLE presentation_requests ADD COLUMN credo_verification_session_id TEXT;
ALTER TABLE presentation_requests ADD COLUMN verifier_client_id_ref TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_platform_presentation_credo_session
  ON presentation_requests(credo_verification_session_id)
  WHERE credo_verification_session_id IS NOT NULL;

INSERT INTO schema_migrations (version, name)
VALUES (23, 'add_oid4vp_verification_session');
