-- Migration number: 0001 	 2026-09-16T00:00:00.000Z
CREATE TABLE IF NOT EXISTS images (
  id           TEXT    PRIMARY KEY,
  r2_key       TEXT    NOT NULL,
  content_type TEXT    NOT NULL,
  size         INTEGER NOT NULL,
  created_at   INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_images_created_at ON images (created_at DESC);
