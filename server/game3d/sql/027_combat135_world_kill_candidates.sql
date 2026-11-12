-- Combat 13.3–13.5, MANUAL private-beta migration 027.
-- Requires 001–026. These are immutable, UNVERIFIED combat observations.
-- The real game engine still does not populate/authorize these records.
CREATE TABLE game3d_combat_world_kill_candidate (
 event_id text PRIMARY KEY
  REFERENCES game3d_engine_outcome(event_id),
 owner_id text NOT NULL,
 character_id text NOT NULL,
 instance_id text NOT NULL,
 enemy_id text NOT NULL CHECK(enemy_id ~ '^[A-Za-z0-9_.:-]{1,160}$'),
 server_tick bigint NOT NULL CHECK(server_tick >= 0),
 strike_kind text NOT NULL CHECK(strike_kind IN ('single','triple','aoe')),
 weapon_path text NOT NULL CHECK(weapon_path IN ('damage','defense','ranged')),
 target_count smallint NOT NULL CHECK(target_count BETWEEN 1 AND 12),
 hit_count smallint NOT NULL CHECK(hit_count BETWEEN 1 AND 3),
 player_x double precision NOT NULL CHECK(player_x BETWEEN -100000 AND 100000),
 player_z double precision NOT NULL CHECK(player_z BETWEEN -100000 AND 100000),
 enemy_x double precision NOT NULL CHECK(enemy_x BETWEEN -100000 AND 100000),
 enemy_z double precision NOT NULL CHECK(enemy_z BETWEEN -100000 AND 100000),
 player_facing double precision NOT NULL CHECK(player_facing BETWEEN -6.283186 AND 6.283186),
 observed_enemy_hp_before integer NOT NULL
  CHECK(observed_enemy_hp_before BETWEEN 1 AND 100000),
 observed_enemy_hp_after integer NOT NULL DEFAULT 0
  CHECK(observed_enemy_hp_after = 0),
 observed_damage integer NOT NULL
  CHECK(observed_damage BETWEEN 1 AND 100000),
 record_kind text NOT NULL DEFAULT 'unverified_world_combat'
  CHECK(record_kind='unverified_world_combat'),
 combat_authorized boolean NOT NULL DEFAULT false CHECK(combat_authorized=false),
 reward_authorized boolean NOT NULL DEFAULT false CHECK(reward_authorized=false),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(owner_id,character_id)
  REFERENCES game3d_trusted_character(owner_id,character_id),
 CHECK(strike_kind='aoe' OR target_count=1),
 CHECK((strike_kind='triple' AND hit_count=3) OR
       (strike_kind<>'triple' AND hit_count=1)),
 CHECK(observed_damage >= observed_enemy_hp_before)
);
CREATE INDEX game3d_combat_world_kill_owner_idx
 ON game3d_combat_world_kill_candidate(owner_id,character_id,instance_id);
CREATE TRIGGER game3d_combat_world_kill_candidate_immutable
 BEFORE UPDATE OR DELETE ON game3d_combat_world_kill_candidate
 FOR EACH ROW EXECUTE FUNCTION game3d_item_provenance_immutable();
-- This is NOT a kill verification writer or reward ledger. No INSERT
-- adapter/permissions/public endpoint; candidates must never mint XP/items.
