// Combat / Quest 21.1: staging-only, backend-internal read-only ingress.
// No HTTP/WebSocket listener, socket binding, player input or reward authority.
const own = (value, keys) => value !== null && typeof value === 'object' &&
  !Array.isArray(value) &&
  (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null) &&
  Object.keys(value).length === keys.length &&
  keys.every(key => Object.hasOwn(value, key));
const ID = /^[A-Za-z0-9_-]{1,128}$/;
const TRANSPORT_ID = /^tx-[a-f0-9]{32}$/;
const FORBIDDEN = new Set(['__anon__', '__default__', '__dev_test__']);
const safeId = x => typeof x === 'string' && ID.test(x) && !FORBIDDEN.has(x);
const keys = ['authenticated', 'identitySource', 'transportId', 'ownerId',
  'characterId', 'expiresAtMs', 'serverReadContext'];
const fail = reason => Object.freeze({ok:false,version:'21.1',reason,
  privateServerOnly:true,publicRouteInstalled:false,transportBindingCreated:false,
  resumeCombatAuthorized:false,rewardsIssued:false,productionReady:false});
const seqFrame = raw => {
  if (typeof raw !== 'string' || Buffer.byteLength(raw,'utf8') > 192 || raw.length < 1)
    return null;
  let value;
  try { value = JSON.parse(raw); } catch { return null; }
  if (!own(value,['v','seq','op']) || value.v !== 1 ||
      !Number.isSafeInteger(value.seq) || value.seq < 1 || value.seq > 256 ||
      value.op !== 'questbook.read') return null;
  return Object.freeze({v:1,seq:value.seq,op:'questbook.read'});
};
const sanitize = rows => {
  if (!Array.isArray(rows) || rows.length > 32) return null;
  const ids = new Set(), output=[];
  for (const row of rows) {
    if (row === null || typeof row !== 'object' || Array.isArray(row) ||
        !['questId','objectiveId'].every(k=>typeof row[k] === 'string' &&
          /^[A-Za-z0-9_.:-]{1,128}$/.test(row[k])) ||
        !['type','status'].every(k=>typeof row[k] === 'string' &&
          /^[a-z_]{1,40}$/.test(row[k])) ||
        !Number.isSafeInteger(row.current) || !Number.isSafeInteger(row.required) ||
        row.current < 0 || row.required < 0 || row.current > row.required ||
        row.required > 100000) return null;
    const id=JSON.stringify([row.questId,row.objectiveId]);
    if (ids.has(id)) return null;
    ids.add(id);
    output.push(Object.freeze({questId:row.questId,objectiveId:row.objectiveId,
      type:row.type,status:row.status,current:row.current,required:row.required}));
  }
  return Object.freeze(output);
};

