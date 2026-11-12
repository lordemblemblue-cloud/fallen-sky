-- Game 3D 16.5: manual private Echo Chronicle quest evidence and completion.
-- After canonical 008, trusted kills 035 and prerequisite turn-ins 036/037.
-- Existing player browser questbook is NOT a trusted gameplay evidence source.
CREATE TABLE game3d_private_echo_quest_165 (
 owner_id text NOT NULL, character_id text NOT NULL,
 quest_id text NOT NULL CHECK(quest_id ~ '^echo_(ch|branch)_[a-z0-9_]+$'),
 catalog_revision text NOT NULL CHECK(catalog_revision='axe-private-echo-165-v1'),
 status text NOT NULL DEFAULT 'accepted' CHECK(status IN('accepted','completed')),
 accepted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 completed_at timestamptz,
 reward_issued boolean NOT NULL DEFAULT false CHECK(reward_issued=false),
 PRIMARY KEY(owner_id,character_id,quest_id),
 FOREIGN KEY(owner_id,character_id)
  REFERENCES game3d_trusted_character(owner_id,character_id),
 CHECK((status='accepted' AND completed_at IS NULL) OR
       (status='completed' AND completed_at IS NOT NULL))
);
CREATE TABLE game3d_private_world_discovery_receipt_165 (
 receipt_id text PRIMARY KEY CHECK(receipt_id ~ '^[A-Za-z0-9_.:-]{8,160}$'),
 owner_id text NOT NULL, character_id text NOT NULL,
 world_id text NOT NULL CHECK(world_id ~ '^[A-Za-z0-9_.:-]{8,128}$'),
 target_id text NOT NULL CHECK(target_id ~ '^[A-Za-z0-9_.:-]{1,160}$'),
 evidence_digest text NOT NULL CHECK(evidence_digest ~ '^[a-f0-9]{64}$'),
 observed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 source_kind text NOT NULL
  CHECK(source_kind='trusted-private-world-discovery'),
 UNIQUE(receipt_id,owner_id,character_id),
 FOREIGN KEY(owner_id,character_id)
  REFERENCES game3d_trusted_character(owner_id,character_id)
);
CREATE TRIGGER game3d_private_world_discovery_165_immutable
 BEFORE UPDATE OR DELETE ON game3d_private_world_discovery_receipt_165
 FOR EACH ROW EXECUTE FUNCTION game3d_item_provenance_immutable();

CREATE TABLE game3d_private_echo_objective_credit_165 (
 owner_id text NOT NULL, character_id text NOT NULL,
 quest_id text NOT NULL,
 receipt_id text NOT NULL CHECK(receipt_id ~ '^[A-Za-z0-9_.:-]{8,160}$'),
 receipt_kind text NOT NULL CHECK(receipt_kind IN ('kill','discovery')),
 objective_id text NOT NULL CHECK(objective_id ~ '^[A-Za-z0-9_.:-]{1,160}$'),
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(owner_id,character_id,quest_id,receipt_kind,receipt_id),
 FOREIGN KEY(owner_id,character_id,quest_id)
  REFERENCES game3d_private_echo_quest_165(owner_id,character_id,quest_id)
);
CREATE INDEX game3d_private_echo_credit_character_165
 ON game3d_private_echo_objective_credit_165(owner_id,character_id,quest_id);
CREATE TRIGGER game3d_private_echo_credit_165_immutable
 BEFORE UPDATE OR DELETE ON game3d_private_echo_objective_credit_165
 FOR EACH ROW EXECUTE FUNCTION game3d_item_provenance_immutable();

CREATE TABLE game3d_private_echo_turnin_165 (
 owner_id text NOT NULL, character_id text NOT NULL,
 quest_id text NOT NULL,
 catalog_revision text NOT NULL CHECK(catalog_revision='axe-private-echo-165-v1'),
 completed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 source_kind text NOT NULL CHECK(source_kind='verified-private-echo-turnin'),
 reward_issued boolean NOT NULL DEFAULT false CHECK(reward_issued=false),
 PRIMARY KEY(owner_id,character_id,quest_id),
 FOREIGN KEY(owner_id,character_id,quest_id)
  REFERENCES game3d_private_echo_quest_165(owner_id,character_id,quest_id)
);
CREATE TRIGGER game3d_private_echo_turnin_165_immutable
 BEFORE UPDATE OR DELETE ON game3d_private_echo_turnin_165
 FOR EACH ROW EXECUTE FUNCTION game3d_item_provenance_immutable();
-- No public route, XP, loot, points, faction or CP payout.
