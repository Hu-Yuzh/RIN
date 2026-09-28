CREATE TABLE IF NOT EXISTS backup_history (
  id TEXT PRIMARY KEY NOT NULL,
  created_at TEXT NOT NULL,
  reason TEXT NOT NULL,
  item_count INTEGER NOT NULL DEFAULT 0,
  file_path TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_backup_history_created_at
  ON backup_history(created_at DESC);
