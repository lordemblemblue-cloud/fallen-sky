-- Foundation 12.6, manual disposable private-beta migration 019.
-- Source-of-truth inventory slots for an issued item's ORIGINAL owner.
-- Not yet a custody-transfer, trade, or paid listing ledger.
CREATE TABLE game3d_inventory_state (
 owner_id text NOT NULL,
 character_id text NOT NULL,
 revision bigint NOT NULL DEFAULT 0 CHECK (revision>=0),
 capacity integer NOT NULL DEFAULT 200 CHECK(capacity=200),
 PRIMARY KEY(owner_id,character_id),
 FOREIGN KEY(owner_id,character_id)
  REFERENCES game3d_trusted_character(owner_id,character_id)
);
CREATE TABLE game3d_inventory_slot (
 owner_id text NOT NULL,
 character_id text NOT NULL,
 slot_index smallint NOT NULL CHECK(slot_index BETWEEN 0 AND 199),
 item_instance_id uuid NOT NULL UNIQUE,
 PRIMARY KEY(owner_id,character_id,slot_index),
 FOREIGN KEY(owner_id,character_id)
  REFERENCES game3d_inventory_state(owner_id,character_id),
 FOREIGN KEY(item_instance_id,owner_id,character_id)
  REFERENCES game3d_item_issuance(item_instance_id,owner_id,character_id)
);
CREATE TABLE game3d_inventory_operation (
 owner_id text NOT NULL,
 character_id text NOT NULL,
 operation_id text NOT NULL CHECK(operation_id ~ '^[A-Za-z0-9_.:-]{1,160}$'),
 request_digest text NOT NULL CHECK(request_digest ~ '^[a-f0-9]{64}$'),
 result_revision bigint NOT NULL CHECK(result_revision>0),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(owner_id,character_id,operation_id),
 FOREIGN KEY(owner_id,character_id)
  REFERENCES game3d_inventory_state(owner_id,character_id)
);
CREATE TRIGGER game3d_inventory_operation_immutable
 BEFORE UPDATE OR DELETE ON game3d_inventory_operation
 FOR EACH ROW EXECUTE FUNCTION game3d_item_provenance_immutable();
-- Existing issuance records are not automatically backfilled. Account
-- inventory migration must separately prove all original item evidence.
-- No anonymous/consumer database role should write these tables.
