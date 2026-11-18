import { callGameServer } from '../social/socialServer';
import { getCharacterState, mergeCharactersFromServer, setActiveCharacter } from '../characterStore';
import { getStorageUser } from '../characterStorage';
import { fingerprintCharacterSave } from '../../../../base44/shared/characterSaveRules.ts';

// A guest's character name is public; this private, 160-bit bearer code is the
// proof of ownership. It is saved on this browser for automatic return visits.
// Someone who clears browser storage must have copied the code elsewhere.
const CODE_BASE = 'axe_guest_character_recovery_code_v1';
const codeKey = (id) => `${CODE_BASE}::${id}`;
const notify = () => window.dispatchEvent(new Event('axeGuestRecoveryCodeUpdated'));
export function getGuestRecoveryCode(id) {
  if (!id) return '';
  try { return localStorage.getItem(codeKey(id)) || ''; } catch { return ''; }
}
export function formatGuestRecoveryCode(id) {
  return getGuestRecoveryCode(id).match(/.{1,8}/g)?.join('-') || '';
}
export function forgetGuestRecoveryCode(id) {
  try { localStorage.removeItem(codeKey(id)); } catch {}
  notify();
}
const normalize = (value) => String(value || '').toUpperCase().replace(/[\\s-]/g, '');

export async function ensureGuestRecoveryCode(characterId) {
  if (!/^char_[A-Za-z0-9_-]+$/.test(characterId) || getStorageUser() !== '__anon__') {
    throw new Error('Cloud saving is only available for created guest characters.');
  }
  const existing = getGuestRecoveryCode(characterId);
  if (existing) return existing;
  const rosterEntry = getCharacterState().roster.find((c) => c.id === characterId && !c.isDevTest);
  if (!rosterEntry) throw new Error('Create a character before saving it to the cloud.');
  const result = await callGameServer('guestCharacterVault', 'register', { characterId, rosterEntry });
  if (!result?.recoveryCode) throw new Error('The cloud did not provide a recovery code.');
  try {
    localStorage.setItem(codeKey(characterId), result.recoveryCode);
  } catch {
    // Never silently accept a cloud character without a durable local key.
    throw new Error('Could not store this character’s recovery code in this browser.');
  }
  notify();
  return result.recoveryCode;
}

// The existing revision-based vault engine calls this in place of account
// characterVault. Backend authorization is the code, NEVER a guessed name/IP.
export async function callGuestCharacterVault(action, data) {
  if (getStorageUser() !== '__anon__') throw new Error('Guest save is not active.');
  const characterId = String(data?.characterId || '');
  const recoveryCode = await ensureGuestRecoveryCode(characterId);
  return callGameServer('guestCharacterVault', action, { ...data, recoveryCode });
}

export async function recoverGuestCharacter(name, rawCode) {
  const recoveryCode = normalize(rawCode);
  if (recoveryCode.length !== 40) throw new Error('Enter the complete recovery code.');
  const result = await callGameServer('guestCharacterVault', 'recover', { name: String(name || '').trim(), recoveryCode });
  const { characterId, rosterEntry, save } = result || {};
  if (!/^char_[A-Za-z0-9_-]+$/.test(characterId) || rosterEntry?.id !== characterId) throw new Error('Invalid cloud character data.');
  const alreadyOnDevice = getCharacterState().roster.some((character) => character.id === characterId);
  if (!alreadyOnDevice) {
    const end = `::__anon__::${characterId}`;
    for (const [key, value] of Object.entries(save?.data || {})) {
      if (/^[a-z][a-z0-9_]{2,63}$/.test(key) && typeof value === 'string') {
        localStorage.setItem(key + end, value);
      }
    }
    if (save) {
      localStorage.setItem(`axe_character_vault_meta${end}`, JSON.stringify({
        revision: save.revision,
        fingerprint: fingerprintCharacterSave(save.data || {}),
      }));
    }
  }
  // If this device already has the character, never silently replace progress.
  // The vault engine will compare snapshots and offer a conflict choice.
  localStorage.setItem(codeKey(characterId), recoveryCode);
  notify();
  if (!alreadyOnDevice) mergeCharactersFromServer([rosterEntry]);
  setActiveCharacter(characterId);
  return { characterId, name: rosterEntry.name, alreadyOnDevice };
}
