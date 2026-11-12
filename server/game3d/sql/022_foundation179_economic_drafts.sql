-- Marketplace 17.2–17.9: MANUAL, DISPOSABLE PRIVATE-BETA migration 022.
-- Requires 001–021. Nothing here updates real balances or moves items.
-- Not a wallet ledger, custody ledger, purchase, payment, or money movement.
ALTER TABLE game3d_market_listing_candidate
 ADD CONSTRAINT game3d_market_listing_item_draft_179 UNIQUE(listing_id,item_instance_id);
CREATE TABLE game3d_market_economic_draft (
 request_id uuid PRIMARY KEY,
 listing_id uuid NOT NULL,
 item_instance_id uuid NOT NULL,
 seller_account_id text NOT NULL,
 buyer_account_id text NOT NULL,
 ask_agp bigint NOT NULL CHECK(ask_agp BETWEEN 1 AND 100000000),
 expected_snapshot_fingerprint text NOT NULL
  CHECK(expected_snapshot_fingerprint ~ '^[0-9a-f]{64}$'),
 journal_fingerprint text NOT NULL
  CHECK(journal_fingerprint ~ '^[0-9a-f]{64}$'),
 fee_agp bigint NOT NULL DEFAULT 0 CHECK(fee_agp=0),
 draft_only boolean NOT NULL DEFAULT true CHECK(draft_only=true),
 payment_authorized boolean NOT NULL DEFAULT false CHECK(payment_authorized=false),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK(seller_account_id <> buyer_account_id),
 CHECK(seller_account_id ~ '^[A-Za-z0-9_-]{1,128}$'),
 CHECK(buyer_account_id ~ '^[A-Za-z0-9_-]{1,128}$'),
 FOREIGN KEY(listing_id,item_instance_id)
  REFERENCES game3d_market_listing_candidate(listing_id,item_instance_id)
);
CREATE TABLE game3d_market_economic_draft_entry (
 request_id uuid NOT NULL
  REFERENCES game3d_market_economic_draft(request_id),
 entry_role text NOT NULL CHECK(entry_role IN ('buyer-debit','seller-credit')),
 account_id text NOT NULL CHECK(account_id ~ '^[A-Za-z0-9_-]{1,128}$'),
 amount_agp bigint NOT NULL CHECK(amount_agp BETWEEN 1 AND 100000000),
 sign smallint NOT NULL CHECK(sign IN (-1,1)),
 PRIMARY KEY(request_id,entry_role),
 CHECK((entry_role='buyer-debit' AND sign=-1) OR
       (entry_role='seller-credit' AND sign=1))
);
-- Deferred enforcement verifies that a *complete* draft consists of two
-- equal and opposite entries attributed to the correct accounts. This is
-- intentionally NOT sufficient for payment, balance, funding, or replay safety.
CREATE FUNCTION game3d_market_draft_balanced_179()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
 e RECORD;
 d RECORD;
BEGIN
 SELECT * INTO d FROM game3d_market_economic_draft WHERE request_id=NEW.request_id;
 SELECT count(*) AS n,coalesce(sum(amount_agp*sign),0) AS net,
        count(*) FILTER (WHERE entry_role='buyer-debit'
          AND account_id=d.buyer_account_id AND amount_agp=d.ask_agp) AS debits,
        count(*) FILTER (WHERE entry_role='seller-credit'
          AND account_id=d.seller_account_id AND amount_agp=d.ask_agp) AS credits
 INTO e FROM game3d_market_economic_draft_entry WHERE request_id=NEW.request_id;
 IF e.n<>2 OR e.net<>0 OR e.debits<>1 OR e.credits<>1 THEN
  RAISE EXCEPTION 'Unbalanced or incomplete marketplace draft';
 END IF;
 RETURN NULL;
END;
$$;
-- Also constrain bare headers: an economic draft cannot commit without
-- its complete two-sided entry set. Deferred checks run at COMMIT.
CREATE CONSTRAINT TRIGGER game3d_market_economic_header_balanced
 AFTER INSERT ON game3d_market_economic_draft
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
 EXECUTE FUNCTION game3d_market_draft_balanced_179();
CREATE CONSTRAINT TRIGGER game3d_market_economic_draft_balanced
 AFTER INSERT ON game3d_market_economic_draft_entry
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
 EXECUTE FUNCTION game3d_market_draft_balanced_179();
CREATE TRIGGER game3d_market_economic_draft_immutable
 BEFORE UPDATE OR DELETE ON game3d_market_economic_draft
 FOR EACH ROW EXECUTE FUNCTION game3d_item_provenance_immutable();
CREATE TRIGGER game3d_market_economic_draft_entry_immutable
 BEFORE UPDATE OR DELETE ON game3d_market_economic_draft_entry
 FOR EACH ROW EXECUTE FUNCTION game3d_item_provenance_immutable();
-- NO INSERT ADAPTER, roles, public APIs, or automatic schema application.
-- A future writer must lock real wallet rows and enforce an authoritative,
-- conservation-checked immutable ledger plus customer retry idempotency.
