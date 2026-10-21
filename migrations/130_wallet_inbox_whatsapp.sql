-- Capture every new inbox card atomically, including producers without a wallet.vc.offered event.
-- This notification-only topic leaves the existing Android delivery path unchanged.
CREATE TRIGGER wallet_inbox_whatsapp_insert
AFTER INSERT ON wallet_pending_offers
WHEN NEW.issuer_tenant_id IS NOT NULL AND NEW.issuer_tenant_id <> ''
BEGIN
  INSERT INTO integration_outbox (id, topic, aggregate_key, dedupe_key, payload, status, created_at)
  VALUES (
    lower(hex(randomblob(16))),
    'wallet.inbox.whatsapp',
    NEW.tenant_id,
    'wallet-inbox-whatsapp:' || NEW.id,
    json_object(
      'tenantId', NEW.tenant_id,
      'issuerTenantId', NEW.issuer_tenant_id,
      'sourceType', NEW.source_type,
      'sourceId', NEW.source_id,
      'credentialType', NEW.credential_type,
      'inboxItemId', NEW.id
    ),
    'pending',
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  );
END;
