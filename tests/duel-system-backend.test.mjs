// duelSystem: Game 3D duels resolved by the server (docs/game3d/BACKEND_AUDIT.md).
// The function runs against an in-memory Base44 stand-in; its dice are scripted.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
let now = Date.now();
class FixtureDate extends Date { static now() { return now; } }

const tables = {};
const reset = () => {
  for (const k of Object.keys(tables)) delete tables[k];
  rolls.length = 0;
  now = Date.now();
  Object.assign(tables, {
    AvatarProgression: [{id:'pa',user_id:'alice',global_level:40},{id:'pb',user_id:'bob',global_level:45}],
    DuelSession: [],
    SocialNotification: [],
    SocialFriendship: [{ id: 'f1', user_a_id: 'alice', user_b_id: 'carol' }],
    PlayerState: [{ id: 'p1', player_id: 'bob', status: 'online', last_update: Date.now() }],
  });
};
const matches = (row, filter) => Object.entries(filter).every(([k, v]) => row[k] === v);
let seq = 0;
const entities = new Proxy({}, { get: (_, name) => ({
  filter: async (filter = {}) => (tables[name] || []).filter((r) => matches(r, filter)).map((r) => ({ ...r })),
  get: async (id) => { const r = (tables[name] || []).find((x) => x.id === id); return r ? { ...r } : null; },
  create: async (data) => { const row = { id: `${name}-${++seq}`, ...data }; (tables[name] ||= []).push(row); return { ...row }; },
  update: async (id, patch) => { const r = (tables[name] || []).find((x) => x.id === id); Object.assign(r, patch); return { ...r }; },
  delete: async (id) => { tables[name] = (tables[name] || []).filter((x) => x.id !== id); },
}) });
const users = { alice: { id: 'alice', full_name: 'Alice' }, bob: { id: 'bob', full_name: 'Bob' }, carol: { id: 'carol', full_name: 'Carol' }, dave: { id: 'dave', full_name: 'Dave' } };

// the function's dice
const rolls = [];
const scriptedMath = Object.create(Math);
scriptedMath.random = () => (rolls.length ? rolls.shift() : 0.5);

let handler;
const source = buildSync({ entryPoints: ['base44/functions/duelSystem/entry.ts'], bundle: true, write: false, format: 'cjs', platform: 'node', external: ['npm:*'] }).outputFiles[0].text;
vm.runInNewContext(source, {
  module: { exports: {} }, exports: {}, Response, Request, Date: FixtureDate, crypto: webcrypto, JSON, Number, String, Object, Array, Promise, Math: scriptedMath,
  console: { warn() {}, error() {}, log() {} },
  // the function reads feature flags through Deno.env; none are set in this stand-in
  Deno: { serve: (fn) => { handler = fn; }, env: { get: () => undefined } },
  require: () => ({ createClientFromRequest: (req) => ({ auth: { me: async () => users[req.headers.get('test-user')] || null }, asServiceRole: { entities } }) }),
});
// the same rules, as the game bundles them
const shared = await import('data:text/javascript,' + encodeURIComponent(buildSync({ entryPoints: ['base44/shared/axePowerBudget.ts'], bundle: true, write: false, format: 'esm', platform: 'neutral' }).outputFiles[0].text));

async function call(user, action, data = {}, status = 200) {
  // protocol 3: every hit carries a fresh intent id and a per-duelist sequence (base44/shared/duelCombatIntentPolicy.mjs)
  if (action === 'hit' && data.duelId && !data.intentId) {
    const key = data.duelId + ':' + user;
    intentSeqs[key] = (intentSeqs[key] || 0) + 1;
    data = { ...data, intentId: ('axehi_' + user + '_' + intentSeqs[key]).padEnd(16, '0'), intentSeq: intentSeqs[key] };
  }
  const res = await handler(new Request('https://test.local', { method: 'POST', headers: { 'test-user': user }, body: JSON.stringify({ action, data }) }));
  const body = await res.json();
  assert.equal(res.status, status, `${action}: ${JSON.stringify(body)}`);
  return body;
}
const HERO = { level: 40, damage: 800, maxHP: 3800, defense: 360, attackSuccess: 180, attackBlock: 230, critChance: 24, attributionAttack: 130, attributionDefense: 120, criticalDamage: 0.2, criticalDefense: 0.1 };
const intentSeqs = {};
const stored = (id) => tables.DuelSession.find((d) => d.id === id);
const syncPositions = async (duelId, distance = 2) => {
  await call('alice','sync_position',{duelId,position:{x:0,y:0,z:0}});
  await call('bob','sync_position',{duelId,position:{x:distance,y:0,z:0}});
};
const startDuel = async (a = HERO, b = HERO, distance = 2) => {
  const { duel } = await call('alice', 'challenge', { opponentId: 'bob', opponentName: 'Bob', stats: a });
  await call('bob', 'respond', { duelId: duel.id, decision: 'accept', stats: b });
  await syncPositions(duel.id, distance);
  return stored(duel.id);
};

