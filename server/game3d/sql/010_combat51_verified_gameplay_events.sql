-- Combat Foundation 5.1: SOURCE-ONLY PRIVATE BETA migration 010.
-- Manual application ONLY after reviewed migrations 001..009.
-- Requires game3d_trusted_character (008) and the append-only trigger (009).
-- Untrusted browser inventories or Base44 upgrade rolls are NOT source events.
CREATE TABLE IF NOT EXISTS game3d_verified_gameplay_event (
  event_id uuid PRIMARY KEY,
  owner_id text NOT NULL,
  character_id text NOT NULL,
  completion_id text NOT NULL CHECK (completion_id ~ '^[A-Za-z0-9_.:-]{1,160}$'),
  source_kind text NOT NULL CHECK (source_kind IN ('quest','encounter','craft')),
  definition_id text NOT NULL CHECK (definition_id ~ '^[A-Za-z0-9_.:-]{1,160}$'),
  award_index integer NOT NULL CHECK (award_index BETWEEN 0 AND 32),
  proof_digest text NOT NULL CHECK (proof_digest ~ '^[0-9a-f]{64}$'),
  event_digest text NOT NULL CHECK (event_digest ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT game3d_verified_event_trusted_character_fk
    FOREIGN KEY (owner_id,character_id)
    REFERENCES game3d_trusted_character(owner_id,character_id),
  CONSTRAINT game3d_verified_event_award_unique
    UNIQUE (completion_id,award_index)
);
CREATE INDEX IF NOT EXISTS game3d_verified_event_owner_idx
  ON game3d_verified_gameplay_event(owner_id,character_id,created_at);

-- No UPDATE/DELETE of once-committed source evidence.
CREATE TRIGGER game3d_verified_gameplay_event_immutable
  BEFORE UPDATE OR DELETE ON game3d_verified_gameplay_event
  FOR EACH ROW EXECUTE FUNCTION game3d_item_provenance_immutable();

-- The source proof must be produced by a separate, trusted server gameplay
-- completion verifier and committed by the same transaction as this event.
-- There is NO public create endpoint or implicit client authorization.
-- Production database grants, RLS and separate writer credentials require
-- review; a privileged DB account can bypass trigger-level enforcement.
