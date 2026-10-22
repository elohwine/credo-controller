-- A supplier payment can carry its proof the same two ways as a job receipt: a live photo
-- (fingerprint on the payment, bytes kept apart so lists stay small) or a receipt record from
-- the payer's wallet (id, type and label only).
ALTER TABLE ap_payments ADD COLUMN proof_image_sha256 TEXT;
ALTER TABLE ap_payments ADD COLUMN proof_record_json TEXT;

CREATE TABLE IF NOT EXISTS ap_payment_proof_images (
  payment_id TEXT PRIMARY KEY,
  image_data TEXT NOT NULL,
  image_sha256 TEXT NOT NULL,
  created_at TEXT NOT NULL
);