test('only signed-in players, never yourself, and only someone in the world or a friend', async () => {
  reset();
  await call('nobody', 'state', {}, 401);
  assert.equal((await call('alice', 'challenge', { opponentId: 'alice' }, 400)).code, 'self');
  assert.equal((await call('alice', 'challenge', { opponentId: 'dave' }, 403)).code, 'offline', 'Dave is not online and not a friend');
  assert.ok((await call('alice', 'challenge', { opponentId: 'carol', stats: HERO })).duel, 'Carol is a friend');
  const { duel } = await call('alice', 'challenge', { opponentId: 'bob', opponentName: 'Bob', stats: HERO });
  assert.equal(duel.status, 'pending');
  assert.ok((await call('alice', 'challenge', { opponentId: 'bob', stats: HERO })).already_pending, 'a second click returns the same challenge');
  assert.ok(tables.SocialNotification.some((n) => n.recipient_id === 'bob' && n.type === 'duel_challenge' && n.related_entity_id === duel.id), 'Bob is notified');
});

test('a tampered client cannot bring absurd stats', async () => {
  reset();
  const { duel } = await call('alice', 'challenge', { opponentId: 'bob', stats: { level: 999, damage: 1e9, maxHP: 1e9, critChance: 100, defense: -5 } });
  const s = stored(duel.id).challenger_stats;
  const expected = shared.clampAXEDuelStats(shared.getAXEParHero(40));
  assert.equal(s.level, 40);
  for(const key of ['damage','maxHP','critChance','defense']) assert.equal(s[key],expected[key]);
});

test('only the challenged player answers; accepting starts the duel at each side\'s own max HP', async () => {
  reset();
  const { duel } = await call('alice', 'challenge', { opponentId: 'bob', stats: { ...HERO, maxHP: 3000 } });
  await call('alice', 'respond', { duelId: duel.id, decision: 'accept' }, 404);
  await call('carol', 'respond', { duelId: duel.id, decision: 'accept' }, 404);
  const { duel: active } = await call('bob', 'respond', { duelId: duel.id, decision: 'accept', stats: { ...HERO, maxHP: 4200 } });
  assert.equal(active.status, 'active');
  assert.deepEqual([active.challenger_hp, active.challenger_max_hp, active.opponent_hp, active.opponent_max_hp], [shared.clampAXEDuelStats(shared.getAXEParHero(40)).maxHP, shared.clampAXEDuelStats(shared.getAXEParHero(40)).maxHP, shared.clampAXEDuelStats(shared.getAXEParHero(45)).maxHP, shared.clampAXEDuelStats(shared.getAXEParHero(45)).maxHP]);
  assert.equal((await call('bob', 'respond', { duelId: duel.id, decision: 'accept' }, 409)).code, 'not_pending');
  const second = (await call('alice', 'challenge', { opponentId: 'carol', stats: HERO }, 409));
  assert.equal(second.code, 'already_dueling');
});

test('declined and expired challenges cannot be accepted', async () => {
  reset();
  const { duel } = await call('alice', 'challenge', { opponentId: 'bob', stats: HERO });
  assert.equal((await call('bob', 'respond', { duelId: duel.id, decision: 'decline' })).duel.status, 'declined');
  const { duel: late } = await call('alice', 'challenge', { opponentId: 'bob', stats: HERO });
  stored(late.id).expires_at = new Date(Date.now() - 1000).toISOString();
  assert.equal((await call('bob', 'respond', { duelId: late.id, decision: 'accept', stats: HERO }, 409)).duel.status, 'expired');
});

