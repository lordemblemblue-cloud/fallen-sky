// Explicitly opt-in. NEVER run against a player or production database.
// Uses a disposable localhost PostgreSQL 16 database and random schema/role.
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {createPrivateAccountFence313} from '../privateAccountFence313.mjs';

const url=process.env.GAME3D_322_DISPOSABLE_PG_ADMIN_URL;
const ack=process.env.GAME3D_322_DISPOSABLE_ACK==='I_HAVE_A_DISPOSABLE_PG16';
const identifier=v=>'"'+v.replaceAll('"','""')+'"';
const safeUrl=()=>{
 let parsed;try{parsed=new URL(url)}catch{return false}
 return parsed.protocol==='postgresql:'&&
  ['localhost','127.0.0.1'].includes(parsed.hostname)&&
  parsed.pathname==='/game3d_322_disposable';
};
test('32.2 genuine PG16 atomic two-worker admission, expiry and stale release',
 {skip:!url&&!ack,timeout:120000},async()=>{
 assert.equal(ack,true,'disposable database acknowledgment required');
 assert.equal(safeUrl(),true,'refuse all non-disposable or remote PG databases');
 process.env.GAME3D_PRIVATE_STAGING_ENV='staging';
 const {default:pg}=await import('pg');
 const suffix=randomUUID().replaceAll('-','');
 const schema='g3d_322_'+suffix,role='g3d_322_admit_'+suffix;
 const admin=new pg.Pool({connectionString:url,max:3,connectionTimeoutMillis:3000});
 const name=identifier(schema)+'.'+identifier('game3d_private_account_fence_313');
 let setup,restricted,createdSchema=false,createdRole=false;
 let a,b,c,d;
 const scope={ownerId:'owner322',characterId:'hero322',instanceId:'world-instance-322',
  instanceEpoch:'world-epoch-322'};
 const options=()=>({enabled:true,pool:restricted,schema,scope,
  verifyOriginal:async()=>true,ttlMs:1000,connectionTimeoutMs:1000});
 try{
  const version=await admin.query('SHOW server_version_num');
  assert(Number(version.rows[0].server_version_num)>=160000);
  await admin.query('CREATE SCHEMA '+identifier(schema));createdSchema=true;
  await admin.query('CREATE ROLE '+identifier(role)+' NOLOGIN');createdRole=true;
  setup=new pg.Pool({connectionString:url,max:2,connectionTimeoutMillis:3000,
   options:'-c search_path='+schema});
  const sql=await readFile(new URL('../sql/052_combat313_private_account_fence.sql',import.meta.url),'utf8');
  await setup.query(sql);
  await admin.query('GRANT USAGE ON SCHEMA '+identifier(schema)+' TO '+identifier(role));
  await admin.query('GRANT SELECT, INSERT, UPDATE ON '+name+' TO '+identifier(role));
  const raw=new pg.Pool({connectionString:url,max:3,connectionTimeoutMillis:3000});
  restricted={async connect(){const client=await raw.connect();
   try{await client.query('SET ROLE '+identifier(role));
    await client.query('SET search_path TO '+identifier(schema));}
   catch(error){client.release(true);throw error}
   return {query:(...args)=>client.query(...args),
    release:()=>client.release(true)};
  },end:()=>raw.end()};
  a=await createPrivateAccountFence313(options());
  b=await createPrivateAccountFence313(options());
  const outcomes=await Promise.all([a.acquire(),b.acquire()]);
  assert.deepEqual([...outcomes].sort(),[false,true]);
  const winner=outcomes[0]?a:b,loser=outcomes[0]?b:a;
  assert.equal(await winner.verify(),true);
  assert.equal(await loser.verify(),false);
  // A stale owner cannot affect a newer generation after PG clock expiry.
  await new Promise(done=>setTimeout(done,1200));
  c=await createPrivateAccountFence313(options());
  assert.equal(await c.acquire(),true);
  assert.equal(await winner.release(),false);
  assert.equal(await c.verify(),true);
  // Third worker still denied until current holder explicitly releases.
  d=await createPrivateAccountFence313(options());
  assert.equal(await d.acquire(),false);
  assert.equal(await c.release(),true);
  await Promise.all([a.shutdown(),b.shutdown(),c.shutdown(),d.shutdown()]);
  // The restricted role cannot DELETE a fence or alter gameplay tables.
  const account=await restricted.connect();
  try{await assert.rejects(account.query('DELETE FROM '+name))}
  finally{account.release()}
 }finally{
  for(const guard of [a,b,c,d])try{await guard?.shutdown()}catch{}
  try{await restricted?.end()}catch{}
  try{await setup?.end()}catch{}
  if(createdSchema)try{await admin.query('DROP SCHEMA '+identifier(schema)+' CASCADE')}catch{}
  if(createdRole)try{await admin.query('DROP ROLE '+identifier(role))}catch{}
  await admin.end();
 }
});
