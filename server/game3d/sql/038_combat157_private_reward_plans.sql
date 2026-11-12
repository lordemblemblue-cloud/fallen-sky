-- Game 3D Combat / Quest 15.7 — manual private reward PLAN migration.
-- Run AFTER 035–037. This is NOT a claim, grant, settlement, XP credit,
-- currency credit, skill point update, inventory receipt, or payable voucher.
CREATE TABLE game3d_private_quest_reward_plan_157 (
 owner_id text NOT NULL,
 character_id text NOT NULL,
 quest_id text NOT NULL CHECK(quest_id ~ '^[A-Za-z0-9_.:-]{1,160}$'),
 catalog_revision text NOT NULL CHECK(catalog_revision ~ '^[A-Za-z0-9_.:-]{1,80}$'),
 reward_revision text NOT NULL CHECK(reward_revision ~ '^[A-Za-z0-9_.:-]{1,80}$'),
 xp_amount integer NOT NULL CHECK(xp_amount BETWEEN 0 AND 100000),
 points_amount integer NOT NULL CHECK(points_amount BETWEEN 0 AND 1000),
 contribution_amount integer NOT NULL CHECK(contribution_amount BETWEEN 0 AND 100000),
 reputation_amount integer NOT NULL CHECK(reputation_amount BETWEEN 0 AND 100000),
 item_count integer NOT NULL DEFAULT 0 CHECK(item_count=0),
 currency_amount integer NOT NULL DEFAULT 0 CHECK(currency_amount=0),
 plan_only boolean NOT NULL DEFAULT true CHECK(plan_only=true),
 reward_issued boolean NOT NULL DEFAULT false CHECK(reward_issued=false),
 source_kind text NOT NULL
  CHECK(source_kind='verified-private-quest-turnin-plan'),
 planned_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(owner_id,character_id,quest_id),
 FOREIGN KEY(owner_id,character_id,quest_id)
  REFERENCES game3d_private_quest_turnin_156
  (owner_id,character_id,quest_id)
);
CREATE INDEX game3d_quest_reward_plan_character_157
 ON game3d_private_quest_reward_plan_157
 (owner_id,character_id,planned_at);
CREATE TRIGGER game3d_quest_reward_plan_157_immutable
 BEFORE UPDATE OR DELETE ON game3d_private_quest_reward_plan_157
 FOR EACH ROW EXECUTE FUNCTION game3d_item_provenance_immutable();

-- No grants to browser/public roles, automatic migration, item/currency
-- inserts, XP update, external worker, or settlement function.
