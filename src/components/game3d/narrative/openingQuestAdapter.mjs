// Phase 45 isolated opening quest state model. No live imports, storage writes or rewards.
export function createOpeningQuestAdapter({definitions,contentRevision}) {
  // Development-only model. Definition and event provenance must be supplied
  // by a future trusted integration. This module is not an authorization layer.
  const main=['M01','M02','M03','M04','M05','M06'];
  const side=['S01','S02','S03','S04','S05','S06','S07','S08'];
  const reality=['PRESERVED','PRESERVED','PRESERVED','ORIGINAL','ORIGINAL','PRESERVED'];
  const plain=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&Object.getPrototypeOf(x)===Object.prototype;
  const exact=(x,keys)=>plain(x)&&Object.keys(x).length===keys.length&&keys.every(k=>Object.hasOwn(x,k));
  const token=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,96}$/.test(x);
  const copy=x=>JSON.parse(JSON.stringify(x));
  const bad=reason=>({ok:false,reason});
  const MAX_EVENTS=1024, MAX_BYTES=240000;
  const defs=new Map();
  if(!token(contentRevision)||!Array.isArray(definitions)||definitions.length>14) throw Error('INVALID_DEFINITIONS');
  for(const raw of definitions){
    if(!exact(raw,['id','reality','requires','objectives','enabled'])||![...main,...side].includes(raw.id)||defs.has(raw.id)||!['PRESERVED','ORIGINAL'].includes(raw.reality)||typeof raw.enabled!=='boolean'||!Array.isArray(raw.requires)||new Set(raw.requires).size!==raw.requires.length||!raw.requires.every(x=>main.includes(x)&&x!==raw.id)||!Array.isArray(raw.objectives)||raw.objectives.length===0||raw.objectives.length>32||!raw.objectives.every(token)||new Set(raw.objectives).size!==raw.objectives.length) throw Error('INVALID_DEFINITION');
    const i=main.indexOf(raw.id);
    if(i>=0&&(raw.reality!==reality[i]||raw.requires.length!==(i?1:0)||(i&&raw.requires[0]!==main[i-1])))throw Error('INVALID_MAIN_ORDER_OR_REALITY');
    defs.set(raw.id,copy(raw));
  }
  // Do not permit optional content to be a prerequisite of the main campaign.
  const scopeOK=s=>exact(s,['ownerId','characterId','campaignId'])&&Object.values(s).every(token)&&!['__default__','__dev_test__'].includes(s.characterId);
  const sameScope=(a,b)=>scopeOK(a)&&scopeOK(b)&&['ownerId','characterId','campaignId'].every(k=>a[k]===b[k]);
  const newSnapshot=scope=>{
    if(!scopeOK(scope))throw Error('INVALID_SCOPE');
    return {schemaVersion:1,contentRevision,scope:copy(scope),revision:0,events:[]};
  };
  const eventKeys=['eventId','questId','kind','reality','objectiveId'];
  const validEvent=e=>exact(e,eventKeys)&&token(e.eventId)&&token(e.questId)&&['ACCEPT','OBJECTIVE','COMPLETE'].includes(e.kind)&&['PRESERVED','ORIGINAL'].includes(e.reality)&&(e.kind==='OBJECTIVE'?token(e.objectiveId):e.objectiveId===null);
  const equalEvent=(a,b)=>eventKeys.every(k=>a[k]===b[k]);
  const reduce=(records,e)=>{
    if(!validEvent(e))return 'INVALID_EVENT';
    const d=defs.get(e.questId);
    if(!d||!d.enabled)return 'UNKNOWN_OR_DISABLED_QUEST';
    if(d.reality!==e.reality)return 'WRONG_REALITY';
    const q=records.get(d.id);
    if(e.kind==='ACCEPT'){
      if(q)return 'ALREADY_ACCEPTED_OR_COMPLETED';
      if(!d.requires.every(id=>records.get(id)?.status==='COMPLETED'))return 'PREREQUISITE_REQUIRED';
      records.set(d.id,{status:'ACTIVE',reality:d.reality,objectives:[]});
      return null;
    }
    if(!q||q.status!=='ACTIVE')return 'NOT_ACTIVE';
    if(e.kind==='OBJECTIVE'){
      if(!d.objectives.includes(e.objectiveId))return 'UNKNOWN_OBJECTIVE';
      if(q.objectives.includes(e.objectiveId))return 'OBJECTIVE_ALREADY_RECORDED';
      q.objectives.push(e.objectiveId);
      return null;
    }
    if(!d.objectives.every(id=>q.objectives.includes(id)))return 'OBJECTIVES_INCOMPLETE';
    q.status='COMPLETED';
    return null;
  };
  const inspect=(snapshot,scope)=>{
    if(!exact(snapshot,['schemaVersion','contentRevision','scope','revision','events'])||snapshot.schemaVersion!==1||snapshot.contentRevision!==contentRevision||!sameScope(snapshot.scope,scope)||!Array.isArray(snapshot.events)||snapshot.events.length>MAX_EVENTS||snapshot.revision!==snapshot.events.length)return bad('INVALID_SNAPSHOT_OR_SCOPE');
    const records=new Map(), seen=new Map();
    for(const e of snapshot.events){
      if(!validEvent(e)||seen.has(e.eventId))return bad('INVALID_EVENT_HISTORY');
      const reason=reduce(records,e);
      if(reason)return bad('INVALID_EVENT_HISTORY');
      seen.set(e.eventId,e);
    }
    return {ok:true,records,seen};
  };
  const read=(snapshot,scope)=>{
    const check=inspect(snapshot,scope);
    if(!check.ok)return check;
    return {ok:true,revision:snapshot.revision,quests:Object.fromEntries([...check.records].map(([id,q])=>[id,copy(q)]))};
  };
  const append=(snapshot,{scope,expectedRevision,event}={})=>{
    const check=inspect(snapshot,scope);
    if(!check.ok)return check;
    if(!validEvent(event))return bad('INVALID_EVENT');
    const prior=check.seen.get(event.eventId);
    if(prior)return equalEvent(prior,event)?{ok:true,duplicate:true,snapshot:copy(snapshot)}:bad('EVENT_ID_CONFLICT');
    if(expectedRevision!==snapshot.revision)return bad('STALE_REVISION');
    if(snapshot.events.length>=MAX_EVENTS)return bad('JOURNAL_LIMIT');
    const reason=reduce(check.records,event);
    if(reason)return bad(reason);
    const next=copy(snapshot);
    next.events.push(copy(event));next.revision++;
    // This is a serialized local journal proposal, NOT an item/currency receipt.
    return {ok:true,duplicate:false,snapshot:next};
  };
  const encode=(snapshot,scope)=>{
    const check=inspect(snapshot,scope);if(!check.ok)return check;
    const data=JSON.stringify(snapshot);
    return data.length<=MAX_BYTES?{ok:true,data}:bad('SNAPSHOT_TOO_LARGE');
  };
  const decode=(data,scope)=>{
    if(typeof data!=='string'||data.length>MAX_BYTES)return bad('INVALID_SERIALIZED_SNAPSHOT');
    let snapshot;try{snapshot=JSON.parse(data);}catch{return bad('INVALID_SERIALIZED_SNAPSHOT');}
    const check=inspect(snapshot,scope);
    return check.ok?{ok:true,snapshot}:check;
  };
  return Object.freeze({newSnapshot,read,append,encode,decode});
}
