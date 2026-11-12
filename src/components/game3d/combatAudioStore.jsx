// Combat / action sound effect store.
// Maps action key → uploaded audio URL. Persists to localStorage.
// Game code calls playActionSound(key) at runtime to play the SFX.
// Keys without an upload fall back to the built-in sound pack
// (audio/defaultSoundPack.mjs); an upload always replaces the built-in files.
import { getDefaultSoundVariants, resolveSoundVariants, createVariantPicker, DEFAULT_ACTION_SOUNDS } from './audio/defaultSoundPack.mjs';

const STORAGE_KEY = 'combat_audio_map_v1';

// All registered action types. Add new ones here + the manager picks them up.
export const ACTION_SOUNDS = [
  { key: 'player_walk',   label: 'Player Walk / Run',     category: 'player',  description: 'Plays in loop while the player moves' },
  { key: 'player_attack', label: 'Player Attack (Legacy Fallback)', category: 'player', description: 'Fallback for melee and ranged release when dedicated audio is not uploaded' },
  { key: 'player_melee_swing', label: 'Melee Weapon Swing', category: 'player', description: 'Optional sword/fist swing on the resolved strike frame' },
  { key: 'player_blade_wind', label: 'Blade Wind Whoosh Layer', category: 'player', description: 'Plays simultaneously with each melee swing; rushing air as the blade cuts through the wind' },
  { key: 'player_blade_resonance', label: 'Blade Metal / Resonance Layer', category: 'player', description: 'Optional third swing layer, mixed below the primary swing and wind whoosh' },
  { key: 'player_blade_cut', label: 'Blade Cutting Enemy Layer', category: 'player', description: 'Plays only when a melee strike actually hits; layers over the existing enemy impact' },
  { key: 'player_ranged_release', label: 'Ranged Weapon Release', category: 'player', description: 'Optional ranged release on the resolved strike frame' },
  { key: 'combo_finisher', label: 'Combo Finisher (3rd Hit)', category: 'player', description: 'Layered on the third swing of a melee skill combo (the combo-3 strike)' },
  { key: 'player_hit',    label: 'Player Takes Damage',   category: 'player',  description: 'Plays when an enemy lands a hit on the player' },
  { key: 'player_jump',   label: 'Player Jump',           category: 'player',  description: 'Plays on jump (Space)' },
  { key: 'enemy_attack',  label: 'Enemy Attack',          category: 'enemy',   description: 'Plays when an enemy swings at the player' },
  { key: 'enemy_hit', label: 'Enemy Takes Damage', category: 'enemy', description: 'Default contact audio at resolved impact' },
  { key: 'enemy_critical_hit', label: 'Enemy Critical Impact', category: 'enemy', description: 'Optional heavier contact sound for critical hits' },
  { key: 'enemy_lethal_hit', label: 'Enemy Lethal Impact', category: 'enemy', description: 'Optional final-impact sound; enemy death audio remains separate' },
  { key: 'enemy_death',   label: 'Enemy Death',           category: 'enemy',   description: 'Plays when an enemy dies' },
  { key: 'armor_break', label: 'Armor / Shield Break', category: 'enemy', description: "A boss's armor bar shatters, or a hit breaks your Aegis / Ascension shield" },
  { key: 'ambience_water_flow', label: 'Flowing Water (Spatial Loop)', category: 'environment', description: 'River or underground lake grows louder as the player approaches; fades away at distance' },
  { key: 'ambience_waterfall', label: 'Waterfall / Rapids (Spatial Loop)', category: 'environment', description: 'Optional second layered water bed; more intense right beside a rapid or fall' },
  { key: 'ambience_wind', label: 'World Wind (Resumable Loop)', category: 'environment', description: 'Outdoor atmosphere fades out in combat and resumes at its previous playback time' },
  { key: 'ambience_cave', label: 'Dungeon Cave Room Tone (Resumable Loop)', category: 'environment', description: 'Subtle dungeon ambience plays between fights and resumes at the previous playback time' },
  { key: 'ambience_cave_drips', label: 'Cave Water Drips (Spatial Loop)', category: 'environment', description: 'Optional damp cavern water sounds near the underground lake' },
  { key: 'ambience_nature', label: 'Outdoor Nature (Resumable Loop)', category: 'environment', description: 'Calm outdoor bed in Wolfveil and the forest; pauses in combat and resumes at its previous time' },
  { key: 'level_up',      label: 'Level Up',              category: 'system',  description: 'Plays when the player gains a level' },
  { key: 'quest_accept',  label: 'Quest Accepted',        category: 'system',  description: 'Plays when a quest is accepted' },
  { key: 'quest_complete',label: 'Quest Completed',       category: 'system',  description: 'Plays when a quest reward is claimed' },
  { key: 'chest_open', label: 'Chest / Loot Container Opened', category: 'system', description: 'Plays when a chest or loot container is opened' },
  { key: 'victory', label: 'Victory', category: 'system', description: 'Boss defeated, duel or faction war won, or a milestone quest completed' },
];

