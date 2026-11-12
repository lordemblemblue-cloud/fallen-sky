-- Game 3D 83.3: MANUAL private PG16+ creator intake audit ledger.
-- Apply ONLY to a dedicated, pre-created, non-public disposable staging schema
-- after migration 053. No app boot auto-DDL and no gameplay privileges.
BEGIN;
DO $audit_guard$
BEGIN
 IF current_schema() IS NULL OR current_schema()='public' OR
    current_setting('server_version_num')::integer < 160000 THEN
  RAISE EXCEPTION '83.3 requires a private PG16+ staging schema';
 END IF;
 IF to_regclass('game3d_creator_catalog_proposal_830') IS NULL OR
    to_regclass('game3d_creator_catalog_review_830') IS NULL THEN
  RAISE EXCEPTION '83.3 requires reviewed migration 053';
 END IF;
END;
$audit_guard$;

CREATE TABLE game3d_creator_catalog_intake_audit_833 (
 audit_id uuid PRIMARY KEY,
 request_id uuid NOT NULL,
 event text NOT NULL CHECK (event IN (
  'intake-attempt','intake-result-ok','intake-result-denied',
  'intake-exception','intake-contract-violation',
  'intake-session-expired')),
 operation text NOT NULL
  CHECK (operation IN ('submit','status','review')),
 principal_id text NOT NULL CHECK (
  principal_id ~ '^[A-Za-z0-9_.:-]{1,128}$' AND
  principal_id NOT IN ('__anon__','__default__')),
 occurred_at_ms bigint NOT NULL CHECK (occurred_at_ms > 0),
 proposal_id uuid NULL,
 code text NULL CHECK (
  code IS NULL OR (
   char_length(code) BETWEEN 1 AND 96 AND
   code ~ '^[a-z][a-z0-9-]*$')),
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CONSTRAINT creator_catalog_intake_audit_unique_event_833
  UNIQUE (request_id,event)
);
CREATE INDEX creator_catalog_intake_audit_principal_833
 ON game3d_creator_catalog_intake_audit_833(principal_id,recorded_at DESC);

-- This ledger is append-only. Neither updates nor deletes are authorized
-- even for a privileged writer; DBA maintenance requires explicit review.
CREATE FUNCTION creator_catalog_intake_audit_833_immutable()
RETURNS trigger LANGUAGE plpgsql AS $audit_immutable$
BEGIN
 RAISE EXCEPTION '83.3 private creator intake audit is immutable';
END;
$audit_immutable$;
CREATE TRIGGER creator_catalog_intake_audit_833_no_update_delete
 BEFORE UPDATE OR DELETE ON game3d_creator_catalog_intake_audit_833
 FOR EACH ROW EXECUTE FUNCTION creator_catalog_intake_audit_833_immutable();

REVOKE ALL ON game3d_creator_catalog_intake_audit_833 FROM PUBLIC;
REVOKE ALL ON FUNCTION creator_catalog_intake_audit_833_immutable()
 FROM PUBLIC;
-- DBA must grant only INSERT and SELECT (readiness verification) to a
-- dedicated audit-writer role. Do not grant table ownership to the app.
-- Do not grant any creator/player/reward/world role access.
COMMIT;
