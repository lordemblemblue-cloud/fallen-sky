// In-game clan overlay. Private chat content is always loaded through a
// server-verified membership/role check, never direct public entity reads.

import { base44 } from '@/api/base44Client';

const listeners = new Set();

const state = {
  // The list of clans the local user belongs to (left sidebar)
  myClans: [],
  // Active clan id (which one is currently shown in the right panel)
  activeClanId: null,
  // Full Division record for the active clan
  activeClan: null,
  // ClanMember rows for the active clan
  members: [],
  // Online member ids (from User.is_online or presence heartbeat)
  onlineUserIds: new Set(),
  // The local user's membership row for the active clan
  myMembership: null,
  // Chat messages on the default channel for the active clan
  messages: [],
  // Vault items
  vaultItems: [],
  // Guild upgrades
  upgrades: [],
  // Guild hall (single row per clan)
  hall: null,
  // Open quests/missions
  missions: [],
  loading: false,
};

const subs = { divisions: null, members: null, messages: null, vault: null, upgrades: null, missions: null };

async function loadPrivateChat(clanId, channelId) {
  if (!clanId || !channelId) return [];
  const result = await base44.functions.invoke('secureClanAccess', {
    operation: 'getMessages', divisionId: clanId,
    entityData: { channelId }, limit: 100,
  });
  if (result?.data?.success !== true) return [];
  return Array.isArray(result.data.data) ? result.data.data.slice().reverse() : [];
}

function emit() { listeners.forEach((fn) => fn(getSnapshot())); }
export function getSnapshot() { return { ...state, onlineUserIds: new Set(state.onlineUserIds) }; }
export function subscribe(fn) { listeners.add(fn); fn(getSnapshot()); return () => listeners.delete(fn); }

// Load the user's clan memberships and pick an active one.
export async function loadMyClans(userId) {
  if (!userId) return;
  state.loading = true; emit();
  const memberships = await base44.entities.ClanMember.filter({ user_id: userId });
  const clanIds = [...new Set(memberships.map((m) => m.clan_id).filter(Boolean))];
  const clans = [];
  for (const id of clanIds) {
    try {
      const d = await base44.entities.Division.get(id);
      if (d) clans.push(d);
    } catch {}
  }
  state.myClans = clans;
  if (!state.activeClanId && clans.length > 0) {
    state.activeClanId = clans[0].id;
  }
  state.loading = false;
  emit();
  if (state.activeClanId) await loadActiveClan(state.activeClanId, userId);
}

export async function setActiveClan(clanId, userId) {
  state.activeClanId = clanId;
  await loadActiveClan(clanId, userId);
}

export async function loadActiveClan(clanId, userId) {
  if (!clanId) return;
  const [clan, members, vault, upgrades, missions, hallRows] = await Promise.all([
    base44.entities.Division.get(clanId).catch(() => null),
    base44.entities.ClanMember.filter({ clan_id: clanId }).catch(() => []),
    base44.entities.ClanVaultItem.filter({ clan_id: clanId }).catch(() => []),
    base44.entities.ClanUpgrade.filter({ clan_id: clanId }).catch(() => []),
    base44.entities.ClanQuest.filter({ divisionId: clanId }).catch(() => []),
    base44.entities.ClanHall.filter({ clan_id: clanId }).catch(() => []),
  ]);

  state.activeClan = clan;
  state.members = members || [];
  state.vaultItems = vault || [];
  state.upgrades = upgrades || [];
  state.missions = missions || [];
  state.hall = (hallRows && hallRows[0]) || null;
  state.myMembership = (members || []).find((m) => m.user_id === userId) || null;

  // The browser must never try to access service-role User records.
  // Use only authorized presence sources when they become available.
  state.onlineUserIds = new Set();

  // Choose only a channel allowed by this player's verified clan role.
  let chatChannelId = null;
  try {
    const channels = await base44.entities.ClanChannel.filter({ divisionId: clanId });
    const rank = { member: 0, officer: 1, leader: 2 };
    const memberRank = rank[state.myMembership?.role] ?? -1;
    const channel = (channels || []).find((ch) =>
      memberRank >= ({ none: 0, officer: 1, leader: 2 }[ch.role_restriction || 'none'] ?? 2));
    chatChannelId = channel?.id || null;
    state.messages = chatChannelId ? await loadPrivateChat(clanId, chatChannelId) : [];
  } catch {
    state.messages = [];
  }

  emit();
  attachRealtime(clanId, userId, chatChannelId);
}

