-- Combat/Quest 31.3: EXPLICIT staging-only migration, not auto-applied.
-- Use a dedicated private non-public schema. No grants or production changes.
BEGIN;
DO $$
BEGIN
 IF current_schema() IS NULL OR current_schema()='public' THEN
  RAISE EXCEPTION '31.3 requires non-public disposable staging schema';
 END IF;
 IF current_setting('server_version_num')::integer < 160000 THEN
  RAISE EXCEPTION '31.3 requires PostgreSQL 16 or newer';
 END IF;
END $$;
CREATE TABLE game3d_private_account_fence_313 (
 owner_id text PRIMARY KEY NOT NULL CHECK (owner_id ~ '^[A-Za-z0-9_-]{1,128}$'),
 character_id text NOT NULL CHECK (character_id ~ '^[A-Za-z0-9_-]{1,128}$'),
 world_instance_id text NOT NULL CHECK (world_instance_id ~ '^[A-Za-z0-9_.:-]{8,128}$'),
 world_epoch text NOT NULL CHECK (world_epoch ~ '^[A-Za-z0-9_.:-]{8,128}$'),
 claim_nonce uuid NOT NULL,
 generation bigint NOT NULL CHECK (generation>0),
 active boolean NOT NULL DEFAULT false,
 expires_at timestamptz NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE UNIQUE INDEX game3d_private_account_fence_313_nonce_unique
 ON game3d_private_account_fence_313 (claim_nonce);
-- No GRANTS here. A separate private staging login with table-limited
-- SELECT/INSERT/UPDATE may run this CAS, but must have no gameplay/reward rights.
COMMIT;
