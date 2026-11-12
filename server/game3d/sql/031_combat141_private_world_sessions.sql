-- Combat 14.1 private staging ONLY; manual migration 031 after 001–030.
-- An EXISTING trusted server auth service must issue 256-bit opaque credentials
-- and register their SHA256 digests through privileged private provisioning.
-- No browser-issued token, CREATE GRANT or general-purpose login system.
CREATE TABLE game3d_private_world_session_141 (
 token_sha256 text PRIMARY KEY CHECK (token_sha256 ~ '^[a-f0-9]{64}$'),
 owner_id text NOT NULL,
 character_id text NOT NULL,
 expires_at timestamptz NOT NULL,
 revoked_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY (owner_id,character_id)
   REFERENCES game3d_trusted_character(owner_id,character_id)
);
CREATE INDEX game3d_private_world_session_active_141
 ON game3d_private_world_session_141(owner_id,character_id,expires_at)
 WHERE revoked_at IS NULL;
-- Deliberately no insertion, token minting API, RLS bypass, permissions GRANT
-- or migration runner. Never store the bearer token itself.