// Real-time subscriptions for the currently active clan.
function attachRealtime(clanId, userId, chatChannelId) {
  detachRealtime();
  try {
    subs.divisions = base44.entities.Division.subscribe((evt) => {
      if (evt.id === clanId && evt.type === 'update') {
        state.activeClan = evt.data;
        emit();
      }
    });
    subs.members = base44.entities.ClanMember.subscribe((evt) => {
      const row = evt.data || { id: evt.id };
      if (row.clan_id !== clanId) return;
      if (evt.type === 'create') state.members = [...state.members, row];
      else if (evt.type === 'update') state.members = state.members.map((m) => m.id === row.id ? row : m);
      else if (evt.type === 'delete') state.members = state.members.filter((m) => m.id !== evt.id);
      state.myMembership = state.members.find((m) => m.user_id === userId) || null;
      emit();
    });
    if (chatChannelId) {
      // Backend membership/role validation is necessary for private chat.
      // Poll the scoped endpoint until an authorized realtime transport exists.
      let fetching = false;
      const poll = async () => {
        if (fetching || state.activeClanId !== clanId) return;
        fetching = true;
        try {
          const next = await loadPrivateChat(clanId, chatChannelId);
          if (state.activeClanId === clanId) { state.messages = next; emit(); }
        } catch { /* preserve messages on temporary failure */ }
        finally { fetching = false; }
      };
      const timer = setInterval(poll, 10_000);
      subs.messages = () => clearInterval(timer);
    }
    subs.vault = base44.entities.ClanVaultItem.subscribe((evt) => {
      const row = evt.data || { id: evt.id };
      if (row.clan_id !== clanId) return;
      if (evt.type === 'create') state.vaultItems = [...state.vaultItems, row];
      else if (evt.type === 'update') state.vaultItems = state.vaultItems.map((v) => v.id === row.id ? row : v);
      else if (evt.type === 'delete') state.vaultItems = state.vaultItems.filter((v) => v.id !== evt.id);
      emit();
    });
    subs.upgrades = base44.entities.ClanUpgrade.subscribe((evt) => {
      const row = evt.data || { id: evt.id };
      if (row.clan_id !== clanId) return;
      if (evt.type === 'create') state.upgrades = [...state.upgrades, row];
      else if (evt.type === 'update') state.upgrades = state.upgrades.map((u) => u.id === row.id ? row : u);
      else if (evt.type === 'delete') state.upgrades = state.upgrades.filter((u) => u.id !== evt.id);
      emit();
    });
  } catch (e) { console.warn('[clanStore] subscribe failed', e); }
}

function detachRealtime() {
  Object.keys(subs).forEach((k) => { try { subs[k]?.(); } catch {} subs[k] = null; });
}

export function teardownClanStore() {
  detachRealtime();
  state.myClans = []; state.activeClanId = null; state.activeClan = null;
  state.members = []; state.messages = []; state.vaultItems = []; state.upgrades = [];
  state.missions = []; state.hall = null; state.myMembership = null;
  emit();
}

// Server-side actions go through the clanSystem backend function.
export async function clanAction(action, data) {
  const res = await base44.functions.invoke('clanSystem', { action, data });
  if (res?.data?.error) throw new Error(res.data.error);
  return res?.data || res;
}