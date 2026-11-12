-- Combat Foundation 3.8. Apply manually to a PRIVATE staging PostgreSQL DB.
-- Never point the application at production until beta has verified migrations.
CREATE TABLE IF NOT EXISTS game3d_duel_lease (
  duel_id text PRIMARY KEY,
  epoch text NOT NULL,
  owner_id text NOT NULL,
  fence bigint NOT NULL CHECK (fence > 0),
  expires_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (length(duel_id) BETWEEN 1 AND 160),
  CHECK (length(epoch) BETWEEN 1 AND 160),
  CHECK (length(owner_id) BETWEEN 1 AND 160)
);
CREATE TABLE IF NOT EXISTS game3d_duel_terminal (
  duel_id text PRIMARY KEY,
  epoch text NOT NULL,
  fence bigint NOT NULL CHECK (fence > 0),
  result_id text NOT NULL,
  payload_digest text NOT NULL CHECK (length(payload_digest) = 64),
  payload jsonb NOT NULL,
  acked boolean NOT NULL DEFAULT false,
  staged_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  acked_at timestamptz,
  CHECK (length(duel_id) BETWEEN 1 AND 160),
  CHECK (length(result_id) BETWEEN 1 AND 200)
);
CREATE INDEX IF NOT EXISTS game3d_duel_terminal_pending_idx
  ON game3d_duel_terminal (staged_at) WHERE acked = false;
