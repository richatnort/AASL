-- Extend category_order with display name, colour, built-in flag
ALTER TABLE "category_order" ADD COLUMN "display_name" text;
ALTER TABLE "category_order" ADD COLUMN "color"        text;
ALTER TABLE "category_order" ADD COLUMN "is_built_in"  boolean NOT NULL DEFAULT true;

-- Seed display names and brand colours for the three built-in categories
-- (rows may not exist yet if categoryOrder hasn't been seeded; use INSERT ... ON CONFLICT)
INSERT INTO "category_order" (category, sort_order, display_name, color, is_built_in)
VALUES
  ('greengrocers', 0, 'Green Grocers', '#22c55e', true),
  ('butchers',     1, 'Butchers',      '#dc2626', true),
  ('supermarket',  2, 'Supermarket',   '#f06c00', true)
ON CONFLICT (category) DO UPDATE
  SET display_name = EXCLUDED.display_name,
      color        = EXCLUDED.color,
      is_built_in  = EXCLUDED.is_built_in;

-- Gift cards table
CREATE TABLE "gift_cards" (
  "id"                serial PRIMARY KEY,
  "name"              text NOT NULL,
  "category_key"      text NOT NULL,
  "card_number"       text NOT NULL,
  "pin"               text NOT NULL,
  "balance_check_url" text NOT NULL,
  "last_balance"      text,
  "last_checked_at"   timestamp
);
