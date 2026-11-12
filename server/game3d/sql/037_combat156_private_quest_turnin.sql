-- Game 3D 15.6: manual PRIVATE quest turn-in ledger, after migrations 035-036.
-- An earned quest completion is NOT the same as a reward or wallet grant.
-- Only trusted server code with quest turn-in authority may insert records.
CREATE TABLE game3d_private_quest_turnin_156 (
 owner_id text NOT NULL,
 character_id text NOT NULL,
 quest_id text NOT NULL CHECK (quest_id ~ '^[A-Za-z0-9_.:-]{1,160}$'),
 catalog_revision text NOT NULL CHECK (
  catalog_revision ~ '^[A-Za-z0-9_.:-]{1,80}$'),
 completed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 source_kind text NOT NULL
  CHECK (source_kind='server-verified-private-quest-turnin'),
 rewards_issued boolean NOT NULL DEFAULT false CHECK (rewards_issued=false),
 PRIMARY KEY (owner_id,character_id,quest_id),
 FOREIGN KEY (owner_id,character_id,quest_id)
  REFERENCES game3d_private_quest_acceptance_154
  (owner_id,character_id,quest_id)
);
CREATE INDEX game3d_private_quest_turnin_character_156
 ON game3d_private_quest_turnin_156 (owner_id,character_id,completed_at);
CREATE TRIGGER game3d_private_quest_turnin_156_immutable
 BEFORE UPDATE OR DELETE ON game3d_private_quest_turnin_156
 FOR EACH ROW EXECUTE FUNCTION game3d_item_provenance_immutable();
-- This migration does NOT add any production grants, trigger a completion,
-- give XP/loot/AGP/items, create endpoints or deploy any player session.
