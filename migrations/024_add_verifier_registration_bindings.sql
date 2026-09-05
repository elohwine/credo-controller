-- Verifier registration bindings required by the DCQL-first OpenID4VP platform flow.
-- Migration 023 already owns the presentation protocol/session columns.

ALTER TABLE verifier_registrations ADD COLUMN signer_did_url_ref TEXT;
ALTER TABLE verifier_registrations ADD COLUMN credo_verifier_id_ref TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_platform_verifier_credo_id
  ON verifier_registrations(organization_id, credo_verifier_id_ref)
  WHERE credo_verifier_id_ref IS NOT NULL;

INSERT INTO schema_migrations (version, name)
VALUES (24, 'add_verifier_registration_bindings');
