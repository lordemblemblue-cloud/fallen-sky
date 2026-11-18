// Local Game Two skirmish modes against AI: Capture the Flag (1 human + 14 AI vs 15 AI), Sudden Death (1 + 24 vs 25 AI;
// no respawns), Team Deathmatch (1 + 24 vs 25 AI; first team to 50 defeats) and Free for All (you and 49 AI, everyone
// for themselves; first to 15 defeats).
// Reuses Game Two's actual Fighter, saber, Force, collision and rendering. On an authored arena (levels/skybridge.js)
// the bots follow the navigation grid, keep off ledges, cut energy bridges from their consoles and Force Push enemies
// who stand in front of a drop. These are OFFLINE AI matches, not 16-human Railway rooms.
import { NavGrid } from './level/nav.js';
const distance = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);
const nearFlag = (fighter, pos, radius) => distance(fighter.pos, pos) < radius &&
  Math.abs(fighter.pos[1] - pos[1]) < 2.25;
const isAlive = f => f && f.status !== 'dead' && f.hp > 0;
const opposite = team => team === 'blue' ? 'red' : 'blue';
const copy = p => p.slice();
const colors = { blue: [0.1, 0.68, 1, 0.75], red: [1, 0.19, 0.17, 0.75] };
export const CTF_FLAG_PASS_RANGE = 16; // meters; handoffs require a visible, living teammate
export const CTF_ALLY_SHIELD_RANGE = 16;
export const CTF_ALLY_SHIELD_HEAL = 30; // instant HP, limited by teammate max HP
export const CTF_ALLY_SHIELD_SECONDS = 6; // protective mitigation lasts six seconds
export const CTF_ALLY_SHIELD_DAMAGE_MULTIPLIER = 0.65; // reduces damage by 35%
export const CTF_ALLY_SHIELD_COOLDOWN = 6; // per recipient to prevent stacking

export const CTF_CARRIER_SPEED_SCALE = 0.9;
export const CTF_DROP_RETURN_SECONDS = 20;
// Free for All: every rival has their own blade colour and tint
const RIVALS = [
  { label: 'Crimson', blade: [1, 0.1, 0.06], tint: [0.9, 0.2, 0.16] },
  { label: 'Amber', blade: [1, 0.55, 0.08], tint: [0.95, 0.6, 0.2] },
  { label: 'Violet', blade: [0.72, 0.25, 1], tint: [0.6, 0.3, 0.9] },
  { label: 'Jade', blade: [0.2, 1, 0.35], tint: [0.3, 0.85, 0.4] },
  { label: 'Gold', blade: [1, 0.86, 0.2], tint: [0.9, 0.8, 0.3] },
  { label: 'Cyan', blade: [0.2, 0.95, 1], tint: [0.3, 0.85, 0.9] },
  { label: 'Silver', blade: [0.9, 0.92, 1], tint: [0.75, 0.78, 0.85] },
];
const PUSH_RANGE = 6;            // m: a bot Force Pushes an enemy this close when there is a drop behind them
const LEDGE_PROBE = [0.9, 1.6];  // m ahead a bot checks for a floor before it takes the step
const ERRAND_RANGE = 14;         // m: a bot goes to a console this close when its bridge carries enemies

// members: fighters per team (Free for All: in all). CTF 15 v 15; Sudden Death and Team Deathmatch 50 fighters (25 a
// side); Free for All 50.
export const TEAM_MODES = Object.freeze({
  ctf: { id: 'ctf', label: 'Capture the Flag', members: 15, respawn: 5, captureTarget: 3 },
  sudden: { id: 'sudden', label: 'Sudden Death', members: 25, respawn: null },
  tdm: { id: 'tdm', label: 'Team Deathmatch', members: 25, respawn: 4, killTarget: 50 },
  ffa: { id: 'ffa', label: 'Free for All', members: 50, respawn: 3, fragTarget: 15, ffa: true },
});
export const modeTitle = c => c.ffa ? c.label + ' · ' + c.members + ' fighters' : c.label + ' · ' + c.members + 'v' + c.members;

export function chooseTeamHomes(world, fallbackBlue, fallbackRed) {
  // An authored arena names its team homes (the flag stands there; the team spawns around it).
  const L = world.level; if (L?.teamHomes) return { blue: copy(L.teamHomes.blue), red: copy(L.teamHomes.red) };
  const original = (world.map?.spawns || []).filter(s => s.kind === 'info_player_deathmatch');
  // The native Drive-sourced BSP supplies authentic deathmatch start locations.
  // Keep equal-height, floor-supported starts; prefer widely separated positions.
  let best = null, separation = 0;
  for (const a of original) for (const b of original) {
    if (a === b || Math.abs(a.pos[1] - b.pos[1]) > 0.7) continue;
    const d = distance(a.pos, b.pos);
    if (d < 5 || d <= separation) continue;
    const floorA = world.floorAt(a.pos[0], a.pos[2], a.pos[1] + 1.6);
    const floorB = world.floorAt(b.pos[0], b.pos[2], b.pos[1] + 1.6);
    if (floorA === null || floorB === null) continue;
    if (Math.abs(floorA - floorB) > 0.8) continue;
    separation = d;
    best = [ [a.pos[0], floorA, a.pos[2]], [b.pos[0], floorB, b.pos[2]] ];
  }
  return { blue: best ? best[0] : copy(fallbackBlue), red: best ? best[1] : copy(fallbackRed) };
}

