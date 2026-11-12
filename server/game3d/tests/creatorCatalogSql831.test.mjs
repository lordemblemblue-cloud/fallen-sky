import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {inspectCreatorCatalogMigration831} from '../creatorCatalogSqlContract831.mjs';

const sql=readFileSync('server/game3d/sql/053_creator_catalog_private_staging_830.sql','utf8');

test('83.1 migration has 3 balanced and complete PostgreSQL function blocks',()=>{
 const checked=inspectCreatorCatalogMigration831(sql);
 assert.equal(checked.ok,true,checked.reasons.join('; '));
 assert.equal(checked.blocks,3);
 assert.equal((sql.match(/LANGUAGE plpgsql AS \$\$/g)||[]).length,2);
 assert.equal((sql.match(/^END; \$\$;$/gm)||[]).length,3);
});

test('83.1 previous broken AS $ delimiter is rejected',()=>{
 const broken=sql.replace('RETURNS trigger LANGUAGE plpgsql AS $$',
  'RETURNS trigger LANGUAGE plpgsql AS $');
 const result=inspectCreatorCatalogMigration831(broken);
 assert.equal(result.ok,false);
 assert.match(result.reasons.join(' '),/paired|single-dollar/i);
});

test('83.1 previous missing terminator before $$ is rejected',()=>{
 const broken=sql.replace('END; $$;',()=> 'END $$;');
 const result=inspectCreatorCatalogMigration831(broken);
 assert.equal(result.ok,false);
 assert.match(result.reasons.join(' '),/terminated with END;/);
});

test('83.1 second trigger function quote pair is mandatory',()=>{
 const first=sql.indexOf('CREATE FUNCTION game3d_creator_catalog_review_830_guard()');
 const broken=sql.slice(0,first)+sql.slice(first).replace('END; $$;','END; $;');
 assert.equal(inspectCreatorCatalogMigration831(broken).ok,false);
});

test('83.1 staging migration must reject public schema and old PostgreSQL',()=>{
 assert.equal(inspectCreatorCatalogMigration831(
  sql.replace("current_schema()='public'","current_schema()='something_else'")
 ).ok,false);
 assert.equal(inspectCreatorCatalogMigration831(
  sql.replace("current_setting('server_version_num')::integer < 160000", "TRUE")
 ).ok,false);
});

test('83.1 staging migration cannot authorize public or drop unrelated tables',()=>{
 const unsafe=sql.replace('COMMIT;', "GRANT INSERT ON game3d_creator_catalog_review_830 TO PUBLIC;\nCOMMIT;");
 assert.equal(inspectCreatorCatalogMigration831(unsafe).ok,false);
 const destructive=sql.replace('COMMIT;', 'DROP TABLE player_items;\nCOMMIT;');
 assert.equal(inspectCreatorCatalogMigration831(destructive).ok,false);
});

test('83.1 both immutable trigger functions must revoke public EXECUTE',()=>{
 const broken=sql.replace(
  'REVOKE ALL ON FUNCTION game3d_creator_catalog_review_830_guard() FROM PUBLIC;',
  '-- removed');
 assert.equal(inspectCreatorCatalogMigration831(broken).ok,false);
});

test('83.1 proposal and review tables remain private and non-issuing',()=>{
 assert.match(sql,/eligible_for_issuance boolean NOT NULL DEFAULT false/);
 assert.match(sql,/catalog_published boolean NOT NULL DEFAULT false/);
 assert.match(sql,/rewards_issued boolean NOT NULL DEFAULT false/);
 assert.match(sql,/game3d_creator_catalog_proposal_830_immutable/);
 assert.match(sql,/game3d_creator_catalog_review_830_immutable/);
 assert.doesNotMatch(sql,/\bINSERT INTO game3d_item_issuance\b/);
});
