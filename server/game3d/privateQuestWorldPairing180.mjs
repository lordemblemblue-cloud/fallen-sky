// Game 3D Combat / Quest 18.0 — isolated, short-lived Base44/world pairing.
// This is an opt-in SERVER-ONLY provider for 17.9; no public route or reward.
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const ID = /^[A-Za-z0-9_-]{1,128}$/;
const WORLD = /^[A-Za-z0-9_.:-]{8,128}$/;
const ACTION = /^qb174-[a-f0-9]{64}$/;
const CHALLENGE = /^[a-f0-9]{64}$/;
const MAC = /^[a-f0-9]{64}$/;
const safeId = x => typeof x === 'string' && ID.test(x) &&
  !['__anon__', '__default__', '__dev_test__'].includes(x);
const object = x => x && typeof x === 'object' && !Array.isArray(x);
const exact = (x, keys) => object(x) && Object.keys(x).length === keys.length &&
  Object.keys(x).every(k => keys.includes(k));
const fields = ['v', 'purpose', 'ownerId', 'characterId', 'challenge',
  'actionSessionId', 'issuedAtMs', 'expiresAtMs'];
const denied = reason => Object.freeze({ok:false,version:'18.0',reason,
  privateServerOnly:true,rewardsIssued:false,productionReady:false});
const core = p => JSON.stringify(fields.map(k => p[k]));

// The independent Base44 function implements this exact canonical HMAC.
export function signGame3DWorldPairing180(secret, proof) {
  if (typeof secret !== 'string' || secret.length < 32 ||
      !exact(proof, fields)) throw Error('18.0 invalid world pairing signature inputs');
  return createHmac('sha256',secret).update('game3d-world-pairing-180\n'+core(proof)).digest('hex');
}

