-- Combat / Quest 17.6 — STAGING-ONLY migration for restricted row-lock grants.
-- PostgreSQL requires UPDATE on at least one table column to use SELECT FOR UPDATE.
-- Provide a generated constant column that cannot be assigned arbitrary values.
-- This script performs NO GRANT and must never run automatically in production.
-- Run as a disposable-schema administrator, then grant ONLY column UPDATE
-- (action_row_lock_176) on these 4 tables to the dedicated 17.4 writer role.
BEGIN;
DO $$
DECLARE target_schema text := current_schema();
DECLARE target_table text;
BEGIN
 IF target_schema IS NULL OR target_schema='public' THEN
  RAISE EXCEPTION '17.6 requires an explicit, non-public disposable schema';
 END IF;
 FOREACH target_table IN ARRAY ARRAY[
  'game3d_trusted_character',
  'game3d_private_quest_acceptance_154',
  'game3d_private_echo_quest_165',
  'game3d_private_rival_invitation_164'
 ] LOOP
  IF to_regclass(format('%I.%I',target_schema,target_table)) IS NULL THEN
   RAISE EXCEPTION '17.6 missing required lock table %',target_table;
  END IF;
  EXECUTE format(
   'ALTER TABLE %I.%I ADD COLUMN IF NOT EXISTS action_row_lock_176 smallint GENERATED ALWAYS AS (0::smallint) STORED',
   target_schema,target_table
  );
 END LOOP;
END
$$;
COMMIT;
