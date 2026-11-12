import { createGame3DDuelGateway } from './gateway.mjs';
import {createGame3DQuestbookRelay170} from './privateQuestbookRoute170.mjs';
import {assertGame3DQuestbookDatabaseReadiness171, GAME3D_QUESTBOOK_PG_SCHEMA_PATTERN_171} from './privateQuestbookReadiness171.mjs';
import {createGame3DQuestActionRoute174} from './privateQuestActionRoute174.mjs';
import {assertGame3DQuestActionDatabaseReadiness174}
 from './privateQuestActionReadiness174.mjs';
import {createPgCombatLedger} from './transactionalLedger.mjs';
import {randomUUID} from 'node:crypto';
import {assertGame3DPreBetaSafety} from './combatPreBetaGate.mjs';
import {COMBAT_FOUNDATION_SOURCE_MILESTONE} from './combatFoundationManifest.mjs';

// Combat 5.8: refuse explicit competitive reward/gear enabling before beta.
assertGame3DPreBetaSafety(process.env);

const allowed=(process.env.GAME3D_ALLOWED_ORIGINS||'')
  .split(',').map(x=>x.trim()).filter(Boolean);
// Private staging-only database. Do not configure this for public play before
// the Base44 report endpoint also has a transactional ownership fence.
const databaseUrl=process.env.GAME3D_COMBAT_PG_URL||null;
if(process.env.GAME3D_COMBAT_JOURNAL_ENABLED==='true'&&!databaseUrl)
  throw Error('GAME3D_COMBAT_JOURNAL_ENABLED requires private PostgreSQL configuration');
