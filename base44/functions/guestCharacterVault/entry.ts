import { createClientFromRequest } from 'npm:@base44/sdk@0.8.63';
import { checkCharacterSave, fingerprintCharacterSave } from '../../shared/characterSaveRules.ts';
import { readBoundedGuestBody } from '../../shared/readBoundedGuestBody.mjs';

// Deliberately passwordless guest play: no Base44 auth.me() and no user entity.
// Authorization is possession of a high-entropy recovery code. The entity is
// admin-only; untrusted browsers may access it ONLY through this function.
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
});
const ID = /^char_[A-Za-z0-9_-]{1,110}$/;
const CODE = /^[A-F0-9]{40}$/;
const NAME = /^[\p{L}\p{N} '\-]{2,24}$/u;
const MAX_ROSTER_BYTES = 15_000;
type RecordData = Record<string, any>;

function nameKey(name: unknown): string {
  const value = String(name || '').normalize('NFKC').trim().replace(/\s+/g, ' ');
  if (!NAME.test(value)) throw Object.assign(new Error('Choose a character name of 2–24 letters, numbers, spaces, apostrophes or hyphens.'), { status: 400 });
  return value.toLocaleLowerCase('en-US');
}
function safeRoster(raw: unknown, id: string, name: string): RecordData {
  const value = raw && typeof raw === 'object' && !Array.isArray(raw) ? { ...(raw as RecordData), id, name } : { id, name };
  if (JSON.stringify(value).length > MAX_ROSTER_BYTES) throw Object.assign(new Error('Character appearance is too large.'), { status: 413 });
  return value;
}
function freshCode(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(20)), x => x.toString(16).padStart(2, '0')).join('').toUpperCase();
}
async function hashCode(code: string): Promise<string> {
  const bytes = new TextEncoder().encode(code);
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), x => x.toString(16).padStart(2, '0')).join('');
}
function validCode(raw: unknown): string | null {
  const code = String(raw || '').toUpperCase().replace(/[\s-]/g, '');
  return CODE.test(code) ? code : null;
}
function sameHash(left: string, right: string) {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let i = 0; i < left.length; i++) mismatch |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return mismatch === 0;
}
const metadata = (row: RecordData) => ({
  id: row.id, character_id: row.character_id, revision: row.revision,
  fingerprint: row.fingerprint, saved_at: row.saved_at, roster_entry: row.roster_entry,
});
const fullSave = (row: RecordData) => row.revision > 0 ? { ...metadata(row), data: row.data || {} } : null;

