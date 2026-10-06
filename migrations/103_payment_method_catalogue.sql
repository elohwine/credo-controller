-- Click n Pay and Simulated pay sit beside EcoCash in the provider catalogue.
-- Organisation setup offers these three, in this order, matching the school-fees payment dialog.

INSERT OR IGNORE INTO service_providers (id, tenant_id, name, type, description, base_url, auth_type, config_schema, is_system)
VALUES
  ('clicknpay', 'system', 'Click n Pay', 'payment', 'Pay with card', NULL, 'none', NULL, 1),
  ('simulated', 'system', 'Simulated pay', 'payment', 'Practice payment. No real money moves.', NULL, 'none', NULL, 1);