export function spawnNearby(world, home, index, participants) {
  // Use real collision/floor probes before placing anyone. No teleporting
  // through walls. The source BSP has only 3 deathmatch spawns, but team
  // modes need up to 16 safe distinct positions.
  const golden = 2.399963229728653;
  for (let attempt = 0; attempt < 46; attempt++) {
    const ring = 1.5 + ((index + attempt) % 6) * 0.85;
    const angle = (index + attempt * 0.65 + participants * 0.11) * golden;
    const x = home[0] + Math.cos(angle) * ring, z = home[2] + Math.sin(angle) * ring;
    const y = world.floorAt(x, z, home[1] + 1.5);
    if (y === null || Math.abs(y - home[1]) > 0.75) continue;
    const p = [x, y, z], before = copy(p);
    world.collide(p, 0.46);
    if (distance(p, before) < 0.08) return p;
  }
  return copy(home); // always keep fighters within their own floor section
}

// is there a drop (no floor, or one more than 2 m down) within reach beyond `to`, along the line from `from`?
export function dropAhead(world, from, to, reach = 7) {
  const dx = to[0] - from[0], dz = to[2] - from[2], l = Math.hypot(dx, dz) || 1;
  for (let s = 1; s <= reach; s++) { const y = world.floorAt(to[0] + dx / l * s, to[2] + dz / l * s, to[1] + 0.6); if (y === null || y < to[1] - 2) return true; }
  return false;
}

export class Game2TeamMatch {
  constructor(game, mode, mapId = 'training') {
    if (!TEAM_MODES[mode]) throw new Error('Unknown Game 2 team mode: ' + mode);
    this.g = game;
    this.config = TEAM_MODES[mode];
    this.mode = mode;
    this.mapId = mapId;
    this.homes = chooseTeamHomes(game.world, game.playerSpawn, game.enemySpawn);
    // Default nav samples a 3.2m ceiling and deliberately sees the lower
    // ventilation floor; CTF's newly distant upper ship pad is 4.2m high.
    // Construct an upper-aware grid ONLY for this Stronghold CTF match.
    // It follows the existing service incline, medical bridge and long
    // enclosed skybridge. Other skirmish modes keep their original nav.
    this.ctfUpperNav = mode === 'ctf' && mapId === 'sumi_stronghold' &&
      game.world.space && game.world.level?.navBounds
      ? new NavGrid(game.world.space, game.world.level.navBounds, 1, 7.5) : null;
    this.scores = { blue: 0, red: 0 };
    this.kills = new Map(); // Free for All: fighter -> defeats
    this.flags = {
      blue: { home: copy(this.homes.blue), pos: copy(this.homes.blue), state: 'base', carrier: null, dropTime: 0, passAt: -Infinity },
      red: { home: copy(this.homes.red), pos: copy(this.homes.red), state: 'base', carrier: null, dropTime: 0, passAt: -Infinity },
    };
    this.ended = false;
    this.winner = null;
    this.message = '';
    this.playerRespawnAt = null;
    // energy bridge consoles of an authored arena ('E' for the player; bots use them on their own)
    const space = game.world.space;
    this.consoles = space ? [...space.interactables.values()].filter(i => i.bridge) : [];
    if (space?.bridges?.size) space.onBridge = b => this.onBridge(b);
    this.spawnTeams();
  }
  mapLabel() { return this.g.arenaDef?.label || this.mapId; }

