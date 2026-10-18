-- Links a Roles-page row to the membership role used when someone joins the team
-- (field_worker, supervisor, …). Empty for a custom role that only lists what they can do.

ALTER TABLE roles ADD COLUMN membership_role TEXT;
