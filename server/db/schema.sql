-- BessyV2 — Data tier (PostgreSQL system of record).
-- Implements the tables in docs/SYSTEM_COMPONENTS.md §3.1. The application/API
-- tier (server/lib) talks to these tables through the Store interface; the
-- in-memory Store used by tests mirrors this exact shape.
--
-- Design notes:
--  * The nested gradebook (period → category → assignment) is stored two ways
--    on purpose: fully normalized tables (grading_periods, categories,
--    assignments) for querying/analytics, AND a jsonb snapshot on `courses`
--    for atomic sync + fast change-detection diffs. The server writes both in
--    one transaction; reads of a whole gradebook use the jsonb for speed.
--  * Grades stay owned by the user (courses.owner_id). The DB is a synced copy,
--    not a new authority over the data.
--  * audit_log is append-only (no UPDATE/DELETE granted to the app role).

BEGIN;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";  -- gen_random_uuid()

-- ---------------------------------------------------------------------------
-- Identity
-- ---------------------------------------------------------------------------
CREATE TYPE user_role   AS ENUM ('student', 'caregiver', 'support', 'admin');
CREATE TYPE user_status AS ENUM ('active', 'deactivated', 'deleted');

CREATE TABLE users (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email          CITEXT      NOT NULL UNIQUE,       -- case-insensitive
  role           user_role   NOT NULL DEFAULT 'student',
  status         user_status NOT NULL DEFAULT 'active',
  -- PBKDF2-HMAC-SHA256 stored as "pbkdf2_sha256$<iterations>$<salt_b64>$<hash_b64>"
  password_hash  TEXT        NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX users_status_idx ON users (status);

CREATE TABLE auth_sessions (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  refresh_hash   TEXT        NOT NULL,              -- hash of the refresh token
  device_label   TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at     TIMESTAMPTZ NOT NULL,
  revoked_at     TIMESTAMPTZ
);
CREATE INDEX auth_sessions_user_idx ON auth_sessions (user_id);

-- ---------------------------------------------------------------------------
-- Gradebook (synced copy of the user's own data)
-- ---------------------------------------------------------------------------
CREATE TABLE courses (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id       UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  section_id     TEXT        NOT NULL,              -- client-side course id
  title          TEXT        NOT NULL,
  teacher        TEXT,
  color_value    BIGINT      NOT NULL DEFAULT 4283783319, -- 0xFF4F46E5
  snapshot       JSONB       NOT NULL,              -- full Course JSON (periods…)
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (owner_id, section_id)
);
CREATE INDEX courses_owner_idx ON courses (owner_id);

-- Normalized projection of the snapshot (populated in the same tx as courses).
CREATE TABLE grading_periods (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id      UUID        NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  period_key     TEXT        NOT NULL,              -- client period id (e.g. q1)
  title          TEXT        NOT NULL,
  weight         DOUBLE PRECISION NOT NULL DEFAULT 1.0,
  term           SMALLINT,                          -- 1 or 2, nullable
  UNIQUE (course_id, period_key)
);

CREATE TABLE categories (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id      UUID        NOT NULL REFERENCES grading_periods(id) ON DELETE CASCADE,
  category_key   TEXT        NOT NULL,
  title          TEXT        NOT NULL,
  weight         DOUBLE PRECISION NOT NULL DEFAULT 0.0,
  drop_lowest    INTEGER,
  UNIQUE (period_id, category_key)
);

CREATE TABLE assignments (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id    UUID        NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  assignment_key TEXT        NOT NULL,
  title          TEXT        NOT NULL,
  earned         DOUBLE PRECISION,                  -- null = ungraded
  max_points     DOUBLE PRECISION NOT NULL,
  excused        BOOLEAN     NOT NULL DEFAULT false,
  due            TIMESTAMPTZ,
  UNIQUE (category_id, assignment_key)
);
CREATE INDEX assignments_category_idx ON assignments (category_id);

-- ---------------------------------------------------------------------------
-- Caregiver sharing
-- ---------------------------------------------------------------------------
CREATE TYPE share_status AS ENUM ('pending', 'accepted', 'revoked');

CREATE TABLE share_links (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  caregiver_id   UUID        REFERENCES users(id) ON DELETE CASCADE,  -- null until accepted
  invite_code    TEXT        NOT NULL UNIQUE,
  scope          TEXT        NOT NULL DEFAULT 'read',
  status         share_status NOT NULL DEFAULT 'pending',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  accepted_at    TIMESTAMPTZ
);
CREATE INDEX share_links_student_idx  ON share_links (student_id);
CREATE INDEX share_links_caregiver_idx ON share_links (caregiver_id);

-- ---------------------------------------------------------------------------
-- Notifications
-- ---------------------------------------------------------------------------
CREATE TYPE device_platform AS ENUM ('ios', 'android');

CREATE TABLE device_tokens (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token          TEXT        NOT NULL,
  platform       device_platform NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, token)
);

CREATE TABLE notification_prefs (
  user_id           UUID    PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  grade_posted      BOOLEAN NOT NULL DEFAULT true,   -- a new score appeared
  grade_changed     BOOLEAN NOT NULL DEFAULT true,   -- an existing score moved
  grade_dropped     BOOLEAN NOT NULL DEFAULT true    -- a score went down
);

-- ---------------------------------------------------------------------------
-- Audit (append-only)
-- ---------------------------------------------------------------------------
CREATE TABLE audit_log (
  id             BIGSERIAL   PRIMARY KEY,
  actor_id       UUID        REFERENCES users(id),   -- the staff member
  actor_email    TEXT        NOT NULL,               -- denormalized (survives deletes)
  target_id      UUID,                               -- the affected user
  target_email   TEXT,
  action         TEXT        NOT NULL,               -- e.g. reset_password
  detail         JSONB,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX audit_log_target_idx ON audit_log (target_id);
CREATE INDEX audit_log_actor_idx  ON audit_log (actor_id);

COMMIT;
