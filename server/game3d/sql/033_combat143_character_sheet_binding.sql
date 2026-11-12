-- Combat Foundation 14.3. Manual private-beta migration 033 after 001-032.
-- Bind an immutable world seed to the exact trusted character XP revision
-- from which its server-derived combat sheet is computed.
-- Legacy 14.2 seeds remain valid for 14.2, but NOT for strict 14.3 bootstrap.
ALTER TABLE game3d_private_world_seed_142
 ADD COLUMN character_revision bigint;
ALTER TABLE game3d_private_world_seed_142
 ADD CONSTRAINT world_seed_143_revision_nonnegative
 CHECK (character_revision IS NULL OR character_revision>=0);
-- The existing 14.2 BEFORE UPDATE/DELETE trigger also protects this binding.
-- A new trusted world seed must specify character_revision at provisioning
-- time. Level/revision changes require a NEW sealed instance, not in-place
-- changes to a running fight. No grants, credential issuer or public writer.
