-- OpenID4VP 1.0 / DCQL protocol bindings for platform presentation requests.
-- Keeps business request ids distinct from Credo protocol session ids.

ALTER TABLE verifier_registrations ADD COLUMN signer_did_url_ref TEXT;
ALTER TABLE verifier_registrations ADD COLUMN credo_verifier_id_ref TEXT;

ALTER TABLE presentation_requests ADD COLUMN protocol TEXT NOT NULL DEFAULT 'openid4vp';
ALTER TABLE presentation_requests ADD COLUMN credo_verification_session_id TEXT;
ALTER TABLE presentation_requests ADD COLUMN verifier_client_id_ref TEXT;

CREATE INDEX IF NOT EXISTS idx_platform_presentation_requests_credo_session
  ON presentation_requests(credo_verification_session_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_platform_verifier_credo_id
  ON verifier_registrations(organization_id, credo_verifier_id_ref)
  WHERE credo_verifier_id_ref IS NOT NULL;

INSERT INTO schema_migrations (version, name)
VALUES (23, 'add_dcql_protocol_bindings');
