// SQLite schema of the KhatmDB Durable Object (applied on every cold start; all statements are idempotent).
export const SCHEMA = `
-- Khatm Circle: schema
-- One khatm = a shared link. kind 'quran': 30 juz per round, claimed and marked read by members.
-- kind 'dhikr': a shared counter towards a target (e.g. 100,000 salawat).
CREATE TABLE IF NOT EXISTS khatms (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL DEFAULT 'quran',     -- quran | dhikr
  purpose TEXT NOT NULL DEFAULT 'general',-- memorial | shifa | ramadan | occasion | general | circle
  title TEXT NOT NULL,
  honoree TEXT NOT NULL DEFAULT '',       -- e.g. "Grandma Amina"
  note TEXT NOT NULL DEFAULT '',
  deadline TEXT NOT NULL DEFAULT '',      -- YYYY-MM-DD or ''
  round INTEGER NOT NULL DEFAULT 1,
  target INTEGER NOT NULL DEFAULT 0,      -- dhikr target
  phrase TEXT NOT NULL DEFAULT '',        -- dhikr phrase key or custom text
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS members (
  id TEXT PRIMARY KEY,
  khatm_id TEXT NOT NULL,
  name TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  is_host INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS members_k ON members(khatm_id);
CREATE UNIQUE INDEX IF NOT EXISTS members_tok ON members(token_hash);
-- A claimed juz. No row = free. reader is the display name (the organiser can claim for someone not on the link).
CREATE TABLE IF NOT EXISTS parts (
  khatm_id TEXT NOT NULL,
  round INTEGER NOT NULL,
  juz INTEGER NOT NULL,
  member_id TEXT NOT NULL,
  reader TEXT NOT NULL,
  claimed_at INTEGER NOT NULL,
  done_at INTEGER,
  PRIMARY KEY (khatm_id, round, juz)
);
CREATE TABLE IF NOT EXISTS rounds (
  khatm_id TEXT NOT NULL,
  round INTEGER NOT NULL,
  started_at INTEGER NOT NULL,
  completed_at INTEGER,
  readers INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (khatm_id, round)
);
CREATE TABLE IF NOT EXISTS counts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  khatm_id TEXT NOT NULL,
  round INTEGER NOT NULL DEFAULT 1,
  member_id TEXT NOT NULL,
  n INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS counts_k ON counts(khatm_id);
CREATE TABLE IF NOT EXISTS rate (
  k TEXT PRIMARY KEY,
  n INTEGER NOT NULL,
  reset_at INTEGER NOT NULL
);
`;
