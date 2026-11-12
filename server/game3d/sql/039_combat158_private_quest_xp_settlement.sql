-- Combat / Quest 15.8: private XP ONLY settlement. Manual after 008 and 035-038.
-- Uses the EXISTING game3d_trusted_character and game3d_trusted_grant_event
-- authorities; it does not create a competing XP balance or award points.
-- All three operations (trusted event, XP+revision, receipt) commit together.
CREATE TABLE game3d_private_quest_xp_settlement_158 (
 owner_id text NOT NULL,
 character_id text NOT NULL,
 quest_id text NOT NULL CHECK (quest_id ~ '^[A-Za-z0-9_.:-]{1,160}$'),
 grant_event_id text NOT NULL UNIQUE
  REFERENCES game3d_trusted_grant_event(event_id),
 grant_digest text NOT NULL CHECK (grant_digest ~ '^[a-f0-9]{64}$'),
 xp_amount integer NOT NULL CHECK (xp_amount BETWEEN 1 AND 10000),
 reward_revision text NOT NULL CHECK (reward_revision ~ '^[A-Za-z0-9_.:-]{1,80}$'),
 source_kind text NOT NULL
  CHECK (source_kind='server-verified-private-quest-xp'),
 xp_credited boolean NOT NULL CHECK (xp_credited=true),
 points_credited boolean NOT NULL DEFAULT false CHECK (points_credited=false),
 reputation_credited boolean NOT NULL DEFAULT false CHECK (reputation_credited=false),
 contribution_credited boolean NOT NULL DEFAULT false CHECK (contribution_credited=false),
 items_issued boolean NOT NULL DEFAULT false CHECK (items_issued=false),
 currency_issued boolean NOT NULL DEFAULT false CHECK (currency_issued=false),
 settled_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(owner_id,character_id,quest_id),
 FOREIGN KEY(owner_id,character_id,quest_id)
  REFERENCES game3d_private_quest_reward_plan_157
  (owner_id,character_id,quest_id),
 FOREIGN KEY(owner_id,character_id)
  REFERENCES game3d_trusted_character(owner_id,character_id)
);
CREATE INDEX game3d_private_quest_xp_settlement_owner_158
 ON game3d_private_quest_xp_settlement_158
 (owner_id,character_id,settled_at);
CREATE TRIGGER game3d_private_quest_xp_settlement_158_immutable
 BEFORE UPDATE OR DELETE ON game3d_private_quest_xp_settlement_158
 FOR EACH ROW EXECUTE FUNCTION game3d_item_provenance_immutable();
-- Private feature gate and DB GRANTs must be independently reviewed.
-- No public endpoint, automatic production migration or other reward payout.
