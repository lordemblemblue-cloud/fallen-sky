-- Combat Foundation 6.0: private beta manual migration 013, after 001–012.
CREATE TABLE IF NOT EXISTS game3d_world_event_journal (
 event_id text PRIMARY KEY CHECK(event_id ~ '^[A-Za-z0-9_.:-]{1,160}$'),
 instance_id text NOT NULL CHECK(instance_id ~ '^[A-Za-z0-9_.:-]{1,160}$'),
 owner_id text NOT NULL, character_id text NOT NULL,
 event_type text NOT NULL CHECK(event_type IN
   ('enemy_killed','location_discovered','craft_completed')),
 server_tick bigint NOT NULL CHECK(server_tick>=0),
 tier text CHECK(tier IN ('normal','elite','boss')),
 location text,
 evidence_digest text NOT NULL CHECK(evidence_digest ~ '^[0-9a-f]{64}$'),
 event_digest text NOT NULL CHECK(event_digest ~ '^[0-9a-f]{64}$'),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(owner_id,character_id)
  REFERENCES game3d_trusted_character(owner_id,character_id)
);
CREATE INDEX IF NOT EXISTS game3d_world_event_character_idx
 ON game3d_world_event_journal(owner_id,character_id,instance_id,server_tick);
CREATE TRIGGER game3d_world_event_journal_immutable
 BEFORE UPDATE OR DELETE ON game3d_world_event_journal
 FOR EACH ROW EXECUTE FUNCTION game3d_item_provenance_immutable();
