-- The app role a person should get when they are invited (from an import: office users are managers,
-- mobile users are field workers). Their real role lives on org_memberships once they join.
ALTER TABLE employees ADD COLUMN intended_role TEXT;
