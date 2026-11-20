// Internal-only opt-in world PvP state machine and verified announcement outbox.
// This is NOT a browser API and does not turn client-side hit events into damage.
// A deployment must provide trusted session/pose and receipt resolvers, a durable
// flag/receipt store, and transport before enabling open-world player damage.
import {WORLD_PVP_MODE,resolveWorldPvpZone,canWorldPvpAttack}
  from '../../src/components/game3d/pvp/WorldPvpRules.mjs';
import {worldAnnouncementFromReceipt}
  from '../../src/components/game3d/notifications/WorldAnnouncementModel.mjs';

const validIdentity=id=>typeof id==='string'&&/^[A-Za-z0-9_.:-]{1,128}$/.test(id);
const validFlag=mode=>mode===WORLD_PVP_MODE.PVE||mode===WORLD_PVP_MODE.PVP;
const deny=reason=>Object.freeze({ok:false,reason});
const cloneEvent=(kind,data,seq,now)=>Object.freeze({
  ...data,kind,id:'world-event-'+seq,sequence:seq,occurredAt:now,verified:true,
});

export function createGame3DWorldPvpAuthority({
  resolveTrustedActor,verifyCombatReceipt,verifyWorldEvent,now=Date.now,
  onAnnouncement=()=>{},
}={}){
  if(typeof resolveTrustedActor!=='function'||typeof now!=='function')
    throw Error('World PvP requires a trusted session and position resolver');
  // In-memory storage is suitable only for single-process tests/staging.
  // Real deployment must replace it with instance-scoped durable state.
  const flags=new Map(),streaks=new Map(),receipts=new Set(),events=[];
  let sequence=0;
  const lookup=async token=>{
    if(!token)return null;
    let actor;
    try{actor=await resolveTrustedActor(token)}catch{return null}
    if(actor?.trusted!==true||!validIdentity(actor.id)||
       !validIdentity(actor.instanceId))return null;
    return Object.freeze({...actor,mode:flags.get(actor.id)||WORLD_PVP_MODE.PVE});
  };
  const broadcast=(kind,raw)=>{
    const display=worldAnnouncementFromReceipt({kind,...raw});
    if(!display)return null;
    const record=cloneEvent(kind,{...raw,...display},++sequence,now());
    events.push(record);
    if(events.length>100)events.shift();
    try{onAnnouncement(record)}catch{/* presentation cannot undo commit */}
    return record;
  };
  const getStatus=async token=>{
    const actor=await lookup(token);
    if(!actor)return deny('unverified_session');
    const zone=resolveWorldPvpZone(actor);
    return Object.freeze({ok:true,mode:actor.mode,zone,playerKiller:(streaks.get(actor.id)||0)>0,
      streak:streaks.get(actor.id)||0});
  };
  const setFlag=async(token,mode)=>{
    const actor=await lookup(token);
    if(!actor)return deny('unverified_session');
    if(!validFlag(mode))return deny('invalid_mode');
    flags.set(actor.id,mode);
    return Object.freeze({ok:true,mode,zone:resolveWorldPvpZone(actor),
      // Safe zones always block player damage even while the PvP flag stays on.
      effectivePvp:resolveWorldPvpZone(actor).kind==='opt_in'&&mode==='pvp'});
  };
  const assessAttack=async(attackerToken,defenderToken)=>{
    const [a,b]=await Promise.all([lookup(attackerToken),lookup(defenderToken)]);
    if(!a||!b)return deny('unverified_session');
    return canWorldPvpAttack({attacker:a,defender:b,
      attackerZone:resolveWorldPvpZone(a),defenderZone:resolveWorldPvpZone(b)});
  };
  const commitElimination=async({attackerToken,defenderToken,receipt}={})=>{
    const [attacker,defender]=await Promise.all([lookup(attackerToken),lookup(defenderToken)]);
    if(!attacker||!defender)return deny('unverified_session');
    const eligibility=canWorldPvpAttack({attacker,defender,
      attackerZone:resolveWorldPvpZone(attacker),defenderZone:resolveWorldPvpZone(defender)});
    if(!eligibility.ok)return eligibility;
    if(typeof verifyCombatReceipt!=='function')return deny('combat_authority_unavailable');
    let proof;
    try{proof=await verifyCombatReceipt({receipt,attacker,defender})}
    catch{return deny('combat_receipt_unverified')}
    if(!proof||proof.verified!==true||!validIdentity(proof.id)||
       proof.killerId!==attacker.id||proof.victimId!==defender.id||
       proof.instanceId!==attacker.instanceId||
       proof.fatal!==true)return deny('combat_receipt_unverified');
    if(receipts.has(proof.id))return deny('duplicate_combat_receipt');
    receipts.add(proof.id);
    const streak=(streaks.get(attacker.id)||0)+1;
    streaks.set(attacker.id,streak);
    streaks.set(defender.id,0);
    const announcements=[broadcast('player_kill',{
      actorName:attacker.displayName||attacker.id,
      targetName:defender.displayName||defender.id,
    })];
    if(streak===3||streak===5||streak===10||streak>10&&streak%5===0)
      announcements.push(broadcast('killing_spree',{
        actorName:attacker.displayName||attacker.id,streak,
      }));
    return Object.freeze({ok:true,playerKiller:true,streak,
      announcements:announcements.filter(Boolean)});
  };
  const commitAchievement=async(candidate)=>{
    if(typeof verifyWorldEvent!=='function')return deny('event_authority_unavailable');
    let proven;
    try{proven=await verifyWorldEvent(candidate)}
    catch{return deny('world_event_unverified')}
    if(proven?.verified!==true||
       !['item_acquired','dungeon_cleared'].includes(proven.kind)||
       !validIdentity(proven.receiptId))return deny('world_event_unverified');
    if(receipts.has(proven.receiptId))return deny('duplicate_world_receipt');
    const projected=worldAnnouncementFromReceipt(proven);
    if(!projected)return deny('invalid_world_announcement');
    receipts.add(proven.receiptId);
    return Object.freeze({ok:true,announcement:broadcast(proven.kind,{
      actorName:proven.actorName,itemName:proven.itemName,dungeonName:proven.dungeonName,
    })});
  };
  const readAnnouncements=(since=0,limit=15)=>{
    const cursor=Number.isSafeInteger(since)&&since>=0?since:0;
    const count=Number.isSafeInteger(limit)?Math.max(1,Math.min(limit,30)):15;
    return events.filter(e=>e.sequence>cursor).slice(-count);
  };
  return Object.freeze({getStatus,setFlag,assessAttack,commitElimination,
    commitAchievement,readAnnouncements,
    // Integration guard: never report open-world combat as production-ready
    // until a trusted world strike resolver and durable ledger are installed.
    productionReady:false});
}
