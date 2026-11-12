import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';
import {
  axeStrikeOutcomes,
  clampAXEDuelStats,
  rollAXEStrike,
} from '../../shared/axePowerBudget.ts';
import { duelSkillProfile, validateDuelCastStart, validateDuelCastHit, MAX_ACTIVE_DUEL_CASTS } from '../../shared/duelComboPolicy.mjs';
import {
  validateServerChargeBegin, verifyServerChargeRelease, verifyServerFinisherChain,
  SERVER_CHARGE_MAX_PENDING, SERVER_CHAIN_LATE_MS, verifiedPvpChargedModifiers,
} from '../../shared/duelChargePolicy.mjs';
import {
  hasVerifiedDuelMastery, duelMasteryHitXp, grantDuelMasteryXp,
  duelMasteryLevel, duelMasteryMaxLevel,
} from '../../shared/duelMasteryPolicy.mjs';
import {
  createDuelShield, activeDuelShield, absorbDuelShieldDamage,
  DUEL_SHIELD_COOLDOWN_MS,
} from '../../shared/duelShieldPolicy.mjs';
import { updateDuelPosition, resolveDuelRange } from '../../shared/duelPositionPolicy.mjs';
import {
  DUEL_PROTOCOL_VERSION, MAX_DUEL_EVENT_HISTORY,
  validateCombatIntent, rememberCombatIntent,
  sortAndDedupeCombatReceipts,
} from '../../shared/duelCombatIntentPolicy.mjs';
import { legacyCombatAllowed, dedicatedVoting, initialDedicatedCheckpoint } from '../../shared/duelDedicatedHandoff.mjs';
import {inspectStoredCharacterEvidence} from '../../shared/duelCharacterProvenance.mjs';

// Game 3D duels, resolved by the server (docs/game3d/BACKEND_AUDIT.md).
// Browsers can no longer write DuelSession: the challenge, the accept, every hit and the
// result all go through here. Each hit is rolled and resolved with the same combat rules
// the game uses (base44/shared/axePowerBudget.ts), against each duelist's stats.
//
// Duelist stats still come from the player's browser, because progression is not
// server-owned yet; they are clamped to what a fully built hero can have.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
});
const nameOf = (user: any) => user?.full_name || user?.username || user?.email?.split?.('@')?.[0] || 'Player';

export const DUEL_RULES = Object.freeze({
  challengeLifeMs: 60_000, // a challenge nobody answers expires
  idleTimeoutMs: 120_000, // an active duel with no hit for two minutes ends with no winner
  minHitIntervalMs: 450, // the fastest a duelist can land hits
  maxSkillMultiplier: 3,
  rangeByWeaponPath: Object.freeze({ ranged: 7, damage: 3, defense: 3 }) as Record<string, number>,
  rangeToleranceM: 0.75, // positions are reported by the clients
  onlineWindowMs: 30_000,
});

