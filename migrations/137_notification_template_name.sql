-- Which WhatsApp template a delivery used, so branded sends can be told apart from the generic fallback.
ALTER TABLE notification_deliveries ADD COLUMN template_name TEXT;
