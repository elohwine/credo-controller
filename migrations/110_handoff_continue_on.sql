-- When a job continues after a purchase it raised: as soon as the purchase is approved,
-- or only once it is bought, received and (for a supplier) paid. NULL keeps the default
-- from the built-in catalog.
ALTER TABLE org_workflow_handoffs ADD COLUMN continue_on TEXT;

-- The supplier is now paid when the purchase order is delivered with its bill, not when the
-- order is approved. Carry an organization's saved choice over to the new rule.
UPDATE request_handoffs
SET on_status = 'completed'
WHERE from_request_type = 'finance.purchase_order'
  AND on_status = 'approved'
  AND to_request_type = 'finance.payment_request'
  AND NOT EXISTS (
    SELECT 1 FROM request_handoffs newer
    WHERE newer.organization_id = request_handoffs.organization_id
      AND newer.from_request_type = 'finance.purchase_order'
      AND newer.on_status = 'completed'
      AND newer.to_request_type = 'finance.payment_request'
  );
