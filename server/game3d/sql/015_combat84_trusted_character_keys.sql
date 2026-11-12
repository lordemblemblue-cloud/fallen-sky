-- Combat Foundation 8.4: private beta migration 015, after 001–014.
-- Makes migration 008 trusted-character IDs match 5.x–8.x JS identity
-- invariants. Apply to a fresh disposable DB; never auto-run on production.
-- If preexisting IDs do not match, this migration must FAIL, not coerce.
ALTER TABLE game3d_trusted_character
 ADD CONSTRAINT game3d_trusted_character_owner_key
 CHECK(owner_id ~ '^[A-Za-z0-9_-]{1,128}$'
       AND owner_id NOT IN ('__anon__','__default__'));
ALTER TABLE game3d_trusted_character
 ADD CONSTRAINT game3d_trusted_character_character_key
 CHECK(character_id ~ '^[A-Za-z0-9_-]{1,128}$'
       AND character_id NOT IN ('__anon__','__default__'));
-- Item issuance and world journals already have exact owner FKs; all new
-- 5.x/6.x evidence uses the canonical trusted-character identity.