const load = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
};

let map = load();
const listeners = new Set();
const emit = () => listeners.forEach((fn) => fn(map));
const persist = () => {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(map)); } catch {}
};

// The uploaded URL, else the first built-in file. Stable per key, so looping
// ambience beds and "is this key configured" checks never flip between files.
export function getActionSound(key) {
  return map[key] || getDefaultSoundVariants(key)[0] || null;
}

// Every file playActionSound may choose from: [upload] or the built-in variants.
export function getActionSoundVariants(key) {
  return resolveSoundVariants(key, map);
}

// Built-in files for a key (empty when the pack has none). For the admin UI.
export function getDefaultActionSoundVariants(key) {
  return getDefaultSoundVariants(key);
}

// Uploaded overrides only (the admin UI shows these as SET).
export function getAllActionSounds() {
  return { ...map };
}

export function setActionSound(key, url) {
  map = { ...map, [key]: url };
  persist();
  emit();
}

export function clearActionSound(key) {
  const next = { ...map };
  delete next[key];
  map = next;
  persist();
  emit();
}

export function subscribeActionSounds(fn) {
  listeners.add(fn);
  fn(map);
  return () => listeners.delete(fn);
}

// Lightweight runtime player. Reuses a small pool per file so rapid-fire
// sounds (e.g. swings) don't cut each other off. Pools are keyed by URL: an
// admin replacement or a different random variant gets its own elements
// instead of reloading a shared element's src mid-combat.
const POOL_SIZE = 4;
const audioPool = {};
const pickVariant = createVariantPicker();

function pooledAudio(url) {
  const pool = audioPool[url] || (audioPool[url] = []);
  // Find an unused (or finished) pool slot
  let audio = pool.find((a) => a.paused || a.ended);
  if (!audio) {
    if (pool.length < POOL_SIZE) {
      audio = new Audio(url);
      pool.push(audio);
    } else {
      audio = pool[0];
    }
  }
  return audio;
}

export function playActionSound(key, { volume = 0.7 } = {}) {
  const url = pickVariant(key, resolveSoundVariants(key, map));
  if (!url) return;
  const audio = pooledAudio(url);
  audio.volume = Math.min(1, Math.max(0, Number(volume) || 0));
  audio.currentTime = 0;
  audio.play().catch(() => {});
}

// Fetch the built-in one-shots ahead of the first swing/hit so the first
// play is not delayed by the download. Looping ambience beds load themselves.
export function preloadActionSounds(keys = Object.keys(DEFAULT_ACTION_SOUNDS)) {
  if (typeof Audio === 'undefined') return 0;
  let created = 0;
  for (const key of keys) {
    if (key.startsWith('ambience_')) continue;
    for (const url of resolveSoundVariants(key, map)) {
      if (audioPool[url]?.length) continue;
      try {
        const audio = new Audio(url);
        audio.preload = 'auto';
        audioPool[url] = [audio];
        created += 1;
      } catch {}
    }
  }
  return created;
}

// Loop helpers (for walk SFX). Returns a stop function.
const loopInstances = {};

export function startLoopSound(key, { volume = 0.5 } = {}) {
  if (loopInstances[key]) return; // already looping
  const url = getActionSound(key);
  if (!url) return;
  const audio = new Audio(url);
  audio.loop = true;
  audio.volume = volume;
  audio.play().catch(() => {});
  loopInstances[key] = audio;
}

export function stopLoopSound(key) {
  const audio = loopInstances[key];
  if (audio) {
    audio.pause();
    audio.currentTime = 0;
    delete loopInstances[key];
  }
}