-- Private Game 3D migration 056. MANUAL, NOT AUTOMATICALLY APPLIED.
-- Retains original owner/character custody of issued item instances.
-- This is staging-only until the trusted item allocator explicitly opts in.
CREATE TABLE game3d_storage_state (
 owner_id text NOT NULL,
 character_id text NOT NULL,
 revision bigint NOT NULL DEFAULT 0 CHECK (revision >= 0),
 capacity integer NOT NULL DEFAULT 400 CHECK (capacity = 400),
 PRIMARY KEY (owner_id, character_id),
 FOREIGN KEY (owner_id, character_id)
 REFERENCES game3d_inventory_state(owner_id, character_id)
);
CREATE TABLE game3d_storage_slot (
 owner_id text NOT NULL,
 character_id text NOT NULL,
 slot_index smallint NOT NULL CHECK (slot_index BETWEEN 0 AND 399),
 item_instance_id uuid NOT NULL UNIQUE,
 PRIMARY KEY (owner_id, character_id, slot_index),
 FOREIGN KEY (owner_id, character_id)
 REFERENCES game3d_storage_state(owner_id, character_id),
 FOREIGN KEY (item_instance_id, owner_id, character_id)
 REFERENCES game3d_item_issuance(item_instance_id, owner_id, character_id)
);
-- All allocators must lock game3d_inventory_state for the character before
-- querying/writing either inventory or storage, then commit them together.
-- Do not grant the browser or consumer database roles direct write access.
