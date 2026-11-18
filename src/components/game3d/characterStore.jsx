import {game3dCharacterModel} from './game3dCharacterModel';
// ─── Character Roster Store ────────────────────────────────────────────
// Persistent multi-character roster. Each character has:
//   { id, name, appearance: { head, body, shoulders }, createdAt }
//
// One character is "active" at a time. The active character's ID is the
// namespace key used by every progression store (level/xp, halo, titles,
// weapon mastery, kill count, etc.) via `characterStorage.js`. Switching
// the active character causes every store to reload from that character's
// own slot — so each character has fully independent stats and starts
// fresh at level 1 with 0 in everything.

import {
  notifyCharacterChange,
  subscribeCharacterChange,
  userScopedKey,
} from './characterStorage';
import { GLOBAL_AVATAR_MODEL_URL, DEFAULT_AVATAR_APPEARANCE, companionModel } from '@/components/onboarding/genesisAssets';
import { makeAXECharacterEntryFields, validateAXECharacterName } from './axe/characters/AXECharacterEntry';
import { getAXEFaction, AXE_WEAPON_ROLES } from './axe/factions/AXEFactionWeaponConfig';

// Roster + active-character keys are scoped to the signed-in user, so one
// account's roster is never visible to another account on the same browser.
const ROSTER_BASE = 'wwm_character_roster_v1';
const ACTIVE_BASE = 'wwm_character_active_v1';
const DELETED_BASE = 'wwm_character_deleted_v1';
const rosterKey = () => userScopedKey(ROSTER_BASE);
const activeKey = () => userScopedKey(ACTIVE_BASE);
const deletedKey = () => userScopedKey(DELETED_BASE);
const deletedIds = () => {
  try { const ids = JSON.parse(localStorage.getItem(deletedKey()) || '[]');
    return new Set(Array.isArray(ids) ? ids.filter(id => typeof id === 'string' && /^char_[A-Za-z0-9_-]+$/.test(id)) : []);
  } catch { return new Set(); }
};

// The platform avatar is shared across Atom X Eve, not a disposable Game 3D
// creation; Dev Test also holds older progression data and is always protected.
export const isDeletableGame3DCharacter = character => Boolean(character &&
  typeof character.id === 'string' && /^char_[A-Za-z0-9_-]+$/.test(character.id) &&
  !character.isDevTest && !character.platform_avatar_id);

// Default appearance — only one option per slot for now. More can be added later.
export const APPEARANCE_OPTIONS = {
  head:      [{ id: 'default', label: 'Default' }],
  body:      [{ id: 'default', label: 'Default' }],
  shoulders: [{ id: 'default', label: 'Default' }],
};

// Reserved id for the editor-only "Dev Test" character. This slot OWNS the
// legacy single-key progression data (the test progression that existed
// before the multi-character system) — `characterStorage.js` migrates the
// legacy keys into this id on first run, so it shows up pre-loaded with
// your old test data. Every character created AFTER this one starts fresh.
const DEV_TEST_ID = '__dev_test__';

const DEV_TEST_CHARACTER = {
  id: DEV_TEST_ID,
  name: 'Dev Test',
  isDevTest: true,
  appearance: { head: 'default', body: 'default', shoulders: 'default' },
  model_url: GLOBAL_AVATAR_MODEL_URL,
  face_scan_generated: false,
  tripo_model_id: '',
  createdAt: '1970-01-01T00:00:00.000Z',
};

function load() {
  try {
    const stored = JSON.parse(localStorage.getItem(rosterKey()) || '[]');
    // Ensure the Dev Test slot is always present at the top of the roster
    // (editor-only — safe to leave in for now; will be the first to display).
    const deleted=deletedIds();
    const withoutDev = (Array.isArray(stored)?stored:[]).filter(c => c?.id !== DEV_TEST_ID && !deleted.has(c?.id));
    const roster = [DEV_TEST_CHARACTER, ...withoutDev];
    const storedActive=localStorage.getItem(activeKey()) || DEV_TEST_ID;
    const activeId=roster.some(c=>c.id===storedActive)?storedActive:(withoutDev[0]?.id || DEV_TEST_ID);
    return { roster, activeId };
  } catch {
    return { roster: [DEV_TEST_CHARACTER], activeId: DEV_TEST_ID };
  }
}

let state = load();
const listeners = new Set();

const persist = () => {
  try {
    // Don't persist the Dev Test character into the roster — it's seeded
    // on every load() so it's always present without polluting the saved
    // user-created roster.
    const persistable = state.roster.filter((c) => c.id !== DEV_TEST_ID);
    localStorage.setItem(rosterKey(), JSON.stringify(persistable));
    if (state.activeId) localStorage.setItem(activeKey(), state.activeId);
  } catch {}
};
const emit = () => { persist(); listeners.forEach((fn) => fn(state)); };

// When the signed-in user changes, drop this roster and re-read the new
// user's own roster + active character (never carry the old one over).
subscribeCharacterChange(() => {
  state = load();
  listeners.forEach((fn) => fn(state));
});

export function getCharacterState() { return state; }

