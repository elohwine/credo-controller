-- How the latest send of each invite went, so the team list can show a failed invite and offer
-- to send it again by email or WhatsApp.
-- delivery_channel: email | whatsapp | sms | link
-- delivery_status: sending | sent | delivered | failed | not_sent
-- delivery_ref: the email provider message id, or the WhatsApp notification_deliveries id.
ALTER TABLE member_invites ADD COLUMN delivery_channel TEXT;
ALTER TABLE member_invites ADD COLUMN delivery_status TEXT;
ALTER TABLE member_invites ADD COLUMN delivery_reason TEXT;
ALTER TABLE member_invites ADD COLUMN delivery_ref TEXT;
ALTER TABLE member_invites ADD COLUMN delivery_to TEXT;
ALTER TABLE member_invites ADD COLUMN delivery_at TEXT;
