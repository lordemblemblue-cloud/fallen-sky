-- Combat Foundation 5.2: PRIVATE DISPOSABLE BETA migration 011.
-- Manual only, after migrations 001-010. Not deployed/activated.
-- No browser client is authorized to insert completions or award items.
CREATE TABLE IF NOT EXISTS game3d_server_completion_source (
  completion_id text PRIMARY KEY
    CHECK (completion_id ~ '^[A-Za-z0-9_.:-]{1,160}$'),
  owner_id text NOT NULL,
  character_id text NOT NULL,
  source_kind text NOT NULL CHECK(source_kind IN ('quest','encounter','craft')),
  receipt_digest text NOT NULL CHECK(receipt_digest ~ '^[0-9a-f]{64}$'),
  awards jsonb NOT NULL CHECK(jsonb_typeof(awards)='array' AND
    jsonb_array_length(awards) BETWEEN 1 AND 33),
  source_digest text NOT NULL CHECK(source_digest ~ '^[0-9a-f]{64}$'),
  committed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY (owner_id,character_id)
    REFERENCES game3d_trusted_character(owner_id,character_id)
);
CREATE INDEX IF NOT EXISTS game3d_server_completion_character_idx
  ON game3d_server_completion_source(owner_id,character_id,committed_at);
-- Registered trigger from migration 009. Append-only even when replaying.
CREATE TRIGGER game3d_server_completion_source_immutable
BEFORE UPDATE OR DELETE ON game3d_server_completion_source
FOR EACH ROW EXECUTE FUNCTION game3d_item_provenance_immutable();

-- No public writer role, trigger bypass grants or PG credentials are provided.
-- Deploy grants and game-event producer only after private beta validation.