export function subscribeCharacters(fn) {
  listeners.add(fn);
  fn(state);
  return () => listeners.delete(fn);
}

export function getActiveCharacter() {
  return state.roster.find((c) => c.id === state.activeId) || null;
}

// Create a new character. Stored progression starts EMPTY for this id —
// the namespaced storage layer returns nothing for new ids, so every store
// initializes to its defaults (level 1, 0 XP, 0 halo, no titles, etc.).
export function createCharacter({ name, appearance, avatarConfig = {}, factionId, startingWeaponStyleId }) {
  const nameCheck = validateAXECharacterName(name || 'New Character');
  if (!nameCheck.ok) throw new Error(`Invalid character name: ${nameCheck.reason}`);
  const id = `char_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const character = {
    ...Object.fromEntries([...Object.keys(DEFAULT_AVATAR_APPEARANCE),'gender','female_model_variant','model_url'].filter(k=>avatarConfig[k]!==undefined).map(k=>[k,avatarConfig[k]])), appearance_version:4,
    id,
    name: nameCheck.value,
    ...makeAXECharacterEntryFields({ factionId, startingWeaponStyleId }),
    appearance: {
      head:      appearance?.head      || 'default',
      body:      appearance?.body      || 'default',
      shoulders: appearance?.shoulders || 'default',
    },
    model_url: game3dCharacterModel(avatarConfig),
    face_scan_generated: Boolean(avatarConfig.face_scan_generated),
    tripo_model_id: avatarConfig.tripo_model_id || '',
    style_preset: avatarConfig.style_preset || 'heroic_fantasy',
    skin_tone: avatarConfig.skin_tone || '#b97855',
    eye_color: avatarConfig.eye_color || '#5ca9c9',
    hair_color: avatarConfig.hair_color || '#2a1d18',
    height_scale: avatarConfig.height_scale || 1,
    body_proportions: avatarConfig.body_proportions || { width: 1, depth: 1 },
    createdAt: new Date().toISOString(),
  };
  state = {
    roster: [...state.roster, character],
    activeId: id,
  };
  emit();
  // Tell every progression store to reload from this character's slot
  // (which is empty for a new character → everything resets to defaults).
  notifyCharacterChange();
  return character;
}

// For account-backed characters, call only AFTER the owning account's
// characterVault delete succeeds. A guest (__anon__) character has no remote
// account and may be deleted directly from browser-local storage.
// Also clears this user's local character-scoped progress/backup data, so a
// different character never inherits its inventory, currency or old XP.
export function deleteCreatedCharacter(id) {
  const character=state.roster.find(c=>c.id===id);
  if(!isDeletableGame3DCharacter(character))return false;
  const deleted=deletedIds();deleted.add(id);
  // Persist the tombstone before removing anything from the roster. If an
  // earlier asynchronous server list arrives, it must not resurrect this slot.
  localStorage.setItem(deletedKey(),JSON.stringify([...deleted]));
  const suffix=userScopedKey('')+'::'+id;
  for(let i=localStorage.length-1;i>=0;i--){
    const key=localStorage.key(i);
    if(key?.endsWith(suffix))localStorage.removeItem(key);
  }
  const wasActive=state.activeId===id;
  const roster=state.roster.filter(c=>c.id!==id);
  const activeId=wasActive
    ? (roster.find(c=>c.platform_avatar_id)?.id || roster.find(c=>!c.isDevTest)?.id || DEV_TEST_ID)
    : state.activeId;
  state={roster,activeId};
  emit();
  // The new active character's existing namespaced data now owns the HUD.
  if(wasActive)notifyCharacterChange();
  return true;
}

export function setActiveCharacter(id) {
  if (!state.roster.some((c) => c.id === id)) return;
  if (state.activeId === id) return;
  state = { ...state, activeId: id };
  emit();
  notifyCharacterChange();
}

// Characters the server holds that this device has never seen (played on another device,
// or browser data cleared) join the roster. Characters already here are left as they are;
// the Dev Test slot is always local. Returns how many were added. Only the roster is written:
// which character is active stays as it was (persist() would also store the Dev Test default).
export function mergeCharactersFromServer(entries = []) {
  const known = new Set(state.roster.map((c) => c.id));
  const deleted=deletedIds();
  const added = (entries || []).filter((e) => e?.id && e.id !== DEV_TEST_ID && !known.has(e.id))
    .filter(e=>!deleted.has(e.id))
    .map((e) => ({ ...e, name: String(e.name || 'Character').slice(0, 40), appearance: e.appearance || { head: 'default', body: 'default', shoulders: 'default' } }));
  if (!added.length) return 0;
  state = { ...state, roster: [...state.roster, ...added] };
  try { localStorage.setItem(rosterKey(), JSON.stringify(state.roster.filter((c) => c.id !== DEV_TEST_ID))); } catch {}
  listeners.forEach((fn) => fn(state));
  return added.length;
}

// Called by the login screen when "PLAY" is pressed for a chosen character.
// Just switches the active character — every progression store will
// automatically reload from that character's namespaced slot.
export async function activateAndSyncToHUD(id) {
  const character=state.roster.find(c=>c.id===id);
  if (!character) throw new Error('This character is no longer in your Game 3D roster. Refresh Character Select.');
  // Entering the world is a local character selection, not an implicit
  // account-avatar save. The previous remote write could fail on the migrated
  // app and block Play before the existing 3D scene could be entered.
  // Customizations are saved explicitly through the character creator.
  setActiveCharacter(id);
  window.dispatchEvent(new CustomEvent('axeCharacterActivated',{detail:{characterId:id,character}}));
}
window.addEventListener('avatarAppearanceSaved', event => {
  const avatar = event.detail?.avatar;
  if (!avatar) return;
  const patch = Object.fromEntries(
    [...Object.keys(DEFAULT_AVATAR_APPEARANCE), 'gender', 'female_model_variant', 'model_url']
      .filter((key) => avatar[key] !== undefined)
      .map((key) => [key, avatar[key]]),
  );
  // Once the universal avatar has its own linked Game 3D slot, do not silently
  // rewrite an unrelated character's appearance when the account avatar changes.
  // Older installs with no platform slot retain the original active-slot behavior.
  const linked = state.roster.find((character) => character.platform_avatar_id === avatar.id);
  const targetId = linked?.id || state.activeId;
  state = {
    ...state,
    roster: state.roster.map((character) =>
      character.id === targetId && !character.isDevTest ? { ...character, ...patch } : character),
  };
  emit();
});


/**
 * Link the already-created, account-owned Atom X Eve AI avatar to Game 3D.
 * This is a Game 3D progression slot, NOT another Avatar entity/persona.
 * Never overwrite an existing player's custom Game 3D slot or its XP.
 */
export function upsertPlatformAvatarCharacter(avatar) {
  if (!avatar?.id || avatar.setup_status !== 'complete') return null;
  const safeId = String(avatar.id).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 90);
  if (!safeId) return null;
  const id = 'platform_' + safeId;
  const appearance = Object.fromEntries(
    [...Object.keys(DEFAULT_AVATAR_APPEARANCE), 'gender', 'female_model_variant', 'model_url']
      .filter((key) => avatar[key] !== undefined)
      .map((key) => [key, avatar[key]]),
  );
  const nameResult = validateAXECharacterName(String(avatar.name || 'AI Avatar').slice(0, 24));
  const name = nameResult.ok ? nameResult.value : 'AI Avatar';
  const existing = state.roster.find((character) => character.id === id);
  const fields = {
    ...appearance,
    id,
    platform_avatar_id: String(avatar.id),
    name,
    model_url: companionModel(avatar),
    appearance_version: Number(avatar.appearance_version) || 4,
    face_scan_generated: Boolean(avatar.face_scan_generated),
  };
  if (existing) {
    // Preserve progression identity, game-specific fields, and creation date.
    if (Object.entries(fields).every(([key, value]) => JSON.stringify(existing[key]) === JSON.stringify(value))) {
      return existing;
    }
    state = {
      ...state,
      roster: state.roster.map((character) => character.id === id ? { ...character, ...fields } : character),
    };
    emit();
    return state.roster.find((character) => character.id === id);
  }
  const otherPlayerSlots = state.roster.filter((character) => !character.isDevTest);
  const platformEntry = {
    ...makeAXECharacterEntryFields({}),
    appearance: { head: 'default', body: 'default', shoulders: 'default' },
    createdAt: new Date().toISOString(),
    ...fields,
  };
  state = {
    roster: [...state.roster, platformEntry],
    // On a first visit, use the platform avatar instead of the editor-only slot.
    // Existing game-specific characters retain their active progression choice.
    activeId: otherPlayerSlots.length === 0 && state.activeId === DEV_TEST_ID ? id : state.activeId,
  };
  emit();
  if (state.activeId === id) notifyCharacterChange();
  return platformEntry;
}

// AXE Prompt 012 — faction and starting combat-identity setters.
export function setActiveCharacterFaction(factionId) {
  const active = getActiveCharacter();
  if (!active || active.isDevTest) return false;
  if (factionId !== 'AXE_Faction_Unassigned' && !getAXEFaction(factionId)) return false;
  state = {
    ...state,
    roster: state.roster.map((character) =>
      character.id === active.id ? { ...character, factionId } : character,
    ),
  };
  emit();
  window.dispatchEvent(new CustomEvent('axeCharacterFactionChanged', {
    detail: { characterId: active.id, factionId },
  }));
  return true;
}

export function setActiveCharacterStartingWeaponRole(role) {
  const active = getActiveCharacter();
  if (!active || active.isDevTest) return false;
  if (!Object.values(AXE_WEAPON_ROLES).includes(role)) return false;
  state = {
    ...state,
    roster: state.roster.map((character) =>
      character.id === active.id
        ? { ...character, startingWeaponStyleId: `AXE_WeaponRole_${role}` }
        : character,
    ),
  };
  emit();
  window.dispatchEvent(new CustomEvent('axeCharacterWeaponRoleChanged', {
    detail: { characterId: active.id, role },
  }));
  return true;
}
