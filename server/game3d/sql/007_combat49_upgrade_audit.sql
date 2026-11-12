-- Combat Foundation 4.9: private disposable beta ONLY, after schema 001-006.
-- One immutable audit of Base44 server-rolled upgrades per standardized duel.
-- Recorded upgrade rolls do NOT certify who originally minted an item.
-- The worker never applies gear stats or pays rewards using this record.
CREATE TABLE IF NOT EXISTS game3d_duel_upgrade_audit (
  duel_id text PRIMARY KEY REFERENCES game3d_duel_loadout(duel_id),
  epoch text NOT NULL CHECK (length(epoch) BETWEEN 1 AND 160),
  loadout_digest text NOT NULL CHECK (loadout_digest ~ '^[0-9a-f]{64}$'),
  audit_digest text NOT NULL CHECK (audit_digest ~ '^[0-9a-f]{64}$'),
  audit_version integer NOT NULL CHECK (audit_version=1),
  audit jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS game3d_duel_upgrade_audit_epoch_idx
  ON game3d_duel_upgrade_audit(epoch);
