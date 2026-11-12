-- Combat Foundation 4.3: private staging PostgreSQL ONLY.
-- Apply after 001, 002 and 003. Never migrate production before beta.
-- A terminal match gets ONE immutable lifecycle archive entry in the SAME
-- transaction as the signed worker's terminal report and terminal outbox.
-- This does not update Base44 DuelSession or grant account rewards.
CREATE TABLE IF NOT EXISTS game3d_duel_lifecycle_archive (
  duel_id text PRIMARY KEY REFERENCES game3d_duel_lease(duel_id),
  epoch text NOT NULL,
  result_id text NOT NULL UNIQUE,
  report_sequence bigint NOT NULL CHECK (report_sequence > 0),
  simulation_sequence bigint NOT NULL CHECK (simulation_sequence >= 0),
  player_a_id text NOT NULL,
  player_b_id text NOT NULL,
  winner_id text,
  loser_id text,
  finish_reason text,
  outcome text NOT NULL CHECK (outcome IN ('win','draw')),
  reward_eligibility text NOT NULL DEFAULT 'unverified_account'
    CHECK (reward_eligibility = 'unverified_account'),
  rewards_issued boolean NOT NULL DEFAULT false CHECK (rewards_issued = false),
  archived_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (length(duel_id) BETWEEN 1 AND 160),
  CHECK (length(epoch) BETWEEN 1 AND 160),
  CHECK (length(result_id) BETWEEN 1 AND 200),
  CHECK (length(player_a_id) BETWEEN 1 AND 160),
  CHECK (length(player_b_id) BETWEEN 1 AND 160),
  CHECK (player_a_id <> player_b_id),
  CHECK (winner_id IS NULL OR winner_id IN (player_a_id,player_b_id)),
  CHECK (loser_id IS NULL OR loser_id IN (player_a_id,player_b_id)),
  CHECK (
    (outcome='draw' AND winner_id IS NULL AND loser_id IS NULL) OR
    (outcome='win' AND winner_id IS NOT NULL AND loser_id IS NOT NULL
      AND winner_id <> loser_id)
  )
);
CREATE INDEX IF NOT EXISTS game3d_duel_lifecycle_player_a_idx
  ON game3d_duel_lifecycle_archive(player_a_id,archived_at DESC);
CREATE INDEX IF NOT EXISTS game3d_duel_lifecycle_player_b_idx
  ON game3d_duel_lifecycle_archive(player_b_id,archived_at DESC);
