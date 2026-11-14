-- A finished-job inbox card has no credential link, so offer_uri is blank.
-- The old unique index treated that blank as a real offer link. The second
-- notice for the same person (they already had one blank card) aborted the
-- job save, the phone showed "Not shared", and the job stayed running even
-- though every step had already been written.
-- Real offer links stay unique while they are open. Blank notices do not.
DROP INDEX IF EXISTS ux_wallet_pending_offer_unresolved_uri;

CREATE UNIQUE INDEX IF NOT EXISTS ux_wallet_pending_offer_unresolved_uri
  ON wallet_pending_offers (tenant_id, offer_uri)
  WHERE resolved_at IS NULL AND TRIM(COALESCE(offer_uri, '')) <> '';
