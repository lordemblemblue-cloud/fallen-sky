-- Combat Foundation 5.3: private, manual, disposable beta migration 012.
-- Depends on migrations 008, 009 and 011. No runtime activation.
CREATE TABLE IF NOT EXISTS game3d_simulation_completion_receipt (
  completion_id text PRIMARY KEY CHECK(completion_id ~ '^[A-Za-z0-9_.:-]{1,160}$'),
  simulation_id text NOT NULL CHECK(simulation_id ~ '^[A-Za-z0-9_.:-]{1,160}$'),
  simulation_tick bigint NOT NULL CHECK(simulation_tick >= 0),
  owner_id text NOT NULL,
  character_id text NOT NULL,
  source_kind text NOT NULL CHECK(source_kind IN ('quest','encounter','craft')),
  awards jsonb NOT NULL CHECK(jsonb_typeof(awards)='array' AND
    jsonb_array_length(awards) BETWEEN 1 AND 33),
  evidence_digest text NOT NULL CHECK(evidence_digest ~ '^[0-9a-f]{64}$'),
  receipt_digest text NOT NULL CHECK(receipt_digest ~ '^[0-9a-f]{64}$'),
  committed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY(owner_id,character_id)
    REFERENCES game3d_trusted_character(owner_id,character_id),
  UNIQUE(simulation_id,simulation_tick,owner_id,character_id,source_kind)
);
CREATE TRIGGER game3d_simulation_receipt_immutable
  BEFORE UPDATE OR DELETE ON game3d_simulation_completion_receipt
  FOR EACH ROW EXECUTE FUNCTION game3d_item_provenance_immutable();
-- No public writer or game client can attest simulation outcomes.
