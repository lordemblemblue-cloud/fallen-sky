-- Combat 9.1: migration 017, disposable PRIVATE BETA only.
-- Apply manually AFTER 001-016. No user/browser access or backfill.
CREATE TABLE IF NOT EXISTS game3d_engine_outcome (
 event_id text PRIMARY KEY CHECK(event_id ~ '^[A-Za-z0-9_.:-]{1,160}$'),
 instance_id text NOT NULL CHECK(instance_id ~ '^[A-Za-z0-9_.:-]{1,160}$'),
 owner_id text NOT NULL,character_id text NOT NULL,
 event_type text NOT NULL CHECK(event_type IN
  ('enemy_killed','location_discovered','craft_completed')),
 server_tick bigint NOT NULL CHECK(server_tick>=0),
 tier text CHECK(tier IN ('normal','elite','boss')),
 location text,
 evidence_digest text NOT NULL CHECK(evidence_digest ~ '^[0-9a-f]{64}$'),
 outcome_digest text NOT NULL CHECK(outcome_digest ~ '^[0-9a-f]{64}$'),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(owner_id,character_id)
  REFERENCES game3d_trusted_character(owner_id,character_id),
 CHECK((event_type='enemy_killed' AND tier IS NOT NULL AND location IS NULL)
  OR(event_type='location_discovered' AND location IS NOT NULL AND tier IS NULL)
  OR(event_type='craft_completed' AND tier IS NULL AND location IS NULL))
);
CREATE TRIGGER game3d_engine_outcome_immutable BEFORE UPDATE OR DELETE
 ON game3d_engine_outcome FOR EACH ROW
 EXECUTE FUNCTION game3d_item_provenance_immutable();
