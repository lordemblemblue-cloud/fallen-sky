// 19.0: private-only reconnect transport contracts. No public route or gameplay input.
export const isRecord=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&
 (Object.getPrototypeOf(x)===Object.prototype||Object.getPrototypeOf(x)===null);
const WHO=/^[A-Za-z0-9_-]{1,128}$/;
const KEY=/^[A-Za-z0-9_.:-]{8,128}$/;
const ACTION=/^qb174-[a-f0-9]{64}$/;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const HASH=/^[a-f0-9]{64}$/;
export const privateId=x=>typeof x==='string'&&WHO.test(x)&&
 !['__anon__','__default__','__dev_test__'].includes(x);
export const validScope190=s=>isRecord(s)&&privateId(s.ownerId)&&
 privateId(s.characterId)&&KEY.test(s.instanceId)&&
 KEY.test(s.instanceEpoch)&&HASH.test(s.mapFingerprint);
const leaseFields=Object.freeze(['ownerId','characterId','worldInstanceId',
 'worldEpoch','serverSessionId','actionSessionId','leaseNonce','expiresAtMs']);
export const validLease190=(l,t)=>isRecord(l)&&privateId(l.ownerId)&&
 privateId(l.characterId)&&KEY.test(l.worldInstanceId)&&
 KEY.test(l.worldEpoch)&&KEY.test(l.serverSessionId)&&
 ACTION.test(l.actionSessionId)&&UUID.test(l.leaseNonce)&&
 Number.isSafeInteger(l.expiresAtMs)&&l.expiresAtMs>t&&
 l.expiresAtMs<=t+900000;
export const pinLease190=l=>Object.freeze(
 Object.fromEntries(leaseFields.map(k=>[k,l[k]])));
export const sameLease190=(a,b)=>isRecord(a)&&isRecord(b)&&
 leaseFields.every(k=>a[k]===b[k]);
export const denyTransport190=(reason)=>Object.freeze({ok:false,
 version:'19.0-20.0',reason,privateServerOnly:true,
 publicRouteInstalled:false,transportBindingCreated:false,
 resumeCombatAuthorized:false,worldLeaseRestored:false,
 rewardsIssued:false,productionReady:false});
