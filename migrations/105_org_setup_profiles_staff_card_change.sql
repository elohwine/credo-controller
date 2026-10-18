-- What happens to a person's earlier staff card when their role or steps change.
--   stop_when_narrower (default): the old card is withdrawn only when it would still prove
--                                 steps the person no longer has; otherwise it stays valid until
--                                 the new card is accepted.
--   stop_now:                     the old card is withdrawn the moment the role changes.
ALTER TABLE org_setup_profiles ADD COLUMN staff_card_change TEXT;
