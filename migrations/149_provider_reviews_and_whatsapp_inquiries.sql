-- A review can be left only by someone who paid this business or whose request it accepted.
-- A WhatsApp inquiry is the message a person sent us, kept so the same message is answered once.

CREATE TABLE IF NOT EXISTS provider_reviews (
  id TEXT PRIMARY KEY,
  org_tenant_id TEXT NOT NULL,
  author_tenant_id TEXT NOT NULL,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  proof_kind TEXT NOT NULL CHECK (proof_kind IN ('payment', 'request')),
  proof_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (author_tenant_id, org_tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_provider_reviews_org ON provider_reviews(org_tenant_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS whatsapp_inquiries (
  id TEXT PRIMARY KEY,
  sender_key TEXT NOT NULL,
  message_id TEXT NOT NULL,
  phone TEXT NOT NULL,
  need TEXT NOT NULL,
  match_count INTEGER NOT NULL DEFAULT 0,
  reply_status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (sender_key, message_id)
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_inquiries_created ON whatsapp_inquiries(created_at DESC);
