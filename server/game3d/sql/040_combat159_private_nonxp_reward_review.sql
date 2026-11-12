-- Combat/Quest 15.9: immutable NON-SPENDABLE review of pending rewards.
-- Run manually after 008, 035-039. No usable stat points, contribution
-- balance, faction rank, wallet, item, or additional XP are changed here.
CREATE TABLE game3d_private_quest_nonxp_review_159 (
 owner_id text NOT NULL,
 character_id text NOT NULL,
 quest_id text NOT NULL CHECK(quest_id ~ '^[A-Za-z0-9_.:-]{1,160}$'),
 reward_revision text NOT NULL CHECK(reward_revision ~ '^[A-Za-z0-9_.:-]{1,80}$'),
 xp_grant_event_id text NOT NULL,
 points_amount integer NOT NULL CHECK(points_amount BETWEEN 0 AND 1000),
 contribution_amount integer NOT NULL CHECK(contribution_amount BETWEEN 0 AND 100000),
 reputation_amount integer NOT NULL CHECK(reputation_amount BETWEEN 0 AND 100000),
 -- These are review-only values; NEVER a transferable/claimable IOU.
 policy_status text NOT NULL CHECK(policy_status='awaiting-separate-authorities'),
 nonspendable boolean NOT NULL CHECK(nonspendable=true),
 points_posted boolean NOT NULL DEFAULT false CHECK(points_posted=false),
 contribution_posted boolean NOT NULL DEFAULT false CHECK(contribution_posted=false),
 reputation_posted boolean NOT NULL DEFAULT false CHECK(reputation_posted=false),
 item_issued boolean NOT NULL DEFAULT false CHECK(item_issued=false),
 currency_issued boolean NOT NULL DEFAULT false CHECK(currency_issued=false),
 source_kind text NOT NULL
  CHECK(source_kind='verified-private-quest-nonxp-review'),
 reviewed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(owner_id,character_id,quest_id),
 FOREIGN KEY(owner_id,character_id,quest_id)
  REFERENCES game3d_private_quest_xp_settlement_158
  (owner_id,character_id,quest_id),
 FOREIGN KEY(xp_grant_event_id)
  REFERENCES game3d_trusted_grant_event(event_id),
 FOREIGN KEY(owner_id,character_id)
  REFERENCES game3d_trusted_character(owner_id,character_id)
);
CREATE INDEX game3d_private_quest_nonxp_review_owner_159
 ON game3d_private_quest_nonxp_review_159(owner_id,character_id,reviewed_at);
CREATE TRIGGER game3d_private_quest_nonxp_review_159_immutable
 BEFORE UPDATE OR DELETE ON game3d_private_quest_nonxp_review_159
 FOR EACH ROW EXECUTE FUNCTION game3d_item_provenance_immutable();

-- No spendable balance, member/faction binding, deployment hook, unlock,
-- promise to pay, player-facing claim, or GRANT statement.
