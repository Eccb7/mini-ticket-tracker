-- Idempotent: safe to run on every startup.
CREATE TABLE IF NOT EXISTS tickets (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title       TEXT NOT NULL
              CONSTRAINT tickets_title_check CHECK (char_length(btrim(title)) BETWEEN 1 AND 200),
  description TEXT,
  status      TEXT NOT NULL DEFAULT 'open'
              CONSTRAINT tickets_status_check CHECK (status IN ('open', 'in_progress', 'closed')),
  priority    TEXT NOT NULL DEFAULT 'medium'
              CONSTRAINT tickets_priority_check CHECK (priority IN ('low', 'medium', 'high')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Serves "filter by status, newest first". id is a tiebreaker so pages are stable.
CREATE INDEX IF NOT EXISTS tickets_status_created_idx
  ON tickets (status, created_at DESC, id DESC);

-- Serves the unfiltered newest-first list.
CREATE INDEX IF NOT EXISTS tickets_created_idx
  ON tickets (created_at DESC, id DESC);
