-- Marketplace Foundation 19.3: MANUAL disposable private-beta migration 024.
-- Requires 001–023. THIS IS NOT A FUNDED AGP WALLET OR PAYMENT LEDGER.
-- These are UNVERIFIED candidate snapshots for future economic auditing.
-- No server insert/update adapters, commerce routes, privileges or live flags.
CREATE TABLE game3d_market_agp_wallet_candidate (
 owner_account_id text PRIMARY KEY
  CHECK(owner_account_id ~ '^[A-Za-z0-9_-]{1,128}$'
   AND owner_account_id NOT IN ('__anon__','__default__')),
 observed_balance_agp bigint NOT NULL DEFAULT 0
  CHECK(observed_balance_agp BETWEEN 0 AND 9000000000000000000),
 revision bigint NOT NULL DEFAULT 0 CHECK(revision>=0),
 source_kind text NOT NULL DEFAULT 'unverified_preview'
  CHECK(source_kind='unverified_preview'),
 review_only boolean NOT NULL DEFAULT true CHECK(review_only=true),
 funding_verified boolean NOT NULL DEFAULT false CHECK(funding_verified=false),
 spending_enabled boolean NOT NULL DEFAULT false CHECK(spending_enabled=false),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE game3d_market_agp_wallet_draft_entry (
 entry_id uuid PRIMARY KEY,
 owner_account_id text NOT NULL
  REFERENCES game3d_market_agp_wallet_candidate(owner_account_id),
 operation_id uuid NOT NULL,
 delta_agp bigint NOT NULL CHECK(
  delta_agp BETWEEN -100000000 AND 100000000 AND delta_agp<>0),
 record_kind text NOT NULL DEFAULT 'unverified_preview'
  CHECK(record_kind='unverified_preview'),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(owner_account_id,operation_id)
);
CREATE INDEX game3d_market_agp_wallet_draft_entry_owner_idx
 ON game3d_market_agp_wallet_draft_entry(owner_account_id);
CREATE TRIGGER game3d_market_agp_wallet_draft_entry_immutable
 BEFORE UPDATE OR DELETE ON game3d_market_agp_wallet_draft_entry
 FOR EACH ROW EXECUTE FUNCTION game3d_item_provenance_immutable();
-- A future trusted writer must maintain snapshots and journal atomically.
-- This schema alone has NO verified external issuance/source-of-funds,
-- durable transferable wallet, conservation-balanced two-account movement,
-- serialized overdraft locks, idempotent settlement or reconciliation.
-- Do not manually credit balances, grant application roles, or deploy live.
