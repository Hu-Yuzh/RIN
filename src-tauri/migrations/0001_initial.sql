CREATE TABLE IF NOT EXISTS todos (
  id TEXT PRIMARY KEY NOT NULL,
  title TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  due_date TEXT,
  start_time TEXT,
  category TEXT NOT NULL DEFAULT 'personal',
  completed INTEGER NOT NULL DEFAULT 0,
  sort_order REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_todos_due_date ON todos(due_date);
CREATE INDEX IF NOT EXISTS idx_todos_category ON todos(category);
CREATE INDEX IF NOT EXISTS idx_todos_deleted_at ON todos(deleted_at);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS weather_cache (
  location_id TEXT NOT NULL,
  weather_date TEXT NOT NULL,
  weather_code INTEGER NOT NULL,
  temp_min REAL,
  temp_max REAL,
  precipitation_probability REAL,
  fetched_at TEXT NOT NULL,
  PRIMARY KEY (location_id, weather_date)
);
