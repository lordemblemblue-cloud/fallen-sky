// Combat Foundation 8.4 — central trusted character ID policy.
// This centralizes one source-only validation contract (not user authentication).
export function validServerCharacterKey(value) {
 return typeof value==='string' &&
   /^[A-Za-z0-9_-]{1,128}$/.test(value) &&
   value!=='__anon__' && value!=='__default__';
}
export function validCharacterOwnerPair({ownerId,characterId}={}) {
 return validServerCharacterKey(ownerId)&&validServerCharacterKey(characterId);
}
