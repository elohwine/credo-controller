-- A PIN someone else chose (an owner or admin giving a temporary PIN) must be replaced by the
-- person before the account can be used. 1 = the next sign-in only opens the change-PIN screen.
ALTER TABLE ssi_users ADD COLUMN pin_change_required INTEGER NOT NULL DEFAULT 0;
