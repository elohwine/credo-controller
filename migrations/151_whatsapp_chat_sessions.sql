-- One conversation per WhatsApp number and business number: the last search, the requests
-- asked from the chat (numbered in replies), photos kept for the next request, and when the
-- person last wrote (WhatsApp allows a free reply for 24 hours after that).
-- A number with no account asks through a guest record that moves to their account when
-- they sign up with the same number.

CREATE TABLE IF NOT EXISTS whatsapp_chat_sessions (
    sender_key TEXT NOT NULL,
    phone TEXT NOT NULL,
    requester_tenant_id TEXT,
    search TEXT,
    matches TEXT NOT NULL DEFAULT '[]',
    asked TEXT NOT NULL DEFAULT '[]',
    media TEXT NOT NULL DEFAULT '[]',
    last_inbound_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (sender_key, phone)
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_chat_sessions_requester ON whatsapp_chat_sessions(requester_tenant_id);

-- A photo or document sent in the chat, fetched when it arrives (Meta keeps it only briefly).
-- Only the business asked and the person who sent it can open it.
CREATE TABLE IF NOT EXISTS whatsapp_media (
    id TEXT PRIMARY KEY,
    sender_key TEXT NOT NULL,
    phone TEXT NOT NULL,
    provider_media_id TEXT NOT NULL,
    mime_type TEXT,
    caption TEXT,
    data BLOB,
    created_at TEXT NOT NULL,
    UNIQUE (sender_key, provider_media_id)
);