export function createGame3DPrivateQuestIngress211({
  enabled=false, questTransport199, scope, resolveAuthenticatedTransport211,
  now=Date.now,
}={}) {
  if (enabled!==true || process.env.GAME3D_PRIVATE_STAGING_ENV !== 'staging' ||
      questTransport199?.version !== '19.9' ||
      questTransport199.privateServerOnly !== true ||
      questTransport199.publicRouteInstalled !== false ||
      questTransport199.transportBindingCreated !== false ||
      questTransport199.resumeCombatAuthorized !== false ||
      typeof questTransport199.attach !== 'function' ||
      !scope || !safeId(scope.ownerId) || !safeId(scope.characterId) ||
      typeof resolveAuthenticatedTransport211 !== 'function' || typeof now !== 'function')
    throw Error('21.1 requires private 19.9 staging and independent backend transport authorization');
  let closed=false, opened=false, handle=null, pinned=null;
  let serial=Promise.resolve(), pending=0;
  const counters={accepted:0,denied:0,closed:0};
  const deny=reason=>{ counters.denied++; return fail(reason); };
  const stop=()=>{
    if (closed) return false;
    closed=true; counters.closed++;
    try { handle?.close(); } catch {}
    return true;
  };
  const attest=async context=>{
    if (closed || context === null || typeof context !== 'object' ||
        Array.isArray(context)) return null;
    let claim;
    try { claim=await resolveAuthenticatedTransport211(Object.freeze({serverTransportContext:context})); }
    catch { return null; }
    const at=now();
    if (!Number.isSafeInteger(at) || at<=0 || !own(claim,keys) ||
        claim.authenticated !== true ||
        claim.identitySource !== 'trusted-private-transport-211' ||
        !TRANSPORT_ID.test(claim.transportId) ||
        claim.ownerId !== scope.ownerId || claim.characterId !== scope.characterId ||
        !own(claim.serverReadContext,Object.keys(claim.serverReadContext ?? {})) ||
        !Number.isSafeInteger(claim.expiresAtMs) ||
        claim.expiresAtMs <= at || claim.expiresAtMs > at + 60000) return null;
    return claim;
  };
  const matches=claim=>pinned && claim &&
    claim.transportId===pinned.transportId &&
    claim.ownerId===pinned.ownerId && claim.characterId===pinned.characterId &&
    claim.expiresAtMs <= pinned.expiresAtMs && now() < pinned.expiresAtMs;
  const bind=async request=>{
    if (closed || opened) return deny('private_transport_already_bound_or_closed');
    // Reserve before any async check to prevent duplicate simultaneous bind attempts.
    opened=true;
    if (!own(request,['serverTransportContext','serverReconnectContext'])) {
      stop();return deny('backend_only_transport_and_reconnect_context_required');
    }
    const first=await attest(request.serverTransportContext);
    if (!first) {stop();return deny('independent_transport_authority_refused');}
    let result;
    try { result=await questTransport199.attach(Object.freeze({
      serverReconnectContext:request.serverReconnectContext,
    })); } catch {stop();return deny('private_reconnect_unavailable');}
    if (result?.ok !== true || result.version !== '19.9' ||
        result.transportBindingCreated !== false ||
        result.resumeCombatAuthorized !== false ||
        result.privateHandle?.active !== true ||
        typeof result.privateHandle.read !== 'function' ||
        typeof result.privateHandle.close !== 'function') {
      try { result?.privateHandle?.close(); } catch {}
      stop();return deny('original_19_9_handoff_denied');
    }
    handle=result.privateHandle;
    const second=await attest(request.serverTransportContext);
    if (!second || first.transportId!==second.transportId ||
        first.ownerId!==second.ownerId || first.characterId!==second.characterId ||
        second.expiresAtMs>first.expiresAtMs || !handle.active) {
      stop();return deny('transport_changed_during_reconnect');
    }
    pinned=Object.freeze({transportId:first.transportId,
      ownerId:first.ownerId,characterId:first.characterId,
      expiresAtMs:Math.min(first.expiresAtMs,second.expiresAtMs)});
    return Object.freeze({ok:true,version:'21.1',privateBindingPrepared:true,
      privateServerOnly:true,publicRouteInstalled:false,transportBindingCreated:false,
      resumeCombatAuthorized:false,rewardsIssued:false,productionReady:false});
  };
  const receive=request=>{
    if (closed || !pinned || !handle?.active) return Promise.resolve(deny('private_handoff_inactive'));
    if (pending >= 4) return Promise.resolve(deny('private_ingress_backpressure'));
    pending++;
    const task=serial.then(async()=>{
      if (closed || !handle?.active) return deny('private_handoff_inactive');
      if (!own(request,['serverTransportContext','rawFrame'])) {
        stop();return deny('invalid_private_transport_request');
      }
      const frame=seqFrame(request.rawFrame);
      if (!frame) {stop();return deny('malformed_or_unauthorized_frame');}
      const before=await attest(request.serverTransportContext);
      if (!matches(before)) {stop();return deny('transport_identity_revoked');}
      let result;
      try { result=await handle.read(Object.freeze({
        serverReadContext:before.serverReadContext,frame,
      })); } catch {stop();return deny('questbook_reader_unavailable');}
      if (closed || !handle.active || result?.ok!==true ||
          result.operation!=='questbook.snapshot' || result.seq!==frame.seq ||
          result.staticReconnectSnapshot!==true ||
          result.transportBindingCreated!==false ||
          result.worldLeaseRestored!==false ||
          result.resumeCombatAuthorized!==false || result.rewardsIssued!==false) {
        stop();return deny('original_19_9_read_denied');
      }
      const objectives=sanitize(result.objectives);
      if (!objectives) {stop();return deny('unsafe_questbook_payload');}
      const after=await attest(request.serverTransportContext);
      if (!matches(after) || !handle.active) {
        stop();return deny('transport_revoked_during_read');
      }
      counters.accepted++;
      // Only the bounded, server-allowlisted snapshot leaves the ingress.
      return Object.freeze({ok:true,version:'21.1',
        payload:JSON.stringify({v:1,type:'questbook.snapshot',seq:frame.seq,objectives}),
        privateServerOnly:true,publicRouteInstalled:false,transportBindingCreated:false,
        resumeCombatAuthorized:false,rewardsIssued:false,productionReady:false});
    },()=>deny('private_ingress_serial_unavailable'));
    serial=task.then(()=>{},()=>{});
    return task.finally(()=>{pending--;});
  };
  return Object.freeze({version:'21.1',bind,receive,close:stop,shutdown:stop,
    metrics:()=>Object.freeze({...counters}),
    privateServerOnly:true,publicRouteInstalled:false,
    transportBindingCreated:false,resumeCombatAuthorized:false,
    rewardsIssued:false,productionReady:false});
}
