-- Combat Foundation 13.9. Manual private-beta migration 030 after 001–029.
-- Durable, replay-safe state for ONE trusted 13.6 encounter per world instance.
-- This is not a gameplay reward ledger, public room, or deployed migration.
CREATE TABLE game3d_combat_world_recovery_139 (
 instance_id text PRIMARY KEY REFERENCES game3d_combat_world_instance_lease(instance_id)
   ON DELETE RESTRICT,
 instance_epoch text NOT NULL CHECK (instance_epoch ~ '^[A-Za-z0-9_.:-]{8,128}$'),
 holder_id text NOT NULL CHECK (holder_id ~ '^[A-Za-z0-9_.:-]{8,128}$'),
 owner_id text NOT NULL,
 character_id text NOT NULL,
 map_fingerprint text NOT NULL CHECK (map_fingerprint ~ '^[a-f0-9]{64}$'),
 fencing_token bigint NOT NULL CHECK (fencing_token BETWEEN 1 AND 9007199254740991),
 event_seq bigint NOT NULL CHECK (event_seq >= 0),
 checkpoint_json jsonb NOT NULL CHECK (jsonb_typeof(checkpoint_json) = 'object'),
 checkpoint_sha256 text NOT NULL CHECK (checkpoint_sha256 ~ '^[a-f0-9]{64}$'),
 committed_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
-- Only trusted private server code executes the single-statement, lease-row
-- FOR UPDATE fenced CAS write. Old epoch/token writes cannot overwrite a new
-- owner. This row stores no item title, AGP, XP or transferable currencies.
-- No GRANT, RLS bypass, migration execution or public endpoint is created.
