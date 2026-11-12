// Offline SQL safety checks. They do not substitute for the PG16 test.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {QUEST_ACTION_LOCK_TABLES_176} from '../privateQuestActionReadiness174.mjs';
const sql=readFileSync(new URL('../sql/047_combat176_private_action_row_lock_markers.sql',import.meta.url),'utf8');
test('17.6 migration pins the four service lock tables and generated constant',()=>{
 const target=[...sql.matchAll(/^  '(game3d_[^']+)'[,\]]?$/gm)].map(x=>x[1]);
 assert.deepEqual(target,QUEST_ACTION_LOCK_TABLES_176);
 assert.match(sql,/ADD COLUMN IF NOT EXISTS action_row_lock_176 smallint GENERATED ALWAYS AS \(0::smallint\) STORED/);
 assert.match(sql,/target_schema='public'/);
});
test('17.6 migration never implicitly grants sensitive privileges',()=>{
 assert.doesNotMatch(sql,/^\s*(GRANT|REVOKE|CREATE ROLE|DROP TABLE|DROP SCHEMA)\s/mi);
 assert.doesNotMatch(sql,/\bUPDATE\s+game3d_trusted_character\b/i);
 assert.match(sql,/BEGIN;[\s\S]*COMMIT;/);
});
