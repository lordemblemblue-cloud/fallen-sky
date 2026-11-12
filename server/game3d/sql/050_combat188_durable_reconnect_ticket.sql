-- Game 3D Combat / Quest 18.8 — DRAFT PostgreSQL 16 private staging only.
-- No public route, automatic migration, production role or GRANT.
-- Keep one-use Base44 reconnect evidence durable across separate workers.
BEGIN;
DO $$
BEGIN
 IF current_schema() IS NULL OR current_schema()='public' OR
    current_setting('server_version_num')::int < 160000
 THEN RAISE EXCEPTION '18.8 requires private dedicated PG16 staging schema';
 END IF;
END $$;

CREATE TABLE game3d_private_reconnect_ticket_188 (
 ticket_id uuid PRIMARY KEY,
 owner_id text NOT NULL CHECK(owner_id ~ '^[A-Za-z0-9_-]{1,128}$'),
 character_id text NOT NULL CHECK(character_id ~ '^[A-Za-z0-9_-]{1,128}$'),
 world_instance_id text NOT NULL
  CHECK(world_instance_id ~ '^[A-Za-z0-9_.:-]{8,128}$'),
 world_epoch text NOT NULL CHECK(world_epoch ~ '^[A-Za-z0-9_.:-]{8,128}$'),
 world_session_id text NOT NULL
  CHECK(world_session_id ~ '^[A-Za-z0-9_.:-]{8,128}$'),
 action_session_id text NOT NULL
  CHECK(action_session_id ~ '^qb174-[a-f0-9]{64}$'),
 lease_nonce uuid NOT NULL,
 source_kind text NOT NULL DEFAULT 'server-base44-reconnect-188'
  CHECK(source_kind='server-base44-reconnect-188'),
 issued_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 expires_at timestamptz NOT NULL,
 consumed_at timestamptz,
 reward_authorized boolean NOT NULL DEFAULT false
  CHECK(reward_authorized=false),
 CONSTRAINT private_reconnect_188_dates CHECK(expires_at>issued_at),
 CONSTRAINT private_reconnect_188_consumed CHECK(
  consumed_at IS NULL OR consumed_at>=issued_at)
);
CREATE INDEX private_reconnect_188_world_idx
 ON game3d_private_reconnect_ticket_188
 (owner_id,character_id,world_instance_id,expires_at);

-- Defense in depth: even accidental elevated UPDATE grants must not change
-- original principal/nonce/expiry, clear consumed_at, or delete a used ticket.
CREATE FUNCTION game3d_private_reconnect_ticket_guard_188()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN
  RAISE EXCEPTION 'private reconnect ticket is immutable and cannot be deleted';
 END IF;
 IF ROW(NEW.ticket_id,NEW.owner_id,NEW.character_id,
        NEW.world_instance_id,NEW.world_epoch,NEW.world_session_id,
        NEW.action_session_id,NEW.lease_nonce,NEW.source_kind,
        NEW.issued_at,NEW.expires_at,NEW.reward_authorized)
    IS DISTINCT FROM
    ROW(OLD.ticket_id,OLD.owner_id,OLD.character_id,
        OLD.world_instance_id,OLD.world_epoch,OLD.world_session_id,
        OLD.action_session_id,OLD.lease_nonce,OLD.source_kind,
        OLD.issued_at,OLD.expires_at,OLD.reward_authorized)
    OR OLD.consumed_at IS NOT NULL
    OR NEW.consumed_at IS NULL
    OR NEW.consumed_at < OLD.issued_at
 THEN
  RAISE EXCEPTION 'private reconnect identity or consumed state cannot change';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER game3d_private_reconnect_ticket_188_guard
 BEFORE UPDATE OR DELETE ON game3d_private_reconnect_ticket_188
 FOR EACH ROW EXECUTE FUNCTION game3d_private_reconnect_ticket_guard_188();

-- Reviewed administrator must explicitly provision two independent roles:
-- issuer: SELECT/INSERT ticket; consumer: SELECT and UPDATE(consumed_at).
-- BOTH get SELECT + UPDATE(action_row_lock_183) on the old 18.3 PG lease
-- to take FOR SHARE; neither gets to UPDATE lease identity/active/expiry,
-- grant XP/wallet/items, CREATE schema, DELETE tickets or act as superuser.
-- Historical receipts and consumed rows remain auditable (no purge here).
COMMIT;