test('the server rolls each hit and resolves it with the game\'s combat rules', async () => {
  reset();
  const duel = await startDuel();
  // the same outcomes as every hit in the game (axeStrikeOutcomes), hero against hero; one roll picks one
  const A = shared.clampAXEDuelStats(duel.challenger_stats), D = shared.clampAXEDuelStats(duel.opponent_stats);
  const outcomes = (skill = 1, hpPct = 1) => shared.axeStrikeOutcomes(A, D, { skillMultiplier: skill, isSkill: skill !== 1, pvp: true, targetHpPct: hpPct });
  // a roll near 1 lands the last outcome: a plain hit
  rolls.push(0.999999);
  const plain = await call('alice', 'hit', { duelId: duel.id, distance: 2, weaponPath: 'damage', skillMultiplier: 1 });
  const expected = shared.rollAXEStrike(outcomes(), 0.999999);
  assert.deepEqual([expected.kind, expected.critical], ['hit', false]);
  assert.deepEqual([plain.hit.missed, plain.hit.critical, plain.hit.damage], [false, false, expected.damage]);
  assert.equal(stored(duel.id).opponent_hp, D.maxHP - expected.damage);
  assert.ok(expected.damage < shared.computeAXESwing(A, D, {}), 'hero against hero is scaled down');
  // a miss: the hit roll fails, nothing changes but the clock
  stored(duel.id).last_hit_at = {};
  rolls.push(0);
  const miss = (await call('alice', 'hit', { duelId: duel.id, distance: 2, weaponPath: 'damage' })).hit;
  assert.deepEqual([miss.missed,miss.kind,miss.critical,miss.blocked,miss.damage,miss.reflected,miss.lifeSteal], [true,'miss',false,false,0,0,0]);
  assert.equal(stored(duel.id).opponent_hp, D.maxHP - expected.damage);
  // A critical basic hit: forged skill multipliers cannot change the server formula.
  stored(duel.id).last_hit_at = {};
  const table = outcomes(1, (D.maxHP - expected.damage) / D.maxHP);
  const at = table.findIndex((o) => o.kind === 'hit' && o.critical && !o.blocked);
  rolls.push(table.slice(0, at).reduce((sum, o) => sum + o.p, 0) + 1e-9);
  const crit = await call('alice', 'hit', { duelId: duel.id, distance: 2, weaponPath: 'damage', skillMultiplier: 99 });
  assert.equal(crit.hit.critical, true);
  assert.equal(crit.hit.damage, table[at].damage);
});

test('a duelist\'s build counts: block halves, reflect hurts the attacker and can knock it out', async () => {
  reset();
  const tank = { ...HERO, blockPct: 25, reflectPct: 10, avoidPct: 99 }; // avoidance is clamped to its cap
  const duel = await startDuel(HERO, tank);
  // Client-submitted defensive bonuses must not become authoritative.
  assert.equal(stored(duel.id).opponent_stats.avoidPct, shared.clampAXEDuelStats(shared.getAXEParHero(45)).avoidPct);
  assert.equal(stored(duel.id).opponent_stats.reflectPct, shared.clampAXEDuelStats(shared.getAXEParHero(45)).reflectPct);
  // Explicit synthetic server-side sheet, solely to exercise the existing reflect outcome.
  stored(duel.id).opponent_stats = shared.clampAXEDuelStats(tank);
  assert.equal(stored(duel.id).opponent_stats.avoidPct, shared.AXE_DUEL_STAT_LIMITS.avoidPct);
  const A = shared.clampAXEDuelStats(duel.challenger_stats), D = shared.clampAXEDuelStats(tank);
  const table = shared.axeStrikeOutcomes(A, D, { skillMultiplier: 1, isSkill: false, pvp: true, targetHpPct: 1 });
  const at = table.findIndex((o) => o.kind === 'hit' && !o.critical && o.blocked);
  stored(duel.id).challenger_hp = 1; // one reflected point from falling
  rolls.push(table.slice(0, at).reduce((sum, o) => sum + o.p, 0) + 1e-9);
  const hit = await call('alice', 'hit', { duelId: duel.id, distance: 2, weaponPath: 'damage' });
  assert.equal(hit.hit.blocked, true);
  assert.ok(hit.hit.reflected >= 1);
  assert.deepEqual([hit.duel.status, hit.duel.winner_id, hit.duel.loser_id], ['finished', 'bob', 'alice'], 'the attacker fell to its own reflected blow');
});

