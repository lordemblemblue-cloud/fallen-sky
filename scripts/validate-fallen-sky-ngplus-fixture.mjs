// Standalone synthetic contract fixture, NOT runtime or authoritative code.
function exercise(){
 const results=[];const check=(name,ok)=>results.push({name,ok:!!ok});
 const make=(level=155,cycle=0,ending="SACRIFICE_RESTORATION")=>({owner:"fixture-owner",character:"fixture-char",cycle,revision:7,level,xp:1234,ending,completed:true,items:[{id:"a",enhancement:4,sockets:["gem"],location:"equipped"},{id:"b",enhancement:2,sockets:[],location:"stored"}],entitlements:["D01","D25"],history:[],receipts:[],questState:["M20_COMPLETE"],pending:false});
 function start(s,r){
  if(r.owner!==s.owner||r.character!==s.character)return {status:"DENIED",state:s};
  const old=s.receipts.find(x=>x.sourceCycle===r.sourceCycle);
  if(old)return {status:old.key===r.key?"REPLAY":"CONFLICT",state:s};
  if(!r.confirmed||!r.approved||!r.safe||!r.profile||!s.completed||s.pending||r.sourceCycle!==s.cycle||r.revision!==s.revision)return {status:"BLOCKED",state:s};
  if(r.failBefore)return {status:"SOURCE_RECOVERY",state:s};
  // Synthetic bigint decimal cycle representation avoids choosing a gameplay cap.
  const next=(BigInt(s.cycle)+1n).toString();
  const state={...s,cycle:next,revision:s.revision+1,ending:null,completed:false,history:[...s.history,{cycle:s.cycle,ending:s.ending,questState:[...s.questState]}],receipts:[...s.receipts,{sourceCycle:s.cycle,key:r.key,next}],questState:[],pending:false};
  return {status:r.failAfter?"SUCCESSOR_RECOVERY":"COMMITTED",state};
 }
 const req=s=>({owner:s.owner,character:s.character,sourceCycle:s.cycle,revision:s.revision,key:"request-"+s.cycle,confirmed:true,approved:true,safe:true,profile:true});
 for(const ending of ["SACRIFICE_RESTORATION","REFUSAL_FUSION"]){const s=make(155,0,ending),r=req(s),out=start(s,r);check(ending+" entry",out.status==="COMMITTED"&&out.state.cycle==="1");check(ending+" gear and XP exact",JSON.stringify(out.state.items)===JSON.stringify(s.items)&&out.state.level===s.level&&out.state.xp===s.xp);check(ending+" archive/reset",out.state.history[0].ending===ending&&out.state.questState.length===0&&out.state.ending===null);check(ending+" lifetime entitlement",JSON.stringify(out.state.entitlements)===JSON.stringify(s.entitlements));check(ending+" replay",start(out.state,r).status==="REPLAY");check(ending+" conflicting request",start(out.state,{...r,key:"other"}).status==="CONFLICT");}
 const s=make(),r=req(s);
 for(const flag of ["confirmed","approved","safe","profile"])check("missing "+flag,start(s,{...r,[flag]:false}).state===s);
 check("wrong owner",start(s,{...r,owner:"other"}).status==="DENIED");check("wrong character",start(s,{...r,character:"other"}).status==="DENIED");
 check("stale revision",start(s,{...r,revision:6}).status==="BLOCKED");check("wrong source cycle",start(s,{...r,sourceCycle:9}).status==="BLOCKED");
 check("unfinished",start({...s,completed:false},r).status==="BLOCKED");check("pending reward blocks",start({...s,pending:true},r).status==="BLOCKED");
 check("before commit source",start(s,{...r,failBefore:true}).state===s);const lost=start(s,{...r,failAfter:true});check("after commit same successor",lost.status==="SUCCESSOR_RECOVERY"&&start(lost.state,r).status==="REPLAY"&&lost.state.cycle==="1");
 const low=make(87);check("low-level hypothetical entry never grants levels",start(low,req(low)).state.level===87);
 const capped=make(310,"2");check("max level can continue",start(capped,req(capped)).state.level===310&&start(capped,req(capped)).state.cycle==="3");
 const high=make(310,"9007199254740993");check("high-cycle arithmetic fixture",start(high,req(high)).state.cycle==="9007199254740994");
 const format=(level,cycle)=>`${level}${BigInt(cycle)>0n?"+":""}`;check("base display",format(155,0)==="155");check("NG+ display",format(155,1)==="155+");check("later suffix",format(310,"99")==="310+");check("low level display",format(87,1)==="87+");
 // Synthetic enemy award integer examples only; live rounding/modifier policy not determined.
 const receipts=new Set();const enemyXp=(cycle,defeat,normalXp,eligible)=>{const k=cycle+":"+defeat;if(!eligible||receipts.has(k)||!Number.isSafeInteger(normalXp)||normalXp<0||!Number.isSafeInteger(normalXp*2))return 0;receipts.add(k);return BigInt(cycle)>0n?normalXp*2:normalXp;};
 check("normal example",enemyXp("0","d",100,true)===100);check("double example",enemyXp("1","d",100,true)===200);check("duplicate XP",enemyXp("1","d",100,true)===0);check("later cycle still twice",enemyXp("2","d",100,true)===200);check("ineligible defeat",enemyXp("2","x",100,false)===0);check("unsafe integer XP blocked",enemyXp("2","y",Number.MAX_SAFE_INTEGER,true)===0);
 return results;
}
const results=exercise();
for(const r of results)console.log((r.ok?'PASS ':'FAIL ')+r.name);
if(results.some(r=>!r.ok))process.exitCode=1;
