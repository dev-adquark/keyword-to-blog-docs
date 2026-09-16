-- Keyword-to-Blog API — production schema
-- Applied via `npm run db:migrate` (scripts/migrate.mjs). Idempotent: safe to re-run.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Internal, admin-provisioned accounts only — see scripts/provisionTeam.mjs.
-- There is no public signup and no email-verification flow.
CREATE TABLE IF NOT EXISTS users (
  id                 TEXT PRIMARY KEY,
  email              TEXT NOT NULL UNIQUE,
  password_hash      TEXT, -- set by scripts/provisionTeam.mjs; app never inserts a NULL
  name               TEXT NOT NULL,
  status             TEXT NOT NULL DEFAULT 'active', -- active | disabled
  role               TEXT NOT NULL DEFAULT 'DEVELOPER', -- OWNER | DEVELOPER | DIGITAL_MARKETING | ACCOUNT_MANAGEMENT
  last_login_at      TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Existing installs: adds/adjusts columns without recreating the table.
ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'DEVELOPER';
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;
-- This app is now internal/admin-provisioned only (no public signup, no
-- Firebase, no email verification) — columns from that earlier phase are no
-- longer referenced anywhere in the app, so they're dropped here.
ALTER TABLE users DROP COLUMN IF EXISTS email_verified_at;
ALTER TABLE users DROP COLUMN IF EXISTS firebase_uid;

CREATE TABLE IF NOT EXISTS customers (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  plan        TEXT NOT NULL DEFAULT 'starter',
  status      TEXT NOT NULL DEFAULT 'active', -- active | suspended
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_customers_user_id ON customers(user_id);

CREATE TABLE IF NOT EXISTS api_keys (
  id            TEXT PRIMARY KEY,
  customer_id   TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  key_prefix    TEXT NOT NULL,      -- e.g. ktb_live_ab12cd34 (safe to display/log)
  key_hash      TEXT NOT NULL UNIQUE, -- sha256 of the raw secret; raw value is never stored
  name          TEXT NOT NULL,
  environment   TEXT NOT NULL,      -- live | test
  scopes        TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  status        TEXT NOT NULL DEFAULT 'active', -- active | revoked
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at  TIMESTAMPTZ,
  revoked_at    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_api_keys_customer_id ON api_keys(customer_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_api_keys_key_hash ON api_keys(key_hash);

CREATE TABLE IF NOT EXISTS usage_events (
  id            TEXT PRIMARY KEY,
  api_key_id    TEXT NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
  customer_id   TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  endpoint      TEXT NOT NULL,
  request_id    TEXT NOT NULL,
  status_code   INT NOT NULL,
  success       BOOLEAN NOT NULL,
  words         INT NOT NULL DEFAULT 0,
  posts         INT NOT NULL DEFAULT 0, -- 1 per successfully generated post, 0 on failure
  duration_ms   INT NOT NULL DEFAULT 0,
  counted_toward_quota BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE usage_events ADD COLUMN IF NOT EXISTS posts INT NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_usage_api_key_created ON usage_events(api_key_id, created_at);
CREATE INDEX IF NOT EXISTS idx_usage_customer_created ON usage_events(customer_id, created_at);
-- Supports the OWNER team-wide "today's activity" dashboard query, which scans
-- across all customers rather than one at a time.
CREATE INDEX IF NOT EXISTS idx_usage_created ON usage_events(created_at);

CREATE TABLE IF NOT EXISTS jobs (
  id             TEXT PRIMARY KEY,
  customer_id    TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  api_key_id     TEXT NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
  status         TEXT NOT NULL DEFAULT 'queued', -- queued | processing | succeeded | failed
  request_id     TEXT NOT NULL,
  input          JSONB NOT NULL,
  webhook_url    TEXT,
  webhook_events TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  webhook_secret TEXT,
  result         JSONB,
  rendered       JSONB,
  quality        JSONB, -- ContentQualitySummary — same object also stored in content_quality_reports (full detail)
  error_code     TEXT,
  error_message  TEXT,
  idempotency_key TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_jobs_customer_created ON jobs(customer_id, created_at);
CREATE INDEX IF NOT EXISTS idx_jobs_api_key_idempotency ON jobs(api_key_id, idempotency_key);
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS quality JSONB;

CREATE TABLE IF NOT EXISTS idempotency_records (
  api_key_id    TEXT NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
  idempotency_key TEXT NOT NULL,
  request_hash  TEXT NOT NULL,
  response      JSONB NOT NULL,
  status_code   INT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (api_key_id, idempotency_key)
);

-- One-time codes for password reset. Only a hash of the code is ever stored.
-- `purpose` is kept (rather than assumed) for forward compatibility, though
-- 'password_reset' is the only value in use now that signup/verification is gone.
CREATE TABLE IF NOT EXISTS otps (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose      TEXT NOT NULL, -- password_reset
  otp_hash     TEXT NOT NULL,
  expires_at   TIMESTAMPTZ NOT NULL,
  attempts     INT NOT NULL DEFAULT 0,
  verified_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_otps_user_purpose_created ON otps(user_id, purpose, created_at DESC);

-- Server-side browser sessions. The cookie holds only the raw opaque token;
-- only its hash is ever persisted, so a DB leak can't be replayed as a session.
CREATE TABLE IF NOT EXISTS sessions (
  id                  TEXT PRIMARY KEY,
  user_id             TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_token_hash  TEXT NOT NULL,
  expires_at          TIMESTAMPTZ NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at          TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions(session_token_hash);

-- Audit trail for webhook delivery attempts — one row per job per event,
-- updated in place across retries so delivery outcomes are queryable after
-- the fact instead of being fire-and-forget.
CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id             TEXT PRIMARY KEY,
  job_id         TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  event          TEXT NOT NULL, -- job.succeeded | job.failed
  url            TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'pending', -- pending | delivered | failed | blocked
  attempts       INT NOT NULL DEFAULT 0,
  last_status_code INT,
  last_error     TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_job ON webhook_deliveries(job_id);

CREATE TABLE IF NOT EXISTS access_requests (
  id               TEXT PRIMARY KEY,
  customer_id      TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  requested_plan   TEXT NOT NULL,
  reason           TEXT,
  status           TEXT NOT NULL DEFAULT 'pending', -- pending | approved | rejected
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at      TIMESTAMPTZ,
  reviewer_id      TEXT
);
CREATE INDEX IF NOT EXISTS idx_access_requests_customer ON access_requests(customer_id);

-- Auth/admin audit trail — distinct from usage_events (which meters API
-- requests): this tracks account-level security events for the OWNER audit
-- log (logins, and admin actions like disabling a user or revoking a key).
CREATE TABLE IF NOT EXISTS audit_events (
  id                 TEXT PRIMARY KEY,
  event_type         TEXT NOT NULL, -- login_success | login_failed | user_status_changed | api_key_revoked
  actor_user_id      TEXT REFERENCES users(id) ON DELETE SET NULL,
  target_user_id     TEXT REFERENCES users(id) ON DELETE SET NULL,
  target_api_key_id  TEXT REFERENCES api_keys(id) ON DELETE SET NULL,
  metadata           JSONB,
  ip                 TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_events_created ON audit_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_events_actor ON audit_events(actor_user_id);
CREATE INDEX IF NOT EXISTS idx_audit_events_target_user ON audit_events(target_user_id);

-- Content-quality pipeline reports — metadata/scores only, never the
-- generated content itself (jobs.result / usage_events already store what's
-- needed about the generation; this table is purely for quality observability).
CREATE TABLE IF NOT EXISTS content_quality_reports (
  id                TEXT PRIMARY KEY,
  request_id        TEXT NOT NULL,
  job_id            TEXT REFERENCES jobs(id) ON DELETE SET NULL,
  customer_id       TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  api_key_id        TEXT REFERENCES api_keys(id) ON DELETE SET NULL,
  quality_version   TEXT NOT NULL,
  overall_status    TEXT NOT NULL, -- PASS | FAIL
  overall_score     INT NOT NULL,
  writing_score     INT NOT NULL,
  originality_score INT NOT NULL,
  depth_score       INT NOT NULL,
  seo_score         INT NOT NULL,
  readability_score INT NOT NULL,
  keyword_score     INT NOT NULL,
  structure_score   INT NOT NULL,
  factuality_status TEXT NOT NULL,
  freshness_status  TEXT NOT NULL,
  revision_count    INT NOT NULL DEFAULT 0,
  failed_checks     JSONB NOT NULL DEFAULT '[]',
  warnings          JSONB NOT NULL DEFAULT '[]',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_quality_reports_customer_created ON content_quality_reports(customer_id, created_at);
CREATE INDEX IF NOT EXISTS idx_quality_reports_job ON content_quality_reports(job_id);
