-- Game 3D 16.3: manual private faction binding and reputation journal.
-- Requires trusted canonical character (008) and completed quest review (040).
-- Server faction identities deliberately match the existing three AXE factions;
-- the 'Unassigned' placeholder is NEVER an eligible credit destination.
CREATE TABLE game3d_private_faction_membership_163 (
 owner_id text NOT NULL,
 character_id text NOT NULL,
 faction_id text NOT NULL CHECK(faction_id IN
  ('AXE_Faction_1','AXE_Faction_2','AXE_Faction_3')),
 source_kind text NOT NULL CHECK(source_kind='trusted-server-faction-assignment'),
 assigned_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(owner_id,character_id),
 UNIQUE(owner_id,character_id,faction_id),
 FOREIGN KEY(owner_id,character_id)
  REFERENCES game3d_trusted_character(owner_id,character_id)
);
CREATE TRIGGER game3d_private_faction_membership_163_immutable
 BEFORE UPDATE OR DELETE ON game3d_private_faction_membership_163
 FOR EACH ROW EXECUTE FUNCTION game3d_item_provenance_immutable();

CREATE TABLE game3d_private_faction_reputation_account_163 (
 owner_id text NOT NULL,
 character_id text NOT NULL,
 faction_id text NOT NULL,
 reputation bigint NOT NULL DEFAULT 0 CHECK(reputation BETWEEN 0 AND 9000000000000000),
 revision bigint NOT NULL DEFAULT 0 CHECK(revision>=0),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(owner_id,character_id,faction_id),
 FOREIGN KEY(owner_id,character_id,faction_id)
  REFERENCES game3d_private_faction_membership_163(owner_id,character_id,faction_id)
);
CREATE TABLE game3d_private_faction_reputation_event_163 (
 owner_id text NOT NULL,
 character_id text NOT NULL,
 faction_id text NOT NULL,
 quest_id text NOT NULL CHECK(quest_id ~ '^[A-Za-z0-9_.:-]{1,160}$'),
 event_id text NOT NULL CHECK(event_id ~ '^[A-Za-z0-9_.:-]{8,128}$'),
 reward_revision text NOT NULL CHECK(reward_revision ~ '^[A-Za-z0-9_.:-]{1,80}$'),
 amount bigint NOT NULL CHECK(amount BETWEEN 1 AND 1000000),
 reputation_after bigint NOT NULL CHECK(reputation_after>=0),
 revision bigint NOT NULL CHECK(revision>=1),
 source_kind text NOT NULL CHECK(
  source_kind='verified-private-quest-faction-reputation'),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(owner_id,character_id,quest_id),
 UNIQUE(owner_id,character_id,event_id),
 UNIQUE(owner_id,character_id,faction_id,revision),
 FOREIGN KEY(owner_id,character_id,faction_id)
  REFERENCES game3d_private_faction_reputation_account_163
   (owner_id,character_id,faction_id),
 FOREIGN KEY(owner_id,character_id,quest_id)
  REFERENCES game3d_private_quest_nonxp_review_159
   (owner_id,character_id,quest_id)
);
CREATE INDEX game3d_faction_rep_events_character_163
 ON game3d_private_faction_reputation_event_163(owner_id,character_id,faction_id,revision);
CREATE TRIGGER game3d_private_faction_reputation_event_163_immutable
 BEFORE UPDATE OR DELETE ON game3d_private_faction_reputation_event_163
 FOR EACH ROW EXECUTE FUNCTION game3d_item_provenance_immutable();

-- No browser grant/identity accepted, clan/faction switching, faction wars,
-- auto-import, public route, signed-in deployment or production DB grants.
