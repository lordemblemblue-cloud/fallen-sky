-- Combat Foundation 4.8: private beta PostgreSQL migration 006.
-- Apply AFTER migrations 001-005 on disposable test DB, never production.
-- Unique (duel_id) means one immutable standardized loadout per duel.
CREATE TABLE IF NOT EXISTS game3d_duel_loadout (
  duel_id text PRIMARY KEY REFERENCES game3d_duel_lease(duel_id),
  epoch text NOT NULL,
  ruleset text NOT NULL CHECK (ruleset='game3d-standardized-preview-v1'),
  manifest_version integer NOT NULL CHECK (manifest_version=1),
  manifest_digest text NOT NULL CHECK (length(manifest_digest)=64),
  manifest jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS game3d_duel_loadout_epoch_idx
  ON game3d_duel_loadout(epoch);
