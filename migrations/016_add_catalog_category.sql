ALTER TABLE catalog_items ADD COLUMN category TEXT;
CREATE INDEX IF NOT EXISTS idx_catalog_category ON catalog_items(category);
INSERT INTO schema_migrations (version, name) VALUES (16, 'add_catalog_category');
