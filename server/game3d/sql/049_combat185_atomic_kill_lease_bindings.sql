-- Game 3D Combat / Quest 18.5 -- MANUAL, disposable PG16 staging only.
-- A 15.3 server-owned lethal event and its exact 18.3 world admission
-- lease nonce MUST be inserted in one database transaction by the existing
-- trusted 15.3 kill writer. Browser proof and private 15.1 candidates
-- are NOT trusted. No grants, automatic migration, XP or rewards.
BEGIN;
DO $$
BEGIN
 IF current_schema()='public' OR current_schema() IS NULL OR
    current_setting('server_version_num')::int<160000
 THEN RAISE EXCEPTION '18.5 requires a dedicated PG16 staging schema';
 END IF;
END $$;

-- An exact composite FK means a binding can never be linked to a different
-- committed kill, even if an elevated admin passed a valid receipt ID.
ALTER TABLE game3d_private_world_kill_receipt_152
 ADD CONSTRAINT game3d_private_kill_receipt_binding_key_185
 UNIQUE(receipt_id,owner_id,character_id,instance_id,instance_epoch,
        event_seq,map_fingerprint);

CREATE TABLE game3d_private_world_kill_lease_binding_185 (
 receipt_id text PRIMARY KEY,
 owner_id text NOT NULL,
 character_id text NOT NULL,
 instance_id text NOT NULL,
 instance_epoch text NOT NULL,
 event_seq bigint NOT NULL CHECK(event_seq>0),
 map_fingerprint text NOT NULL CHECK(map_fingerprint ~ '^[a-f0-9]{64}$'),
 server_session_id text NOT NULL
  CHECK(server_session_id ~ '^[A-Za-z0-9_.:-]{8,128}$'),
 action_session_id text NOT NULL
  CHECK(action_session_id ~ '^qb174-[a-f0-9]{64}$'),
 lease_nonce uuid NOT NULL,
 bound_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 source_kind text NOT NULL DEFAULT '15.3-server-committed-18.5-lease'
  CHECK(source_kind='15.3-server-committed-18.5-lease'),
 reward_authorized boolean NOT NULL DEFAULT false
  CHECK(reward_authorized=false),
 UNIQUE(instance_id,instance_epoch,event_seq),
 FOREIGN KEY(receipt_id,owner_id,character_id,instance_id,instance_epoch,
             event_seq,map_fingerprint)
  REFERENCES game3d_private_world_kill_receipt_152
  (receipt_id,owner_id,character_id,instance_id,instance_epoch,
   event_seq,map_fingerprint)
);
-- The active 18.3 lease row is intentionally NOT referenced by FK because
-- it is replaced on re-pairing. Historical receipt lease nonces must never
-- be silently relinked to the new session.
CREATE TRIGGER game3d_private_world_kill_lease_binding_185_immutable
 BEFORE UPDATE OR DELETE ON game3d_private_world_kill_lease_binding_185
 FOR EACH ROW EXECUTE FUNCTION game3d_item_provenance_immutable();
-- Prevent even a misconfigured 15.2 projection writer from crediting a
-- receipt with no recorded original lease. Existing unbound credit rows
-- make this migration FAIL: explicit reviewed reconciliation is required,
-- not a guessed nonce backfill or silent deletion.
ALTER TABLE game3d_private_quest_kill_credit_152
 ADD CONSTRAINT game3d_quest_kill_credit_bound_receipt_185
 FOREIGN KEY(receipt_id)
 REFERENCES game3d_private_world_kill_lease_binding_185(receipt_id);

-- Never grant INSERT/UPDATE/DELETE to the 18.4 projection writer.
-- Only the same privileged and privately pinned 15.3 kill writer may INSERT,
-- and only while holding the 18.3 lease row SHARE lock until COMMIT.
COMMIT;
