// WP-FS-S3: isolated paired discovery fixture. No live mount, reward writer,
// inventory access, migration, terrain or authentication. Only trusted fixture
// setup/events may use this model; booleans here are NOT production evidence.
const token=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,96}$/.test(x);
const plain=x=>x!==null&&typeof x==='object'&&Object.getPrototypeOf(x)===Object.prototype;
const exact=(x,keys)=>plain(x)&&Reflect.ownKeys(x).length===keys.length&&keys.every(k=>Object.hasOwn(x,k)&&Object.hasOwn(Object.getOwnPropertyDescriptor(x,k),'value'));
const clone=x=>JSON.parse(JSON.stringify(x));
const bad=reason=>({ok:false,reason});
const scopeKeys=['ownerId','characterId','campaignId'];
const validScope=s=>exact(s,scopeKeys)&&scopeKeys.every(k=>token(s[k]))&&!['__anon__','__default__','__dev_test__'].includes(s.characterId);
const sameScope=(a,b)=>validScope(a)&&validScope(b)&&scopeKeys.every(k=>a[k]===b[k]);
const canonical=id=>typeof id==='string'&&/^D(?:0[1-9]|[1-4][0-9]|50)$/.test(id);
const MAX_EVENTS=512, MAX_BYTES=180000;

export function createPairedDiscoveryModel(config){
  if(!exact(config,['scope','discoveryId','contentRevision','enabled','lifetimeReceipt','legacyDone'])||
    !validScope(config.scope)||!canonical(config.discoveryId)||!token(config.contentRevision)||
    typeof config.enabled!=='boolean'||typeof config.legacyDone!=='boolean'||
    !(config.lifetimeReceipt===null||token(config.lifetimeReceipt)))throw Error('INVALID_FIXTURE_CONFIG');
  const cfg=clone(config);
  // Receipt is supplied by trusted fixture setup from a historical ledger;
  // it is not the item, a grant request, or proof of current possession.
  const fresh=()=>({observed15:false,observed18:false,revealed:false,occupied:false,
    focusHeld:false,interactionRecorded:false,claimReceipt:null,secondVista:false,
    opportunity:'UNRESOLVED',legacyDone:cfg.legacyDone});
  const fields={
    OBSERVE:['reality','verified'],
    OPPORTUNITY:['state','authoredClosure'],
    REVEAL:['access','collision','exitReady','voluntary'],
    ENTER:['access','collision','exitReady'],
    FOCUS_RELEASE:[],
    EXIT:[],
    INTERACT:['verified'],
    CLAIM_RECEIPT:['receiptId','verified','mode'],
    SECOND_VISTA:['verified','voluntary','access'],
  };
  function valid(e){
    if(!exact(e,['eventId','kind','data'])||!token(e.eventId)||!Object.hasOwn(fields,e.kind)||!exact(e.data,fields[e.kind]))return false;
    const d=e.data;
    switch(e.kind){
      case 'OBSERVE':return ['PRESERVED','ORIGINAL'].includes(d.reality)&&typeof d.verified==='boolean';
      case 'OPPORTUNITY':return ['WAITING','ELIGIBLE','MISSED_THIS_CYCLE','UNRESOLVED'].includes(d.state)&&typeof d.authoredClosure==='boolean';
      case 'CLAIM_RECEIPT':return token(d.receiptId)&&typeof d.verified==='boolean'&&['NEW_RECEIPT','EXISTING_ENTITLEMENT'].includes(d.mode);
      default:return Object.values(d).every(v=>typeof v==='boolean');
    }
  }
  function reduce(s,e){
    const d=e.data;
    switch(e.kind){
      case 'OPPORTUNITY':
        if(d.state==='MISSED_THIS_CYCLE'&&!d.authoredClosure)return 'CLOSURE_NOT_VERIFIED';
        if(s.opportunity==='MISSED_THIS_CYCLE'&&d.state!=='MISSED_THIS_CYCLE')return 'OPPORTUNITY_CLOSED';
        s.opportunity=d.state;
        if(d.state!=='ELIGIBLE'&&!s.occupied){s.revealed=false;s.focusHeld=false;}
        return null;
      case 'OBSERVE': {
        if(!d.verified||s.opportunity==='MISSED_THIS_CYCLE')return 'OBSERVATION_UNAVAILABLE';
        const k=d.reality==='PRESERVED'?'observed15':'observed18';
        if(s[k])return 'ALREADY_OBSERVED';
        s[k]=true;return null;
      }
      case 'REVEAL':
        if(s.occupied||s.revealed)return 'ALREADY_REVEALED_OR_OCCUPIED';
        if(!s.observed15||!s.observed18||s.opportunity!=='ELIGIBLE'||!d.access||!d.collision||!d.exitReady||!d.voluntary)return 'ENTRY_NOT_READY';
        s.revealed=true;s.focusHeld=true;return null;
      case 'ENTER':
        if(s.occupied||!s.revealed||!s.focusHeld||s.opportunity!=='ELIGIBLE'||!d.access||!d.collision||!d.exitReady)return 'ENTRY_NOT_READY';
        s.occupied=true;return null;
      case 'FOCUS_RELEASE':
        s.focusHeld=false;if(!s.occupied)s.revealed=false;return null;
      case 'EXIT':
        if(!s.occupied)return 'NOT_OCCUPIED';
        s.occupied=false;s.revealed=false;s.focusHeld=false;return null;
      case 'INTERACT':
        if(!s.occupied||s.opportunity!=='ELIGIBLE'||!d.verified)return 'INTERACTION_NOT_VERIFIED';
        if(s.interactionRecorded)return 'INTERACTION_ALREADY_RECORDED';
        s.interactionRecorded=true;return null;
      case 'CLAIM_RECEIPT':
        if(!s.interactionRecorded||!d.verified)return 'CLAIM_NOT_VERIFIED';
        if(s.claimReceipt!==null)return 'CLAIM_ALREADY_RECORDED';
        if(cfg.lifetimeReceipt!==null){
          if(d.mode!=='EXISTING_ENTITLEMENT'||d.receiptId!==cfg.lifetimeReceipt)return 'EXISTING_ENTITLEMENT_REQUIRED';
        }else{
          if(cfg.legacyDone)return 'LEGACY_LEDGER_RECONCILIATION_REQUIRED';
          if(d.mode!=='NEW_RECEIPT')return 'NO_EXISTING_ENTITLEMENT';
        }
        // A verified receipt can arrive after exit or closure. No minting here.
        s.claimReceipt=d.receiptId;return null;
      case 'SECOND_VISTA':
        if(s.secondVista)return 'VISTA_ALREADY_RECORDED';
        if(s.claimReceipt===null||!d.verified||!d.voluntary||!d.access||s.opportunity!=='ELIGIBLE')return 'VISTA_NOT_READY';
        s.secondVista=true;return null;
      default:return 'UNKNOWN_EVENT';
    }
  }
  const seed=()=>({schemaVersion:1,scope:clone(cfg.scope),discoveryId:cfg.discoveryId,contentRevision:cfg.contentRevision,revision:0,events:[]});
  const inspect=(snapshot)=>{
    if(!exact(snapshot,['schemaVersion','scope','discoveryId','contentRevision','revision','events'])||
      snapshot.schemaVersion!==1||!sameScope(snapshot.scope,cfg.scope)||snapshot.discoveryId!==cfg.discoveryId||
      snapshot.contentRevision!==cfg.contentRevision||!Array.isArray(snapshot.events)||
      snapshot.events.length>MAX_EVENTS||snapshot.revision!==snapshot.events.length)return bad('INVALID_SNAPSHOT');
    const state=fresh(), seen=new Map();
    for(const e of snapshot.events){
      if(!valid(e)||seen.has(e.eventId)||reduce(state,e))return bad('INVALID_HISTORY');
      seen.set(e.eventId,e);
    }
    return {ok:true,state,seen};
  };
  const read=snapshot=>{
    const r=inspect(snapshot);if(!r.ok)return r;
    const s=r.state,complete=s.claimReceipt!==null&&s.secondVista;
    return {ok:true,revision:snapshot.revision,state:{...s,
      collisionLease:s.occupied,canExit:s.occupied,
      narrativeComplete:complete||s.legacyDone,
      actualVistaComplete:complete,
      recollectionOutstanding:(s.claimReceipt!==null||s.legacyDone)&&!s.secondVista,
      historicalCompletionPreserved:s.legacyDone,
      // Recovery of an occupied checkpoint needs real collision/egress preflight.
      occupiedRecoveryRequiresPreflight:s.occupied,
      lifetimeEntitlementKnown:cfg.lifetimeReceipt!==null||s.claimReceipt!==null}};
  };
  const submit=(snapshot,request)=>{
    if(!cfg.enabled)return bad('DISABLED');
    if(!exact(request,['scope','expectedRevision','event'])||!sameScope(request.scope,cfg.scope)||
       !Number.isSafeInteger(request.expectedRevision)||request.expectedRevision<0||!valid(request.event))return bad('INVALID_REQUEST');
    const r=inspect(snapshot);if(!r.ok)return r;
    const e=request.event,prior=r.seen.get(e.eventId);
    if(prior)return prior.kind===e.kind&&fields[e.kind].every(k=>prior.data[k]===e.data[k])?
      {ok:true,duplicate:true,snapshot:clone(snapshot)}:bad('EVENT_ID_CONFLICT');
    if(request.expectedRevision!==snapshot.revision)return bad('STALE_REVISION');
    if(snapshot.events.length>=MAX_EVENTS)return bad('JOURNAL_LIMIT');
    const reason=reduce(r.state,e);if(reason)return bad(reason);
    const next=clone(snapshot);next.events.push(clone(e));next.revision++;
    if(JSON.stringify(next).length>MAX_BYTES)return bad('JOURNAL_LIMIT');
    return {ok:true,duplicate:false,snapshot:next};
  };
  const encode=snapshot=>{const r=inspect(snapshot);if(!r.ok)return r;
    const data=JSON.stringify(snapshot);return data.length<=MAX_BYTES?{ok:true,data}:bad('JOURNAL_LIMIT');};
  const decode=data=>{if(typeof data!=='string'||data.length>MAX_BYTES)return bad('INVALID_SERIALIZED_SNAPSHOT');
    let snapshot;try{snapshot=JSON.parse(data);}catch{return bad('INVALID_SERIALIZED_SNAPSHOT');}
    const r=inspect(snapshot);return r.ok?{ok:true,snapshot}:r;};
  return Object.freeze({newSnapshot:seed,read,submit,encode,decode});
}
