// Phase 49 offline encounter fixture; no live combat import.
export function createM03EncounterModel({barrierSegments=3}={}) {
  // Isolated fixture state only. All damage/outcome observations require a future trusted host.
  if(!Number.isInteger(barrierSegments)||barrierSegments<1||barrierSegments>10)throw Error("INVALID_FIXTURE_TUNING");
  const copy=x=>JSON.parse(JSON.stringify(x));
  const fail=reason=>({ok:false,reason});
  const exact=(x,keys)=>x!==null&&typeof x==="object"&&!Array.isArray(x)&&Object.getPrototypeOf(x)===Object.prototype&&Object.keys(x).length===keys.length&&keys.every(k=>Object.hasOwn(x,k));
  const token=x=>typeof x==="string"&&/^[A-Za-z0-9_-]{1,96}$/.test(x);
  const phase=hp=>hp===0?"DEFEATED":hp<=3500?"C":hp<=7000?"B":"A";
  const roles=["DAMAGE","RANGE","DEFENSE","TRAINING_LOANER"];
  const attacks={A:["CLAW","STOMP"],B:["CLAW","STOMP","BARRIER_PULSE","CREST_PROJECTILE"],C:["CLAW","TAIL_ARC"]};
  const newState=()=>({status:"READY",epoch:0,hp:10000,barrier:barrierSegments,role:null,assist:false,pending:null,protectionAcknowledged:false,aftermath:null});
  const eventKeys=["eventId","epoch","kind","data"];
  const shape=e=>exact(e,eventKeys)&&token(e.eventId)&&Number.isSafeInteger(e.epoch)&&e.epoch>=0&&typeof e.kind==="string"&&e.data!==null&&typeof e.data==="object"&&!Array.isArray(e.data);
  const empty=d=>exact(d,[]);
  const same=(a,b)=>a.epoch===b.epoch&&a.kind===b.kind&&Object.keys(a.data).length===Object.keys(b.data).length&&Object.keys(a.data).every(k=>Object.hasOwn(b.data,k)&&a.data[k]===b.data[k]);
  const reduce=(s,e)=>{
    const d=e.data;
    if(e.epoch!==s.epoch)return "STALE_EPOCH";
    if(e.kind==="START"){
      if(!["READY","FAILED","RETREATED"].includes(s.status))return "START_NOT_AVAILABLE";
      if(!exact(d,["role","assist","arenaLoaded","controlAvailable","validWeapon","loanerRequired"])||!roles.includes(d.role)||typeof d.assist!=="boolean"||d.arenaLoaded!==true||d.controlAvailable!==true||typeof d.validWeapon!=="boolean"||typeof d.loanerRequired!=="boolean")return "UNSAFE_START";
      if(d.role==="TRAINING_LOANER"?d.validWeapon||!d.loanerRequired:!d.validWeapon||d.loanerRequired)return "INVALID_WEAPON_SELECTION";
      s.status="TRANSFORMING";s.epoch++;s.hp=10000;s.barrier=barrierSegments;s.role=d.role;s.assist=d.assist;s.pending=null;s.protectionAcknowledged=false;return null;
    }
    if(e.kind==="TRANSFORM_COMPLETE"){
      if(s.status!=="TRANSFORMING"||!exact(d,["controlAvailable"])||d.controlAvailable!==true)return "TRANSFORMATION_NOT_READY";
      s.status="ACTIVE";return null;
    }
    if(e.kind==="AFTERMATH"){
      if(s.status!=="DEFEATED"||!exact(d,["mode"])||!["acknowledge","skip_with_journal"].includes(d.mode))return "AFTERMATH_NOT_AVAILABLE";
      s.status="COMPLETE";s.aftermath=d.mode;return null;
    }
    if(e.kind==="PLAYER_DEFEAT"||e.kind==="RETREAT"||e.kind==="RELOAD_CHECKPOINT"){
      if(!["ACTIVE","TRANSFORMING"].includes(s.status)||!empty(d))return "RESET_NOT_AVAILABLE";
      s.status=e.kind==="RETREAT"?"RETREATED":e.kind==="PLAYER_DEFEAT"?"FAILED":"READY";s.epoch++;s.pending=null;s.hp=10000;s.barrier=barrierSegments;s.role=null;s.protectionAcknowledged=false;return null;
    }
    if(s.status!=="ACTIVE")return "ENCOUNTER_NOT_ACTIVE";
    if(e.kind==="BOSS_DAMAGE"){
      if(!exact(d,["hpAfter"])||!Number.isInteger(d.hpAfter)||d.hpAfter<0||d.hpAfter>=s.hp)return "INVALID_DAMAGE_OBSERVATION";
      s.hp=d.hpAfter;
      if(s.hp===0){s.status="DEFEATED";s.pending=null;}
      return null;
    }
    if(e.kind==="TELEGRAPH"){
      if(!exact(d,["attackId","attack"])||!token(d.attackId)||!attacks[phase(s.hp)].includes(d.attack)||s.pending)return "INVALID_TELEGRAPH";
      s.pending={id:d.attackId,attack:d.attack,stage:"TELEGRAPH"};return null;
    }
    if(e.kind==="PROTECT"){
      if(!exact(d,["attackId","method"])||!["interrupt","lure"].includes(d.method)||s.pending?.id!==d.attackId||s.pending?.attack!=="BARRIER_PULSE"||s.pending?.stage!=="TELEGRAPH")return "PROTECTION_NOT_AVAILABLE";
      s.pending=null;s.protectionAcknowledged=true;return null;
    }
    if(e.kind==="HIT_WINDOW"){
      if(!exact(d,["attackId"])||s.pending?.id!==d.attackId||s.pending?.stage!=="TELEGRAPH")return "INVALID_HIT_WINDOW";
      s.pending.stage="ACTIVE";return null;
    }
    if(e.kind==="RESOLVE"){
      if(!exact(d,["attackId","outcome"])||s.pending?.id!==d.attackId||s.pending?.stage!=="ACTIVE"||!["miss","player_hit","barrier_hit"].includes(d.outcome))return "INVALID_RESOLUTION";
      if(d.outcome==="barrier_hit"&&s.pending.attack!=="BARRIER_PULSE")return "INVALID_BARRIER_HIT";
      s.pending=null;
      if(d.outcome==="barrier_hit"){
        s.barrier--;
        if(s.barrier===0){s.status="FAILED";s.epoch++;}
      }
      return null;
    }
    return "UNKNOWN_EVENT";
  };
  const replay=events=>{
    if(!Array.isArray(events)||events.length>2048)return fail("INVALID_JOURNAL");
    const state=newState(),seen=new Map(),attackIds=new Set();
    for(const e of events){
      if(!shape(e)||seen.has(e.eventId))return fail("INVALID_HISTORY");
      if(e.kind==="TELEGRAPH"){
        const key=e.epoch+":"+e.data.attackId;
        if(attackIds.has(key))return fail("ATTACK_ID_REUSED");
        attackIds.add(key);
      }
      const reason=reduce(state,e);if(reason)return fail(reason);
      seen.set(e.eventId,e);
    }
    return {ok:true,state,seen};
  };
  const read=events=>{
    const r=replay(events);if(!r.ok)return r;
    return {ok:true,state:{...copy(r.state),phase:phase(r.state.hp),m04Available:r.state.status==="COMPLETE",sealRepaired:false},revision:events.length};
  };
  const append=(events,expectedRevision,event)=>{
    const r=replay(events);if(!r.ok)return r;
    if(!shape(event))return fail("INVALID_EVENT");
    const previous=r.seen.get(event.eventId);
    if(previous)return same(previous,event)?{ok:true,duplicate:true,events:copy(events),state:read(events).state}:fail("EVENT_ID_CONFLICT");
    if(expectedRevision!==events.length)return fail("STALE_REVISION");
    const next=[...events,copy(event)],check=read(next);
    return check.ok?{ok:true,duplicate:false,events:next,state:check.state}:check;
  };
  // Explicit checkpoint restore discards unsafe active attack state, never grants victory.
  // Future host must persist this reset event and prior quest bundle atomically.
  return Object.freeze({read,append});
}
