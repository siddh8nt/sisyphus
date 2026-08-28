-- Sisyphus SQLite schema. Endpoints, live telemetry, and heartbeats live in
-- memory (registry.js), NOT here. This persists sessions, tasks, and stats.

CREATE TABLE IF NOT EXISTS sessions (
  id           TEXT PRIMARY KEY,
  prompt       TEXT,
  started_at   INTEGER NOT NULL,
  completed_at INTEGER,
  summary      TEXT,
  stats_json   TEXT
);

CREATE TABLE IF NOT EXISTS tasks (
  id           TEXT PRIMARY KEY,
  session_id   TEXT NOT NULL,
  title        TEXT,
  file         TEXT,
  language     TEXT,
  assign       TEXT,           -- phoneId | 'claude'
  phone_id     TEXT,
  phone_name   TEXT,
  runtime      TEXT,           -- 'npu' | 'cpu' | null
  state        TEXT,           -- lifecycle state
  status       TEXT,           -- 'completed' | 'failed' | 'pending'
  tokens_in    INTEGER DEFAULT 0,
  tokens_out   INTEGER DEFAULT 0,
  duration_ms  INTEGER DEFAULT 0,
  tok_per_sec  REAL DEFAULT 0,
  fallback     INTEGER DEFAULT 0,
  code         TEXT,
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL,
  FOREIGN KEY (session_id) REFERENCES sessions(id)
);

CREATE INDEX IF NOT EXISTS idx_tasks_session ON tasks(session_id);

CREATE TABLE IF NOT EXISTS phones (
  id         TEXT PRIMARY KEY,   -- stable logical phone id
  name       TEXT,
  first_seen INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS phone_stats (
  phone_id        TEXT NOT NULL,
  session_id      TEXT NOT NULL,
  tasks_completed INTEGER DEFAULT 0,
  tokens_in       INTEGER DEFAULT 0,
  tokens_out      INTEGER DEFAULT 0,
  avg_tok_per_sec REAL DEFAULT 0,
  PRIMARY KEY (phone_id, session_id)
);