// Shared quotas bound unauthenticated work across all function instances. The
// single-id predicate is rechecked by Base44 in the same write as the change.
const quotaIds = new Map<string, string>();
async function admitGuestAttempt(quotas: any, action: 'register' | 'recover') {
  let id = quotaIds.get(action);
  if (!id) {
    const rows = await quotas.filter({ action }, 'created_date', 2);
    if (rows.length !== 1) throw new Error('Guest quota is unavailable');
    id = String(rows[0].id);
    quotaIds.set(action, id);
  }
  const minute = Math.floor(Date.now() / 60_000) * 60_000;
  const limit = action === 'register' ? 30 : 120;
  const reset = await quotas.updateMany({ id, window_start: { $lt: minute } },
    { $set: { window_start: minute, used: 1 } });
  if (reset.updated === 1) return true;
  const claim = await quotas.updateMany({ id, window_start: minute, used: { $lt: limit } },
    { $inc: { used: 1 } });
  return claim.updated === 1;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  try {
    const raw = await readBoundedGuestBody(req);
    if (raw === null) return json({ error: 'Save request is too large' }, 413);
    const payload = JSON.parse(raw || '{}');
    const action = String(payload.action || '');
    const data = payload.data && typeof payload.data === 'object' ? payload.data : {};
    if (!['register', 'recover', 'get', 'put', 'delete'].includes(action)) return json({ error: 'Unknown action' }, 400);

    const base44 = createClientFromRequest(req);
    if (action === 'register' || action === 'recover') {
      if (!await admitGuestAttempt(base44.asServiceRole.entities.GuestVaultQuota, action)) {
        return json({ error: 'Too many guest save attempts. Try again in a minute.' }, 429);
      }
    }
    const collection = base44.asServiceRole.entities.Game3DGuestCharacterSave;

    if (action === 'register') {
      const characterId = String(data.characterId || '');
      if (!ID.test(characterId)) return json({ error: 'Invalid character' }, 400);
      const displayName = String(data.rosterEntry?.name || '').normalize('NFKC').trim().replace(/\s+/g, ' ');
      const key = nameKey(displayName);
      const prior = await collection.filter({ character_id: characterId }, '-created_date', 2);
      if (prior?.length) return json({ error: 'Character already registered; use the recovery code.', code: 'already_registered' }, 409);
      const code = freshCode();
      await collection.create({
        character_id: characterId, name_key: key, name: displayName,
        recovery_hash: await hashCode(code), revision: 0, data: {},
        fingerprint: fingerprintCharacterSave({}),
        roster_entry: safeRoster(data.rosterEntry, characterId, displayName),
        saved_at: new Date().toISOString(),
      });
      // Returned exactly once. Client stores it on the visitor's device.
      return json({ success: true, characterId, name: displayName, recoveryCode: code });
    }

    const code = validCode(data.recoveryCode);
    if (!code) return json({ error: 'Character name or recovery code not found', code: 'not_found' }, 404);
    const digest = await hashCode(code);
    let matches: RecordData[];
    if (action === 'recover') {
      // Look up by secret hash, not by an arbitrarily limited list of common
      // names (hundreds of players may choose the same character name).
      matches = (await collection.filter({ recovery_hash: digest }, '-created_date', 2)) || [];
    } else {
      if (!ID.test(String(data.characterId || ''))) return json({ error: 'Invalid character' }, 400);
      matches = (await collection.filter({ character_id: String(data.characterId) }, '-created_date', 2)) || [];
    }
    const nameForRecovery = action === 'recover' ? nameKey(data.name) : null;
    const row = matches.find((item) => !item.deleted_at &&
      sameHash(String(item.recovery_hash || ''), digest) &&
      (!nameForRecovery || item.name_key === nameForRecovery));
    if (!row) return json({ error: 'Character name or recovery code not found', code: 'not_found' }, 404);
    if (action === 'recover') return json({ success: true, characterId: row.character_id, rosterEntry: row.roster_entry, save: fullSave(row) });
    if (action === 'get') return json({ success: true, save: fullSave(row) });
    if (action === 'delete') {
      await collection.update(row.id, { deleted_at: new Date().toISOString(), previous_data: row.data || {}, previous_revision: row.revision, data: {}, roster_entry: null });
      return json({ success: true, deleted: true });
    }

    const expected = Number(data.expectedRevision);
    if (!Number.isInteger(expected) || expected < 0) return json({ error: 'Invalid expected revision' }, 400);
    if (expected !== row.revision && !data.overwrite) return json({ error: 'A newer character save exists', code: 'conflict', save: fullSave(row) }, 409);
    const minutes = row.saved_at ? Math.max(0, (Date.now() - Date.parse(row.saved_at)) / 60_000) : Infinity;
    const check = checkCharacterSave(data.data, row.revision ? row.data : null, { minutesSincePrevious: minutes });
    if (!check.ok) return json({ error: 'Character save rejected', code: 'rejected', errors: check.errors }, 422);
    // Keep the prior snapshot before every update, including an explicit overwrite.
    const savedAt = new Date().toISOString();
    const revision = row.revision + 1;
    const patch = {
      revision, data: data.data, fingerprint: fingerprintCharacterSave(data.data),
      roster_entry: safeRoster(data.rosterEntry || row.roster_entry, row.character_id, row.name),
      previous_data: row.data || {}, previous_revision: row.revision, saved_at: savedAt,
    };
    await collection.update(row.id, patch);
    return json({ success: true, save: { ...metadata({ ...row, ...patch }), revision }, flags: check.flags });
  } catch (error) {
    const status = Number((error as { status?: number })?.status) || 500;
    if (status >= 500) console.error('[guestCharacterVault]', error);
    return json({ error: status < 500 ? (error as Error).message : 'Guest cloud save is unavailable' }, status);
  }
});
