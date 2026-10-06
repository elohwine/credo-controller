-- Org readiness replaces workflow activation.
--
-- Each workflow template may persist an explicit declaration of the
-- organizational prerequisites it needs (people, roles, authorities,
-- departments, trust anchors, payment providers, stage actors).
-- NULL means "use the code-side registry default for this template".
--
-- The `enabled` flag remains as a soft UI/visibility hint only; it is no longer
-- the operational gate for workflow execution.

ALTER TABLE workflow_templates ADD COLUMN prerequisites TEXT;
