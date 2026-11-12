-- Combat Foundation 13.8: private, manual beta-only migration 029.
-- Requires manually reviewed migrations 001–028. No live worker,
-- privileged public grants, state restoration, or reward writer installed.
-- Checkpoints are DIGEST METADATA ONLY, not a restorable game state.
CREATE TABLE game3d_combat_world_checkpoint_138 (
 instance_id text PRIMARY KEY REFERENCES
   game3d_combat_world_instance_lease(instance_id) ON DELETE RESTRICT,
 instance_epoch text NOT NULL CHECK
   (instance_epoch ~ '^[A-Za-z0-9_.:-]{8,128}$'),
 fencing_token bigint NOT NULL CHECK
   (fencing_token BETWEEN 1 AND 9007199254740991),
 event_seq bigint NOT NULL CHECK (event_seq >= 0),
 snapshot_sha256 text NOT NULL CHECK
   (snapshot_sha256 ~ '^[a-f0-9]{64}$'),
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
-- Lease CAS operations are PostgreSQL single-statement writes.
-- Checkpoint digest INSERT/UPDATE locks the matching active lease row in
-- the SAME statement; a stale epoch/token cannot change checkpoint data.
-- Full encounter HP/position/queued-event restore is intentionally absent.
-- A subsequent migration must define verified restoration, authorization,
-- outcome settlement and per-write fencing before this can be public.
