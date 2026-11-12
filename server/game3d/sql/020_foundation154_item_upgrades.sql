-- Inventory Foundation 15.4: migration 020, DISPOSABLE PRIVATE BETA ONLY.
-- Apply manually after 001-019; no backfill from client saves, no game grants.
-- Canonical stage/enchant state for original item issuance owner.
CREATE TABLE game3d_item_upgrade_state (
 item_instance_id uuid PRIMARY KEY,
 owner_id text NOT NULL CHECK(owner_id ~ '^[A-Za-z0-9_-]{1,128}$'),
 character_id text NOT NULL CHECK(character_id ~ '^[A-Za-z0-9_-]{1,128}$'),
 revision bigint NOT NULL DEFAULT 0 CHECK(revision>=0),
 ascend_stage smallint NOT NULL DEFAULT 0 CHECK(ascend_stage BETWEEN 0 AND 5),
 enchant_level smallint NOT NULL DEFAULT 0 CHECK(enchant_level BETWEEN 0 AND 10),
 over_enchant_level smallint NOT NULL DEFAULT 0 CHECK(over_enchant_level BETWEEN 0 AND 5),
 CHECK(over_enchant_level=0 OR enchant_level=10),
 FOREIGN KEY(item_instance_id,owner_id,character_id)
  REFERENCES game3d_item_issuance(item_instance_id,owner_id,character_id),
 UNIQUE(item_instance_id,owner_id,character_id)
);
-- Operation history is immutable; no writer is installed in this milestone.
CREATE TABLE game3d_item_upgrade_operation (
 item_instance_id uuid NOT NULL,
 operation_id text NOT NULL CHECK(operation_id ~ '^[A-Za-z0-9_.:-]{1,160}$'),
 owner_id text NOT NULL,
 character_id text NOT NULL,
 expected_revision bigint NOT NULL CHECK(expected_revision>=0),
 result_revision bigint NOT NULL CHECK(result_revision=expected_revision+1),
 mode text NOT NULL CHECK(mode IN ('ascend','enchant','over_enchant')),
 state_digest text NOT NULL CHECK(state_digest ~ '^[a-f0-9]{64}$'),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(item_instance_id,operation_id),
 FOREIGN KEY(item_instance_id,owner_id,character_id)
  REFERENCES game3d_item_upgrade_state(item_instance_id,owner_id,character_id)
);
CREATE TRIGGER game3d_item_upgrade_operation_immutable
 BEFORE UPDATE OR DELETE ON game3d_item_upgrade_operation FOR EACH ROW
 EXECUTE FUNCTION game3d_item_provenance_immutable();
-- Do not grant browser/anonymous roles access; no live upgrade paths.
