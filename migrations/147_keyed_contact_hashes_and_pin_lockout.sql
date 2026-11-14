-- Migration: 147_keyed_contact_hashes_and_pin_lockout.sql
-- Description: Marks which accounts still hold an open digest of their phone number or email
--              address, and gives the PIN an attempt limit.
-- Date: 2026-11-04
--
-- Why: `phone_hash` held `sha256(number)` with no key. A Zimbabwean mobile number is `2637` plus
-- seven digits, so ten million candidates recover every number in the table in under a second: the
-- hash was the number in a thin disguise, not a pseudonym. Hashes written from now on are keyed
-- (HMAC-SHA256 under CONTACT_HASH_PEPPER, which lives only in the deployment secret store).
--
-- An old digest cannot be converted without the person's number, so `contact_hash_version` marks
-- which rows are still open. `SSIAuthService` rewrites a row to the keyed hash on the next
-- successful sign-in, when the number is in hand, and sets the version to 2. Rows left at NULL are
-- the ones still to be rewritten, and the data-protection report counts them.
--
-- The PIN columns exist because a four-to-six digit PIN with no attempt limit is guessable by
-- anyone who can reach the sign-in endpoint; the global rate limit counted all callers together,
-- not attempts against one account.

ALTER TABLE ssi_users ADD COLUMN contact_hash_version INTEGER;
ALTER TABLE ssi_users ADD COLUMN pin_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE ssi_users ADD COLUMN pin_locked_until TEXT;

-- Every row that exists now predates the keyed hash.
UPDATE ssi_users SET contact_hash_version = NULL WHERE phone_hash IS NOT NULL OR email_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ssi_users_contact_hash_version ON ssi_users(contact_hash_version);
