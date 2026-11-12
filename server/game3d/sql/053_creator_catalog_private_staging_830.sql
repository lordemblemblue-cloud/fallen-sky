-- Game 3D 83.0 — EXPLICIT, PRIVATE PostgreSQL 16 STAGING migration.
-- This is not installed by application startup or by merging this file.
-- Neither table has an HTTP grant path, public role grant, reward authority,
-- server-owned live item definitions, inventory issuance or market settlement.
BEGIN;
DO $$
BEGIN
 IF current_schema() IS NULL OR current_schema()='public' OR
    current_setting('server_version_num')::integer < 160000
 THEN RAISE EXCEPTION '83.0 requires dedicated non-public PG16 staging schema';
 END IF;
END; $$;

CREATE TABLE game3d_creator_catalog_proposal_830 (
 proposal_id uuid PRIMARY KEY,
 creator_id text NOT NULL
  CHECK (creator_id ~ '^[A-Za-z0-9_.:-]{1,128}$'
   AND creator_id NOT IN ('__anon__','__default__')),
 proposal_digest char(64) NOT NULL
  CHECK (proposal_digest ~ '^[0-9a-f]{64}$'),
 payload jsonb NOT NULL CHECK (jsonb_typeof(payload)='object'),
 status text NOT NULL DEFAULT 'pending'
  CHECK (status IN ('pending','request-changes','rejected','curation-only')),
 revision integer NOT NULL DEFAULT 0 CHECK (revision BETWEEN 0 AND 1),
 draft_only boolean NOT NULL DEFAULT true CHECK (draft_only=true),
 catalog_published boolean NOT NULL DEFAULT false CHECK (catalog_published=false),
 eligible_for_issuance boolean NOT NULL DEFAULT false
  CHECK (eligible_for_issuance=false),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 reviewed_at timestamptz,
 CONSTRAINT game3d_creator_catalog_830_unique_draft
  UNIQUE (creator_id,proposal_digest),
 CONSTRAINT game3d_creator_catalog_830_review_state CHECK (
   (status='pending' AND revision=0 AND reviewed_at IS NULL) OR
   (status<>'pending' AND revision=1 AND reviewed_at IS NOT NULL)
 )
);
CREATE INDEX game3d_creator_catalog_830_creator_idx
 ON game3d_creator_catalog_proposal_830(creator_id,created_at DESC);

CREATE TABLE game3d_creator_catalog_review_830 (
 review_id uuid PRIMARY KEY,
 proposal_id uuid NOT NULL UNIQUE
  REFERENCES game3d_creator_catalog_proposal_830(proposal_id),
 proposal_digest char(64) NOT NULL
  CHECK (proposal_digest ~ '^[0-9a-f]{64}$'),
 reviewer_id text NOT NULL
  CHECK (reviewer_id ~ '^[A-Za-z0-9_.:-]{1,128}$'
   AND reviewer_id NOT IN ('__anon__','__default__')),
 disposition text NOT NULL
  CHECK (disposition IN ('request-changes','reject','accept-for-curation')),
 review_note text NOT NULL CHECK (
   char_length(review_note) BETWEEN 1 AND 500),
 status text NOT NULL DEFAULT 'review-record-only'
  CHECK (status='review-record-only'),
 catalog_published boolean NOT NULL DEFAULT false CHECK(catalog_published=false),
 eligible_for_issuance boolean NOT NULL DEFAULT false
  CHECK(eligible_for_issuance=false),
 rewards_issued boolean NOT NULL DEFAULT false CHECK(rewards_issued=false),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX game3d_creator_review_830_reviewer_idx
 ON game3d_creator_catalog_review_830(reviewer_id,created_at DESC);

-- Only the one-time pending -> reviewed transition may change a proposal.
-- No edits to submitted content, creator identity, digest or reviewed records.
CREATE FUNCTION game3d_creator_catalog_proposal_830_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN
  RAISE EXCEPTION '83.0 creator proposals cannot be deleted';
 END IF;
 IF OLD.status<>'pending' OR OLD.revision<>0 OR
    NEW.status NOT IN ('request-changes','rejected','curation-only') OR
    NEW.revision<>1 OR NEW.reviewed_at IS NULL OR
    ROW(NEW.proposal_id,NEW.creator_id,NEW.proposal_digest,NEW.payload,
      NEW.draft_only,NEW.catalog_published,NEW.eligible_for_issuance,
      NEW.created_at) IS DISTINCT FROM
    ROW(OLD.proposal_id,OLD.creator_id,OLD.proposal_digest,OLD.payload,
      OLD.draft_only,OLD.catalog_published,OLD.eligible_for_issuance,
      OLD.created_at)
 THEN
  RAISE EXCEPTION '83.0 proposal changes outside single review are forbidden';
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER game3d_creator_catalog_proposal_830_immutable
 BEFORE UPDATE OR DELETE ON game3d_creator_catalog_proposal_830
 FOR EACH ROW EXECUTE FUNCTION game3d_creator_catalog_proposal_830_guard();

-- Review history is immutable, including after a rejected or curation-only
-- decision. A subsequent draft must submit a new content digest.
CREATE FUNCTION game3d_creator_catalog_review_830_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 RAISE EXCEPTION '83.0 creator review records are immutable';
END; $$;
CREATE TRIGGER game3d_creator_catalog_review_830_immutable
 BEFORE UPDATE OR DELETE ON game3d_creator_catalog_review_830
 FOR EACH ROW EXECUTE FUNCTION game3d_creator_catalog_review_830_guard();

-- No GRANT to PUBLIC, browsers, player APIs, payout services or item issuers.
-- A DBA must provision a dedicated restricted staging role independently.
-- Grant only the exact SELECT/INSERT/UPDATE rights reviewed for these tables;
-- do not grant DELETE or UPDATE of review rows or issuance tables.
REVOKE ALL ON game3d_creator_catalog_proposal_830 FROM PUBLIC;
REVOKE ALL ON game3d_creator_catalog_review_830 FROM PUBLIC;
REVOKE ALL ON FUNCTION game3d_creator_catalog_proposal_830_guard() FROM PUBLIC;
REVOKE ALL ON FUNCTION game3d_creator_catalog_review_830_guard() FROM PUBLIC;
COMMIT;
