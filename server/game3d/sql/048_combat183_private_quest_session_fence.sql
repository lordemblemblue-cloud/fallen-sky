-- Combat / Quest 18.3 — DRAFT disposable PostgreSQL 16 staging migration.
-- Do NOT run automatically, on production, or with a public application role.
-- The dedicated world-session issuer/revoker owns INSERT/UPDATE/DELETE.
-- The restricted 17.4 quest action writer gets SELECT plus UPDATE only on
-- the generated constant marker, needed by PostgreSQL SELECT FOR SHARE.
-- The marker cannot be assigned or used to modify authentication state.
BEGIN;
DO $$
DECLARE target_schema text := current_schema();
BEGIN
 IF target_schema IS NULL OR target_schema='public' THEN
  RAISE EXCEPTION '18.3 requires a dedicated non-public staging schema';
 END IF;
 IF current_setting('server_version_num')::int < 160000 THEN
  RAISE EXCEPTION '18.3 requires PostgreSQL 16 or newer';
 END IF;
END
$$;

CREATE TABLE game3d_private_quest_session_fence_183 (
 owner_id text NOT NULL CHECK (owner_id ~ '^[A-Za-z0-9_-]{1,128}$'),
 character_id text NOT NULL CHECK (character_id ~ '^[A-Za-z0-9_-]{1,128}$'),
 world_instance_id text NOT NULL CHECK (world_instance_id ~ '^[A-Za-z0-9_.:-]{8,128}$'),
 world_epoch text NOT NULL CHECK (world_epoch ~ '^[A-Za-z0-9_.:-]{8,128}$'),
 world_session_id text NOT NULL CHECK (world_session_id ~ '^[A-Za-z0-9_.:-]{8,128}$'),
 action_session_id text NOT NULL CHECK (action_session_id ~ '^qb174-[a-f0-9]{64}$'),
 lease_nonce uuid NOT NULL,
 active boolean NOT NULL DEFAULT false,
 issued_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 expires_at timestamptz NOT NULL,
 revoked_at timestamptz,
 action_row_lock_183 smallint GENERATED ALWAYS AS (0::smallint) STORED,
 PRIMARY KEY (owner_id,character_id,world_instance_id),
 CONSTRAINT quest_session_183_active_valid CHECK (
   (active=true AND revoked_at IS NULL) OR active=false
 ),
 CONSTRAINT quest_session_183_dates CHECK (expires_at>issued_at)
);
CREATE UNIQUE INDEX quest_session_183_nonce_unique
 ON game3d_private_quest_session_fence_183 (lease_nonce);
-- No GRANT here. Staging administrators must grant SELECT and
-- UPDATE(action_row_lock_183) ONLY to the restricted 17.4 writer;
-- the separate issuer/revoker may hold INSERT/UPDATE on this table.
-- Revocation UPDATE of active=false takes a row lock and waits for any
-- acceptance transaction holding FOR SHARE to commit or roll back.
COMMIT;
