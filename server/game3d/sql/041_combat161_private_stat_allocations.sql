-- Game 3D 16.1 — manual private-only stat allocation migration (after 008).
-- The journal records only confirmed level-earned point SPENDS from the
-- trusted 5.0 character XP, not any browser-owned Character Vault balance.
-- Quest bonus point proposals in 15.9 are NOT spendable through this ledger.
CREATE TABLE game3d_private_stat_allocation_161 (
 owner_id text NOT NULL,
 character_id text NOT NULL,
 allocation_id text NOT NULL
  CHECK(allocation_id ~ '^[A-Za-z0-9_.:-]{8,128}$'),
 stat_key text NOT NULL
  CHECK(stat_key IN ('strength','dexterity','constitution','focus')),
 points integer NOT NULL CHECK(points BETWEEN 1 AND 99),
 character_revision_before bigint NOT NULL CHECK(character_revision_before>=0),
 character_revision_after bigint NOT NULL
  CHECK(character_revision_after=character_revision_before+1),
 source_kind text NOT NULL
  CHECK(source_kind='trusted-private-level-stat-allocation'),
 policy_version text NOT NULL
  CHECK(policy_version='game3d-private-stat-allocation-161-v1'),
 allocated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(owner_id,character_id,allocation_id),
 FOREIGN KEY(owner_id,character_id)
  REFERENCES game3d_trusted_character(owner_id,character_id)
);
CREATE INDEX game3d_stat_allocation_character_161
 ON game3d_private_stat_allocation_161
 (owner_id,character_id,allocated_at);
CREATE TRIGGER game3d_private_stat_allocation_161_immutable
 BEFORE UPDATE OR DELETE ON game3d_private_stat_allocation_161
 FOR EACH ROW EXECUTE FUNCTION game3d_item_provenance_immutable();

-- No public API, automated schema migration, character HUD sync, stat respec,
-- quest bonus redemption, contribution wallet, DB privileges or game deployment.
