-- Marketplace Foundation 19.4–19.9. Manual private disposable beta 025.
-- Requires migrations 001–024. NO live AGP funding, mint, credit or sales.
-- Existing completion/receipt evidence proves digest consistency ONLY.
-- This table proposes possible AGP for review; a verified economic game
-- ruleset, an authorized AGP award, and funded wallet source do NOT yet exist.
CREATE TABLE game3d_market_agp_funding_candidate (
 claim_id uuid PRIMARY KEY,
 completion_id text NOT NULL UNIQUE
  REFERENCES game3d_simulation_completion_receipt(completion_id),
 owner_id text NOT NULL CHECK(
  owner_id ~ '^[A-Za-z0-9_-]{1,128}$'
  AND owner_id NOT IN ('__anon__','__default__')),
 character_id text NOT NULL CHECK(
  character_id ~ '^[A-Za-z0-9_-]{1,128}$'
  AND character_id NOT IN ('__anon__','__default__')),
 proposed_agp bigint NOT NULL
  CHECK(proposed_agp BETWEEN 1 AND 100000000),
 expected_receipt_digest text NOT NULL
  CHECK(expected_receipt_digest ~ '^[a-f0-9]{64}$'),
 expected_completion_digest text NOT NULL
  CHECK(expected_completion_digest ~ '^[a-f0-9]{64}$'),
 record_kind text NOT NULL DEFAULT 'unverified_funding_candidate'
  CHECK(record_kind='unverified_funding_candidate'),
 ruleset_verification_attached boolean NOT NULL DEFAULT false
  CHECK(ruleset_verification_attached=false),
 agp_mint_enabled boolean NOT NULL DEFAULT false CHECK(agp_mint_enabled=false),
 wallet_credit_enabled boolean NOT NULL DEFAULT false CHECK(wallet_credit_enabled=false),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(owner_id,character_id)
  REFERENCES game3d_trusted_character(owner_id,character_id)
);
CREATE INDEX game3d_market_funding_candidate_owner_idx
 ON game3d_market_agp_funding_candidate(owner_id,character_id);
CREATE TRIGGER game3d_market_agp_funding_candidate_immutable
 BEFORE UPDATE OR DELETE ON game3d_market_agp_funding_candidate
 FOR EACH ROW EXECUTE FUNCTION game3d_item_provenance_immutable();
-- The UNIQUE completion constraint blocks duplicate *recorded proposals*.
-- It does not prove event authenticity, legitimate AGP, absence of cross-
-- system double credit, or guarantee a future wallet writer is idempotent.
-- Do not grant INSERT/UPDATE/DELETE to client, anonymous or public roles.
-- Do NOT auto-apply migration; no staging data seeding or runtime hook.
