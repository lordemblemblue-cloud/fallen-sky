-- Combat 14.2: immutable PRIVATE provisioning for a server-world encounter.
-- Manual private-beta migration 032; requires 001–031 reviewed separately.
-- Only an independently privileged world-instance provisioner may INSERT.
-- Never authorize browser writes, reward writers, AGP, or public game traffic.
CREATE TABLE game3d_private_world_seed_142 (
 instance_id text PRIMARY KEY CHECK
  (instance_id ~ '^[A-Za-z0-9_.:-]{8,128}$'),
 owner_id text NOT NULL,
 character_id text NOT NULL,
 map_id text NOT NULL CHECK(map_id='wolfveil-v1'),
 map_fingerprint text NOT NULL CHECK
  (map_fingerprint ~ '^[a-f0-9]{64}$'),
 revision bigint NOT NULL CHECK
  (revision BETWEEN 1 AND 9007199254740991),
 world_origin_x double precision NOT NULL CHECK
  (world_origin_x BETWEEN -100000 AND 100000),
 world_origin_z double precision NOT NULL CHECK
  (world_origin_z BETWEEN -100000 AND 100000),
 actors_json jsonb NOT NULL CHECK
  (jsonb_typeof(actors_json)='object' AND
   pg_column_size(actors_json) BETWEEN 2 AND 65536),
 source_kind text NOT NULL DEFAULT 'trusted_server_world_provisioner'
  CHECK(source_kind='trusted_server_world_provisioner'),
 sealed boolean NOT NULL DEFAULT true CHECK(sealed=true),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(owner_id,character_id)
  REFERENCES game3d_trusted_character(owner_id,character_id)
);
-- A seed revision cannot be replaced in-place while combat is running.
-- To re-provision, explicitly create a NEW world instance and new lease.
CREATE FUNCTION game3d_private_world_seed_142_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 RAISE EXCEPTION '14.2 world seed is immutable';
END;$$;
CREATE TRIGGER world_seed_142_immutable
 BEFORE UPDATE OR DELETE ON game3d_private_world_seed_142
 FOR EACH ROW EXECUTE FUNCTION game3d_private_world_seed_142_immutable();
-- No actor seeding API, INSERT writer, GRANT or public endpoint installed.