  spawnTeams() {
    if (this.config.ffa) return this.spawnFreeForAll();
    const g = this.g, count = this.config.members, yaw = g.world.level?.teamYaw;
    g.player.team = 'blue';
    g.playerSpawn = copy(this.homes.blue);
    g.enemySpawn = copy(this.homes.red);
    g.player.pos = copy(this.homes.blue);
    g.player.spawn = copy(this.homes.blue);
    if (yaw) { g.playerSpawnYaw = yaw.blue; g.player.yaw = g.player.targetYaw = yaw.blue; }
    g.player.label = 'You · Blue';
    g.readySaber(g.player);

    const roles = ['attacker', 'defender', 'support'];
    for (const team of ['blue', 'red']) {
      const botCount = team === 'blue' ? count - 1 : count;
      for (let i = 0; i < botCount; i++) {
        const p = spawnNearby(g.world, this.homes[team], i + 1, botCount);
        const f = g.addNpc('duelist', p[0], p[2], {
          name: team + '_bot_' + (i + 1),
          label: (team === 'blue' ? 'Blue' : 'Red') + ' ' + (i + 1),
          team, hp: 100,
          // Preserve each combat model's own colors; team identity is an outline.
          tint: [1, 1, 1], tintAmt: 0, saber: true,
          blade: team === 'blue' ? [0.22, 0.52, 1] : [1, 0.13, 0.08],
          yaw: yaw ? yaw[team] : team === 'blue' ? 0 : Math.PI, dmgScale: 0.6, blockSkill: 0.38,
        });
        f.pos[1] = p[1]; f.spawn = copy(p);
        f.matchRole = roles[i % roles.length];
        f.reaction = 0.46;
        g.giveForce?.(f); this.botKit(f, i);
      }
    }
    g.hud.msg(this.config.label + ' · ' + count + ' vs ' + count + ' · ' + this.mapLabel());
  }
  // Free for All: everyone (you included) on team 'ffa', which is hostile to every other fighter
  spawnFreeForAll() {
    const g = this.g, n = this.config.members;
    g.player.team = 'ffa'; g.player.label = 'You';
    const sp = this.pickSpawn(g.player);
    g.player.pos = copy(sp); g.player.spawn = copy(sp); g.playerSpawn = copy(sp);
    g.playerSpawnYaw = faceCentre(sp); g.player.yaw = g.player.targetYaw = g.playerSpawnYaw;
    g.readySaber(g.player);
    for (let i = 1; i < n; i++) {
      const R = RIVALS[(i - 1) % RIVALS.length], p = this.pickSpawn(null);
      const f = g.addNpc('duelist', p[0], p[2], { name: 'ffa_bot_' + i, label: R.label, team: 'ffa', hp: 100, tint: R.tint, tintAmt: 0.45, saber: true, blade: R.blade, yaw: faceCentre(p), dmgScale: 0.6, blockSkill: 0.38 });
      f.pos[1] = p[1]; f.spawn = copy(p); f.reaction = 0.46;
      g.giveForce?.(f); this.botKit(f, i);
    }
    g.hud.msg('Free for All · ' + n + ' fighters · first to ' + this.config.fragTarget + ' · ' + this.mapLabel());
  }
  // a quarter of the bots fight with dual sabers and a quarter with a saberstaff: Jedi Academy's own sets with the local
  // animations, else the ones derived from Jedi Outcast's (actor.js G2D_, Fighter.twirlStaff)
  botKit(f, i) { const sk = this.g.skel; if ((sk?.rigJson?.jaAnims || sk?.anims?.G2D_BOTH_A1_T__B_) && f.setSaberKit) f.setSaberKit(['single', 'dual', 'single', 'staff'][i % 4]); }
  // a Free for All (re)spawn point: the arena's spawn point furthest from everyone alive (a little random), or near a home
  pickSpawn(f) {
    const g = this.g, pts = g.world.level?.ffaSpawns;
    const others = g.fighters().filter(o => o && o !== f && o.pos && isAlive(o));
    if (!pts?.length) return spawnNearby(g.world, Math.random() < 0.5 ? this.homes.blue : this.homes.red, others.length + 1, this.config.members);
    let best = pts[0], score = -Infinity;
    for (const p of pts) { const d = others.length ? Math.min(...others.map(o => distance(o.pos, p))) : 20; const s = Math.min(d, 30) + Math.random() * 6; if (s > score) { score = s; best = p; } }
    // big matches have more fighters than spawn points: a free spot around the chosen one, not on top of someone
    for (let i = 0; i < 12; i++) { const p = i ? spawnNearby(g.world, best, i + Math.floor(Math.random() * 6), this.config.members) : copy(best); if (!others.some(o => distance(o.pos, p) < 1.2)) return p; }
    return copy(best);
  }
  homeFor(f) { return this.homes[f.team] || this.homes.blue; }

  // Flag rules are shared by player and bots. Only CTF supplies a carrier.
  // Keeping the token on the Fighter makes the 10% penalty apply after any
  // normal Force Speed or other multiplier, without mutating Force state.
  hasFreeSense(f) {
    return this.mode === 'ctf' && !!f && !!this.flags[opposite(f.team)] &&
      this.flags[opposite(f.team)].carrier === f && isAlive(f);
  }
  passTargets(f) {
    if (!this.hasFreeSense(f)) return [];
    return this.g.fighters().filter(ally =>
      ally !== f && ally.team === f.team && isAlive(ally) &&
      distance(f.pos, ally.pos) <= CTF_FLAG_PASS_RANGE &&
      Math.abs(f.pos[1] - ally.pos[1]) <= 2.5);
  }
  // CTF-only support lock. Unlike flag passing, no one has to carry a flag
  // to lock on and shield a nearby teammate. Neither enemies nor the caster
  // can appear as valid recipients. This does not change friendly-fire rules.
  shieldTargets(f) {
    if (this.mode !== 'ctf' || this.ended || !isAlive(f)) return [];
    return this.g.fighters().filter(ally =>
      ally !== f && ally.team === f.team && isAlive(ally) &&
      distance(f.pos, ally.pos) <= CTF_ALLY_SHIELD_RANGE &&
      Math.abs(f.pos[1] - ally.pos[1]) <= 2.5);
  }
  canShieldAlly(f, ally) {
    if (!ally || !this.shieldTargets(f).includes(ally)) return false;
    const from=f.chest(), to=ally.chest();
    if (this.g.world?.mapCollision?.rayBlocked?.(from,to)) return false;
    return !this.g.world?.lineOfSight || !!this.g.world.lineOfSight(from,to);
  }
  canCastAllyShield(f, ally) {
    return this.canShieldAlly(f, ally) &&
      (ally.ctfShieldCooldownUntil || 0) <= this.g.t;
  }
  applyAllyShield(f, ally) {
    if (!this.canCastAllyShield(f, ally)) return false;
    const healed=Math.max(0, Math.min(CTF_ALLY_SHIELD_HEAL, ally.maxHp - ally.hp));
    ally.hp+=healed;
    ally.healFlash=1.5;
    ally.ctfShieldUntil=this.g.t + CTF_ALLY_SHIELD_SECONDS;
    ally.ctfShieldDamageMul=CTF_ALLY_SHIELD_DAMAGE_MULTIPLIER;
    ally.ctfShieldCooldownUntil=this.g.t + CTF_ALLY_SHIELD_COOLDOWN;
    // A brief soft highlight rather than tinting the entire character blue.
    ally.glow=Math.max(ally.glow || 0,0.26);
    ally.glowCol=[0.56,0.83,1];
    this.g.burstHeal?.(ally);
    this.g.hud?.msg('Force Shield: ' + (ally.label || 'teammate') +
      ' healed +' + Math.round(healed) + ' HP · protected 6s');
    return true;
  }
  canPassFlag(f, ally) {
    if (!this.hasFreeSense(f) || !ally || !this.passTargets(f).includes(ally)) return false;
    const from = f.chest(), to = ally.chest();
    if (this.g.world?.mapCollision?.rayBlocked?.(from, to)) return false;
    return !this.g.world?.lineOfSight || this.g.world.lineOfSight(from, to);
  }
  setCarrier(flag, fighter) {
    if (flag.carrier) flag.carrier.ctfCarrierFlag = null;
    flag.carrier = fighter;
    flag.state = 'carried';
    flag.pos = copy(fighter.pos);
    fighter.ctfCarrierFlag = true;
  }
  passFlag(from, ally) {
    const flag = this.flags[opposite(from?.team)];
    if (!flag || flag.carrier !== from || !this.canPassFlag(from, ally) ||
        this.g.t - flag.passAt < 0.55) return false;
    flag.passAt = this.g.t;
    this.setCarrier(flag, ally);
    this.g.hud?.msg((from.isPlayer ? 'You' : from.label || 'A teammate') +
      ' passed the ' + opposite(from.team).toUpperCase() + ' flag to ' +
      (ally.isPlayer ? 'you' : ally.label || 'a teammate'));
    if (this.g.lockedTarget === ally) this.g.clearTargetLock?.();
    return true;
  }
  tryPassFlag(target) {
    const player = this.g.player;
    if (!this.hasFreeSense(player)) return false;
    if (!this.canPassFlag(player, target)) {
      this.g.hud?.msg('Lock onto a nearby teammate to pass the flag [H]');
      return false;
    }
    return this.passFlag(player, target);
  }

