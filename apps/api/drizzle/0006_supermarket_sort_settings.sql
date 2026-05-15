-- Seed default supermarket sort mode; aisle order falls back to DEFAULT_AISLE_ORDER constant
INSERT INTO "app_settings" ("key", "value")
VALUES ('supermarket_sort_mode', 'az')
ON CONFLICT ("key") DO NOTHING;
