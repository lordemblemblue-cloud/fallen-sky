-- Combat Foundation 4.4: isolated beta PostgreSQL, after migrations 001-004.
-- Review is transactionally coupled to terminal/archive, NOT a payout.
-- No path to mark account/gameplay eligibility as verified exists in 4.4.
-- Composite FK also prevents a review row linking the wrong result ID to
-- another otherwise-valid archived duel.
CREATE UNIQUE INDEX IF NOT EXISTS game3d_duel_archive_pair_idx
  ON game3d_duel_lifecycle_archive(duel_id,result_id);
CREATE TABLE IF NOT EXISTS game3d_duel_reward_review (
  duel_id text PRIMARY KEY,
  result_id text NOT NULL UNIQUE,
  FOREIGN KEY(duel_id,result_id)
    REFERENCES game3d_duel_lifecycle_archive(duel_id,result_id),
  review_status text NOT NULL DEFAULT 'blocked_account_unverified'
    CHECK (review_status = 'blocked_account_unverified'),
  account_stats_verified boolean NOT NULL DEFAULT false
    CHECK (account_stats_verified = false),
  loadout_verified boolean NOT NULL DEFAULT false
    CHECK (loadout_verified = false),
  ranked_policy_verified boolean NOT NULL DEFAULT false
    CHECK (ranked_policy_verified = false),
  eligible boolean NOT NULL DEFAULT false CHECK (eligible = false),
  rewards_issued boolean NOT NULL DEFAULT false CHECK (rewards_issued = false),
  review_created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (length(result_id) BETWEEN 1 AND 200)
);
CREATE INDEX IF NOT EXISTS game3d_duel_reward_review_result_idx
  ON game3d_duel_reward_review(result_id);
