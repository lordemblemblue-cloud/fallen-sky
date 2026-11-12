-- Game 3D 83.4: MANUAL private staff capability allowlist.
-- Apply only in a DBA-provisioned disposable PG16+ axe_creator_test_* schema.
-- Requires completed migrations 053 and 054. Not used by gameplay or login.
-- The game-server staff-policy reader receives SELECT ONLY, never writes.
BEGIN;
DO $policy_guard$
BEGIN
 IF current_schema() IS NULL OR current_schema()='public' OR
    current_setting('server_version_num')::integer < 160000 THEN
  RAISE EXCEPTION '83.4 requires dedicated non-public PG16 staging schema';
 END IF;
 IF to_regclass('game3d_creator_catalog_proposal_830') IS NULL OR
    to_regclass('game3d_creator_catalog_review_830') IS NULL OR
    to_regclass('game3d_creator_catalog_intake_audit_833') IS NULL THEN
  RAISE EXCEPTION '83.4 requires reviewed private migrations 053 and 054';
 END IF;
END;
$policy_guard$;

-- A DBA or separate offline staff-policy operator must insert/revoke grants.
-- A browser request, client role flag or player world lease does not write here.
CREATE TABLE game3d_creator_catalog_staff_grant_834 (
 grant_id uuid PRIMARY KEY,
 account_id text NOT NULL CHECK (
  account_id ~ '^[A-Za-z0-9_.:-]{1,128}$'
  AND account_id NOT IN ('__anon__','__default__')),
 capability text NOT NULL CHECK (capability IN (
  'creator-catalog:submit','creator-catalog:status',
  'creator-catalog:review')),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 expires_at timestamptz NOT NULL,
 revoked_at timestamptz NULL,
 granted_by text NOT NULL CHECK (
  granted_by ~ '^[A-Za-z0-9_.:-]{1,128}$'
  AND granted_by NOT IN ('__anon__','__default__')
  AND granted_by <> account_id),
 reason text NOT NULL CHECK (char_length(reason) BETWEEN 8 AND 300),
 CONSTRAINT creator_catalog_staff_grant_unique_834
  UNIQUE(account_id,capability),
 CONSTRAINT creator_catalog_staff_grant_dates_834 CHECK(
  expires_at>created_at AND
  expires_at<=created_at+INTERVAL '30 days' AND
  (revoked_at IS NULL OR revoked_at>=created_at))
);
CREATE INDEX creator_catalog_staff_grant_expiry_834
 ON game3d_creator_catalog_staff_grant_834(expires_at)
 WHERE revoked_at IS NULL;

-- Existing grant identity, authority, expiry and written reason are
-- immutable; an offline operator may only set revoked_at once.
CREATE FUNCTION creator_catalog_staff_grant_834_guard()
RETURNS trigger LANGUAGE plpgsql AS $grant_guard$
BEGIN
 IF TG_OP='DELETE' THEN
  RAISE EXCEPTION '83.4 grants cannot be deleted';
 END IF;
 IF OLD.revoked_at IS NOT NULL OR NEW.revoked_at IS NULL OR
    ROW(NEW.grant_id,NEW.account_id,NEW.capability,
      NEW.created_at,NEW.expires_at,NEW.granted_by,NEW.reason)
    IS DISTINCT FROM
    ROW(OLD.grant_id,OLD.account_id,OLD.capability,
      OLD.created_at,OLD.expires_at,OLD.granted_by,OLD.reason) THEN
  RAISE EXCEPTION '83.4 staff grants can only transition to revoked';
 END IF;
 RETURN NEW;
END;
$grant_guard$;
CREATE TRIGGER creator_catalog_staff_grant_834_immutable
 BEFORE UPDATE OR DELETE ON game3d_creator_catalog_staff_grant_834
 FOR EACH ROW EXECUTE FUNCTION creator_catalog_staff_grant_834_guard();

REVOKE ALL ON game3d_creator_catalog_staff_grant_834 FROM PUBLIC;
REVOKE ALL ON FUNCTION creator_catalog_staff_grant_834_guard() FROM PUBLIC;
-- DBA: separately grant SELECT only to a restricted, non-owner policy
-- reader. Do not grant INSERT/UPDATE/DELETE to the game server, HTTP API,
-- creator staging/audit roles, public users or player world authority.
COMMIT;
