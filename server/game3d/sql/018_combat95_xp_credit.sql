-- Combat 9.5, PRIVATE BETA migration 018; run manually after 001-017.
-- Unique completion event => at most one trusted character XP credit.
CREATE TABLE IF NOT EXISTS game3d_authoritative_xp_credit (
 completion_id text PRIMARY KEY
   REFERENCES game3d_simulation_completion_receipt(completion_id),
 owner_id text NOT NULL,
 character_id text NOT NULL,
 credited_xp integer NOT NULL CHECK(credited_xp BETWEEN 1 AND 10000),
 receipt_digest text NOT NULL CHECK(receipt_digest ~ '^[0-9a-f]{64}$'),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(owner_id,character_id)
  REFERENCES game3d_trusted_character(owner_id,character_id)
);
CREATE TRIGGER game3d_authoritative_xp_credit_immutable
 BEFORE UPDATE OR DELETE ON game3d_authoritative_xp_credit
 FOR EACH ROW EXECUTE FUNCTION game3d_item_provenance_immutable();
-- Do not grant access to browsers, Character Vault or public upgrade writers.
