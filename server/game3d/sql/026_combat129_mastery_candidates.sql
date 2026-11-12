-- Combat 12.4–12.9. MANUAL disposal-only beta migration 026.
-- New data are UNVERIFIED historic mastery observations, not game awards.
-- Requires reviewed prior migrations 001–025 and trusted character table.
CREATE TABLE game3d_combat_mastery_candidate (
 owner_id text NOT NULL,
 character_id text NOT NULL,
 skill_id text NOT NULL CHECK(skill_id ~ '^[A-Za-z0-9_]{1,80}$'),
 candidate_revision bigint NOT NULL CHECK(candidate_revision > 0),
 observed_level smallint NOT NULL CHECK(observed_level BETWEEN 1 AND 30),
 max_level smallint NOT NULL CHECK(max_level IN (10,30)),
 source_kind text NOT NULL DEFAULT 'unverified_preview'
  CHECK(source_kind = 'unverified_preview'),
 server_authorized boolean NOT NULL DEFAULT false CHECK(server_authorized = false),
 competitive_enabled boolean NOT NULL DEFAULT false CHECK(competitive_enabled = false),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(owner_id,character_id,skill_id,candidate_revision),
 CHECK(observed_level <= max_level),
 FOREIGN KEY(owner_id,character_id)
  REFERENCES game3d_trusted_character(owner_id,character_id)
);
CREATE TRIGGER game3d_combat_mastery_candidate_immutable
 BEFORE UPDATE OR DELETE ON game3d_combat_mastery_candidate
 FOR EACH ROW EXECUTE FUNCTION game3d_item_provenance_immutable();
-- No writer or grant permission installed. NEVER trust candidate levels to
-- authorize competitive damage, charged casts, clan stats or item rewards.