  drop(flag, now) {
    if (flag.state !== 'carried') return;
    const fallen = flag.carrier;
    const p = copy(fallen.pos);
    const floor = this.g.world?.floorAt?.(p[0], p[2], p[1] + 0.65);
    flag.pos = floor === null ? p : [p[0], floor ?? p[1], p[2]];
    fallen.ctfCarrierFlag = null;
    flag.carrier = null;
    flag.state = 'dropped';
    flag.dropTime = now;
  }
  reset(flag) {
    if (flag.carrier) flag.carrier.ctfCarrierFlag = null;
    flag.pos = copy(flag.home);
    flag.carrier = null;
    flag.state = 'base';
    flag.passAt = -Infinity;
  }
  finish(team) {
    if (this.ended) return;
    this.ended = true;
    this.winner = team;
    this.message = (team === 'blue' ? 'BLUE TEAM WINS' : 'RED TEAM WINS');
    this.g.hud.msg(this.message + ' · Return to the main menu for a rematch');
  }
  finishFreeForAll(K) {
    if (this.ended) return;
    this.ended = true;
    this.winnerFighter = K;
    this.winner = K.isPlayer ? 'you' : 'rival';
    this.message = K.isPlayer ? 'YOU WIN THE FREE FOR ALL' : (K.label || 'A rival').toUpperCase() + ' WINS';
    this.g.hud.msg(this.message + ' · Return to the main menu for a rematch');
  }
  onDeath(f) {
    for (const flag of Object.values(this.flags)) if (flag.carrier === f) this.drop(flag, this.g.t);
    if (f.isPlayer && this.config.respawn != null) this.playerRespawnAt = this.g.t + this.config.respawn;
    if (this.ended) return;
    // a fall counts for whoever last hurt, pushed or pulled the victim, or cut the bridge under them (Fighter.fallDeath)
    const K = f.killedBy && f.killedBy !== f ? f.killedBy : null;
    if (this.config.ffa && K) {
      const n = (this.kills.get(K) || 0) + 1; this.kills.set(K, n);
      if (n >= this.config.fragTarget) this.finishFreeForAll(K);
    } else if (this.mode === 'tdm' && K && K.team !== f.team && K.team in this.scores) {
      this.scores[K.team]++;
      if (this.scores[K.team] >= this.config.killTarget) this.finish(K.team);
    }
  }

