-- Combat Foundation 5.0: source-only PRIVATE BETA migration 009.
-- Requires migrations 001..008 on a fresh, isolated PostgreSQL database.
-- No loot grants, stat modifiers, progression migration or rewards are enabled.
-- The server-event verifier is deliberately not wired to any untrusted save.
CREATE TABLE IF NOT EXISTS game3d_item_issuance (
  item_instance_id uuid PRIMARY KEY,
  owner_id text NOT NULL CHECK (owner_id ~ '^[A-Za-z0-9_-]{1,128}$'),
  character_id text NOT NULL CHECK (character_id ~ '^[A-Za-z0-9_-]{1,128}$'),
  source_event_id text NOT NULL CHECK (source_event_id ~ '^[A-Za-z0-9_.:-]{1,160}$'),
  award_index integer NOT NULL CHECK (award_index BETWEEN 0 AND 32),
  definition_id text NOT NULL CHECK (definition_id ~ '^[A-Za-z0-9_.:-]{1,160}$'),
  source_kind text NOT NULL CHECK (source_kind IN ('encounter','quest','craft')),
  source_digest text NOT NULL CHECK (source_digest ~ '^[0-9a-f]{64}$'),
  claim_digest text NOT NULL CHECK (claim_digest ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (source_event_id,award_index),
  UNIQUE (item_instance_id,owner_id,character_id)
);
CREATE INDEX IF NOT EXISTS game3d_item_issuance_owner_idx
  ON game3d_item_issuance(owner_id,character_id);

-- The issuance proof and operation history are append-only, even if a normal
-- application connection accidentally attempts UPDATE or DELETE.
CREATE OR REPLACE FUNCTION game3d_item_provenance_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Game3D item provenance history is append-only';
END;
$$;
CREATE TRIGGER game3d_item_issuance_immutable
BEFORE UPDATE OR DELETE ON game3d_item_issuance
FOR EACH ROW EXECUTE FUNCTION game3d_item_provenance_immutable();

CREATE TABLE IF NOT EXISTS game3d_character_equipment_revision (
  owner_id text NOT NULL,
  character_id text NOT NULL,
  revision bigint NOT NULL DEFAULT 0 CHECK (revision >= 0),
  PRIMARY KEY(owner_id,character_id)
);
CREATE TABLE IF NOT EXISTS game3d_character_equipment (
  owner_id text NOT NULL,
  character_id text NOT NULL,
  equipment_slot text NOT NULL CHECK (equipment_slot ~ '^[A-Za-z0-9_-]{1,32}$'),
  item_instance_id uuid NOT NULL UNIQUE,
  PRIMARY KEY(owner_id,character_id,equipment_slot),
  FOREIGN KEY(owner_id,character_id)
    REFERENCES game3d_character_equipment_revision(owner_id,character_id),
  FOREIGN KEY(item_instance_id,owner_id,character_id)
    REFERENCES game3d_item_issuance(item_instance_id,owner_id,character_id)
);
CREATE TABLE IF NOT EXISTS game3d_equipment_operation (
  owner_id text NOT NULL,
  character_id text NOT NULL,
  operation_id text NOT NULL CHECK (operation_id ~ '^[A-Za-z0-9_.:-]{1,160}$'),
  request_digest text NOT NULL CHECK (request_digest ~ '^[0-9a-f]{64}$'),
  result_revision bigint NOT NULL CHECK (result_revision > 0),
  equipment_slot text NOT NULL CHECK (equipment_slot ~ '^[A-Za-z0-9_-]{1,32}$'),
  item_instance_id uuid,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(owner_id,character_id,operation_id),
  FOREIGN KEY(owner_id,character_id)
    REFERENCES game3d_character_equipment_revision(owner_id,character_id)
);
CREATE TRIGGER game3d_equipment_operation_immutable
BEFORE UPDATE OR DELETE ON game3d_equipment_operation
FOR EACH ROW EXECUTE FUNCTION game3d_item_provenance_immutable();

-- These objects must only be accessible to trusted backend roles. No Base44
-- browser role, anonymous HTTP caller or VITE_ credentials may write them.
-- Set and audit explicit DB GRANTs per isolated beta environment.
