-- Marketplace Foundation 17.1 — DISPOSABLE PRIVATE BETA migration 021.
-- Apply MANUALLY after 001..020; never run on production or application boot.
-- This is a future transaction-fence schema only. No writer, reservation,
-- seller listing, buyer purchase, AGP balance or item transfer is installed.
-- Existing game3d_item_issuance ownership is permanently original-owner-bound.
--
-- A future trusted transaction writer must, in ONE SERIALIZABLE write transaction:
--  (1) authenticate seller and buyer from trusted sessions
--  (2) lock/revalidate immutable source, inventory, equipment and buyer capacity
--  (3) atomically exclude duplicate item intents and enforce idempotent requests
--  (4) post balanced integer AGP double-entry and custody-transfer ledger rows
--  (5) commit all-or-nothing; reconcile before enabling payouts or refunds
-- Do not treat this table's existence as an active inventory lock.

ALTER TABLE game3d_market_listing_candidate
 ADD CONSTRAINT game3d_market_candidate_item_scope_171
 UNIQUE(listing_id,item_instance_id,owner_id,character_id);

CREATE TABLE game3d_market_custody_intent (
 claim_id uuid PRIMARY KEY,
 request_id uuid NOT NULL UNIQUE,
 listing_id uuid NOT NULL UNIQUE,
 item_instance_id uuid NOT NULL UNIQUE,
 owner_id text NOT NULL CHECK(owner_id ~ '^[A-Za-z0-9_-]{1,128}$'
  AND owner_id NOT IN ('__anon__','__default__')),
 character_id text NOT NULL CHECK(character_id ~ '^[A-Za-z0-9_-]{1,128}$'
  AND character_id NOT IN ('__anon__','__default__')),
 expected_inventory_slot smallint NOT NULL
  CHECK(expected_inventory_slot BETWEEN 0 AND 199),
 expected_snapshot_fingerprint text NOT NULL
  CHECK(expected_snapshot_fingerprint ~ '^[a-f0-9]{64}$'),
 intent_kind text NOT NULL DEFAULT 'review_only'
  CHECK(intent_kind='review_only'),
 currency_debited boolean NOT NULL DEFAULT false CHECK(currency_debited=false),
 item_transferred boolean NOT NULL DEFAULT false CHECK(item_transferred=false),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(listing_id,item_instance_id,owner_id,character_id)
  REFERENCES game3d_market_listing_candidate(
   listing_id,item_instance_id,owner_id,character_id),
 FOREIGN KEY(item_instance_id,owner_id,character_id)
  REFERENCES game3d_item_issuance(item_instance_id,owner_id,character_id)
);

CREATE TRIGGER game3d_market_custody_intent_immutable
 BEFORE UPDATE OR DELETE ON game3d_market_custody_intent
 FOR EACH ROW EXECUTE FUNCTION game3d_item_provenance_immutable();

-- UNIQUE(item_instance_id) stops multiple *recorded* intents for one item,
-- but cannot stop a rogue inventory writer from moving that item. Until
-- EVERY mutation path participates in the same trusted custody protocol
-- and an audited transfer ledger exists, do not enable any intent inserts.
-- No GRANT to browser, anonymous, client SDK, or Base44 consumer roles.