  // ---------- energy bridges
  onBridge(b) {
    const g = this.g, name = b.label.charAt(0).toUpperCase() + b.label.slice(1), ends = [[b.x0, b.y, (b.z0 + b.z1) / 2], [b.x1, b.y, (b.z0 + b.z1) / 2]];
    if (b.state === 'warn') { for (const p of ends) g.sfxAt?.('saberoff', p, 0.9); g.hud.msg(name + ' bridge failing'); return; }
    if (b.state === 'on') { for (const p of ends) g.sfxAt?.('saberon', p, 0.7); g.hud.msg(name + ' bridge restored'); return; }
    // off: whoever is on it now falls; their death goes to the one who cut the power
    const space = g.world.space;
    for (const o of g.fighters()) if (o !== b.cutBy && isAlive(o) && space.bridgeAt(o.pos) === b) o.markAttacker?.(b.cutBy);
    g.hud.msg(name + ' bridge is down');
  }
  // the console a fighter stands at (within its use radius, on the same level)
  consoleAt(f) {
    let best = null, bd = Infinity;
    for (const c of this.consoles) { const d = distance(f.pos, c.p); if (d < c.r && d < bd && Math.abs(f.pos[1] - c.p[1]) < 1.5) { bd = d; best = c; } }
    return best;
  }
  useConsole(f, c = this.consoleAt(f)) {
    const space = this.g.world.space; if (!c || !space || !space.dropBridge(c.bridge)) return false;
    const b = space.bridges.get(c.bridge); b.cutBy = f;
    if (f.isPlayer) this.g.hud.msg('You cut the ' + b.label + ' bridge');
    return true;
  }
  // a bridge worth cutting for f: it is on, carries at least one enemy of f and none of f's friends
  worthCutting(f, id) {
    const space = this.g.world.space, b = space?.bridges.get(id); if (!b || b.state !== 'on') return false;
    let foes = 0;
    for (const o of this.g.fighters()) {
      if (o === f || !isAlive(o) || space.bridgeAt(o.pos) !== b) continue;
      if (f.team !== 'ffa' && o.team === f.team) return false;
      foes++;
    }
    return foes > 0;
  }
  updateConsoles() {
    if (!this.consoles.length) return;
    const g = this.g, P = g.player;
    if (isAlive(P) && g.inp?.pressed('KeyE')) { const c = this.consoleAt(P); if (c && !this.useConsole(P, c)) g.hud.msg('That bridge is already down'); }
    for (const f of g.npcs) { // a bot at a console cuts the bridge after a short reaction
      const c = isAlive(f) && f.status === 'normal' ? this.consoleAt(f) : null;
      if (!c || !this.worthCutting(f, c.bridge)) { f.cutAt = 0; continue; }
      if (!f.cutAt) f.cutAt = g.t + 0.35 + Math.random() * 0.6;
      else if (g.t >= f.cutAt) { f.cutAt = 0; this.useConsole(f, c); }
    }
  }
  // the bridge console a defender guards: one at the head of a bridge on its own side (they take turns by number)
  postFor(f) {
    if (f.post !== undefined) return f.post;
    const home = this.homeFor(f), own = this.consoles.filter(c => Math.sign(c.p[0]) === Math.sign(home[0]) && Math.abs(c.p[0]) > Math.abs(home[0]) / 2);
    return (f.post = own.length ? own[(f.humId || 0) % own.length] : null);
  }
  // a console within reach whose bridge is worth cutting: the bot goes there
  consoleErrand(f) {
    let best = null, bd = ERRAND_RANGE;
    for (const c of this.consoles) { const d = distance(f.pos, c.p); if (d < bd && Math.abs(c.p[1] - f.pos[1]) < 2 && this.worthCutting(f, c.bridge)) { bd = d; best = c; } }
    return best;
  }

  update(dt) {
    if (this.ended) return;
    const g = this.g, now = g.t;
    this.updateConsoles();
    if (this.mode === 'sudden') {
      // No respawns. The entire opposing team must be eliminated.
      const blue = g.fighters().some(f => f.team === 'blue' && isAlive(f));
      const red = g.fighters().some(f => f.team === 'red' && isAlive(f));
      if (!blue || !red) this.finish(blue ? 'blue' : 'red');
      return;
    }
    if (this.playerRespawnAt !== null && now >= this.playerRespawnAt) {
      this.playerRespawnAt = null;
      if (this.config.ffa) { g.playerSpawn = this.pickSpawn(g.player); g.playerSpawnYaw = faceCentre(g.playerSpawn); }
      else g.playerSpawn = spawnNearby(g.world, this.homeFor(g.player), 0, this.config.members);
      g.respawnPlayer();
      g.hud.msg(this.mode === 'ctf' ? 'Respawned · recover your flag' : 'Respawned');
    }
    for (const n of g.npcs) {
      if (isAlive(n) || now - n.deadAt < this.config.respawn) continue;
      n.spawn = this.config.ffa ? this.pickSpawn(n) : spawnNearby(g.world, this.homeFor(n), n.humId || 1, this.config.members);
      g.respawnNpc(n); g.shield?.(n); n.force?.reset?.(); n.matchPath = null;
    }
    if (this.mode !== 'ctf') return;

    for (const [team, flag] of Object.entries(this.flags)) {
      if (flag.state === 'carried') {
        if (!isAlive(flag.carrier)) this.drop(flag, now);
        else flag.pos = copy(flag.carrier.pos);
      }
      if (flag.state === 'dropped' && now - flag.dropTime >= CTF_DROP_RETURN_SECONDS) this.reset(flag);
      // a flag that fell into a chasm goes straight home
      if (flag.state === 'dropped' && g.world.level && g.world.floorAt(flag.pos[0], flag.pos[2], flag.pos[1] + 0.6) === null) { this.reset(flag); g.hud.msg(team.toUpperCase() + ' flag returned'); }
      // Teammates immediately return their own dropped flag.
      if (flag.state === 'dropped' && g.fighters().some(f => f.team === team && isAlive(f) && nearFlag(f, flag.pos, 1.6))) {
        this.reset(flag);
        g.hud.msg(team.toUpperCase() + ' flag returned');
      }
      if (flag.state !== 'carried') {
        const carrier = g.fighters().find(f => f.team === opposite(team) && isAlive(f) && nearFlag(f, flag.pos, 1.65));
        if (carrier) {
          this.setCarrier(flag, carrier);
          g.hud.msg((carrier.isPlayer ? 'You' : carrier.label) + ' took the ' + team.toUpperCase() + ' flag');
        }
      }
    }

    for (const team of ['blue', 'red']) {
      const stolen = this.flags[opposite(team)], own = this.flags[team];
      if (stolen.state !== 'carried' || stolen.carrier?.team !== team || own.state !== 'base') continue;
      if (nearFlag(stolen.carrier, own.home, 2.2)) {
        this.scores[team]++;
        this.reset(stolen);
        this.reset(own);
        g.hud.msg(team.toUpperCase() + ' CAPTURE · ' + this.scores.blue + ':' + this.scores.red);
        if (this.scores[team] >= this.config.captureTarget) this.finish(team);
      }
    }
  }

