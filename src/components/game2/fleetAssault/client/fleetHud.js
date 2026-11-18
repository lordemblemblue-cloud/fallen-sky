// Fleet Assault HUD, drawn on a 2D canvas over the WebGL view (as engine/hud.js does for the duel).
import { CRUISER, GROUND, ROLES, SHIP_CLASSES, SHIP_TIERS, SIDE_INFO, SUBSYSTEM_IDS } from '../../../../../server/game2/fleet/rules.mjs';
import { addScaled, dist, forwardOf, fromBoxLocal } from '../../../../../server/game2/fleet/vec.mjs';
import { drawFleetCockpit } from './fleetCockpitHud.js';

const COL = { republic: '#6fc8ff', separatist: '#ff7a5c', good: '#7dffb0', warn: '#ffd166', bad: '#ff5c5c', dim: 'rgba(255,255,255,0.55)', text: '#eaf4ff' };
const TIER_COL = { fortified: '#7dffb0', steady: '#c9f0ff', strained: '#ffd166', broken: '#ff5c5c' };
const SUB_LETTER = { weapons: 'W', shields: 'S', hyperdrive: 'H', comms: 'C' };
const mmss = ms => { const s = Math.max(0, Math.ceil((ms || 0) / 1000)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };

export function project(vp, p, w, h) {
  const x = vp[0] * p[0] + vp[4] * p[1] + vp[8] * p[2] + vp[12];
  const y = vp[1] * p[0] + vp[5] * p[1] + vp[9] * p[2] + vp[13];
  const ww = vp[3] * p[0] + vp[7] * p[1] + vp[11] * p[2] + vp[15];
  if (ww <= 0.5) return null;
  return [(x / ww * 0.5 + 0.5) * w, (1 - (y / ww * 0.5 + 0.5)) * h, ww];
}

export class FleetHud {
  constructor(canvas) { this.canvas = canvas; this.ctx = canvas.getContext('2d'); }
  draw(client, view, ui = {}) {
    const cv = this.canvas, x = this.ctx;
    const dpr = view.width / Math.max(1, cv.clientWidth || view.width);
    if (cv.width !== view.width || cv.height !== view.height) { cv.width = view.width; cv.height = view.height; }
    x.setTransform(dpr, 0, 0, dpr, 0, 0);
    const W = view.width / dpr, H = view.height / dpr;
    x.clearRect(0, 0, W, H);
    x.font = '600 12px ui-sans-serif, system-ui, sans-serif';
    x.textBaseline = 'middle';
    const T = client.now();
    const me = client.me;
    if (!me) { this.banner(x, W, H, 'Connecting to Fleet Assault…', ''); return; }
    const vp = view.vp;
    const P = p => { const s = project(vp, p, view.width, view.height); return s ? [s[0] / dpr, s[1] / dpr, s[2]] : null; };
    const ownP = client.renderPos();

    // boost streaks and damage vignette under everything else
    if (client.pred?.boosting) this.streaks(x, W, H, T);
    if (client.hurtFlash > 0.02) {
      const g = x.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.7);
      g.addColorStop(0, 'rgba(255,40,30,0)'); g.addColorStop(1, `rgba(255,40,30,${0.45 * client.hurtFlash})`);
      x.fillStyle = g; x.fillRect(0, 0, W, H);
    }

    // cruisers: name, commander tier, shields / hull, subsystems (labels that would overlap are stacked)
    const placed = [];
    const labels = [...client.cruisers.values()].filter(c => c.state === 'active' || c.state === 'spooling')
      .map(c => ({ c, s: P(addScaled(c.p, [0, 1, 0], 90)) })).filter(l => l.s).sort((a, b) => b.s[1] - a.s[1]);
    for (const { c, s } of labels) {
      const enemy = c.side !== me.side, col = enemy ? COL.separatist : COL.republic;
      const sideCol = COL[c.side];
      const w = 120, left = s[0] - w / 2;
      let top = s[1] - 30;
      while (placed.some(r => Math.abs(r[0] - left) < w + 14 && Math.abs(r[1] - top) < 54)) top -= 56;
      placed.push([left, top]);
      x.fillStyle = 'rgba(3,19,24,0.28)'; x.fillRect(left - 6, top - 16, w + 12, 50);
      x.fillStyle = sideCol; x.textAlign = 'center';
      x.fillText(c.name + (c.eid === client.you?.home ? ' · home' : ''), s[0], top - 8);
      this.bar(x, left, top + 2, w, 4, c.shields / CRUISER.shields, '#7fd8ff');
      this.bar(x, left, top + 8, w, 5, c.hull / CRUISER.hull, col);
      SUBSYSTEM_IDS.forEach((k, i) => {
        const f = c.subs[k] / CRUISER.subsystems[k].hp;
        x.fillStyle = f <= 0 ? COL.bad : f < 0.5 ? COL.warn : 'rgba(255,255,255,0.75)';
        x.textAlign = 'left'; x.fillText(SUB_LETTER[k], left + i * 15, top + 22);
      });
      x.fillStyle = TIER_COL[c.tier] || COL.dim; x.textAlign = 'right';
      x.font = '700 10px ui-sans-serif, system-ui, sans-serif';
      x.fillText(c.leaderless ? 'LEADERLESS' : (c.tier || '').toUpperCase(), left + w, top + 22);
      x.font = '600 12px ui-sans-serif, system-ui, sans-serif';
      if (c.spooling) { x.fillStyle = COL.warn; x.textAlign = 'center'; x.fillText('HYPERDRIVE SPOOLING', s[0], top - 24); }
    }

    // ships within range
    const fwd = client.forward();
    const target = client.targetInfo(client.lockTarget) || (ownP && fwd ? client.targetInfo(client.pickTarget(ownP, fwd)?.eid) : null);
    for (const sh of client.ships.values()) {
      if (sh.eid === me.eid) continue;
      const pose = client.shipPose(sh);
      if (!pose) continue;
      const d = ownP ? dist(ownP, pose.p) : 0;
      const enemy = sh.side !== me.side;
      if (d > (enemy ? 3500 : 2300)) continue;
      const s = P(pose.p);
      if (!s) continue;
      const size = Math.max(5, Math.min(14, 1600 / Math.max(1, s[2])));
      x.strokeStyle = enemy ? '#ff665b' : '#62ffc5'; x.lineWidth = 1.5;
      x.beginPath(); x.moveTo(s[0], s[1] - size); x.lineTo(s[0] + size, s[1]); x.lineTo(s[0], s[1] + size); x.lineTo(s[0] - size, s[1]); x.closePath(); x.stroke();
      if (sh.cls?.canDock && enemy) { x.fillStyle = COL.warn; x.textAlign = 'center'; x.fillText('BOARDING CRAFT', s[0], s[1] - size - 8); }
    }
    if (target && ownP) this.target(x, client, target, P, ownP);
    if (client.predCls?.canDock) this.hangars(x, client, P);

    // reticle and lock
    if (client.pred) {
      const aim = P(addScaled(client.renderPos(), forwardOf(client.renderQuat()), 600));
      if (aim) {
        x.strokeStyle = client.hitFlash > 0.1 ? COL.good : 'rgba(220,240,255,0.85)'; x.lineWidth = 1.5;
        x.beginPath(); x.arc(aim[0], aim[1], 9, 0, Math.PI * 2); x.stroke();
        for (const [a, b] of [[[-20, 0], [-12, 0]], [[12, 0], [20, 0]], [[0, -20], [0, -12]], [[0, 12], [0, 20]]]) { x.beginPath(); x.moveTo(aim[0] + a[0], aim[1] + a[1]); x.lineTo(aim[0] + b[0], aim[1] + b[1]); x.stroke(); }
        if (client.hitFlash > 0.1) { x.lineWidth = 2; for (const sgn of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) { x.beginPath(); x.moveTo(aim[0] + sgn[0] * 5, aim[1] + sgn[1] * 5); x.lineTo(aim[0] + sgn[0] * 12, aim[1] + sgn[1] * 12); x.stroke(); } }
        const lock = client.you?.lock;
        const M = SHIP_CLASSES.fighter.missiles;
        if (lock && lock[0] && client.predCls?.missiles) {
          const k = Math.min(1, lock[1] / (M.lockTime * 1000));
          x.strokeStyle = k >= 1 ? COL.bad : COL.warn; x.lineWidth = 3;
          x.beginPath(); x.arc(aim[0], aim[1], 26, -Math.PI / 2, -Math.PI / 2 + k * Math.PI * 2); x.stroke();
          if (k >= 1) { x.fillStyle = COL.bad; x.textAlign = 'center'; x.fillText('LOCKED · right mouse', aim[0], aim[1] + 40); }
        }
      }
    }

    this.topBar(x, client, W, T);
    this.feed(x, client, W);
    if (client.pred) drawFleetCockpit(x, client, W, H);
    this.statusLine(x, client, W, H, ui);
    if (me.role === 'commander' || client.you?.r === 'commander') this.commanderPanel(x, client, W, H);
    // banners
    const toast = client.toasts[0];
    if (toast) { x.textAlign = 'center'; x.font = '600 15px ui-sans-serif, system-ui, sans-serif'; x.fillStyle = 'rgba(4,10,20,0.6)'; const tw = x.measureText(toast.text).width; x.fillRect(W / 2 - tw / 2 - 12, H * 0.22 - 15, tw + 24, 30); x.fillStyle = COL.text; x.fillText(toast.text, W / 2, H * 0.22); x.font = '600 12px ui-sans-serif, system-ui, sans-serif'; }
    if (client.result) {
      const won = client.result.winner === me.side;
      this.banner(x, W, H, client.result.winner ? (won ? 'VICTORY' : 'DEFEAT') : 'DRAW', reasonText(client.result.reason, client.result.winner, me.side));
    } else if (client.phase === 'warmup') {
      this.banner(x, W, H, client.warmupIn != null ? 'Battle in ' + Math.ceil(client.warmupIn / 1000) : 'Waiting for pilots', 'You fly for the ' + SIDE_INFO[me.side].name + ' · ' + (ROLES[client.you?.r || me.role]?.name || ''));
    } else if (client.you?.th === 'dead') {
      this.banner(x, W, H, 'Destroyed', 'Relaunching in ' + Math.ceil((client.you.rs || 0) / 1000) + ' s · pick your next ship (1-3) or level on foot (4-6) below');
    } else if (client.you?.th === 'out') {
      this.banner(x, W, H, 'No cruiser left to launch from', '');
    }
    if (ownP && Math.hypot(...ownP) > 7500) { x.fillStyle = COL.bad; x.textAlign = 'center'; x.fillText('LEAVING THE BATTLEFIELD · turn back', W / 2, H * 0.3); }
  }
  // a boarding craft's goal: the mouths of each enemy hangar, open once that cruiser's shields are down
  hangars(x, client, P) {
    const B = CRUISER.bay;
    for (const c of client.cruisers.values()) {
      if (c.side === client.me.side || (c.state !== 'active' && c.state !== 'spooling')) continue;
      for (const s of [-1, 1]) {
        const sp = P(fromBoxLocal([B.center[0] + s * (B.half[0] + 4), B.center[1], B.center[2]], c.p, c.yaw));
        if (!sp) continue;
        const open = c.shields <= 0;
        x.strokeStyle = open ? COL.good : COL.bad; x.lineWidth = 2;
        x.strokeRect(sp[0] - 12, sp[1] - 7, 24, 14);
        x.fillStyle = open ? COL.good : COL.bad; x.textAlign = 'center';
        x.fillText(open ? 'HANGAR OPEN' : 'HANGAR SHIELDED', sp[0], sp[1] + 20);
      }
    }
  }
  bar(x, l, t, w, h, f, col) {
    x.fillStyle = 'rgba(255,255,255,0.12)'; x.fillRect(l, t, w, h);
    x.fillStyle = col; x.fillRect(l, t, w * Math.max(0, Math.min(1, f)), h);
  }
  banner(x, W, H, title, sub) {
    x.textAlign = 'center';
    x.fillStyle = 'rgba(2,6,16,0.55)'; x.fillRect(0, H * 0.38 - 40, W, 80);
    x.font = '800 30px ui-sans-serif, system-ui, sans-serif'; x.fillStyle = COL.text; x.fillText(title, W / 2, H * 0.38 - 8);
    x.font = '600 13px ui-sans-serif, system-ui, sans-serif'; x.fillStyle = COL.dim; x.fillText(sub, W / 2, H * 0.38 + 20);
    x.font = '600 12px ui-sans-serif, system-ui, sans-serif';
  }
  streaks(x, W, H, T) {
    x.strokeStyle = 'rgba(180,220,255,0.18)'; x.lineWidth = 1;
    for (let i = 0; i < 26; i++) {
      const a = i * 2.39996 + (T / 1000) * 0.4, r0 = (Math.min(W, H) * 0.3) + ((T / 4 + i * 97) % 400);
      const cx = W / 2, cy = H / 2;
      x.beginPath(); x.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); x.lineTo(cx + Math.cos(a) * (r0 + 60), cy + Math.sin(a) * (r0 + 60)); x.stroke();
    }
  }
  target(x, client, t, P, ownP) {
    const s = P(t.p);
    const enemy = t.side !== client.me.side;
    const col = enemy ? COL.separatist : COL.republic;
    const d = dist(ownP, t.p);
    if (!s) return;
    const r = t.kind === 'cruiser' ? 40 : 18;
    x.strokeStyle = col; x.lineWidth = 2;
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      x.beginPath(); x.moveTo(s[0] + sx * r, s[1] + sy * (r - 7)); x.lineTo(s[0] + sx * r, s[1] + sy * r); x.lineTo(s[0] + sx * (r - 7), s[1] + sy * r); x.stroke();
    }
    x.fillStyle = col; x.textAlign = 'center';
    x.fillText((t.name || (t.cls?.canDock ? 'Boarding craft' : 'Fighter')) + ' · ' + Math.round(d) + ' m', s[0], s[1] + r + 12);
    if (t.kind === 'ship') this.bar(x, s[0] - 22, s[1] + r + 20, 44, 3, t.hp / t.max, col);
    if (t.kind === 'ship' && enemy) {
      const lead = client.leadPoint(t);
      const l = lead && P(lead);
      if (l) { x.strokeStyle = COL.warn; x.lineWidth = 1.5; x.beginPath(); x.arc(l[0], l[1], 5, 0, Math.PI * 2); x.stroke(); x.beginPath(); x.moveTo(s[0], s[1]); x.lineTo(l[0], l[1]); x.setLineDash([3, 4]); x.stroke(); x.setLineDash([]); }
    }
  }
  topBar(x, client, W) {
    const me = client.me, sides = client.sides;
    x.textAlign = 'center';
    x.fillStyle = 'rgba(4,10,20,0.6)'; x.fillRect(W / 2 - 250, 8, 500, 48);
    x.font = '800 16px ui-sans-serif, system-ui, sans-serif'; x.fillStyle = COL.text;
    x.fillText(client.phase === 'battle' ? mmss(client.left) : client.phase === 'warmup' ? 'WARM-UP' : client.phase.toUpperCase(), W / 2, 24);
    x.font = '600 12px ui-sans-serif, system-ui, sans-serif';
    for (const [side, dir] of [['republic', -1], ['separatist', 1]]) {
      const d = sides[side];
      if (!d) continue;
      const cx = W / 2 + dir * 150;
      x.fillStyle = COL[side];
      x.fillText(SIDE_INFO[side].name + (side === me.side ? ' (you)' : '') + (d.buff ? ' · comms buff' : ''), cx, 18);
      this.bar(x, cx - 70, 27, 140, 5, d.strength, COL[side]);
      x.fillStyle = COL.dim; x.fillText(d.tickets + ' reinforcements · ' + d.score + ' pts', cx, 43);
    }
    const g = client.ground;
    if (g) {
      let line = '';
      if (g.phase === 'pending') line = client.phase === 'battle' ? 'Planet: ground phase opens in ' + mmss(g.timer) : 'Planet: the ground phase opens ' + mmss(GROUND.opensMs) + ' into the battle';
      else if (g.phase === 'open') line = 'Planet: comms arrays · Republic ' + g.arrays.republic + ' · Empire ' + g.arrays.separatist + ' · ' + mmss(g.timer) + ' left';
      else if (g.winner) line = 'Planet: ' + SIDE_INFO[g.winner].name + ' destroyed the enemy array (buff for the rest of the match)';
      else if (g.winner === null) line = 'Planet: no array destroyed · no buff';
      x.fillStyle = COL.dim; x.fillText(line, W / 2, 68);
    }
    if (client.you?.vo && !client.you.vo.team) { x.fillStyle = COL.bad; x.fillText('TEAM VOICE OFFLINE · lost the ground phase', W / 2, 84); }
  }
  feed(x, client, W) {
    x.textAlign = 'right';
    client.feed.forEach((f, i) => {
      const age = (client.now() - f.at) / 1000;
      if (age > 8) return;
      x.globalAlpha = Math.min(1, 8 - age);
      x.fillStyle = f.tone === 'good' ? COL.good : f.tone === 'bad' ? COL.bad : f.tone === 'big' ? COL.warn : f.tone === 'warn' ? '#ffe7a8' : COL.text;
      x.fillText(f.text, W - 16, 22 + i * 18);
    });
    x.globalAlpha = 1;
  }
  flightPanel(x, client, W, H) {
    const s = client.pred, cls = client.predCls, hp = client.you?.hp ?? cls.hull;
    const left = W / 2 - 200, top = H - 74;
    x.fillStyle = 'rgba(4,10,20,0.6)'; x.fillRect(left - 10, top - 14, 420, 70);
    x.textAlign = 'left'; x.fillStyle = COL.text;
    x.font = '800 22px ui-sans-serif, system-ui, sans-serif'; x.fillText(Math.round(s.speed), left, top + 8);
    x.font = '600 11px ui-sans-serif, system-ui, sans-serif'; x.fillStyle = COL.dim; x.fillText('m/s', left + 52, top + 10);
    this.bar(x, left, top + 24, 80, 4, (s.speed - cls.minSpeed) / (cls.boostSpeed - cls.minSpeed), '#c9f0ff');
    const row = (label, f, col, y, extra) => { x.fillStyle = COL.dim; x.fillText(label, left + 110, y); this.bar(x, left + 160, y - 3, 200, 6, f, col); if (extra) { x.fillStyle = col; x.fillText(extra, left + 366, y); } };
    row('HULL', hp / cls.hull, hp / cls.hull < 0.3 ? COL.bad : COL.good, top, Math.ceil(hp));
    row('BOOST', s.energy / cls.boostMax, s.boosting ? '#ffffff' : '#62d8ff', top + 16, s.energy < cls.boostMin && !s.boosting ? 'LOW' : '');
    if (cls.lasers) row('HEAT', s.heat / cls.lasers.overheat, s.lockout > 0 ? COL.bad : s.heat > 70 ? COL.warn : '#ffb36b', top + 32, s.lockout > 0 ? 'OVERHEAT' : '');
    else { x.fillStyle = COL.warn; x.fillText('Boarding craft: fly into an enemy hangar once its shields are down', left + 110, top + 32); }
    if (cls.missiles) { x.fillStyle = COL.dim; x.fillText('MISSILES ' + (client.you?.ms ?? 0), left, top + 42); }
    const level = SHIP_TIERS.find(t => t.cls === cls.id);
    if (level) { x.fillStyle = cls.id === 'fighter' ? COL.dim : COL.warn; x.fillText('LEVEL ' + level.level + ' · ' + level.name[client.me.side].toUpperCase(), left + 110, top + 48); }
    x.font = '600 12px ui-sans-serif, system-ui, sans-serif';
  }
  statusLine(x, client, W, H, ui) {
    const you = client.you, role = ROLES[you?.r]?.name || '';
    x.textAlign = 'left'; x.fillStyle = COL.dim;
    let where = '';
    if (you?.th === 'interior') where = you.b?.area && client.cruisers.get(+you.b.area.slice(5))?.side !== client.me.side ? 'Aboard the enemy cruiser' : 'Inside your cruiser, watching the battle';
    else if (you?.th === 'ground') where = 'On the planet';
    x.fillText([role, where, client.t.kind === 'local' ? 'Practice vs AI pilots' : 'Online', ui.fps ? ui.fps + ' fps' : ''].filter(Boolean).join(' · '), 16, H - 16);
    x.fillStyle = COL.warn; x.fillText('Points ' + (you?.pts ?? 0) + ' · kills ' + (you?.kills ?? 0), 16, H - 52);
    x.fillText('H help · Tab scoreboard · Esc menu', 16, H - 34);
  }
  commanderPanel(x, client, W, H) {
    const c = client.cruisers.get(client.you?.home);
    if (!c) return;
    const left = W - 300, top = H - 150;
    x.fillStyle = 'rgba(4,10,20,0.65)'; x.fillRect(left - 10, top - 18, 300, 140);
    x.textAlign = 'left'; x.fillStyle = TIER_COL[c.tier] || COL.text;
    x.fillText('COMMANDER · ' + (c.tier || '').toUpperCase(), left, top);
    const md = client.you?.md;
    if (md) { x.fillStyle = COL.dim; x.fillText('damage taken x' + md[0] + ' · dealt x' + md[1] + ' · Force x' + md[2], left, top + 16); }
    x.fillStyle = COL.text; x.fillText('Broadside focus (1-4): ' + (client.you?.cmd?.focus || 'hull'), left, top + 34);
    SUBSYSTEM_IDS.forEach((k, i) => { x.fillStyle = COL.dim; x.fillText((i + 1) + ' ' + CRUISER.subsystems[k].name, left + (i % 2) * 140, top + 52 + Math.floor(i / 2) * 16); });
    x.fillStyle = client.you?.cmd?.canJump ? COL.warn : COL.dim;
    x.fillText('J hyperdrive jump ' + (client.you?.cmd?.canJump ? '(available)' : '(25% hull or less)'), left, top + 92);
    x.fillStyle = COL.dim; x.fillText('Drag to look · wheel to zoom · M marks a target', left, top + 108);
  }
}

function reasonText(reason, winner, side) {
  const us = winner === side;
  switch (reason) {
    case 'destroyed': return us ? 'Every enemy cruiser destroyed' : 'Our fleet was destroyed';
    case 'retreat': return us ? 'The last enemy cruiser fled to hyperspace' : 'Our last cruiser fled to hyperspace';
    case 'time': return 'Time: the stronger fleet wins';
    case 'forfeit': return us ? 'The enemy pilots left' : 'Our pilots left';
    case 'mutual': return 'Both fleets lost';
    default: return '';
  }
}
