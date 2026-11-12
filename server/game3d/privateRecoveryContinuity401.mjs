// Combat / Quest 40.1–40.4: immutable, independently sourced
// replacement-worker identity snapshots. Not a login/reconnect issuer.
const ID = /^[A-Za-z0-9_-]{1,128}$/;
const WORLD = /^[A-Za-z0-9_.:-]{8,128}$/;
const RESERVED = new Set(['__anon__', '__default__', '__dev_test__']);
const KEYS = Object.freeze([
  'authenticated', 'identitySource', 'ownerId', 'characterId',
  'instanceId', 'instanceEpoch', 'expiresAtMs', 'serverWorkerContext',
]);
const validId = value => typeof value === 'string' &&
  ID.test(value) && !RESERVED.has(value);
const validWorld = value => typeof value === 'string' && WORLD.test(value);

/** Return a scalar-only snapshot. Do not retain a mutable backend receipt. */
export function pinOriginalRecovery401(receipt, workerContext, at) {
  try {
    if (!Number.isSafeInteger(at) || at <= 0 ||
        !receipt || typeof receipt !== 'object' || Array.isArray(receipt) ||
        Object.getPrototypeOf(receipt) !== Object.prototype ||
        Object.keys(receipt).length !== KEYS.length ||
        !KEYS.every(key => Object.hasOwn(receipt, key))) return null;
    // A private backend proof must contain stable data properties only.
    // Never evaluate attacker-supplied getters more than once (or at all).
    const descriptors = Object.getOwnPropertyDescriptors(receipt);
    if (!KEYS.every(key => descriptors[key] &&
          Object.hasOwn(descriptors[key], 'value'))) return null;
    const value = Object.fromEntries(KEYS.map(key => [key, descriptors[key].value]));
    if (value.authenticated !== true ||
        value.identitySource !== 'trusted-original-worker-recovery-383' ||
        value.serverWorkerContext !== workerContext ||
        !validId(value.ownerId) || !validId(value.characterId) ||
        !validWorld(value.instanceId) || !validWorld(value.instanceEpoch) ||
        !Number.isSafeInteger(value.expiresAtMs) ||
        value.expiresAtMs <= at || value.expiresAtMs > at + 30000) return null;
    return Object.freeze({
      ownerId: value.ownerId,
      characterId: value.characterId,
      instanceId: value.instanceId,
      instanceEpoch: value.instanceEpoch,
      expiresAtMs: value.expiresAtMs,
      serverWorkerContext: workerContext,
    });
  } catch {
    // Throwing getters or proxies must never authorize a private socket.
    return null;
  }
}

/** Fresh original-world verification is required after the awaited provider.
 * The first expiry is an absolute ceiling, even if the verifier reissues a
 * later deadline. A later proof may shorten, never extend, that first lease.
 */
export function sameOriginalRecovery401(pinned, receipt, workerContext, at) {
  const fresh = pinOriginalRecovery401(receipt, workerContext, at);
  return !!pinned && !!fresh &&
    pinned.serverWorkerContext === workerContext &&
    pinned.expiresAtMs > at &&
    fresh.ownerId === pinned.ownerId &&
    fresh.characterId === pinned.characterId &&
    fresh.instanceId === pinned.instanceId &&
    fresh.instanceEpoch === pinned.instanceEpoch;
}