  brain(f, dt = 1 / 60) {
    const g = this.g, c = f.cmd;
    c.fwd = c.right = c.up = 0;
    c.walk = c.crouch = c.attack = c.alt = c.jump = c.jumpPressed = c.crouchPressed = false;
    if (!isAlive(f) || this.ended) return;

    const foes = g.foesOf(f);
    const closest = foes.reduce((best, other) =>
      !best || distance(f.pos, other.pos) < distance(f.pos, best.pos) ? other : best, null);
    const near = closest && distance(f.pos, closest.pos) < 4.7 ? closest : null;

    let objective = closest?.pos || this.homes[opposite(f.team)];
    if (this.mode === 'ctf') {
      const myFlag = this.flags[f.team], theirFlag = this.flags[opposite(f.team)];
      const carry = theirFlag.carrier === f;
      if (carry) {
        objective = this.homes[f.team];
        // AI carriers may hand off to a friend closer to home when pressured.
        // Same visibility/range/cooldown rules as the player's H pass.
        if (near) {
          const friends = this.passTargets(f).filter(ally =>
            distance(ally.pos, objective) + 3 < distance(f.pos, objective));
          const receiver = friends.find(ally => this.canPassFlag(f, ally));
          if (receiver) this.passFlag(f, receiver);
        }
      }
      else if (myFlag.state === 'carried' && f.matchRole !== 'attacker') objective = myFlag.carrier?.pos || myFlag.pos;
      else if (f.matchRole === 'defender') objective = myFlag.state === 'dropped' ? myFlag.pos : myFlag.home;
      else if (f.matchRole === 'support' && theirFlag.carrier?.team === f.team) objective = theirFlag.carrier.pos;
      else objective = theirFlag.pos;
    }
    // out of a fight, a console nearby whose bridge carries enemies comes first: go and cut it. Team Deathmatch
    // defenders guard a bridge console on their own side unless an enemy comes close to it.
    const errand = !near && this.consoles.length ? this.consoleErrand(f) : null;
    const post = this.mode === 'tdm' && f.matchRole === 'defender' ? this.postFor(f) : null;
    const guarding = !errand && !near && post && (!closest || distance(closest.pos, post.p) > 10);
    if (errand) objective = errand.p; else if (guarding) objective = post.p;
    const target = near || (this.mode !== 'ctf' && !errand && !guarding ? closest : null);
    const destination = target?.pos || objective;
    if (!destination) return;
    // Force Push an enemy who has a drop behind them (an edge, a bridge)
    if (target && f.force && this.tryPush(f, target)) return;

    // Route: straight at a close target when that walk is safe; otherwise along the navigation grid (it knows the
    // chasms and which bridges are up). Path cache is throttled per bot.
    let waypoint = destination;
    // A raised flag base cannot be reached on the lower-only nav grid.
    // Upper-aware CTF paths connect lower hangar -> service incline ->
    // medical bridge -> skybridge -> ship pad using actual collision.
    const nav = this.ctfUpperNav || g.world.nav;
    if (nav && !(target && distance(f.pos, destination) < 3.5 && Math.abs(destination[1] - f.pos[1]) < 1.2 && nav.walkLine(f.pos, destination))) {
      if (!f.matchPath || !f.matchPathGoal || distance(f.matchPathGoal, destination) > 2.2 || g.t - (f.matchPathAt || 0) > (target ? 1.2 : 3)) {
        f.matchPath = nav.findPath(f.pos, destination, this.ctfUpperNav ? 26000 : 9000) || [];
        f.matchPathGoal = copy(destination);
        f.matchPathAt = g.t;
      }
      while (f.matchPath.length && distance(f.pos, f.matchPath[0]) < 1.2) f.matchPath.shift();
      if (f.matchPath.length) waypoint = f.matchPath[0];
    }
    const dx = waypoint[0] - f.pos[0], dz = waypoint[2] - f.pos[2];
    const d = Math.hypot(dx, dz);
    f.targetYaw = Math.atan2(dx, dz);
    if (target && distance(f.pos, target.pos) < 2.7) {
      c.attack = (g.t + f.humId * 0.29) % 1.15 < 0.75;
      if (f.saber?.animLevel === 7 && distance(f.pos, target.pos) < 1.7 && Math.random() < dt * 0.6) f.startKick?.('F'); // a saberstaff bot kicks now and then
      c.right = Math.sin(g.t * 1.2 + f.humId) > 0 ? 0.35 : -0.35;
    }
    if (d > (waypoint === destination ? (target ? 1.8 : 1.3) : 0.2)) c.fwd = 1;

    // Basic collision-aware steering on maps without a navigation grid.
    if (!nav && d > 2 && g.world.lineOfSight && !g.world.lineOfSight(f.chest(), [destination[0], destination[1] + 1, destination[2]])) {
      c.right = f.humId % 2 ? 0.7 : -0.7;
    }
    if (g.world.level) this.keepOffLedges(f);
  }
  // never walk off an edge: no floor (or a long drop) a step ahead in the direction the bot is about to move
  keepOffLedges(f) {
    const c = f.cmd; if (!c.fwd && !c.right) return false;
    const s = Math.sin(f.yaw), co = Math.cos(f.yaw), mx = s * c.fwd - co * c.right, mz = co * c.fwd + s * c.right, l = Math.hypot(mx, mz) || 1;
    for (const r of LEDGE_PROBE) {
      const y = this.g.world.floorAt(f.pos[0] + mx / l * r, f.pos[2] + mz / l * r, f.pos[1] + 0.6);
      if (y === null || y < f.pos[1] - 1.5) { c.fwd = c.right = 0; f.matchPathAt = -99; return true; } // and plan again
    }
    return false;
  }
  tryPush(f, T) {
    const g = this.g, F = f.force;
    if (!g.world.level || (f.pushAt || 0) > g.t || f.status !== 'normal' || T.spawnShield > g.t) return false;
    const d = distance(f.pos, T.pos); if (d > PUSH_RANGE || d < 1.2) return false;
    f.pushAt = g.t + 0.5 + Math.random() * 0.5; // look again shortly
    if ((F.fp ?? 0) < 30 || !dropAhead(g.world, f.pos, T.pos)) return false;
    f.yaw = f.targetYaw = Math.atan2(T.pos[0] - f.pos[0], T.pos[2] - f.pos[2]);
    if (!F.cast('push')) return false;
    f.pushAt = g.t + 5 + Math.random() * 4;
    return true;
  }