let dbPool=null,transactionalLedger=null;
if(databaseUrl){
  const {default:pg}=await import('pg');
  dbPool=new pg.Pool({connectionString:databaseUrl,max:4,
    connectionTimeoutMillis:5000,idleTimeoutMillis:10000});
  transactionalLedger=createPgCombatLedger({
    pool:dbPool,ownerId:randomUUID(),
    journalEnabled:process.env.GAME3D_COMBAT_JOURNAL_ENABLED==='true',
    ledgerOnlyEnabled:process.env.GAME3D_COMBAT_LEDGER_ONLY_ENABLED==='true',
    lifecycleArchiveEnabled:process.env.GAME3D_COMBAT_ARCHIVE_ENABLED==='true',
    rewardReviewEnabled:process.env.GAME3D_COMBAT_REVIEW_ENABLED==='true',
    standardizedLoadoutEnabled:process.env.GAME3D_COMBAT_BASELINE_ENABLED==='true',
    upgradeAuditEnabled:process.env.GAME3D_COMBAT_UPGRADE_AUDIT_ENABLED==='true',
  });
}
// 17.0: isolated, explicitly enabled authenticated read relay. It never
// imports browser saves as trusted progress and never runs migrations.
let questbookPool=null,questbookRoute=null;
if(process.env.GAME3D_QUESTBOOK_ENABLED==='true'){
  const url=process.env.GAME3D_QUESTBOOK_PG_URL||'';
  const secret=process.env.GAME3D_QUESTBOOK_SECRET||'';
  const appOrigin=process.env.GAME3D_QUESTBOOK_APP_ORIGIN||'';
  const schema=process.env.GAME3D_QUESTBOOK_PG_SCHEMA||'';
  if(!/^postgres(?:ql)?:\/\//.test(url)||secret.length<32||
     !GAME3D_QUESTBOOK_PG_SCHEMA_PATTERN_171.test(schema))
    throw Error('17.1 read relay requires dedicated Questbook PG URL, secret and schema');
  const {default:pg}=await import('pg');
  questbookPool=new pg.Pool({connectionString:url,max:5,
    options:'-c search_path='+schema,
    connectionTimeoutMillis:5000,idleTimeoutMillis:10000});
  // Fail BEFORE binding a listener if schema migrations or least-privilege
  // role grants are missing. Never use a postgres superuser as read relay.
  await assertGame3DQuestbookDatabaseReadiness171({pool:questbookPool,schema});
  questbookRoute=createGame3DQuestbookRelay170({
   pool:questbookPool,secret,appOrigin
  });
}
// Explicitly disabled unless separately configured on this private worker.
// These staging intent writes need a distinct, restricted PostgreSQL login.
let questActionPool=null,questActionRoute=null;
if(process.env.GAME3D_QUEST_ACTION_174_ENABLED==='true'){
  if(process.env.GAME3D_QUESTBOOK_ENABLED!=='true'||
     process.env.GAME3D_QUEST_ACTION_174_SINGLE_REPLICA_STAGING_ACK!=='true')
    throw Error('17.4 needs enabled verified reads and explicit single-replica staging acknowledgement');
  const url=process.env.GAME3D_QUEST_ACTION_174_PG_URL||'';
  const readUrl=process.env.GAME3D_QUESTBOOK_PG_URL||'';
  const schema=process.env.GAME3D_QUEST_ACTION_174_PG_SCHEMA||'';
  const readSchema=process.env.GAME3D_QUESTBOOK_PG_SCHEMA||'';
  const secret=process.env.GAME3D_QUEST_ACTION_174_SECRET||'';
  const appOrigin=process.env.GAME3D_QUESTBOOK_APP_ORIGIN||'';
  if(!/^[a-z][a-z0-9_]{0,62}$/.test(schema)||schema!==readSchema||
     secret.length<32||!/^postgres(?:ql)?:\/\//.test(url))
    throw Error('17.4 restricted PG writer, matching Questbook schema and private signer required');
  const target=new URL(url),source=new URL(readUrl);
  if(target.hostname!==source.hostname||target.port!==source.port||
     target.pathname!==source.pathname||target.username===source.username)
    throw Error('17.4 writer and read role must share one database but use different logins');
  const {default:pg}=await import('pg');
  questActionPool=new pg.Pool({connectionString:url,max:2,
    options:'-c search_path='+schema,
    connectionTimeoutMillis:5000,idleTimeoutMillis:10000});
  await assertGame3DQuestActionDatabaseReadiness174({pool:questActionPool,schema});
  questActionRoute=createGame3DQuestActionRoute174({
    pool:questActionPool,secret,appOrigin
  });
}
const gateway=createGame3DDuelGateway({
  secret:process.env.GAME3D_COMBAT_SECRET,
  origins:allowed,
  reportUrl:process.env.GAME3D_COMBAT_REPORT_URL,
  mapId:process.env.GAME3D_COMBAT_MAP_ID||null,
  requireInstanceBinding:process.env.GAME3D_COMBAT_INSTANCE_BINDING_ENABLED==='true',
  spawnPresetId:process.env.GAME3D_COMBAT_SPAWN_PRESET_ID||null,
  outboxDir:process.env.GAME3D_COMBAT_SETTLEMENT_OUTBOX_DIR||null,
  transactionalLedger,
  questbookRoute,questActionRoute,
  authoritativeReadsEnabled:process.env.GAME3D_COMBAT_READ_ENABLED==='true',
  ledgerOnlyEnabled:process.env.GAME3D_COMBAT_LEDGER_ONLY_ENABLED==='true',
  lifecycleArchiveEnabled:process.env.GAME3D_COMBAT_ARCHIVE_ENABLED==='true',
  rewardReviewEnabled:process.env.GAME3D_COMBAT_REVIEW_ENABLED==='true',
  admissionPreflightEnabled:process.env.GAME3D_COMBAT_PREFLIGHT_ENABLED==='true',
  characterBindingEnabled:process.env.GAME3D_COMBAT_CHARACTER_BINDING_ENABLED==='true',
  standardizedLoadoutEnabled:process.env.GAME3D_COMBAT_BASELINE_ENABLED==='true',
  upgradeAuditEnabled:process.env.GAME3D_COMBAT_UPGRADE_AUDIT_ENABLED==='true',
  port:Number(process.env.PORT||3000),
});
const addr=await gateway.listen();
console.log('[Game 3D Authority source '+COMBAT_FOUNDATION_SOURCE_MILESTONE+'] Isolated duel worker listening on',addr.port,
  '| authorized origins',allowed.length,
  '| mode=opt-in | ranked disabled; Base44 writes remain nontransactional');
for(const signal of ['SIGTERM','SIGINT']){
  process.once(signal,async()=>{
    await gateway.close();
    if(questActionRoute)await questActionRoute.shutdown();
    if(questActionPool)await questActionPool.end();
    if(questbookRoute)await questbookRoute.shutdown();
    if(questbookPool)await questbookPool.end();
    if(dbPool)await dbPool.end();
    process.exit(0);
  });
}
