-- Marketplace Foundation 18.0–18.9: MANUAL disposable beta migration 023.
-- Requires 001–022. Models PROPOSED title movement only. NO transfer writer.
-- Original game3d_item_issuance and inventory slot ownership stay untouched.
ALTER TABLE game3d_market_economic_draft
 ADD CONSTRAINT game3d_market_draft_scoped_parties_189
 UNIQUE(request_id,item_instance_id,seller_account_id,buyer_account_id);
CREATE TABLE game3d_market_title_transfer_draft (
 transfer_id uuid PRIMARY KEY,
 request_id uuid NOT NULL UNIQUE,
 item_instance_id uuid NOT NULL UNIQUE,
 source_account_id text NOT NULL CHECK(
  source_account_id ~ '^[A-Za-z0-9_-]{1,128}$'),
 source_character_id text NOT NULL CHECK(
  source_character_id ~ '^[A-Za-z0-9_-]{1,128}$'),
 proposed_target_account_id text NOT NULL CHECK(
  proposed_target_account_id ~ '^[A-Za-z0-9_-]{1,128}$'),
 proposed_target_character_id text NOT NULL CHECK(
  proposed_target_character_id ~ '^[A-Za-z0-9_-]{1,128}$'),
 expected_seller_slot smallint NOT NULL
  CHECK(expected_seller_slot BETWEEN 0 AND 199),
 proposed_buyer_slot smallint NOT NULL
  CHECK(proposed_buyer_slot BETWEEN 0 AND 199),
 expected_snapshot_fingerprint text NOT NULL CHECK(
  expected_snapshot_fingerprint ~ '^[0-9a-f]{64}$'),
 journal_fingerprint text NOT NULL CHECK(
  journal_fingerprint ~ '^[0-9a-f]{64}$'),
 blueprint_fingerprint text NOT NULL CHECK(
  blueprint_fingerprint ~ '^[0-9a-f]{64}$'),
 title_operation text NOT NULL DEFAULT 'proposal_only'
  CHECK(title_operation='proposal_only'),
 item_transferred boolean NOT NULL DEFAULT false CHECK(item_transferred=false),
 settlement_authorized boolean NOT NULL DEFAULT false
  CHECK(settlement_authorized=false),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK(source_account_id<>proposed_target_account_id),
 FOREIGN KEY(request_id,item_instance_id,source_account_id,proposed_target_account_id)
  REFERENCES game3d_market_economic_draft(
   request_id,item_instance_id,seller_account_id,buyer_account_id),
 FOREIGN KEY(item_instance_id,source_account_id,source_character_id)
  REFERENCES game3d_item_issuance(item_instance_id,owner_id,character_id)
);
CREATE TRIGGER game3d_market_title_transfer_draft_immutable
 BEFORE UPDATE OR DELETE ON game3d_market_title_transfer_draft
 FOR EACH ROW EXECUTE FUNCTION game3d_item_provenance_immutable();
-- NOT a current-title projection, not an outbox and not transferable custody.
-- A true transferable title chain must preserve original immutable issuance,
-- order all transfers and guarantee one current owner with transactional locks.
-- No DB grants, HTTP endpoints, item mutation or auction integration.
