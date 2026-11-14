-- Migration: 146_check_log_without_caller_details.sql
-- Description: The public record-check log counts checks instead of tracing callers. Clears the
--              stored addresses and browser strings from the rows already written.
-- Date: 2026-11-04
--
-- Why: `GET /api/verify/{id}` needs no sign-in, and every call wrote the caller's IP address and
-- user agent into `vc_verifications.verifier_info` with no retention limit, while
-- `GET /api/verify/{id}/history` handed them back to anyone. An IP address is personal data. The
-- controller now keeps only a salted short hash of the address, and the history answer no longer
-- includes it at all.

UPDATE vc_verifications
   SET verifier_info = json_object('timestamp', COALESCE(created_at, CURRENT_TIMESTAMP))
 WHERE verifier_info IS NOT NULL
   AND verifier_info <> '';
