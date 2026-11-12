-- Combat / Quest 15.2. MANUAL private-only migration 035, after 001-034.
-- NO writer for "committed" kills is installed by this migration.
-- Only a separately audited, privileged, lease-fenced server combat writer
-- may INSERT into private_world_kill_receipt_152; 13.6/15.1 candidates NEVER qualify.
-- No grants, public routes, saved browser progress, XP, items, or economy effects.

CREATE TABLE game3d_private_world_kill_receipt_152 (
 receipt_id text PRIMARY KEY CHECK(receipt_id ~ '^[A-Za-z0-9_.:-]{8,160}$'),
 owner_id text NOT NULL,
 character_id text NOT NULL,
 instance_id text NOT NULL CHECK(instance_id ~ '^[A-Za-z0-9_.:-]{8,128}$'),
 instance_epoch text NOT NULL CHECK(instance_epoch ~ '^[A-Za-z0-9_.:-]{8,128}$'),
 map_fingerprint text NOT NULL CHECK(map_fingerprint ~ '^[a-f0-9]{64}$'),
 event_seq bigint NOT NULL CHECK(event_seq>0),
 enemy_id text NOT NULL CHECK(enemy_id ~ '^[A-Za-z0-9_.:-]{1,160}$'),
 enemy_tier text NOT NULL CHECK(enemy_tier IN
  ('normal','elite','champion','miniBoss')),
 source_kind text NOT NULL
  CHECK(source_kind='server-committed-private-pve-kill'),
 server_kill_committed boolean NOT NULL CHECK(server_kill_committed=true),
 committed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(receipt_id,owner_id,character_id),
 UNIQUE(instance_id,instance_epoch,event_seq),
 FOREIGN KEY(owner_id,character_id)
  REFERENCES game3d_trusted_character(owner_id,character_id)
);
CREATE TRIGGER game3d_private_world_kill_receipt_152_immutable
 BEFORE UPDATE OR DELETE ON game3d_private_world_kill_receipt_152
 FOR EACH ROW EXECUTE FUNCTION game3d_item_provenance_immutable();

-- Durable projection of accepted server-owned quest objectives, NOT a new
-- client quest store. Only the later authenticated quest-acceptance writer may
-- populate/change these rows; 15.2 does not expose a binding writer.
-- Scope v1 to nonrepeatable quests: repeatable quest run identity is TODO.
CREATE TABLE game3d_private_quest_objective_binding_152 (
 owner_id text NOT NULL,
 character_id text NOT NULL,
 quest_id text NOT NULL CHECK(quest_id ~ '^[A-Za-z0-9_.:-]{1,160}$'),
 objective_id text NOT NULL CHECK(objective_id ~ '^[A-Za-z0-9_.:-]{1,160}$'),
 objective_type text NOT NULL CHECK(objective_type IN ('kill','kill_tier')),
 enemy_tier text CHECK(enemy_tier IN
  ('normal','elite','champion','miniBoss')),
 enemy_id text CHECK(enemy_id ~ '^[A-Za-z0-9_.:-]{1,160}$'),
 required_count integer NOT NULL CHECK(required_count BETWEEN 1 AND 10000),
 status text NOT NULL CHECK(status IN ('accepted','completed','abandoned')),
 accepted_at timestamptz NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(owner_id,character_id,quest_id,objective_id),
 FOREIGN KEY(owner_id,character_id)
  REFERENCES game3d_trusted_character(owner_id,character_id),
 CHECK(objective_type<>'kill_tier' OR enemy_tier IS NOT NULL)
);

-- Immutable earned KILL QUEST CREDIT, not a quest turn-in/reward.
-- Composite FKs prevent one account/character crediting another's receipt.
CREATE TABLE game3d_private_quest_kill_credit_152 (
 receipt_id text NOT NULL,
 owner_id text NOT NULL,
 character_id text NOT NULL,
 quest_id text NOT NULL,
 objective_id text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 reward_authorized boolean NOT NULL DEFAULT false
  CHECK(reward_authorized=false),
 PRIMARY KEY(receipt_id,owner_id,character_id,quest_id,objective_id),
 FOREIGN KEY(receipt_id,owner_id,character_id)
  REFERENCES game3d_private_world_kill_receipt_152
   (receipt_id,owner_id,character_id),
 FOREIGN KEY(owner_id,character_id,quest_id,objective_id)
  REFERENCES game3d_private_quest_objective_binding_152
   (owner_id,character_id,quest_id,objective_id)
);
CREATE INDEX game3d_private_quest_kill_credit_owner_152
 ON game3d_private_quest_kill_credit_152
 (owner_id,character_id,quest_id,objective_id);
CREATE TRIGGER game3d_private_quest_kill_credit_152_immutable
 BEFORE UPDATE OR DELETE ON game3d_private_quest_kill_credit_152
 FOR EACH ROW EXECUTE FUNCTION game3d_item_provenance_immutable();

-- No EXTERNAL INSERT route, grant, trigger populating kill receipts, or
-- automatic migration execution. CI fixtures are not live authority.
