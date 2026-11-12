-- Combat Foundation 8.6: PRIVATE BETA migration 016, after 001-015.
-- READ-ONLY market preview identity; not a sale/escrow/order/transfer ledger.
-- Manually apply on disposable beta PostgreSQL only.
CREATE TABLE IF NOT EXISTS game3d_market_listing_candidate (
 listing_id uuid PRIMARY KEY,
 owner_id text NOT NULL CHECK(owner_id ~ '^[A-Za-z0-9_-]{1,128}$'),
 character_id text NOT NULL CHECK(character_id ~ '^[A-Za-z0-9_-]{1,128}$'),
 item_instance_id uuid NOT NULL UNIQUE,
 record_kind text NOT NULL DEFAULT 'private_preview'
   CHECK(record_kind='private_preview'),
 payment_enabled boolean NOT NULL DEFAULT false
   CHECK(payment_enabled=false),
 transfer_enabled boolean NOT NULL DEFAULT false
   CHECK(transfer_enabled=false),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(item_instance_id,owner_id,character_id)
 REFERENCES game3d_item_issuance(item_instance_id,owner_id,character_id)
);
CREATE TRIGGER game3d_market_listing_candidate_immutable
 BEFORE UPDATE OR DELETE ON game3d_market_listing_candidate
 FOR EACH ROW EXECUTE FUNCTION game3d_item_provenance_immutable();
-- No insert adapter or public listing UI is installed. Foreign keys prove
-- ownership *within* the item ledger, NOT earned progression authenticity.