const isoIn = (ms: number) => new Date(Date.now() + ms).toISOString();
const isPast = (iso?: string) => !!iso && Date.parse(iso) <= Date.now();
const sideOf = (duel: any, userId: string) => (duel.challenger_id === userId ? 'challenger' : duel.opponent_id === userId ? 'opponent' : null);
const other = (side: string) => (side === 'challenger' ? 'opponent' : 'challenger');

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return json({ error: 'Unauthorized' }, 401);
    const payload = await req.json().catch(() => ({}));
    const action = String(payload?.action || '');
    const data = payload?.data || {};
    const svc = base44.asServiceRole.entities;
    const me = String(user.id);
    const provenanceEnabled=Deno.env.get('GAME3D_COMBAT_CHARACTER_BINDING_ENABLED')==='true';
    // This checks account ownership of the existing browser-synced save;
    // it does NOT turn client-derived combat stats into authoritative values.
    const bindCharacter=async()=>{
      const characterId=String(data.characterId||'');
      if(!provenanceEnabled)return {ok:true,characterId:null};
      if(!/^[A-Za-z0-9_-]{1,128}$/.test(characterId)||
         ['__anon__','__default__'].includes(characterId))
        return {ok:false,code:'character_binding_required'};
      let rows;
      try{
        rows=await svc.Game3DCharacterSave.filter({
          owner_id:me,character_id:characterId
        },'-created_date',2);
      }catch{return {ok:false,code:'character_save_unavailable'};}
      return inspectStoredCharacterEvidence({ownerId:me,characterId,rows});
    };

    const duelsFor = async (userId: string, status: string) => {
      const [a, b] = await Promise.all([
        svc.DuelSession.filter({ challenger_id: userId, status }),
        svc.DuelSession.filter({ opponent_id: userId, status }),
      ]);
      return [...(a || []), ...(b || [])];
    };
    // every write returns the duel as it now stands
    const save = async (duel: any, patch: Record<string, unknown>) => ({ ...duel, ...patch, ...((await svc.DuelSession.update(duel.id, patch)) || {}) });
    // 2.8 mastery: only backend-confirmed DuelSession skill hits can increase
    // XP. Browser CharacterVault saves and declared skill levels never grant
    // competitive mastery. This is account-scoped Duel Mastery, separate
    // from existing character-local PvE skill mastery until a secure bridge.
    const readDuelMastery = async (ownerId: string) => {
      try {
        const rows = await svc.Game3DDuelMastery.filter({ owner_id: ownerId }, '-created_date', 3);
        if ((rows || []).length > 1) return { row: null, xp: {}, duplicate: true, unavailable: false };
        const row = (rows || [])[0] || null;
        return { row, xp: row?.xp || {}, duplicate: false, unavailable: false };
      } catch (error) {
        // Graceful rollout: missing entity provisioning must not disable
        // ordinary duel attacks. It must fail CLOSED for PvP mastery bonuses.
        console.error('[duelSystem] Duel Mastery ledger unavailable', error);
        return { row: null, xp: {}, duplicate: false, unavailable: true };
      }
    };
    const awardDuelMastery = async (skillId: string, profile: any, landed: boolean) => {
      const points = duelMasteryHitXp(profile, landed);
      if (!points) return;
      const found = await readDuelMastery(me);
      if (found.duplicate || found.unavailable) return; // persistence uncertain: fail closed
      const xp = grantDuelMasteryXp(found.xp, skillId, points);
      if (xp === found.xp) return;
      if (found.row) await svc.Game3DDuelMastery.update(found.row.id, {
        xp, updated_at: new Date().toISOString(),
      });
      else await svc.Game3DDuelMastery.create({
        owner_id: me, xp, updated_at: new Date().toISOString(),
      });
    };
    // Expire stale challenges and idle duels before deciding anything.
    const settle = async (duel: any) => {
      if (duel.status === 'pending' && isPast(duel.expires_at)) return await save(duel, { status: 'expired' });
      if (duel.status === 'active' && duel.dedicated_mode==='preparing' &&
          Date.now()>Number(duel.dedicated_vote_expires||0))
        return await save(duel,{
          dedicated_mode:'legacy',dedicated_votes:{},dedicated_vote_expires:0,
        });
      if (duel.status === 'active' && legacyCombatAllowed(duel) && duel.last_action_at && Date.parse(duel.last_action_at) + DUEL_RULES.idleTimeoutMs <= Date.now()) {
        return await save(duel, { status: 'finished', finish_reason: 'timeout' });
      }
      return duel;
    };
    const liveDuelsFor = async (userId: string) => {
      const out = [];
      for (const duel of [...await duelsFor(userId, 'active'), ...await duelsFor(userId, 'pending')]) {
        const settled = await settle(duel);
        if (settled.status === 'active' || settled.status === 'pending') out.push(settled);
      }
      return out;
    };
    const notify = async (recipientId: string, duel: any) => {
      await svc.SocialNotification.create({
        recipient_id: recipientId, actor_id: me, actor_name: nameOf(user), actor_avatar: user?.avatar_url || '',
        type: 'duel_challenge', title: 'Duel challenge', body: `${nameOf(user)} challenged you to a duel.`,
        related_entity_id: duel.id, status: 'unread', action_kind: 'duel_challenge',
      }).catch(() => null);
    };

    if (action === 'state') {
      const live = await liveDuelsFor(me);
      return json({
        active: live.find((d: any) => d.status === 'active') || null,
        incoming: live.filter((d: any) => d.status === 'pending' && d.opponent_id === me),
        outgoing: live.filter((d: any) => d.status === 'pending' && d.challenger_id === me),
      });
    }

    if (action === 'request_dedicated') {
      if (Deno.env.get('GAME3D_COMBAT_HANDOFF_ENABLED') !== 'true' ||
          Deno.env.get('GAME3D_COMBAT_AUTHORITY_ENABLED') !== 'true' ||
          (Deno.env.get('GAME3D_COMBAT_SECRET')||'').length<32 ||
          !/^wss:\/\/[^?#\s]+\/game3d-duel$/.test(
            Deno.env.get('GAME3D_COMBAT_WS_URL')||''))
        return json({error:'Dedicated duel handoff is not fully configured',
          code:'not_configured'},503);
      const duel=await svc.DuelSession.get(String(data.duelId||'')).catch(()=>null);
      if(!duel||!sideOf(duel,me))return json({error:'Duel not found'},404);
      const voted=dedicatedVoting(duel,me,Date.now());
      if(!voted.ok)return json({error:voted.reason,code:voted.reason},409);
      const patch:Record<string,unknown>={
        dedicated_mode:voted.mode,dedicated_votes:voted.votes,
        dedicated_vote_expires:voted.expiresAt,
      };
      if(voted.complete){
        const mapId=Deno.env.get('GAME3D_COMBAT_MAP_ID')||null;
        if(mapId&&mapId!=='wolfveil-v1')
          return json({error:'Unsupported dedicated map config',code:'map_not_configured'},503);
        const spawnPresetId=Deno.env.get('GAME3D_COMBAT_SPAWN_PRESET_ID')||null;
        const instanceBound=Deno.env.get('GAME3D_COMBAT_INSTANCE_BINDING_ENABLED')==='true';
        if(spawnPresetId && (spawnPresetId!=='wolfveil-south-approach-v1' ||
            mapId!=='wolfveil-v1'||!instanceBound))
          return json({error:'Dedicated spawn preset requires Wolfveil map and instance binding',
            code:'spawn_preset_not_configured'},503);
        if(mapId && !spawnPresetId){
          // Legacy map preview still requires recent client-origin positions.
          // These are still client-origin positions, NOT ranked attestation.
          const locations=[duel.challenger_position,duel.opponent_position];
          const ready=locations.every(p=>p&&Number.isFinite(p.x)&&
            Number.isFinite(p.z)&&Number.isFinite(p.at)&&
            Date.now()-p.at>=0&&Date.now()-p.at<5000);
          if(!ready)
            return json({error:'Fresh duel positions required for map-aware handoff',
              code:'map_positions_stale'},409);
        }
        const fingerprint=instanceBound&&mapId
          ?Deno.env.get('GAME3D_COMBAT_MAP_FINGERPRINT')||'' : '';
        if(instanceBound&&mapId&&!/^[a-f0-9]{64}$/.test(fingerprint))
          return json({error:'Dedicated map fingerprint is not configured',
            code:'map_fingerprint_missing'},503);
        patch.dedicated_epoch=crypto.randomUUID();
        patch.dedicated_sequence=0;
        patch.dedicated_checkpoint=initialDedicatedCheckpoint(duel,Date.now(),mapId,
          instanceBound?{instanceId:crypto.randomUUID(),mapFingerprint:fingerprint,
            ...(spawnPresetId?{spawnPresetId}:{})}:{});
        // Bound identity is a private, per-duel arena ID, not a general MMO
        // world/shard allocation or verified shared-world presence.
        // Previous client-origin DuelSession combat state cannot be
        // applied concurrently once the dedicated worker owns this duel.
        patch.last_action_at=new Date().toISOString();
      }
      const updated=await save(duel,patch);
      return json({success:true,duel:updated,activated:voted.complete,
        awaitingOpponent:!voted.complete});
    }

    if (action === 'cancel_dedicated') {
      const duel=await svc.DuelSession.get(String(data.duelId||'')).catch(()=>null);
      if(!duel||!sideOf(duel,me))return json({error:'Duel not found'},404);
      if(duel.status!=='active'||duel.dedicated_mode!=='preparing')
        return json({error:'Handoff cannot be canceled',code:'not_preparing'},409);
      const updated=await save(duel,{
        dedicated_mode:'legacy',dedicated_votes:{},dedicated_vote_expires:0,
      });
      return json({success:true,duel:updated});
    }

    if (action === 'mastery_state') {
      const found = await readDuelMastery(me);
      if (found.duplicate) return json({ error: 'Duel mastery needs support', code: 'duplicate_mastery' }, 409);
      if (found.unavailable) return json({ error: 'Duel mastery is not provisioned', code: 'mastery_unavailable' }, 503);
      return json({
        success: true, scope: 'account_duel_only',
        xp: found.xp,
        levels: Object.fromEntries(Object.entries(found.xp).map(([skillId, xp]) =>
          [skillId, duelMasteryLevel(xp, duelMasteryMaxLevel(skillId))])),
      });
    }

    if (action === 'challenge') {
      const opponentId = String(data.opponentId || '').trim();
      if (!opponentId) return json({ error: 'Opponent is required', code: 'invalid' }, 400);
      if (opponentId === me) return json({ error: "That's you!", code: 'self' }, 400);
      // only players who are in the world right now (or friends) can be challenged
      const [presence, friendA, friendB] = await Promise.all([
        svc.PlayerState.filter({ player_id: opponentId }, '-last_update', 5).catch(() => []),
        svc.SocialFriendship.filter({ user_a_id: me, user_b_id: opponentId }).catch(() => []),
        svc.SocialFriendship.filter({ user_a_id: opponentId, user_b_id: me }).catch(() => []),
      ]);
      const online = (presence || []).some((p: any) => p?.status !== 'offline' && Number(p?.last_update || 0) > Date.now() - DUEL_RULES.onlineWindowMs);
      if (!online && !(friendA?.length || friendB?.length)) return json({ error: 'That player is not in the world', code: 'offline' }, 403);

      const mine = await liveDuelsFor(me);
      const already = mine.find((d: any) => d.status === 'pending' && d.challenger_id === me && d.opponent_id === opponentId);
      if (already) return json({ success: true, duel: already, already_pending: true });
      if (mine.some((d: any) => d.status === 'active')) return json({ error: "You're already in a duel", code: 'already_dueling' }, 409);
      if ((await liveDuelsFor(opponentId)).some((d: any) => d.status === 'active')) {
        return json({ error: `${String(data.opponentName || 'They')} is already in a duel`, code: 'already_dueling' }, 409);
      }
      const bound=await bindCharacter();
      if(!bound.ok)return json({error:'An unambiguous server-saved character is required',
        code:bound.code},409);
      const duel = await svc.DuelSession.create({
        challenger_id: me, challenger_name: nameOf(user),
        ...(provenanceEnabled?{challenger_character_id:bound.characterId}:{}),
        opponent_id: opponentId, opponent_name: String(data.opponentName || 'Player').slice(0, 80),
        status: 'pending', challenger_stats: clampAXEDuelStats(data.stats), expires_at: isoIn(DUEL_RULES.challengeLifeMs),
      });
      await notify(opponentId, duel);
      return json({ success: true, duel });
    }

    if (action === 'respond') {
      const duel = await svc.DuelSession.get(String(data.duelId || '')).catch(() => null);
      if (!duel || duel.opponent_id !== me) return json({ error: 'Duel not found' }, 404);
      const settled = await settle(duel);
      if (settled.status !== 'pending') return json({ error: 'That challenge is no longer open', code: 'not_pending', duel: settled }, 409);
      if (data.decision !== 'accept') {
        return json({ success: true, duel: await save(duel, { status: 'declined' }) });
      }
      if ((await liveDuelsFor(me)).some((d: any) => d.status === 'active' && d.id !== duel.id)) {
        return json({ error: "You're already in a duel", code: 'already_dueling' }, 409);
      }
      const bound=await bindCharacter();
      if(!bound.ok)return json({error:'An unambiguous server-saved character is required',
        code:bound.code},409);
      const challenger = clampAXEDuelStats(duel.challenger_stats);
      const opponent = clampAXEDuelStats(data.stats);
      const updated = await save(duel, {
        status: 'active', opponent_stats: opponent, opponent_name: nameOf(user),
        ...(provenanceEnabled?{opponent_character_id:bound.characterId}:{}),
        challenger_hp: challenger.maxHP, challenger_max_hp: challenger.maxHP,
        opponent_hp: opponent.maxHP, opponent_max_hp: opponent.maxHP,
        max_hp: Math.max(challenger.maxHP, opponent.maxHP),
        last_hit_at: {}, duel_skill_casts: {}, duel_skill_cooldowns: {},
        duel_charge_holds: {}, duel_shields: {},
        // A newly created DuelSession has no accepted location samples yet.
        // Object-typed fields stay unset until real authenticated RPC writes.
        duel_combat_seq: 0, duel_protocol_version: DUEL_PROTOCOL_VERSION,
        duel_intent_seq: {}, duel_recent_intents: {},
        last_action_at: new Date().toISOString(),
      });
      return json({ success: true, duel: updated });
    }

    if (action === 'combat_events') {
      const duel = await svc.DuelSession.get(String(data.duelId || '')).catch(() => null);
      if (!duel || !sideOf(duel, me))
        return json({error:'Duel not found'},404);
      // Participants only. The combat events entity stays service-only:
      // never expose a global/readable history or trust an arbitrary owner ID.
      let receipts: any[] = [];
      let journalAvailable = true;
      try {
        const rows = await svc.DuelCombatEvent.filter(
          {duel_id: duel.id}, '-created_date', MAX_DUEL_EVENT_HISTORY,
        );
        receipts = (rows || []).map((row: any)=>row?.payload).filter(Boolean);
      } catch(error) {
        journalAvailable = false;
        console.error('[duelSystem] combat journal read',error);
      }
      // New entity provisioning can lag backend code. Preserve the current
      // session's most recent server result as a fallback.
      if (duel.duel_combat_event) receipts.push(duel.duel_combat_event);
      return json({
        success: true, duelId: duel.id, journalAvailable,
        receipts: sortAndDedupeCombatReceipts(receipts)
          .slice(-MAX_DUEL_EVENT_HISTORY),
        authoritative: {
          status: duel.status,
          winner_id: duel.winner_id || null,
          loser_id: duel.loser_id || null,
          finish_reason: duel.finish_reason || null,
          duel_combat_seq: duel.duel_combat_seq || 0,
          challenger_hp: duel.challenger_hp,
          opponent_hp: duel.opponent_hp,
          duel_shields: duel.duel_shields || {},
          duel_intent_seq: duel.duel_intent_seq || {},
        },
      });
    }

    if (action === 'sync_position') {
      const duel = await svc.DuelSession.get(String(data.duelId || '')).catch(() => null);
      const side = duel && sideOf(duel, me);
      if (!duel || !side) return json({error:'Duel not found'},404);
      const settled = await settle(duel);
      if (!legacyCombatAllowed(settled)) return json({error:'Dedicated combat owns this duel',code:'dedicated_authority'},409);
      if (settled.status !== 'active') return json({error:'The duel is over',code:'not_active'},409);
      // Coordinates originate with the player, but validation and timestamps
      // are owned by the backend. Neither the caller nor the target chooses
      // which opponent/slot is updated.
      const now=Date.now();
      const key=`${side}_position`;
      const next=updateDuelPosition(duel[key],data.position,now);
      if (!next.ok) return json({error:next.reason,code:next.reason,
        retryAfterMs:next.retryAfterMs||0},422);
      await save(duel,{[key]:next.position});
      return json({success:true,position:next.position});
    }

    if (action === 'cast_shield') {
      const duel = await svc.DuelSession.get(String(data.duelId || '')).catch(() => null);
      const side = duel && sideOf(duel, me);
      if (!duel || !side) return json({ error: 'Duel not found' }, 404);
      const settled = await settle(duel);
      if (!legacyCombatAllowed(settled)) return json({error:'Dedicated combat owns this duel',code:'dedicated_authority'},409);
      if (settled.status !== 'active') return json({ error: 'The duel is over', code: 'not_active' }, 409);
      const now = Date.now();
      const cooldowns = { ...(duel.duel_skill_cooldowns || {}) };
      const mine = { ...(cooldowns[me] || {}) };
      if (now < Number(mine.aegis_shield || 0)) {
        return json({ error: 'Shield is on cooldown', code: 'skill_cooldown',
          retryAfterMs: Number(mine.aegis_shield) - now }, 429);
      }
      // The universal shield is available to duelists; no browser-supplied
      // HP, shield points, mastery or damage scaling is accepted.
      const maxHp = Number(duel[`${side}_max_hp`] ||
        clampAXEDuelStats(duel[`${side}_stats`]).maxHP);
      const shield = createDuelShield(maxHp, now);
      const shields = { ...(duel.duel_shields || {}), [me]: shield };
      mine.aegis_shield = now + DUEL_SHIELD_COOLDOWN_MS;
      cooldowns[me] = mine;
      const updated = await save(duel, { duel_shields: shields, duel_skill_cooldowns: cooldowns });
      return json({ success: true, shield, duel: updated });
    }

    if (action === 'begin_charge') {
      const duel = await svc.DuelSession.get(String(data.duelId || '')).catch(() => null);
      const side = duel && sideOf(duel, me);
      if (!duel || !side) return json({ error: 'Duel not found' }, 404);
      const settled = await settle(duel);
      if (!legacyCombatAllowed(settled)) return json({error:'Dedicated combat owns this duel',code:'dedicated_authority'},409);
      if (settled.status !== 'active') return json({ error: 'The duel is over', code: 'not_active' }, 409);
      const now = Date.now();
      const checked = validateServerChargeBegin({
        skillId: String(data.skillId || ''),
        weaponPath: String(data.weaponPath || ''),
        chargeId: String(data.chargeId || ''), now,
      });
      if (!checked.ok) return json({ error: checked.reason, code: checked.reason }, 422);
      const holds = { ...(duel.duel_charge_holds || {}) };
      const mine = { ...(holds[me] || {}) };
      for (const [id, value] of Object.entries(mine)) {
        if (Number((value as any)?.expiresAt || 0) <= now) delete mine[id];
      }
      if (mine[checked.hold.chargeId]) return json({ error: 'Duplicate charge', code: 'duplicate_charge' }, 409);
      if (Object.keys(mine).length >= SERVER_CHARGE_MAX_PENDING)
        return json({ error: 'Too many charges', code: 'charge_busy' }, 429);
      const cooldownUntil = Number(duel.duel_skill_cooldowns?.[me]?.[checked.hold.skillId] || 0);
      if (now < cooldownUntil) return json({ error: 'Skill on cooldown', code: 'skill_cooldown' }, 429);
      mine[checked.hold.chargeId] = checked.hold;
      holds[me] = mine;
      await save(duel, { duel_charge_holds: holds });
      return json({ success: true, chargeId: checked.hold.chargeId });
    }

    if (action === 'begin_cast') {
      const duel = await svc.DuelSession.get(String(data.duelId || '')).catch(() => null);
      const side = duel && sideOf(duel, me);
      if (!duel || !side) return json({ error: 'Duel not found' }, 404);
      const settled = await settle(duel);
      if (!legacyCombatAllowed(settled)) return json({error:'Dedicated combat owns this duel',code:'dedicated_authority'},409);
      if (settled.status !== 'active') return json({ error: 'The duel is over', code: 'not_active' }, 409);
      const now = Date.now(), skillId = String(data.skillId || ''), castId = String(data.castId || '');
      const cooldowns = { ...(duel.duel_skill_cooldowns || {}) };
      const myCooldowns = { ...(cooldowns[me] || {}) };
      const checked = validateDuelCastStart({
        skillId, castId, weaponPath: String(data.weaponPath || ''),
        now, cooldownUntil: Number(myCooldowns[skillId] || 0),
      });
      if (!checked.ok) return json({ error: checked.reason, code: checked.reason }, 422);
      const serverCast: Record<string, any> = checked.cast;
      const casts = { ...(duel.duel_skill_casts || {}) };
      const mine = { ...(casts[me] || {}) };
      for (const [id, value] of Object.entries(mine)) {
        if (Number((value as any)?.expiresAt || 0) <= now) delete mine[id];
      }
      const activeCount = Object.values(mine).filter((cast: any) =>
        Number(cast?.nextIndex || 0) < (duelSkillProfile(cast?.skillId)?.offsets.length || 1)
      ).length;
      if (activeCount >= MAX_ACTIVE_DUEL_CASTS)
        return json({ error: 'Too many active casts', code: 'cast_busy' }, 429);
      if (mine[castId]) return json({ error: 'Duplicate cast', code: 'duplicate_cast' }, 409);
      // A charge may be certified only using server timestamps, never
      // data.heldMs, data.masteryLevel or client-supplied charge flags.
      const holds = { ...(duel.duel_charge_holds || {}) };
      const myHolds = { ...(holds[me] || {}) };
      const requestedCharge = typeof data.chargeId === 'string' ? data.chargeId : '';
      const released = requestedCharge
        ? verifyServerChargeRelease(myHolds[requestedCharge], {
          skillId, weaponPath: String(data.weaponPath || ''), now,
        })
        : { valid: false };
      if (requestedCharge) delete myHolds[requestedCharge];
      holds[me] = myHolds;
      serverCast.serverTimedCharge = released.valid === true;
      serverCast.chargeElapsedMs = released.valid ? released.elapsedMs : 0;
      const mastery = await readDuelMastery(me);
      // Duels earn independent mastery ONLY from accepted server-resolved
      // strikes. Never trust the browser or the CharacterVault XP upload.
      serverCast.masteryVerified = !mastery.duplicate && !mastery.unavailable &&
        hasVerifiedDuelMastery(mastery.xp, skillId);
      serverCast.chainConsumed = false;

      let chainConfirmed = false;
      const fromId = typeof data.chainFromCastId === 'string' ? data.chainFromCastId : '';
      if (fromId) {
        const source = mine[fromId];
        const sourceProfile = source && duelSkillProfile(source.skillId);
        const chain = verifyServerFinisherChain({
          source, sourceProfile, nextProfile: checked.profile, now,
        });
        if (chain.ok) {
          mine[fromId] = { ...source, chainConsumed: true };
          serverCast.chainFromCastId = fromId;
          serverCast.serverTimedChain = true;
          serverCast.sourceMasteryVerified = source.masteryVerified === true;
          chainConfirmed = true;
        }
      }
      mine[castId] = serverCast;
      casts[me] = mine;
      myCooldowns[skillId] = now + checked.profile.cooldownMs;
      cooldowns[me] = myCooldowns;
      // No bonus for self-reported level, held duration, charge or chain:
      // authoritative mastery and equipment ownership aren't server-owned yet.
      // Only resolved strikes refresh duel activity; repeatedly registering
      // casts must not keep an inactive duel alive forever.
      await save(duel, {
        duel_skill_casts: casts, duel_skill_cooldowns: cooldowns, duel_charge_holds: holds,
      });
      return json({
        success: true, castId, skillId, strikes: checked.profile.offsets.length,
        serverTimedCharge: serverCast.serverTimedCharge,
        serverTimedChain: chainConfirmed,
        masteryVerified: serverCast.masteryVerified,
        defensiveBreakApplied: false,
      });
    }

    if (action === 'hit') {
      const duel = await svc.DuelSession.get(String(data.duelId || '')).catch(() => null);
      const side = duel && sideOf(duel, me);
      if (!duel || !side) return json({ error: 'Duel not found' }, 404);
      const settled = await settle(duel);
      if (!legacyCombatAllowed(settled)) return json({error:'Dedicated combat owns this duel',code:'dedicated_authority'},409);
      if (settled.status !== 'active') {
        // Terminal knockouts still replay their accepted final result after
        // a lost network response. Never create another hit or mastery award.
        if (Number(duel.duel_protocol_version || 0) >= DUEL_PROTOCOL_VERSION) {
          const lastSeq = Number(duel.duel_intent_seq?.[me] || 0);
          const checked = validateCombatIntent({
            intentId:data.intentId,intentSeq:data.intentSeq,
            lastSeq,recent:duel.duel_recent_intents?.[me] || [],
          });
          if (checked.ok && checked.replay) return json({
            success:true,replay:true,hit:checked.entry.hit,
            receipt:checked.entry.receipt,duel:settled,
          });
        }
        return json({ error: 'The duel is over', code: 'not_active', duel: settled }, 409);
      }

      // Actor-specific intent sequence is validated BEFORE range and hit
      // timing. Retrying an already confirmed intent must never roll damage,
      // shield absorption or duel mastery a second time.
      const protocol3 = Number(duel.duel_protocol_version || 0) >= DUEL_PROTOCOL_VERSION;
      let acceptedIntent: any = null;
      if (protocol3) {
        const previousSeq = Number(duel.duel_intent_seq?.[me] || 0);
        const recent = duel.duel_recent_intents?.[me] || [];
        acceptedIntent = validateCombatIntent({
          intentId: data.intentId, intentSeq: data.intentSeq,
          lastSeq: previousSeq, recent,
        });
        if (!acceptedIntent.ok)
          return json({error:acceptedIntent.reason,code:acceptedIntent.reason},422);
        if (acceptedIntent.replay) {
          return json({
            success:true, replay:true,
            hit:acceptedIntent.entry.hit,
            receipt:acceptedIntent.entry.receipt,
            duel,
          });
        }
      }

      const range = DUEL_RULES.rangeByWeaponPath[String(data.weaponPath || 'damage')] ?? DUEL_RULES.rangeByWeaponPath.damage;
      const rangeCheck = resolveDuelRange({
        attacker:duel[`${side}_position`],
        defender:duel[`${other(side)}_position`],
        weaponRange:range,grace:DUEL_RULES.rangeToleranceM,now:Date.now(),
      });
      // Ignore the browser's reported distance. The server uses TWO recent,
      // speed-bounded position samples stamped by this backend. This is not
      // an authoritative server movement/physics simulator.
      if (!rangeCheck.ok) return json({error:rangeCheck.reason,
        code:rangeCheck.reason},422);
      const now = Date.now();
      const last = Number(duel.last_hit_at?.[me] || 0);
      const abilityHit = data.source === 'ability';
      let verifiedSkill = null;
      let skillCast = null;
      const casts = { ...(duel.duel_skill_casts || {}) };
      if (abilityHit) {
        const castId = String(data.castId || '');
        skillCast = (casts[me] || {})[castId] || null;
        verifiedSkill = skillCast && duelSkillProfile(skillCast.skillId);
        if (!skillCast || !verifiedSkill) return json({ error: 'Skill cast was not registered', code: 'cast_required' }, 422);
        if (verifiedSkill.weaponPath !== String(data.weaponPath || ''))
          return json({ error: 'Wrong weapon', code: 'wrong_weapon' }, 422);
        const hitCheck = validateDuelCastHit(skillCast, verifiedSkill, Number(data.hitIndex), now);
        if (!hitCheck.ok) return json({ error: hitCheck.reason, code: hitCheck.reason,
          retryAfterMs: hitCheck.retryAfterMs || 0 }, hitCheck.reason === 'hit_too_early' ? 429 : 422);
      } else if (now - last < DUEL_RULES.minHitIntervalMs) {
        return json({ error: 'Too fast', code: 'too_fast', retryAfterMs: DUEL_RULES.minHitIntervalMs - (now - last) }, 429);
      }

      const attacker = clampAXEDuelStats(duel[`${side}_stats`]);
      if (verifiedSkill?.criticalAllowed === false) attacker.critChance = 0;
      const defenderBase = clampAXEDuelStats(duel[`${other(side)}_stats`]);
      const modifiers = verifiedPvpChargedModifiers(
        skillCast, verifiedSkill, Number(data.hitIndex),
      );
      const defender = modifiers.armorPiercePct > 0
        ? { ...defenderBase, defense: Math.max(0,
            defenderBase.defense * (1 - modifiers.armorPiercePct)) }
        : defenderBase;
      // A modern registered ability uses the server-declared skill value.
      // The client-supplied multiplier and charged flags are ignored.
      const skillMultiplier = verifiedSkill
        ? Math.max(0.1, Math.min(DUEL_RULES.maxSkillMultiplier,
            verifiedSkill.multiplier * modifiers.powerMultiplier))
        : 1; // basic and old unregistered skill events cannot submit inflated damage
      // the server rolls the dice, the same outcomes as every hit in the game: Accuracy against
      // Block, the defender's avoidance and deflect, crit, block, defense and every reduction under
      // one cap, hero-against-hero scale, execute; reflect hurts the attacker, life steal heals it
      const hpKey = `${other(side)}_hp`;
      const myHpKey = `${side}_hp`;
      const defenderHp = Number(duel[hpKey] ?? defender.maxHP);
      const strike = rollAXEStrike(axeStrikeOutcomes(attacker, defender, {
        skillMultiplier, isSkill: skillMultiplier !== 1, pvp: true, targetHpPct: defenderHp / Math.max(1, defender.maxHP),
      }), Math.random());
      const damage = strike.kind === 'hit' ? strike.damage : 0;
      const shields = { ...(duel.duel_shields || {}) };
      const defenderId = String(duel[`${other(side)}_id`]);
      const absorbed = absorbDuelShieldDamage({
        shield: shields[defenderId], damage, now,
        chainPierce: modifiers.armorPiercePct > 0,
      });
      // Expired shields count as zero and cannot quietly absorb attacks.
      const previousShield = shields[defenderId];
      if (previousShield) shields[defenderId] = {
        ...previousShield, current: absorbed.remaining,
      };
      const hp = Math.max(0, defenderHp - absorbed.hpDamage);
      const myHp = Math.max(0, Math.min(attacker.maxHP, Number(duel[myHpKey] ?? attacker.maxHP) - strike.reflected + strike.lifeSteal));
      const combatSeq=Math.max(0,Number(duel.duel_combat_seq)||0)+1;
      const receipt={
        // Global uniqueness keeps two simultaneous server writers from
        // producing the same receipt ID even with a colliding session seq.
        id:`${duel.id}:${crypto.randomUUID()}`,seq:combatSeq,at:now,
        intentId:protocol3 ? data.intentId : null,
        attackerId:me,defenderId,weaponPath:String(data.weaponPath||'damage'),
        castId:abilityHit?String(data.castId||''):null,
        hitIndex:abilityHit?Number(data.hitIndex):null,
        kind:strike.kind,critical:!!strike.critical,blocked:!!strike.blocked,
        hpDamage:absorbed.hpDamage,rawDamage:damage,
        shieldAbsorbed:absorbed.absorbed,shieldPierced:absorbed.shieldPierced,
      };
      const hitResult={
        missed:strike.kind!=='hit', kind:strike.kind,
        critical:strike.critical, blocked:strike.blocked,
        damage:absorbed.hpDamage, rawDamage:damage,hpDamage:absorbed.hpDamage,
        shieldAbsorbed:absorbed.absorbed,shieldPierced:absorbed.shieldPierced,
        reflected:strike.reflected,lifeSteal:strike.lifeSteal,
        chargedBonusApplied:modifiers.powerMultiplier>1,
        armorPierceApplied:modifiers.armorPiercePct,
      };
      const patch: Record<string, unknown> = {
        duel_combat_seq:combatSeq,duel_combat_event:receipt,
        [hpKey]: hp,
        [myHpKey]: myHp,
        duel_shields: shields,
        last_hit_at: { ...(duel.last_hit_at || {}), [me]: now },
        last_action_at: new Date(now).toISOString(),
      };
      if (protocol3) {
        patch.duel_intent_seq = {
          ...(duel.duel_intent_seq || {}), [me]:data.intentSeq,
        };
        patch.duel_recent_intents = {
          ...(duel.duel_recent_intents || {}),
          [me]:rememberCombatIntent(duel.duel_recent_intents?.[me],{
            intentId:data.intentId,seq:data.intentSeq,receipt,hit:hitResult,
          }),
        };
      }
      if (abilityHit && skillCast && verifiedSkill) {
        const mine = { ...(casts[me] || {}) };
        const next = { ...skillCast, nextIndex: skillCast.nextIndex + 1 };
        if (next.nextIndex >= verifiedSkill.offsets.length) {
          // Keep a short-lived, non-damaging receipt so a legitimate
          // immediately-after-third-hit single can still chain.
          if (skillCast.serverTimedCharge && verifiedSkill.offsets.length === 3) {
            next.completedAt = now;
            next.expiresAt = Math.max(next.expiresAt,
              skillCast.createdAt + verifiedSkill.offsets.at(-1) + SERVER_CHAIN_LATE_MS);
            mine[skillCast.castId] = next;
          } else delete mine[skillCast.castId];
        } else mine[skillCast.castId] = next;
        casts[me] = mine;
        patch.duel_skill_casts = casts;
      }
      if (hp <= 0) Object.assign(patch, { status: 'finished', finish_reason: 'knockout', winner_id: me, loser_id: duel[`${other(side)}_id`] });
      else if (myHp <= 0) Object.assign(patch, { status: 'finished', finish_reason: 'knockout', winner_id: duel[`${other(side)}_id`], loser_id: me });
      const updated = await save(duel, patch);
      // Best-effort append-only combat journal. If provisioning/storage fails,
      // DuelSession remains the source of HP/shields and its latest receipt
      // continues to support defensive feedback. Do NOT reroll the hit.
      try {
        await svc.DuelCombatEvent.create({
          duel_id:duel.id,receipt_id:receipt.id,sequence:combatSeq,
          attacker_id:me,defender_id:defenderId,occurred_at:now,payload:receipt,
        });
      } catch(error) {
        console.error('[duelSystem] journal append',error);
      }
      // Only accepted, resolved skill hits grant persistent duel mastery.
      // Failing XP persistence does not roll back a confirmed hit, but it is
      // logged for recovery rather than silently trusting client progress.
      if (abilityHit && verifiedSkill && strike.kind === 'hit') {
        try { await awardDuelMastery(verifiedSkill.skillId, verifiedSkill, true); }
        catch (error) { console.error('[duelSystem] mastery award', error); }
      }
      return json({
        success:true,hit:hitResult,
        receipt,
        duel: updated,
      });
    }

    if (action === 'forfeit') {
      const duel = await svc.DuelSession.get(String(data.duelId || '')).catch(() => null);
      const side = duel && sideOf(duel, me);
      if (!duel || !side) return json({ error: 'Duel not found' }, 404);
      const settled=await settle(duel);
      if (!legacyCombatAllowed(settled)) return json({error:'Dedicated combat owns this duel',code:'dedicated_authority'},409);
      if (duel.status === 'pending') return json({ success: true, duel: await save(duel, { status: 'declined' }) });
      if (duel.status !== 'active') return json({ success: true, duel });
      return json({
        success: true,
        duel: await save(duel, {
          status: 'finished', finish_reason: 'forfeit', winner_id: duel[`${other(side)}_id`], loser_id: me,
        }),
      });
    }

    return json({ error: `Unknown action: ${action}` }, 400);
  } catch (error) {
    console.error('[duelSystem]', error);
    return json({ error: (error as Error)?.message || 'Duel failed' }, 500);
  }
});