  drawWorld(renderer) {
    // bridge consoles: green while their bridge is up, red while it is down
    const space = this.g.world.space;
    for (const c of this.consoles) { const on = space.bridges.get(c.bridge).state === 'on'; renderer.billboard([c.p[0], 1.75, c.p[2] + (c.p[2] > 0 ? 0.9 : -0.9)], 0.32, on ? [0.3, 1, 0.5, 0.7] : [1, 0.3, 0.2, 0.7], 0); }
    if (this.mode !== 'ctf') return;
    for (const [team, flag] of Object.entries(this.flags)) {
      if (flag.state === 'carried') continue;
      const pos = flag.state === 'base' ? flag.home : flag.pos;
      renderer.billboard([pos[0], pos[1] + (flag.state === 'dropped' ? 0.48 : 1.6), pos[2]], 0.78, colors[team], 0);
      this.g.fx.disc([pos[0], pos[1] + 0.04, pos[2]], 1.55, colors[team], 1);
    }
  }

  drawHUD(ctx, width, height) {
    if (!width || !height) return;
    const x = width / 2, g = this.g, P = g.player;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(4,12,25,0.78)';
    ctx.fillRect(x - 195, 14, 390, 56);
    ctx.font = 'bold 17px system-ui, sans-serif';
    ctx.fillStyle = '#8cddff';
    ctx.fillText(this.config.ffa ? 'FREE FOR ALL · FIRST TO ' + this.config.fragTarget : modeTitle(this.config).toUpperCase(), x, 34);
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.fillStyle = '#f2f6ff';
    if (this.mode === 'ctf') {
      ctx.fillText('BLUE ' + this.scores.blue + '    —    ' + this.scores.red + ' RED', x, 54);
      ctx.font = '11px system-ui, sans-serif';
      ctx.fillStyle = '#b7c5d9';
      ctx.fillText('Light flag: ' + this.flags.blue.state + '   |   Dark flag: ' + this.flags.red.state, x, 88);
    } else if (this.mode === 'tdm') {
      ctx.fillText('BLUE ' + this.scores.blue + '    —    ' + this.scores.red + ' RED', x, 54);
      ctx.font = '11px system-ui, sans-serif'; ctx.fillStyle = '#b7c5d9';
      ctx.fillText('First team to ' + this.config.killTarget + ' defeats', x, 88);
    } else if (this.mode === 'ffa') {
      let lead = null, top = -1; for (const [f, n] of this.kills) if (n > top) { top = n; lead = f; }
      const mine = this.kills.get(P) || 0, place = 1 + [...this.kills.values()].filter(n => n > mine).length;
      ctx.fillText('YOU ' + mine + '   ·   ' + (lead && lead !== P ? 'LEADER ' + (lead.label || '?').toUpperCase() + ' ' + top : mine ? 'YOU LEAD' : 'NO DEFEATS YET'), x, 54);
      ctx.font = '11px system-ui, sans-serif'; ctx.fillStyle = '#b7c5d9';
      ctx.fillText('Place ' + place + ' of ' + this.config.members, x, 88);
    } else {
      const count = team => g.fighters().filter(f => f.team === team && isAlive(f)).length;
      ctx.fillText('BLUE ' + count('blue') + ' ALIVE    —    ' + count('red') + ' RED ALIVE', x, 54);
    }
    // bridge console prompt
    const con = isAlive(P) && !this.ended ? this.consoleAt(P) : null;
    if (con) {
      const b = g.world.space.bridges.get(con.bridge);
      const text = b.state === 'on' ? '[E]  ' + con.prompt : b.state === 'warn' ? 'The ' + b.label + ' bridge is failing' : 'The ' + b.label + ' bridge reforms in ' + Math.ceil(b.t) + ' s';
      ctx.font = '700 14px system-ui, sans-serif'; const tw = ctx.measureText(text).width + 30;
      ctx.fillStyle = 'rgba(6,14,28,0.78)'; ctx.fillRect(x - tw / 2, height * 0.6, tw, 30);
      ctx.fillStyle = b.state === 'on' ? '#bfe8ff' : '#ffb08a'; ctx.fillText(text, x, height * 0.6 + 20);
    }
    if (this.mode === 'ctf') this.drawFlagIndicators(ctx, width, height);
    if (this.playerRespawnAt !== null && !this.ended) {
      ctx.font = 'bold 20px system-ui, sans-serif'; ctx.fillStyle = '#d4e2ee';
      ctx.fillText('Respawning in ' + Math.max(1, Math.ceil(this.playerRespawnAt - g.t)) + ' s', x, height * 0.42);
    }
    if (this.ended) {
      ctx.fillStyle = 'rgba(3,8,18,0.82)';
      ctx.fillRect(x - 240, height * 0.36, 480, 118);
      ctx.font = 'bold 30px system-ui, sans-serif';
      ctx.fillStyle = this.winner === 'blue' || this.winner === 'you' ? '#96dcff' : '#ff9e91';
      ctx.fillText(this.message, x, height * 0.36 + 57);
      ctx.font = '13px system-ui, sans-serif';
      ctx.fillStyle = '#d4e2ee';
      ctx.fillText('Return to the menu to play again', x, height * 0.36 + 82);
    }
    ctx.restore();
  }
  // World-projected, blinking flag glyphs: carried flags remain above heads;
  // dropped flags move to ground level. Their actual game-state locations are
  // not inferred from graphical billboards.
  drawFlagIndicators(ctx, width, height) {
    const g = this.g;
    const project = p => g.hud?.project?.(g.R, p);
    for (const [team, flag] of Object.entries(this.flags)) {
      const carried = flag.state === 'carried' && isAlive(flag.carrier);
      const p = carried ? flag.carrier.headPos() : flag.pos;
      const marker = project([p[0], p[1] + (carried ? 0.7 : flag.state === 'base' ? 2.3 : .65), p[2]]);
      if (!marker || marker[0] < -32 || marker[0] > width + 32 ||
          marker[1] < -32 || marker[1] > height + 32) continue;
      const [x,y] = marker, pulse = .7 + .3 * Math.sin(g.t * 7);
      const col = team === 'blue' ? '#41baff' : '#ff5148';
      ctx.save();
      ctx.fillStyle = 'rgba(7,13,25,.89)';
      ctx.strokeStyle = col;
      ctx.lineWidth = 2.5 + pulse;
      ctx.beginPath(); ctx.arc(x,y,17 + pulse * 2,0,Math.PI*2); ctx.fill();ctx.stroke();
      ctx.strokeStyle = col;ctx.fillStyle=col;ctx.lineWidth=2;
      // Stylized raised pole and triangular flag, independent of installed fonts.
      ctx.beginPath();ctx.moveTo(x-7,y+9);ctx.lineTo(x-7,y-10);ctx.stroke();
      ctx.beginPath();ctx.moveTo(x-6,y-10);ctx.lineTo(x+10,y-6);
      ctx.lineTo(x-6,y-1);ctx.closePath();ctx.fill();
      if (carried) {
        ctx.font = '700 10px system-ui,sans-serif';
        ctx.fillStyle = '#ffffff';ctx.textAlign='center';ctx.textBaseline='bottom';
        ctx.fillText(flag.carrier.isPlayer ? 'YOU HAVE FLAG' : 'FLAG CARRIER',x,y-25);
      } else if (flag.state === 'dropped') {
        ctx.font='700 10px system-ui,sans-serif';ctx.fillStyle='#ffffff';
        ctx.textAlign='center';ctx.fillText('DROPPED',x,y-23);
      }
      ctx.restore();
    }
    const P=g.player;
    if (!this.hasFreeSense(P)) return;
    // Passive, zero-cost Force Sense: enemy radar includes foes behind
    // the carrier and beyond wall occlusion. It never touches Force.fp.
    const cx=width-94,cy=height-115,r=58,range=48;
    if(cx < r+4 || cy < r+4)return;
    ctx.save();
    ctx.fillStyle='rgba(4,13,30,.87)';ctx.strokeStyle='#62ddff';ctx.lineWidth=1.8;
    ctx.beginPath();ctx.arc(cx,cy,r,0,2*Math.PI);ctx.fill();ctx.stroke();
    ctx.beginPath();ctx.moveTo(cx-r,cy);ctx.lineTo(cx+r,cy);
    ctx.moveTo(cx,cy-r);ctx.lineTo(cx,cy+r);ctx.strokeStyle='rgba(105,208,255,.20)';ctx.stroke();
    const s=Math.sin(P.yaw),c=Math.cos(P.yaw);
    for(const foe of g.fighters()){
      if(!foe || foe.team===P.team || !isAlive(foe))continue;
      const dx=foe.pos[0]-P.pos[0],dz=foe.pos[2]-P.pos[2];
      const dist=Math.hypot(dx,dz);if(dist>range)continue;
      const xx=c*dx-s*dz, yy=-(s*dx+c*dz),scale=(r-7)/range;
      ctx.beginPath();ctx.arc(cx+xx*scale,cy+yy*scale,3.7,0,2*Math.PI);
      ctx.fillStyle='#ff6456';ctx.fill();
    }
    ctx.beginPath();ctx.moveTo(cx,cy-6);ctx.lineTo(cx-4,cy+5);ctx.lineTo(cx+4,cy+5);ctx.closePath();
    ctx.fillStyle='#86eaff';ctx.fill();
    ctx.fillStyle='#aef1ff';ctx.textAlign='center';ctx.font='700 11px system-ui,sans-serif';
    ctx.fillText('FORCE SENSE · FREE',cx,cy-r-12);
    ctx.restore();
    const target = g.lockedTarget;
    if(target?.team===P.team && this.canPassFlag(P,target)){
      const prompt='[H] PASS FLAG TO '+(target.label || 'TEAMMATE').toUpperCase();
      ctx.save();ctx.font='700 13px system-ui,sans-serif';ctx.textAlign='center';
      ctx.fillStyle='rgba(5,16,28,.87)';ctx.fillRect(width/2-158,height*.68-19,316,28);
      ctx.fillStyle='#a5e9ff';ctx.fillText(prompt,width/2,height*.68);ctx.restore();
    } else {
      ctx.save();ctx.textAlign='center';ctx.font='600 12px system-ui,sans-serif';
      ctx.fillStyle='#9bdfff';ctx.fillText('Flag carried · -10% speed · lock onto a teammate + H',width/2,height*.72);
      ctx.restore();
    }
  }

}

const faceCentre = p => Math.atan2(-p[0], -p[2]); // a yaw that looks at the middle of the map
