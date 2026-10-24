-- More than one named person may act on a stage. The first chosen person stays in
-- default_user_id; the others are kept here as a JSON array of user ids.
ALTER TABLE org_workflow_actor_defaults ADD COLUMN additional_user_ids TEXT;
