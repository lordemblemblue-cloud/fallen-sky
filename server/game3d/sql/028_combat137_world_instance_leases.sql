-- Combat Foundation 13.7. Manual disposable private-beta migration 028.
-- Requires 001–027. This is an authority *lease slot* and private read model,
-- NOT a live lease acquirer, renewal job, world-server or reward ledger.
CREATE TABLE game3d_combat_world_instance_lease (
 instance_id text PRIMARY KEY CHECK(
  instance_id ~ '^[A-Za-z0-9_.:-]{8,128}$'),
 instance_epoch text NOT NULL CHECK(
  instance_epoch ~ '^[A-Za-z0-9_.:-]{8,128}$'),
 holder_id text NOT NULL CHECK(
  holder_id ~ '^[A-Za-z0-9_.:-]{8,128}$'),
 owner_id text NOT NULL CHECK(
  owner_id ~ '^[A-Za-z0-9_-]{1,128}$'
  AND owner_id NOT IN ('__anon__','__default__')),
 character_id text NOT NULL CHECK(
  character_id ~ '^[A-Za-z0-9_-]{1,128}$'
  AND character_id NOT IN ('__anon__','__default__')),
 map_fingerprint text NOT NULL CHECK(
  map_fingerprint ~ '^[a-f0-9]{64}$'),
 fencing_token bigint NOT NULL CHECK(
  fencing_token BETWEEN 1 AND 9007199254740991),
 expires_at timestamptz NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY (owner_id,character_id)
  REFERENCES game3d_trusted_character(owner_id,character_id)
);
CREATE INDEX game3d_world_lease_owner_scope_137
 ON game3d_combat_world_instance_lease(owner_id,character_id);
-- At most one row per instance. A future secure lease writer must acquire
-- with an atomic CAS, verify the previous lease/expiry, increment token on
-- takeovers, commit its epoch+holder, and fence ALL state writes at commit.
-- This migration deliberately installs NO writer, role grants, worker
-- endpoint, trigger-based automatic renewal, or public API.
-- Never seed from browser session, client map, or self-declared lease flags.
