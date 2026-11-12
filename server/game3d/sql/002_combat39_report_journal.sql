-- Combat Foundation 3.9. PRIVATE staging PostgreSQL ONLY.
-- Apply after 001_combat38_staging.sql; never run on production before beta.
-- Immutable report entries bind the worker's signed report envelope to its
-- database lease fence. Base44 remains an asynchronous, non-atomic projection.
CREATE TABLE IF NOT EXISTS game3d_duel_report_journal (
  duel_id text NOT NULL,
  epoch text NOT NULL,
  report_sequence bigint NOT NULL CHECK (report_sequence > 0),
  simulation_sequence bigint NOT NULL CHECK (simulation_sequence >= 0),
  owner_fence bigint NOT NULL CHECK (owner_fence > 0),
  report_kind text NOT NULL CHECK (report_kind IN ('checkpoint','settle')),
  payload_digest text NOT NULL CHECK (length(payload_digest) = 64),
  payload jsonb NOT NULL,
  acked boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  acked_at timestamptz,
  PRIMARY KEY (duel_id, report_sequence),
  FOREIGN KEY (duel_id) REFERENCES game3d_duel_lease(duel_id)
);
CREATE INDEX IF NOT EXISTS game3d_duel_report_journal_unacked_idx
  ON game3d_duel_report_journal (created_at) WHERE acked = false;