test('hits must be in range and no faster than the server allows', async () => {
  reset();
  const duel = await startDuel(HERO,HERO,9);
  assert.equal((await call('alice', 'hit', { duelId: duel.id, distance: 1, weaponPath: 'damage' }, 422)).code, 'out_of_range');
  now += 500;
  await syncPositions(duel.id,6.5);
  assert.ok((await call('alice', 'hit', { duelId: duel.id, distance: 999, weaponPath: 'ranged' })).hit, 'ranged reaches 7 m using server-stamped samples');
  assert.equal((await call('alice', 'hit', { duelId: duel.id, distance: 6.5, weaponPath: 'ranged' }, 429)).code, 'too_fast');
  await call('carol', 'hit', { duelId: duel.id, distance: 1 }, 404);
});

test('a knockout, a forfeit or two idle minutes end the duel', async () => {
  reset();
  let duel = await startDuel();
  stored(duel.id).opponent_hp = 1;
  rolls.push(0.999999); // one roll per hit: near 1 is a plain hit
  const ko = await call('alice', 'hit', { duelId: duel.id, distance: 1 });
  assert.deepEqual([ko.duel.status, ko.duel.finish_reason, ko.duel.winner_id, ko.duel.loser_id, ko.duel.opponent_hp], ['finished', 'knockout', 'alice', 'bob', 0]);
  assert.equal((await call('bob', 'hit', { duelId: duel.id, distance: 1 }, 409)).code, 'not_active');

  duel = await startDuel();
  const ff = await call('alice', 'forfeit', { duelId: duel.id });
  assert.deepEqual([ff.duel.status, ff.duel.finish_reason, ff.duel.winner_id], ['finished', 'forfeit', 'bob']);

  duel = await startDuel();
  stored(duel.id).last_action_at = new Date(Date.now() - 121_000).toISOString();
  const idle = await call('alice', 'hit', { duelId: duel.id, distance: 1 }, 409);
  assert.deepEqual([idle.duel.status, idle.duel.finish_reason, idle.duel.winner_id], ['finished', 'timeout', undefined]);
});

test('state lists my incoming and outgoing challenges and my active duel', async () => {
  reset();
  const { duel } = await call('alice', 'challenge', { opponentId: 'bob', stats: HERO });
  assert.deepEqual((await call('bob', 'state')).incoming.map((d) => d.id), [duel.id]);
  assert.deepEqual((await call('alice', 'state')).outgoing.map((d) => d.id), [duel.id]);
  await call('bob', 'respond', { duelId: duel.id, decision: 'accept', stats: HERO });
  assert.equal((await call('alice', 'state')).active.id, duel.id);
});

// R159: explicit negative authority and replay coverage.
test('missing or duplicate stored progression falls back to level 1; client level ignored', async()=>{
 for(const rows of [[],[{id:'a',user_id:'alice',global_level:40},{id:'b',user_id:'alice',global_level:45}]]){
  reset();tables.AvatarProgression=rows;
  const {duel}=await call('alice','challenge',{opponentId:'bob',stats:{level:155,damage:99999}});
  assert.equal(duel.challenger_stats.level,1);
 }
});
test('stale position, wrong actor, and replay cannot produce another hit',async()=>{
 reset();const duel=await startDuel();now+=1700;
 assert.equal((await call('alice','hit',{duelId:duel.id,distance:1},422)).code,'position_stale');
 await syncPositions(duel.id,2);
 await call('carol','sync_position',{duelId:duel.id,position:{x:0,y:0,z:0}},404);
 rolls.push(.999999);const data={duelId:duel.id,intentId:'axehi_r159_replay_01',intentSeq:2};
 const a=await call('alice','hit',data), hp=stored(duel.id).opponent_hp, events=tables.DuelCombatEvent.length;
 const b=await call('alice','hit',data);assert.equal(b.replay,true);assert.deepEqual(b.receipt,a.receipt);assert.equal(stored(duel.id).opponent_hp,hp);assert.equal(tables.DuelCombatEvent.length,events);
});
