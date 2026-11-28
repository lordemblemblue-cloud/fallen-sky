// R150 exact source-function integration diagnostics with injected test-only I/O.
// No live imports, SDK calls, real character data or production mutations.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = path => readFileSync(new URL('../../../'+path, import.meta.url), 'utf8');
const gatewayPath='src/components/game3d/axe/services/AXEServiceTransactionGateway.js';
const lootPath='src/components/game3d/lootStore.jsx';
const vaultPath='src/components/game3d/character/characterVault.js';
const clone=x=>JSON.parse(JSON.stringify(x));
function excerpt(path,start,end=null){
  const s=source(path),a=s.indexOf(start),b=end?s.indexOf(end,a):s.length;
  if(a<0||b<=a)throw Error('Source boundary moved: '+path);
  return s.slice(a,b);
}
function load(deps,body,result){
  return new Function(...Object.keys(deps),body+'\nreturn '+result)(...Object.values(deps));
}
const fixture=()=>({active:'hero',materials:{material:[{id:'mat_reinforce',dropId:'one'},{id:'mat_reinforce',dropId:'two'}]},receipts:new Map(),server:new Map(),writes:0,rolls:0,requests:0,dropReceipt:false,flushResult:true,hook:null});
function mount(f){
  const loot=load({_lootInventory:clone(f.materials),emitLootInventory:()=>{f.materials=clone(loot.read());f.writes++;}},excerpt(lootPath,'export function getLootItemCount','export function subscribeLootInventory').replace(/^export /gm,''),'({consumeLootUnits,read:()=>_lootInventory})');
  const createDice=load({ROLL_REFUSALS:{},NEWER_SERVER_SERVICES:new Set(['combine','stage','tier_up'])},excerpt(vaultPath,'export function createServerDice','// what the discovery prompt').replace(/^export /gm,''),'createServerDice');
  const engine={get:()=>({status:'saved'}),flush:async()=>f.flushResult};
  const diceSource=createDice(engine,{getIdentity:()=>({characterId:f.active}),call:async(fn,action,data)=>{
    f.requests++;
    if(!f.server.has(data.transactionId)){f.rolls++;f.server.set(data.transactionId,{ok:true,outcome:'success',after:{percent:5},spent:['one'],cost:{mat_reinforce:1}});}
    if(f.hook)await f.hook();
    return {result:clone(f.server.get(data.transactionId)),repeated:f.requests>1};
  }});
  const receiptStorage={get:()=>f.receipts.get(f.active)||null,set:s=>{if(!f.dropReceipt)f.receipts.set(f.active,s);}};
  const noop=()=>{};
  const gateway=load({checkBeforeServerRoll:()=>({ok:true,item:{instanceId:'blade'}}),persistAXEEquipmentInventory:noop,diceSource,consumeLootUnits:loot.consumeLootUnits,getOwned:()=>true,destroyAXEEquipmentItem:noop,setUpgradeRecord:noop,consumeAXEEquipmentItem:noop,DONOR_UPGRADES:['combine','stage'],SERVER_ROLLED_UPGRADES:['reinforcement'],characterScopedStorage:()=>receiptStorage,getStorageUser:()=> 'fixture-owner',getActiveId:()=>f.active,createAXEServiceTransactionId:()=> 'tx',localHandlers:{},appendAXEServiceAudit:noop,window:undefined},excerpt(gatewayPath,'async function runServerRolledUpgrade').replace(/^export /gm,''),'executeAXEServiceTransaction');
  return {run:()=>gateway('reinforcement',{itemId:'blade',transactionId:'tx'})};
}
const count=f=>f.materials.material.length;
test('actual gateway applies one debit and same-session receipt prevents duplicate',async()=>{const f=fixture(),g=mount(f);assert.equal((await g.run()).ok,true);assert.equal(count(f),1);assert.equal((await g.run()).replayed,true);assert.equal(count(f),1);assert.equal(f.requests,1);});
test('persisted receipt prevents replay after gateway reload',async()=>{const f=fixture();await mount(f).run();assert.equal((await mount(f).run()).replayed,true);assert.equal(count(f),1);assert.equal(f.requests,1);});
test('diagnostic: silent receipt write failure then reload can charge replacement material',async()=>{const f=fixture();f.dropReceipt=true;await mount(f).run();assert.equal(count(f),1);assert.equal(f.receipts.size,0);f.dropReceipt=false;await mount(f).run();assert.equal(f.rolls,1);assert.equal(f.requests,2);assert.equal(count(f),0);});
test('actual gateway refuses late result after switching character',async()=>{const f=fixture();f.hook=()=>{f.active='alt';};const result=await mount(f).run();assert.equal(result.reason,'CHARACTER_CHANGED');assert.equal(count(f),2);});
test('diagnostic: switching away and back during await is not detected by scope equality',async()=>{const f=fixture();f.hook=()=>{f.active='alt';f.active='hero';};const result=await mount(f).run();assert.equal(result.ok,true);assert.equal(count(f),1);});
test('diagnostic: actual dice wrapper invokes roll even if flush returned false',async()=>{const f=fixture();f.flushResult=false;await mount(f).run();assert.equal(f.requests,1);assert.equal(f.rolls,1);});