export function createGame3DQuestWorldPairing180({
  scope, secret, resolveTrustedWorldPrincipal,
  verifyWorldSessionActive, verifyBase44SessionActive,
  now = Date.now, enabled = false,
} = {}) {
  if (enabled !== true || !object(scope) || !safeId(scope.ownerId) ||
      !safeId(scope.characterId) || !WORLD.test(scope.instanceId) ||
      typeof secret !== 'string' || secret.length < 32 ||
      [resolveTrustedWorldPrincipal, verifyWorldSessionActive,
       verifyBase44SessionActive, now].some(f => typeof f !== 'function')) {
    throw Error('18.0 requires disabled-by-default, separate trusted world/Base44 session authorities');
  }
  const pinned = Object.freeze({ownerId:scope.ownerId,
    characterId:scope.characterId,instanceId:scope.instanceId});
  const challenges = new Map(), bindings = new Map();
  let stopped = false, generation = 0;
  const clock = () => { const t=now();return Number.isSafeInteger(t) && t>0 ? t : 0; };
  const activeWorld = async context => {
    if (stopped || !object(context)) return null;
    let p;
    try { p=await resolveTrustedWorldPrincipal(context); } catch { return null; }
    const t=clock();
    if (!t || p?.authenticated !== true ||
        p.identitySource !== 'trusted-server-session' ||
        p.accountId !== pinned.ownerId || p.characterId !== pinned.characterId ||
        typeof p.serverSessionId !== 'string' || !WORLD.test(p.serverSessionId) ||
        !Number.isSafeInteger(p.expiresAtMs) || p.expiresAtMs <= t ||
        p.expiresAtMs > t+900000) return null;
    try { if (await verifyWorldSessionActive(Object.freeze({
      ...pinned,serverSessionId:p.serverSessionId})) !== true) return null; }
    catch { return null; }
    return !stopped && p.expiresAtMs>clock() ? p : null;
  };
  const purge = () => {
    const t=clock();
    for (const [id,v] of challenges) if (v.expiresAtMs<=t) challenges.delete(id);
    for (const [id,v] of bindings) if (v.expiresAtMs<=t) bindings.delete(id);
  };
  const begin = async ({serverRequestContext}={}) => {
    const startGeneration=generation;
    const p=await activeWorld(serverRequestContext);
    if (!p || generation!==startGeneration) return denied('trusted_world_session_required');
    purge();
    if (challenges.size>=64) return denied('staging_challenge_capacity');
    generation++; // retire in-flight proofs from a previous world handshake
    // This is a SINGLE active private world. A fresh handshake invalidates
    // every earlier pair, including those for a superseded world session.
    bindings.clear();
    challenges.clear();
    const challenge=randomBytes(32).toString('hex'),issuedAtMs=clock();
    challenges.set(challenge,Object.freeze({serverSessionId:p.serverSessionId,
      issuedAtMs,expiresAtMs:Math.min(issuedAtMs+15000,p.expiresAtMs)}));
    return Object.freeze({ok:true,version:'18.0',challenge,
      expiresAtMs:challenges.get(challenge).expiresAtMs,
      privateServerOnly:true,rewardsIssued:false,productionReady:false});
  };
  const complete = async ({serverRequestContext,proof,signature}={}) => {
    const startGeneration=generation;
    const p=await activeWorld(serverRequestContext);
    if (!p || generation!==startGeneration) return denied('trusted_world_session_required');
    const t=clock();purge();
    if (!exact(proof,fields) || typeof signature!=='string' || !MAC.test(signature) ||
        proof.v!==1 || proof.purpose!=='base44-auth-me-world-pairing-180' ||
        proof.ownerId!==pinned.ownerId || proof.characterId!==pinned.characterId ||
        typeof proof.challenge!=='string' || !CHALLENGE.test(proof.challenge) ||
        typeof proof.actionSessionId!=='string' || !ACTION.test(proof.actionSessionId) ||
        !Number.isSafeInteger(proof.issuedAtMs) ||
        !Number.isSafeInteger(proof.expiresAtMs) ||
        proof.issuedAtMs>t+5000 || proof.expiresAtMs<=t ||
        proof.expiresAtMs>proof.issuedAtMs+15000) return denied('invalid_base44_world_proof');
    const entry=challenges.get(proof.challenge);
    if (!entry || entry.serverSessionId!==p.serverSessionId ||
        entry.expiresAtMs<=t || proof.issuedAtMs<entry.issuedAtMs-5000)
      return denied('stale_or_wrong_world_challenge');
    const wanted=signGame3DWorldPairing180(secret,proof);
    if (!timingSafeEqual(Buffer.from(wanted,'hex'),Buffer.from(signature,'hex')))
      return denied('invalid_base44_world_signature');
    // Reserve the one-time challenge BEFORE any async authority check. Even
    // concurrent valid completions cannot install the same signed proof twice.
    challenges.delete(proof.challenge);
    // A separately trusted Base44 session authority MUST check logout/revocation;
    // a valid HMAC alone is insufficient to install 17.9 admission.
    const claim=Object.freeze({...pinned,serverSessionId:p.serverSessionId,
      actionSessionId:proof.actionSessionId});
    try { if (await verifyBase44SessionActive(claim)!==true) return denied('base44_session_inactive'); }
    catch { return denied('base44_session_inactive'); }
    const recheckedWorld=await activeWorld(serverRequestContext);
    if (!recheckedWorld || recheckedWorld.serverSessionId!==p.serverSessionId ||
        stopped || generation!==startGeneration || clock()>=entry.expiresAtMs ||
        clock()>=proof.expiresAtMs) return denied('session_changed_during_pairing');
    bindings.set(p.serverSessionId,Object.freeze({actionSessionId:proof.actionSessionId,
      expiresAtMs:Math.min(p.expiresAtMs,proof.expiresAtMs),ownerId:pinned.ownerId,
      characterId:pinned.characterId,instanceId:pinned.instanceId}));
    return Object.freeze({ok:true,version:'18.0',paired:true,
      expiresAtMs:bindings.get(p.serverSessionId).expiresAtMs,
      privateServerOnly:true,rewardsIssued:false,productionReady:false});
  };
  const resolveVerifiedBase44ActionSession = async context => {
    const beforeGeneration=generation;
    const p=await activeWorld(context);if (!p || generation!==beforeGeneration) return null;
    const b=bindings.get(p.serverSessionId),t=clock();
    if (!b || b.expiresAtMs<=t) return null;
    const claim=Object.freeze({...pinned,serverSessionId:p.serverSessionId,
      actionSessionId:b.actionSessionId});
    try { if (await verifyBase44SessionActive(claim)!==true) return null; }
    catch { return null; }
    // A world session can expire or rotate WHILE Base44 checks are pending.
    // Re-attest the trusted principal before exposing the paired action ID.
    const current=await activeWorld(context);
    if (!current || current.serverSessionId!==p.serverSessionId ||
        stopped || generation!==beforeGeneration ||
        bindings.get(p.serverSessionId)!==b || b.expiresAtMs<=clock()) return null;
    return Object.freeze({authenticated:true,
      identitySource:'base44-verified-action-session-179',
      accountId:pinned.ownerId,characterId:pinned.characterId,
      worldSessionId:p.serverSessionId,actionSessionId:b.actionSessionId,
      expiresAtMs:b.expiresAtMs});
  };
  const verifySessionActive = async claim => {
    if (!exact(claim,['ownerId','characterId','instanceId','serverSessionId','actionSessionId']) ||
        claim.ownerId!==pinned.ownerId || claim.characterId!==pinned.characterId ||
        claim.instanceId!==pinned.instanceId || !WORLD.test(claim.serverSessionId)) return false;
    const b=bindings.get(claim.serverSessionId),beforeGeneration=generation;
    if (stopped || !b || b.actionSessionId!==claim.actionSessionId || b.expiresAtMs<=clock()) return false;
    try {
      if (await verifyWorldSessionActive(Object.freeze({...pinned,
        serverSessionId:claim.serverSessionId}))!==true) return false;
      if (await verifyBase44SessionActive(Object.freeze({...pinned,
        serverSessionId:claim.serverSessionId,actionSessionId:claim.actionSessionId}))!==true) return false;
      // In-flight logout/world-revoke must not be accepted based on a stale
      // earlier world liveness snapshot.
      if (await verifyWorldSessionActive(Object.freeze({...pinned,
        serverSessionId:claim.serverSessionId}))!==true) return false;
      return !stopped && generation===beforeGeneration &&
        bindings.get(claim.serverSessionId)===b && b.expiresAtMs>clock();
    } catch { return false; }
  };
  const revoke = async ({serverRequestContext}={}) => {
    const p=await activeWorld(serverRequestContext);
    if (!p) return denied('trusted_world_session_required');
    generation++;
    bindings.delete(p.serverSessionId);
    for (const [id,v] of challenges) if(v.serverSessionId===p.serverSessionId) challenges.delete(id);
    return Object.freeze({ok:true,revoked:true,version:'18.0',rewardsIssued:false});
  };
  const shutdown = () => { generation++;stopped=true;bindings.clear();challenges.clear(); };
  return Object.freeze({version:'18.0',begin,complete,revoke,shutdown,
    resolveTrustedWorldPrincipal:activeWorld,
    resolveVerifiedBase44ActionSession,verifySessionActive,
    privateServerOnly:true,publicPlayerRouteInstalled:false,
    browserCredentialsAccepted:false,rewardsIssued:false,productionReady:false});
}
