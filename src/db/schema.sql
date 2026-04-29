-- Trivia for All — Database Schema (v0.3.0.0)
--
-- Single-source-of-truth for the Postgres schema. Apply manually via
-- `psql $DATABASE_URL -f src/db/schema.sql` against a fresh Neon database, or
-- run `npx tsx scripts/migrate.ts` once that exists.
--
-- Mirrors the design doc → Database schema section. Notes inline.

CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- The full bank of trivia questions.
-- correct_idx is server-side only — never sent to the client.
CREATE TABLE IF NOT EXISTS questions (
  id           TEXT PRIMARY KEY,
  category     TEXT NOT NULL CHECK (category IN ('general','geography','science','history','random','sports')),
  difficulty   TEXT NOT NULL CHECK (difficulty IN ('easy','medium','hard')),
  prompt       TEXT NOT NULL,
  choices      JSONB NOT NULL,           -- exactly 4 strings
  correct_idx  INT NOT NULL CHECK (correct_idx BETWEEN 0 AND 3),
  fact         TEXT NOT NULL DEFAULT '',
  source       TEXT
);

-- An attempt is one game session. Up to 5 SCORED per cookie per UTC date.
-- Practice attempts are unlimited (no daily cap).
CREATE TABLE IF NOT EXISTS attempts (
  id            TEXT PRIMARY KEY,
  cookie_id     TEXT NOT NULL,
  date_utc      DATE NOT NULL,
  mode          TEXT NOT NULL CHECK (mode IN ('scored','practice')),
  started_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at   TIMESTAMPTZ,
  question_ids  JSONB NOT NULL           -- ordered array of question id strings (length up to 20)
);

-- Supports the 5-per-day count check on /api/attempt/start.
CREATE INDEX IF NOT EXISTS attempts_daily_count
  ON attempts (cookie_id, date_utc, mode);

-- Supports `GET /api/attempt/current` lookup of in-progress attempt for a cookie.
CREATE INDEX IF NOT EXISTS attempts_in_progress
  ON attempts (cookie_id, finished_at) WHERE finished_at IS NULL;

-- Per-answer log. Driven by `POST /api/answer`. Server tallies correct_count
-- from this table on `POST /api/attempt/finalize` — client-reported scores
-- are never trusted (server-authoritative).
CREATE TABLE IF NOT EXISTS answers (
  id                BIGSERIAL PRIMARY KEY,
  attempt_id        TEXT NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
  question_id       TEXT NOT NULL,
  choice_idx        INT NOT NULL CHECK (choice_idx BETWEEN 0 AND 3),
  correct           BOOLEAN NOT NULL,
  client_elapsed_ms INT,                  -- telemetry only, not used for scoring
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS answers_by_attempt ON answers (attempt_id);

-- Final scores. One row per finalized SCORED attempt. Practice attempts NEVER
-- write here. A user with 5 daily scored attempts has up to 5 score rows; the
-- leaderboard groups by cookie and ranks by MAX(correct_count).
CREATE TABLE IF NOT EXISTS scores (
  id            BIGSERIAL PRIMARY KEY,
  attempt_id    TEXT NOT NULL UNIQUE REFERENCES attempts(id) ON DELETE CASCADE,
  cookie_id     TEXT NOT NULL,
  date_utc      DATE NOT NULL,
  correct_count INT NOT NULL,
  wrong_count   INT NOT NULL,
  finished_at   TIMESTAMPTZ NOT NULL
);

-- Composite index supports the leaderboard query order (correct DESC, wrong ASC, finished_at ASC, id ASC).
CREATE INDEX IF NOT EXISTS scores_leaderboard
  ON scores (date_utc, correct_count DESC, wrong_count ASC, finished_at ASC, id ASC);

-- Email signup for the v2 monetization "Notify me" CTA on the 5/5-used screen.
-- Lives in v1 to capture the launch list early; v2 monetization decision still
-- pending real demand signal.
CREATE TABLE IF NOT EXISTS notify_signups (
  id                BIGSERIAL PRIMARY KEY,
  email             CITEXT NOT NULL UNIQUE,
  cookie_id         TEXT,
  best_score_today  INT,
  locale            TEXT,
  signup_ts         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  unsubscribe_token UUID NOT NULL DEFAULT gen_random_uuid(),
  unsubscribed_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS notify_signups_cookie ON notify_signups (cookie_id);
CREATE INDEX IF NOT EXISTS notify_signups_unsubscribe_token ON notify_signups (unsubscribe_token);
