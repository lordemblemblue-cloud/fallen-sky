-- Combat 14.9: manual PRIVATE migration 034, after 001-033 review.
-- Existing 14.1 sessions intentionally remain unbound (NULL); the strict
-- 14.9 gateway will not accept those credentials. No live login or grants.
ALTER TABLE game3d_private_world_session_141
 ADD COLUMN world_instance_id text
 REFERENCES game3d_private_world_seed_142(instance_id);
CREATE INDEX game3d_private_world_session_scope_149
 ON game3d_private_world_session_141
 (world_instance_id,owner_id,character_id,expires_at)
 WHERE revoked_at IS NULL AND world_instance_id IS NOT NULL;
-- No ALTER ROLE, GRANT, public function, secret, reward or auto-migration.
