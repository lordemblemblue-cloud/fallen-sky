import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Swords, Trophy, Skull } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import toast from 'react-hot-toast';
import { getPvpAttackRange } from '../pvpCombatRules';
import { setCombatFlag } from '../talents/advancedClassStore';
import { strikeInDuel, beginDuelSkillCast, beginDuelSkillCharge, castDuelShield, syncDuelPosition, fetchDuelCombatEvents, requestDedicatedDuel, cancelDedicatedHandoff } from './duelChallenge';
import { connectDedicatedDuelPreview,readCommittedDedicatedDuel } from './dedicatedDuelClient';
import DedicatedDuelArchiveHistory from './DedicatedDuelArchiveHistory';

/**
 * DuelSystem — global handler for the active duel between two players.
 *
 * - Listens to DuelSession entity changes for the local user.
 * - Renders a red ring under both duelers via dispatching `duelMarker` events
 *   that GameWorld3D picks up (renders the red circle in-world).
 * - Each attack on the locked opponent within range goes to the duel server
 *   (duelSystem), which rolls and resolves it with the game's combat rules
 *   against both duelists' stats and decides the result. Win/lose screen shows
 *   when status flips to finished.
 */
export default function DuelSystem({ userId }) {
  const [duel, setDuel] = useState(null); // active DuelSession row
  const [result, setResult] = useState(null); // { won: bool, opponentName }
  const [shieldNow, setShieldNow] = useState(Date.now());
  const duelRef = useRef(null);
  const dedicatedRef = useRef(null);
  const [dedicatedSnapshot,setDedicatedSnapshot] = useState(null);
  const [dedicatedConnection,setDedicatedConnection] = useState('offline');
  const [durableCheckpoint,setDurableCheckpoint] = useState(null);
  const journalReadOptIn=import.meta.env.VITE_GAME3D_COMBAT_READ_OPTIN==='true';
  const journalLifecycleOptIn=import.meta.env.VITE_GAME3D_COMBAT_LIFECYCLE_OPTIN==='true';
  const completedDedicatedDuels=useRef(new Set());
  const [handoffRequesting,setHandoffRequesting] = useState(false);
  const dedicatedOptInVisible = import.meta.env.VITE_GAME3D_DEDICATED_OPTIN === 'true';

  // Terminal lifecycle is taken ONLY from a participant-authorized read of a
  // committed PostgreSQL terminal journal record, never worker animation or
  // stale Base44 status. This ref blocks re-opening the old Base44 active row.
  const finishDedicatedFromJournal=(data,session)=>{
    const life=data?.lifecycle;
    if(!journalLifecycleOptIn||!session||!life?.finished||
       !life?.resultId||life.duelId!==session.id||
       ![session.challenger_id,session.opponent_id].includes(userId)||
       ![null,session.challenger_id,session.opponent_id].includes(life.winnerId)||
       life.rewardsEligible!==false||life.rewardsIssued!==false)
      return false;
    if(completedDedicatedDuels.current.has(session.id))return true;
    completedDedicatedDuels.current.add(session.id);
    const opponentName=session.challenger_id===userId
      ?session.opponent_name:session.challenger_name;
    setResult({won:life.draw?null:life.winnerId===userId,
      draw:!!life.draw,opponentName:opponentName||'Opponent',
      journalOnly:true,resultId:life.resultId});
    setDuel(null);
    duelRef.current=null;
    return true;
  };

  // Frame-only bridge: the world may mirror authenticated worker snapshots,
  // but never sends model coordinates back as combat authority.
  useEffect(()=>{
    const active=duel?.dedicated_mode==='dedicated'
      ? {matchId:duel.id} : null;
    window.__game3dDedicatedMode=active;
    if(!active)window.__game3dDedicatedPose=null;
    window.dispatchEvent(new CustomEvent('game3dDedicatedMode',{detail:active}));
    if(active)window.dispatchEvent(new CustomEvent('axeMountForceDismount'));
    return ()=>{
      if(window.__game3dDedicatedMode===active){
        window.__game3dDedicatedMode=null;
        window.__game3dDedicatedPose=null;
        window.dispatchEvent(new CustomEvent('game3dDedicatedMode',{detail:null}));
      }
    };
  },[duel?.id,duel?.dedicated_mode]);

  // Presentation only: Game 3D event sounds play the victory sting for a shown win.
  useEffect(()=>{
    if(!result)return;
    window.dispatchEvent(new CustomEvent('axeDuelResult',{
      detail:{won:result.won===true,draw:!!result.draw},
    }));
  },[result]);

  // Hydrate + subscribe to duels involving me
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    // Every server hit has a duel-local receipt ID. Ignore replays from
    // subscription rehydration and position-only row updates.
    const seenReceipts = new Set();
    const handleCombatReceipt = d => {
      const receipt = d?.duel_combat_event;
      if (!d?.id || !receipt || typeof receipt.id !== 'string') return;
      // Unique receipt identity, NOT the best-effort combat sequence: two
      // concurrent writers can legitimately claim the same session seq.
      if (seenReceipts.has(receipt.id)) return;
      seenReceipts.add(receipt.id);
      if (seenReceipts.size > 180) seenReceipts.delete(seenReceipts.values().next().value);
      // Replays can restore history after reconnect without flashing attacks
      // from several minutes ago onto a newly loaded avatar.
      if (!Number.isFinite(Number(receipt.at)) ||
          Date.now() - Number(receipt.at) > 6500 ||
          Number(receipt.at) > Date.now() + 2000) return;
      if (receipt.defenderId !== userId) return;
      window.dispatchEvent(new CustomEvent('axeDuelDefenseResolved', {
        detail: {
          duelId:d.id, receiptId:receipt.id,
          hpDamage:receipt.hpDamage || 0,
          shieldAbsorbed:receipt.shieldAbsorbed || 0,
          shieldPierced:receipt.shieldPierced || 0,
          blocked:!!receipt.blocked, critical:!!receipt.critical,
          kind:receipt.kind, attackerId:receipt.attackerId,
        },
      }));
      if (receipt.shieldAbsorbed > 0) {
        toast(`AEGIS absorbed ${receipt.shieldAbsorbed}`, {
          id:'duel-defended',duration:950,
        });
      } else if (receipt.blocked) {
        toast('Blocked incoming strike', {id:'duel-defended',duration:850});
      }
    };

    const refresh = async () => {
      try {
        const [asA, asB] = await Promise.all([
          base44.entities.DuelSession.filter({ challenger_id: userId, status: 'active' }),
          base44.entities.DuelSession.filter({ opponent_id: userId, status: 'active' }),
        ]);
        if (cancelled) return;
        const active = [...(asA || []), ...(asB || [])][0] || null;
        if(active?.dedicated_mode==='dedicated'&&journalLifecycleOptIn){
          if(completedDedicatedDuels.current.has(active.id)){
            setDuel(null);duelRef.current=null;return;
          }
          try{
            const authoritative=await readCommittedDedicatedDuel(active.id);
            if(cancelled)return;
            if(finishDedicatedFromJournal(authoritative,active))return;
          }catch{
            // Do not fabricate a terminal winner. The periodic read below
            // retries if Base44 still lists the dedicated duel as active.
          }
        }
        if (cancelled)return;
        if(active?.dedicated_mode==='dedicated'&&
           completedDedicatedDuels.current.has(active.id))return;
        if (active?.duel_combat_event?.id)
          seenReceipts.add(active.duel_combat_event.id);
        if (active && Number(active.duel_combat_seq || 0) <
            Number(duelRef.current?.duel_combat_seq || 0)) return;
        setDuel(active);
        duelRef.current = active;
      } catch (e) { console.warn('[Duel] refresh', e); }
    };

    refresh();
    const unsub = base44.entities.DuelSession.subscribe((event) => {
      const d = event.data;
      if (!d) return;
      if (d.challenger_id !== userId && d.opponent_id !== userId) return;
      if(d.dedicated_mode==='dedicated'&&journalLifecycleOptIn){
        if(completedDedicatedDuels.current.has(d.id))return;
        if(d.status==='finished'){
          // An unfenced legacy/Base44 status must never override a
          // committed PostgreSQL winner, even if it arrives first.
          void readCommittedDedicatedDuel(d.id).then(value=>{
            if(!cancelled)finishDedicatedFromJournal(value,d);
          }).catch(()=>{});
          return;
        }
      }
      handleCombatReceipt(d);

      if (d.status === 'finished') {
        // Show win/lose screen + dismiss the duel
        if (d.winner_id === userId) {
          setResult({ won: true, opponentName: d.winner_id === d.challenger_id ? d.opponent_name : d.challenger_name });
        } else if (d.loser_id === userId) {
          setResult({ won: false, opponentName: d.winner_id === d.challenger_id ? d.challenger_name : d.opponent_name });
        }
        setDuel(null);
        duelRef.current = null;
      } else if (d.status === 'active') {
        if(d.dedicated_mode==='dedicated'&&
           completedDedicatedDuels.current.has(d.id))return;
        // Stale/reordered position-only updates must not roll back a newer
        // server-resolved health/shield result on this client.
        if (Number(d.duel_combat_seq || 0) <
            Number(duelRef.current?.duel_combat_seq || 0)) return;
        setDuel(d);
        duelRef.current = d;
      }
    });
    const onJournalDelivery = event => {
      const { duelId, receipts, authoritative } = event.detail || {};
      const current = duelRef.current;
      if (cancelled || !duelId || current?.id !== duelId ||
          current.dedicated_mode==='dedicated') return;
      for (const receipt of Array.isArray(receipts) ? receipts : []) {
        handleCombatReceipt({ id:duelId, duel_combat_event:receipt });
      }
      if (Number(authoritative?.duel_combat_seq || 0) <
          Number(current.duel_combat_seq || 0)) return;
      if (authoritative?.status === 'finished') {
        // A missed terminal subscription must not leave the defeated
        // player stuck in an endless active duel on their next reconnect.
        const winner = authoritative.winner_id;
        if (winner === userId) {
          setResult({won:true,opponentName:
            current.challenger_id === userId ? current.opponent_name : current.challenger_name});
        } else if (authoritative.loser_id === userId) {
          setResult({won:false,opponentName:
            current.challenger_id === userId ? current.opponent_name : current.challenger_name});
        }
        setDuel(null);
        duelRef.current=null;
      } else if (authoritative?.status === 'active') {
        const updated = { ...current, ...authoritative };
        duelRef.current = updated;
        setDuel(updated);
      }
    };
    window.addEventListener('axeDuelJournalDelivery', onJournalDelivery);
    return () => {
      cancelled = true; unsub && unsub();
      window.removeEventListener('axeDuelJournalDelivery', onJournalDelivery);
      seenReceipts.clear();
    };
  }, [userId,journalLifecycleOptIn]);

  // Only after two authenticated opt-in votes do we attach the alternate
  // worker. The legacy service rejects hit writes for preparing/dedicated
  // duels, so this client must never send combat through both authorities.
  useEffect(() => {
    if (!duel?.id || duel.dedicated_mode !== 'dedicated') {
      dedicatedRef.current?.close();
      dedicatedRef.current=null;
      setDedicatedSnapshot(null);
      setDedicatedConnection('offline');
      return undefined;
    }
    let disposed=false,attempts=0,retryTimer=null;
    const seen=new Set();
    const connect=async()=>{
      if(disposed)return;
      setDedicatedConnection('connecting');
      try{
        const session=await connectDedicatedDuelPreview(duel.id,{
          onMessage:message=>{
            if(disposed)return;
            if(message.t==='welcome')setDedicatedConnection('connected');
          },
          onSnapshot:snapshot=>{
            if(!disposed && snapshot?.matchId===duel.id){
              setDedicatedSnapshot(snapshot);
              // The renderer only consumes this projection if the worker
              // included a server-read world origin in its signed handoff.
              const pose={...snapshot,playerId:userId};
              window.__game3dDedicatedPose=pose;
              window.dispatchEvent(new CustomEvent('game3dDedicatedPose',{detail:pose}));
            }
          },
          onEvents:events=>{
            for(const event of events||[]){
              if(disposed||!event?.eventId||seen.has(event.eventId))continue;
              seen.add(event.eventId);
              if(seen.size>150)seen.delete(seen.values().next().value);
              if(event.targetId!==userId ||
                  !['strike','basic','skill_hit'].includes(event.kind))continue;
              window.dispatchEvent(new CustomEvent('axeDuelDefenseResolved',{
                detail:{duelId:duel.id,receiptId:event.eventId,
                  hpDamage:event.hpDamage||0,
                  shieldAbsorbed:event.shieldAbsorbed||0,
                  blocked:!!event.blocked,critical:!!event.critical},
              }));
            }
          },
          onClose:()=>{
            if(disposed)return;
            dedicatedRef.current=null;
            setDedicatedConnection('reconnecting');
            if(++attempts<=6)
              retryTimer=setTimeout(connect,Math.min(8000,attempts*1200));
            else setDedicatedConnection('unavailable');
          },
        });
        if(disposed)session.close();
        else dedicatedRef.current=session;
      }catch(err){
        if(disposed)return;
        if(err?.code==='dedicated_match_archived'){
          // No more tickets for a PG-archived duel even if Base44 still
          // advertises the old session as active. Only the separate,
          // authenticated journal lifecycle read may display a winner.
          setDedicatedConnection('archived');
          if(journalLifecycleOptIn){
            void readCommittedDedicatedDuel(duel.id).then(data=>{
              if(!disposed)finishDedicatedFromJournal(data,duel);
            }).catch(()=>{});
          }
          return;
        }
        // If PostgreSQL is temporarily down, do not fall back to
        // the legacy damage path. The existing bounded retry applies.
        setDedicatedConnection('unavailable');
        if(++attempts<=6)
          retryTimer=setTimeout(connect,Math.min(8000,attempts*1200));
      }
    };
    connect();
    return()=>{
      disposed=true;
      if(retryTimer)clearTimeout(retryTimer);
      dedicatedRef.current?.close();
      dedicatedRef.current=null;
    };
  },[duel?.id,duel?.dedicated_mode,userId]);

  // 4.2 journal-backed lifecycle reconciliation runs even if WebSocket stays
  // connected. A worker 'finished' snapshot alone is NOT a saved match result.
  // The PostgreSQL terminal record is the winner/loser source of truth.
  useEffect(()=>{
    if(!journalLifecycleOptIn||!duel?.id||duel.dedicated_mode!=='dedicated')
      return undefined;
    const session=duel;
    let disposed=false,running=false;
    const reconcile=async()=>{
      if(disposed||running||completedDedicatedDuels.current.has(session.id))return;
      running=true;
      try{
        const committed=await readCommittedDedicatedDuel(session.id);
        if(!disposed)finishDedicatedFromJournal(committed,session);
      }catch{
        // Preserve the last live worker snapshot but never award or claim a
        // winner from an unavailable ledger; keep retrying while mounted.
      }finally{running=false;}
    };
    void reconcile();
    const timer=setInterval(reconcile,3500);
    return()=>{disposed=true;clearInterval(timer);};
  },[journalLifecycleOptIn,duel?.id,duel?.dedicated_mode,userId]);

  // Authenticated read-only fallback after a dropped dedicated connection.
  // Never use the last committed checkpoint as live positions, combat inputs
  // or proof that a user has received XP or item rewards.
  useEffect(()=>{
    if(!journalReadOptIn||!duel?.id||duel.dedicated_mode!=='dedicated'||
       dedicatedConnection==='connected'){
      setDurableCheckpoint(null);
      return undefined;
    }
    let disposed=false;
    const load=async()=>{
      try{
        const value=await readCommittedDedicatedDuel(duel.id);
        if(!disposed)setDurableCheckpoint(value);
      }catch{
        if(!disposed)setDurableCheckpoint(null);
      }
    };
    void load();
    const timer=setInterval(load,6000);
    return()=>{disposed=true;clearInterval(timer);};
  },[journalReadOptIn,duel?.id,duel?.dedicated_mode,dedicatedConnection]);

  // Low-frequency reconciliation, independent of the last-only entity
  // subscription. Recover recent confirmed strikes after dropped updates.
  useEffect(() => {
    if (!duel?.id || !userId || duel.dedicated_mode === 'dedicated')
      return undefined;
    const duelId = duel.id;
    let disposed = false;
    let pending = false;
    const reconcile = async () => {
      if (pending || disposed) return;
      pending = true;
      try {
        const response = await fetchDuelCombatEvents(duelId);
        if (!disposed && response?.success) {
          window.dispatchEvent(new CustomEvent('axeDuelJournalDelivery', {
            detail: { duelId, receipts:response.receipts,
              authoritative:response.authoritative },
          }));
        }
      } catch (_) {
        // The DuelSession subscription remains operational if the optional
        // event journal has not yet been provisioned.
      } finally { pending = false; }
    };
    reconcile();
    const interval = setInterval(reconcile, 3500);
    return () => { disposed = true; clearInterval(interval); };
  }, [duel?.id, duel?.dedicated_mode, userId]);

  useEffect(() => {
    if (!duel) return undefined;
    const interval = setInterval(() => setShieldNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [!!duel]);

  // Advanced Classes cannot be switched during an active duel.
  useEffect(() => {
    setCombatFlag('dueling', !!duel);
    return () => setCombatFlag('dueling', false);
  }, [!!duel]);

  // Broadcast the duel pair so GameWorld3D can draw red circles under both players.
  // Also expose the active duel to middleClickHandler via a global flag.
  useEffect(() => {
    if (duel && userId) {
      const opponentId = duel.challenger_id === userId ? duel.opponent_id : duel.challenger_id;
      window.__activeDuel = { duelId: duel.id, opponentId };
    } else {
      window.__activeDuel = null;
    }
    window.dispatchEvent(new CustomEvent('duelMarker', {
      detail: duel ? {
        active: true,
        challengerId: duel.challenger_id,
        opponentId: duel.opponent_id,
      } : { active: false },
    }));
  }, [duel?.id, duel?.challenger_id, duel?.opponent_id, userId]);

  // Handle locked-target PvP damage. Middle-click only selects/locks the
  // opponent; basic attacks and offensive abilities dispatch `duelAttack`.
  useEffect(() => {
    if (!userId) return;
    const casts = new Map();
    const charges = new Map();
    let registerSequence = Promise.resolve();
    // A single local command queue spans basic hits and ALL skill casts.
    // Server-wide serialization still requires atomic persistence later.
    let combatSequence = Promise.resolve();
    let lastSubmittedIntentSeq = 0;
    let lastIntentDuelId = null;
    let lastPositionSentAt=0;
    let positionPending=false;
    let positionDuelId=null;
    // Position updates are batched to <=4/s, independent from animation rate.
    // The duel backend stamps every accepted sample and derives the distance
    // from BOTH duelists' samples when validating a strike.
    const onLocalMovement = e => {
      const d=duelRef.current;
      if (!d || d.status !== 'active' || d.dedicated_mode==='preparing')return;
      const point=e.detail;
      if(d.dedicated_mode==='dedicated'){
        const current=Date.now();
        if(current-lastPositionSentAt>=100){
          lastPositionSentAt=current;
          dedicatedRef.current?.setMovement({
            x:Number(point?.duelMoveX)||0,
            z:Number(point?.duelMoveZ)||0,
            facing:Number(point?.combatFacing)||0,
          });
        }
        return;
      }
      if (!point || !Number.isFinite(point.x) ||
          !Number.isFinite(point.y) || !Number.isFinite(point.z)) return;
      const now=Date.now();
      if (positionDuelId !== d.id) {
        positionDuelId=d.id;
        lastPositionSentAt=0;
        positionPending=false;
      }
      if (positionPending || now-lastPositionSentAt<250) return;
      lastPositionSentAt=now;
      positionPending=true;
      syncDuelPosition(d.id,{x:point.x,y:point.y,z:point.z})
        .catch(err => {
          // Rejections (speed, invalid sample, duel ended) are recoverable;
          // server range gating will reject stale movement until resynced.
          if (!['position_too_frequent','not_active'].includes(err?.code))
            console.warn('[Duel] position sample rejected',err?.code||err?.message);
        })
        .finally(() => {positionPending=false;});
    };
    const onShieldCast = e => {
      const duelId = e.detail?.duelId;
      if (!duelId || duelRef.current?.id !== duelId ||
          duelRef.current.dedicated_mode==='preparing') return;
      // Shield and strike go through the SAME owning worker when handed off.
      const worker=duelRef.current.dedicated_mode==='dedicated'
        ? dedicatedRef.current:null;
      if(duelRef.current.dedicated_mode==='dedicated'&&!worker)return;
      const request = combatSequence.then(() => worker
        ? worker.sendCommand('shield') : castDuelShield(duelId));
      combatSequence = request.then(() => {}, () => {});
      request.then(reply => {
        if (!(reply?.success||reply?.ok) || duelRef.current?.id !== duelId)return;
        if (reply.duel) { setDuel(reply.duel); duelRef.current = reply.duel; }
        toast('AEGIS shield active', { id: 'duel-shield', duration: 1200 });
      }, err => {
        toast.error(err?.code === 'skill_cooldown'
          ? 'Duel shield is on cooldown'
          : 'Duel server refused shield activation',
          { id: 'duel-shield-refused', duration: 1400 });
      });
    };
    const onChargeStart = (e) => {
      const { chargeId, skillId, weaponPath, duelId } = e.detail || {};
      if (!chargeId || !skillId || charges.has(chargeId) ||
          duelRef.current?.id !== duelId ||
          duelRef.current.dedicated_mode==='preparing') return;
      const mode=duelRef.current.dedicated_mode;
      const promise = registerSequence
        .then(() => mode==='dedicated'
          ? dedicatedRef.current?.sendCommand('charge_begin',
              { chargeId,skillId,weaponPath })
          : beginDuelSkillCharge(duelId,{chargeId,skillId,weaponPath}))
        .then(reply => reply?.success===true||reply?.ok===true,()=>false);
      registerSequence = promise.then(() => {});
      charges.set(chargeId, { promise, createdAt: Date.now() });
      for (const [id, item] of charges) {
        if (Date.now() - item.createdAt > 14000) charges.delete(id);
      }
    };
    const onSkillCast = (e) => {
      const { castId, skillId, weaponPath, duelId, chargeId, chainFromCastId } = e.detail || {};
      const duel = duelRef.current;
      if (!duel || duel.id !== duelId || !castId || !skillId ||
          casts.has(castId) || duel.dedicated_mode==='preparing') return;
      // Server receives an allowlisted skill identity and its cast ID, but
      // *never* trusts the browser's damage, mastery, charge, or chain bonuses.
      // Register in order, avoiding concurrent cast-start writes for the
      // same local duelist. Resolve failures to false so abandoned casts
      // cannot leave unhandled network promise rejections.
      const held = chargeId ? charges.get(chargeId) : null;
      const promise = registerSequence
        .then(async () => {
          const chargeRegistered = held ? await held.promise : false;
          if (chargeId) charges.delete(chargeId);
          const args={castId,skillId,weaponPath,
            ...(chargeRegistered?{chargeId}:{}),
            ...(chainFromCastId?{chainFromCastId}:{})};
          return duel.dedicated_mode==='dedicated'
            ? dedicatedRef.current?.sendCommand('cast',args)
            : beginDuelSkillCast(duel.id,args);
        })
        .then(reply => {
          if (reply?.serverTimedChain) {
            toast('Finisher chain recognized · PvP defense break awaits verified mastery', {
              id: 'duel-timed-chain', duration: 1500,
            });
          } else if (reply?.serverTimedCharge) {
            toast('Charge timed by duel server · mastery bonus not yet enabled', {
              id: 'duel-timed-charge', duration: 1500,
            });
          }
          return reply?.success === true || reply?.ok === true;
        }, err => {
          // The local animation may play even if the server refuses the cast.
          // Tell the player rather than silently pretending the strike landed.
          toast.error('That skill could not be used in this duel', {
            id: 'duel-skill-refused', duration: 1400,
          });
          if (err?.code !== 'skill_cooldown') console.warn('[Duel] cast refused', err?.code);
          return false;
        });
      registerSequence = promise.then(() => {});
      casts.set(castId, { promise, sequence: Promise.resolve(), createdAt: Date.now() });
      // Bound the client map. Server receipts have their own expiry and cap.
      for (const [key, item] of casts) if (Date.now() - item.createdAt > 15000) casts.delete(key);
    };
    const onDuelAttack = async (e) => {
      const targetId = e.detail?.targetPlayerId;
      const distance = Number(e.detail?.distance ?? Infinity); // local only; backend ignores it
      const weaponPath = e.detail?.weaponPath || 'damage';
      const lockedTargetId = e.detail?.lockedTargetId || null;
      const d = duelRef.current;
      if (!d || !targetId || d.dedicated_mode==='preparing')return;

      // Verify target is the other duelist AND the exact player currently locked.
      const otherId = d.challenger_id === userId ? d.opponent_id : d.challenger_id;
      if (targetId !== otherId || lockedTargetId !== otherId) return;

      // Damage range is weapon-class specific:
      // damage + defense = melee (3m), ranged = 7m.
      const maxRange = getPvpAttackRange(weaponPath);
      if (d.dedicated_mode!=='dedicated'&&
          (!Number.isFinite(distance)||distance>maxRange))return;

      const source = e.detail?.source || 'basic_attack';
      const castId = String(e.detail?.castId || '');
      const cast = source === 'ability' ? casts.get(castId) : null;
      // Skill hits are only submitted after their server cast receipt exists.
      // A failed or absent receipt drops the entire skill; no fallback to
      // client-calculated damage is possible.
      if (source === 'ability' && !cast) return;
      const sendHit = async () => {
        if (source === 'ability' && !(await cast.promise)) return;
        if (duelRef.current?.id !== d.id) return;
        if(d.dedicated_mode==='dedicated'){
          // No Base44 damage submission in dedicated mode, even if the
          // worker is temporarily disconnected. Fail closed.
          const worker=dedicatedRef.current;
          if(!worker)return;
          const outcome=await worker.sendCommand(
            source==='ability'?'skill_hit':'basic',
            source==='ability'
              ?{castId,hitIndex:Number(e.detail?.hitIndex),weaponPath}
              :{weaponPath});
          if(!outcome?.ok&&outcome?.reason==='out_of_range')
            toast('Outside authoritative attack range',{id:'duel-range',duration:800});
          return;
        }
        if (lastIntentDuelId !== d.id) {
          lastIntentDuelId = d.id;
          lastSubmittedIntentSeq = 0;
        }
        const version3 = Number(duelRef.current?.duel_protocol_version || 0) >= 3;
        const intentSeq = version3 ? Math.max(lastSubmittedIntentSeq,
          Number(duelRef.current?.duel_intent_seq?.[userId] || 0)) + 1 : null;
        const intentId = version3
          ? `axehi${Date.now().toString(36)}_${Math.random().toString(36).slice(2,13)}` : null;
        const swing = {
          distance, weaponPath,
          source,
          ...(version3 ? {intentId,intentSeq} : {}),
          ...(source === 'ability'
            ? { castId, hitIndex: Number(e.detail?.hitIndex) }
            : { skillMultiplier: 1 }),
        };
        let accepted = null;
        // On a delayed registration, the server's first accepted hit may
        // arrive before its own earliest timestamp for hit 2/3. Retry only
        // that explicit timing refusal (never damage/cooldown/target errors).
        for (let attempt = 0; attempt < (cast ? 3 : 1); attempt++) {
          if (duelRef.current?.id !== d.id) return;
          try {
            accepted = await strikeInDuel(d.id, swing);
            break;
          } catch (err) {
            if (err?.code !== 'hit_too_early' || attempt >= 2) throw err;
            const delay = Math.max(35, Math.min(500,
              Number(err?.body?.retryAfterMs) + 20 || 85));
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        }
        if (!accepted) return;
        if (version3 && accepted.success) lastSubmittedIntentSeq = intentSeq;
        const { hit, duel: next } = accepted;
        // The server response is authoritative; local VFX must never infer
        // successful damage from the outgoing animation alone.
        if (next?.status === 'active' &&
            Number(next.duel_combat_seq || 0) >=
            Number(duelRef.current?.duel_combat_seq || 0)) {
          setDuel(next); duelRef.current = next;
        }
        if (hit?.shieldAbsorbed > 0) {
          toast(`Shield absorbed ${hit.shieldAbsorbed}${hit.shieldPierced ? ` · ${hit.shieldPierced} pierced` : ''}`,
            { id: 'duel-shield-impact', duration: 900 });
        }
        if (hit?.missed) toast('Miss', { id: 'duel-swing', icon: '💨', duration: 700 });
        else if (hit?.blocked && !hit?.hpDamage) {
          toast('Attack blocked', {id:'duel-swing',duration:850});
        } else if (hit?.shieldAbsorbed > 0 && !hit?.hpDamage) {
          toast('AEGIS held', {id:'duel-swing',duration:850});
        } else if (hit?.critical) {
          toast(`Critical! ${hit.hpDamage ?? hit.damage} HP`, {
            id:'duel-swing',icon:'💥',duration:900,
          });
        }
      };
      const sendOrdered = async () => {
        try {
          // Every outgoing hit shares this ordering, regardless of weapon,
          // skill combo or basic attack. Unregistered skill casts still drop.
          await sendHit();
        } catch (err) {
          if (err?.code === 'position_stale') {
            toast('Synchronizing duel positions…', {id:'duel-sync',duration:850});
          } else if (err?.code === 'stale_intent_sequence') {
            toast('Duel command out of sync · waiting for server state', {
              id:'duel-sync',duration:1200,
            });
          } else if (err?.code !== 'too_fast' && err?.code !== 'hit_too_early') {
            console.warn('[Duel] hit refused', err?.code, err?.message);
          }
        }
      };
      const next = combatSequence.then(sendOrdered);
      combatSequence = next.then(() => {}, () => {});
      await next;
    };
    window.addEventListener('multiplayerLocalUpdate', onLocalMovement);
    window.addEventListener('axeDuelShieldCast', onShieldCast);
    window.addEventListener('axeDuelChargeStart', onChargeStart);
    window.addEventListener('axeDuelSkillCast', onSkillCast);
    window.addEventListener('duelAttack', onDuelAttack);
    return () => {
      window.removeEventListener('multiplayerLocalUpdate', onLocalMovement);
      window.removeEventListener('axeDuelShieldCast', onShieldCast);
      window.removeEventListener('axeDuelChargeStart', onChargeStart);
      window.removeEventListener('axeDuelSkillCast', onSkillCast);
      window.removeEventListener('duelAttack', onDuelAttack);
      casts.clear();
      charges.clear();
    };
  }, [userId]);

  const dedicatedMode = duel?.dedicated_mode==='dedicated';
  const workerMe = dedicatedMode ? dedicatedSnapshot?.players?.find(p=>p.id===userId) : null;
  const workerThem = dedicatedMode ? dedicatedSnapshot?.players?.find(p=>p.id!==userId) : null;
  const myHP = workerMe?.hp ?? (duel ? (duel.challenger_id===userId ? duel.challenger_hp:duel.opponent_hp):0);
  const theirHP = workerThem?.hp ?? (duel ? (duel.challenger_id===userId ? duel.opponent_hp:duel.challenger_hp):0);
  const theirName = duel ? (duel.challenger_id === userId ? duel.opponent_name : duel.challenger_name) : '';
  // each duelist fights with their own max HP (older rows have one shared max_hp)
  const mine = duel?.challenger_id === userId ? 'challenger' : 'opponent';
  const theirs = mine === 'challenger' ? 'opponent' : 'challenger';
  const myMaxHP = workerMe?.maxHp ?? (duel ? (duel[`${mine}_max_hp`] || duel.max_hp || 100):100);
  const theirMaxHP = workerThem?.maxHp ?? (duel ? (duel[`${theirs}_max_hp`] || duel.max_hp || 100):100);
  const theirId = duel ? (mine === 'challenger' ? duel.opponent_id : duel.challenger_id) : null;
  const serverPositionReady = dedicatedMode
    ? dedicatedConnection==='connected' && !!workerMe && !!workerThem
    : !!duel && ['challenger_position','opponent_position'].every(key => {
      const recorded = duel[key];
      return recorded && Number.isFinite(Number(recorded.at)) &&
        Math.abs(shieldNow - Number(recorded.at)) < 1600;
    });
  const activeShieldValue = id => {
    if(dedicatedMode){
      const p=dedicatedSnapshot?.players?.find(p=>p.id===id);
      return Math.max(0,Number(p?.shield)||0);
    }
    const shield = duel?.duel_shields?.[id];
    return shield && shieldNow < Number(shield.expiresAt)
      ? Math.max(0, Number(shield.current) || 0) : 0;
  };

  const cancelDedicated = async()=>{
    if(!duel?.id||handoffRequesting)return;
    setHandoffRequesting(true);
    try{
      const reply=await cancelDedicatedHandoff(duel.id);
      if(reply?.success&&reply.duel){
        duelRef.current=reply.duel;setDuel(reply.duel);
        toast('Dedicated handoff canceled; normal duel resumed');
      }
    }catch(_){
      toast.error('Handoff could not be canceled');
    }finally{setHandoffRequesting(false);}
  };
  const requestDedicated = async()=>{
    if(!duel?.id||handoffRequesting)return;
    setHandoffRequesting(true);
    try{
      const reply=await requestDedicatedDuel(duel.id);
      if(reply?.success && reply.duel){
        duelRef.current=reply.duel;
        setDuel(reply.duel);
        toast(reply.activated
          ? 'Dedicated duel activated — connecting to combat server'
          : 'Waiting for opponent to approve dedicated duel');
      }
    }catch(err){
      toast.error(err?.code==='not_configured'
        ? 'Dedicated duel is not enabled on the server'
        : 'Dedicated handoff could not be started');
    }finally{setHandoffRequesting(false);}
  };

  return (
    <>
      {import.meta.env.VITE_GAME3D_COMBAT_HISTORY_OPTIN==='true'&&(
        <DedicatedDuelArchiveHistory userId={userId}/>
      )}
      {duel && dedicatedOptInVisible && duel.dedicated_mode!=='dedicated' && (
        <div className="fixed top-44 left-1/2 -translate-x-1/2 z-[65] flex gap-2 items-center rounded-xl px-3 py-2 bg-slate-950/90 border border-slate-600 text-xs text-white">
          <button type="button" disabled={handoffRequesting}
            onClick={requestDedicated}
            className="rounded-md border border-sky-400/70 px-2 py-1 text-sky-100 disabled:opacity-50">
            {duel.dedicated_votes?.[userId]
              ? 'Retry dedicated approval'
              : 'Approve dedicated duel server'}
          </button>
          {duel.dedicated_mode==='preparing'&&(
            <button type="button" disabled={handoffRequesting}
              className="rounded-md border border-white/30 px-2 py-1 text-white/80"
              onClick={cancelDedicated}>Cancel handoff</button>
          )}
          <span className="text-white/60">Both players must approve</span>
        </div>
      )}
      {dedicatedMode && (
        <div className="fixed top-44 left-1/2 -translate-x-1/2 z-[65] rounded-lg px-3 py-1 bg-slate-950/90 border border-sky-600/50 text-xs text-sky-100">
          Dedicated combat: {dedicatedConnection}
          {durableCheckpoint&&dedicatedConnection!=='connected'&&(
            <span className="ml-2 text-amber-200">
              Last committed checkpoint #{durableCheckpoint.reportSequence}
              {durableCheckpoint.settled?' · Result recorded':' · Not live'}
              {durableCheckpoint.deliveryMode==='journal-only'
                ?' · Base44 combat mirror intentionally disabled'
                :(durableCheckpoint.base44ProjectionMayLag?' · Backend catching up':'')}
            </span>
          )}
          {workerMe&&(
            <span className="ml-2 text-white/70">
              Will {Math.ceil(workerMe.will)} · Stamina {Math.ceil(workerMe.stamina)}
            </span>
          )}
          {dedicatedSnapshot?.status==='finished'
            ? ' · Match finished, awaiting saved result'
            : ' · Server controls HP, movement and strikes'}
          {dedicatedConnection==='connected'&&dedicatedSnapshot?.status==='active'&&(
            <button type="button" className="ml-3 rounded border border-red-400/50 px-2 py-0.5 text-red-200"
              onClick={async()=>{
                if(!window.confirm('Forfeit this dedicated duel?'))return;
                const response=await dedicatedRef.current?.sendCommand('forfeit');
                if(!response?.ok)toast.error('Forfeit could not reach the duel server');
              }}>Forfeit</button>
          )}
        </div>
      )}
      {duel?.dedicated_mode==='preparing'&&!dedicatedOptInVisible&&(
        <div className="fixed top-44 left-1/2 -translate-x-1/2 z-[65] px-3 py-2 rounded-lg bg-slate-950/90 text-xs text-white">
          Combat paused while dedicated handoff completes
        </div>
      )}
      {/* Active duel HUD */}
      <AnimatePresence>
        {duel && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-24 left-1/2 -translate-x-1/2 z-[60] flex items-center gap-6 px-6 py-3 rounded-2xl pointer-events-none"
            style={{
              background: 'rgba(20, 8, 8, 0.85)',
              backdropFilter: 'blur(18px) saturate(160%)',
              border: '1px solid rgba(239, 68, 68, 0.5)',
              boxShadow: '0 8px 28px rgba(0,0,0,0.6), 0 0 24px rgba(239, 68, 68, 0.25)',
            }}
          >
            <div className="flex items-center gap-2">
              <Swords className="w-5 h-5 text-red-300" />
              <span className="text-xs uppercase tracking-[0.25em] font-bold text-red-200">Duel</span>
            </div>
            <HPBar label="You" hp={myHP} maxHp={myMaxHP} shield={activeShieldValue(userId)} color="#22d3ee" />
            <div className="text-red-300 text-xs font-mono">VS</div>
            <HPBar label={theirName || 'Opponent'} hp={theirHP} maxHp={theirMaxHP} shield={activeShieldValue(theirId)} color="#ef4444" />
            <div className="text-[10px] text-white/50 font-mono ml-2">
              {serverPositionReady
                ? dedicatedMode
                  ? 'Server-owned arena · attacks and shields confirmed by worker'
                  : 'Middle-click lock · Server-checked range'
                : dedicatedMode
                  ? 'Connecting to dedicated duel authority…'
                  : duel?.dedicated_mode==='preparing'
                    ? 'Handoff pending · legacy combat paused'
                    : 'Synchronizing duel positions…'}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Win / Lose screen */}
      <AnimatePresence>
        {result && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 backdrop-blur-md"
            onClick={() => setResult(null)}
          >
            <motion.div
              initial={{ scale: 0.7, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="px-12 py-8 rounded-3xl text-center"
              style={{
                background: result.won
                  ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.25), rgba(20, 30, 40, 0.95))'
                  : 'linear-gradient(135deg, rgba(239, 68, 68, 0.25), rgba(20, 12, 14, 0.95))',
                border: `1px solid ${result.won ? 'rgba(16, 185, 129, 0.6)' : 'rgba(239, 68, 68, 0.6)'}`,
                boxShadow: result.won
                  ? '0 16px 60px rgba(16, 185, 129, 0.4)'
                  : '0 16px 60px rgba(239, 68, 68, 0.4)',
              }}
            >
              {result.won || result.draw ? (
                <Trophy className="w-20 h-20 mx-auto text-emerald-300 mb-3" />
              ) : (
                <Skull className="w-20 h-20 mx-auto text-red-300 mb-3" />
              )}
              <div className="text-5xl font-black tracking-wider mb-2"
                   style={{ color: result.won ? '#6ee7b7' : '#fca5a5' }}>
                {result.draw ? 'DUEL DRAW' : result.won ? 'YOU WON' : 'YOU WERE DEFEATED'}
              </div>
              <div className="text-white/70 text-sm">
                {result.draw?'Draw against':result.won ? 'You defeated' : 'Defeated by'}{' '}
                <span className="font-bold text-white">{result.opponentName}</span>
              </div>
              {result.journalOnly&&(
                <div className="mt-2 text-xs text-amber-100/80">
                  Verified PostgreSQL match result · no XP or item rewards issued
                </div>
              )}
              <button
                onClick={() => setResult(null)}
                className="mt-6 px-6 py-2 rounded-full text-sm font-bold tracking-wider uppercase text-white/80 hover:text-white border border-white/20 hover:bg-white/10 transition-all"
              >
                Continue
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

function HPBar({ label, hp, maxHp, shield = 0, color }) {
  const pct = Math.max(0, Math.min(1, hp / maxHp));
  return (
    <div className="flex flex-col gap-1 w-40">
      <div className="flex items-center justify-between text-[10px] font-mono">
        <span className="text-white/70 truncate">{label}</span>
        <span style={{ color }}>{Math.ceil(hp)}/{maxHp}</span>
      </div>
      <div className="h-2 rounded-full bg-white/10 overflow-hidden">
        <motion.div
          className="h-full rounded-full"
          style={{ background: color }}
          animate={{ width: `${pct * 100}%` }}
          transition={{ duration: 0.2 }}
        />
      </div>
      {shield > 0 && (
        <div className="mt-0.5 flex items-center gap-1.5" aria-label={`AEGIS shield ${Math.ceil(shield)}`}>
          <div className="h-1.5 flex-1 rounded-full bg-white/10 overflow-hidden">
            <div className="h-full rounded-full" style={{
              width: `${Math.min(100, shield / Math.max(1, maxHp * 0.1) * 100)}%`,
              background: 'linear-gradient(90deg, #88bce2, #d7f3ff)',
            }} />
          </div>
          <span className="text-[9px] text-sky-200/85">AEGIS {Math.ceil(shield)}</span>
        </div>
      )}
    </div>
  );
}