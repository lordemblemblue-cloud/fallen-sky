/* eslint-disable */
// 2D overlay: health / force bars, power chips, saber style, live animation names, messages, enemy bars, help.
import { POWER_BY_ID } from './force.js';
import { drawGame2ResourceGauges, layoutGame2Gauges } from './hudGauges.js';
import { STYLE_NAMES } from './saber.js';
import { EXECUTION_NAMES } from './executions.js';

const STYLE_COL = ['', '#7fd3ff', '#b6ff8a', '#ff9a6a'];
const HELP_LOCK = ['Target lock / unlock', 'Middle mouse click (remappable). Follow hostile target; click again to release.'];
const HELP_LOADOUT = ['Lightsaber menu', 'Backtick (`): choose Single, Dual or Double-bladed staff. Esc returns to play.'];
const rr = (x, a, b, c, d, r) => { x.beginPath(); x.moveTo(a + r, b); x.arcTo(a + c, b, a + c, b + d, r); x.arcTo(a + c, b + d, a, b + d, r); x.arcTo(a, b + d, a, b, r); x.arcTo(a, b, a + c, b, r); x.closePath(); };
export const HELP = [
  ['Move', 'W A S D  (Shift = walk)'], ['Look / camera', 'Mouse (click to lock; hover-look if blocked) · arrows if needed · wheel zoom'], ['Crouch', 'Hold C'], ['Roll · rolling thrust', 'C while running · attack with W held mid-roll'], ['Force Evade', 'Automatic: 30% free dodge on incoming saber hit · hold Q: 100% dodge, 15% max Force per dodge · A/D/S/W choose direction'],
  ['Jump / Force Jump', 'Space (hold = Force Jump; J = level 1-3). At wall: W+A/D + Space; fresh Space kicks off.'], ['Saber on / off', 'R  (draw from thigh, ignite)'], ['Saber attack', 'Left mouse (+ WASD picks swing); Strong + W + jump + attack = leap slash (25 Force)'],
  ['Saber stance', 'Tab cycles Fast / Medium / Strong'], ['Saber throw', 'Right mouse (hold)'], ['Quick cast', '1 Push · 2 Pull · 3 Grip · 4 Lightning · 5 Heal'], ['More quick casts', '6 Speed · 7 Mind Trick · 8 Rage · 9 Protect · 0 Absorb'],
  HELP_LOCK,
  ['Force selector', 'Mouse wheel chooses · F uses highlighted ability (hold to channel)'], ['More Force', 'Drain · Sight · Team Heal · Team Energize via selector'], ['Respawn · Controls · Debug · Mute', 'Enter · F1 · F3 · M'], HELP_LOADOUT,
];
export const HELP_DUEL = [
  ['Move · look', 'W A S D (Shift = walk)  ·  mouse  ·  C crouch / roll (attack with W held: rolling thrust)'], ['Jump / wall run', 'Space (hold = Force Jump). At wall: W+A/D + Space; release + Space after 0.4s kicks off.'],
  ['Force Evade', '30% free automatic chance on incoming hit · hold Q: 100% for 15% max Force/dodge · A/D side · S back · W behind'],
  ['Saber on / off · execute · stance', 'R toggles saber, or executes a foe glowing red  ·  Tab cycles Fast / Medium / Strong'], ['Saber attack · throw · kata', 'Left mouse: attack (dual/staff use WASD) · hold right: throw / staff direction kick · stand still + hold both: kata (50 Force)'],
  ['Force menu', 'Mouse wheel or [ ] selects highlighted Force power'], ['Cast highlighted Force', 'F to cast  ·  hold F for Grip / Lightning / Heal / Drain'],
  ['Quick cast 1–5', '1 Push (hold to charge) · 2 Pull · 3 Grip · 4 Lightning · 5 Heal'], ['Quick cast 6–0', '6 Speed · 7 Mind Trick · 8 Rage · 9 Protect · 0 Absorb'], ['Other Force powers', 'G Levitate · X Force Repulse (meter full) · Drain and Sight with wheel + F'],
  ['Break a Grip', 'press 1 (Push), 2 (Pull), 0 (Absorb) or select one with wheel + F'], ['Block a push / pull', 'stand still on the ground with Force left, not mid-swing; moving = weaker'],
  ['Combos · taunt', 'Jump + Pull, then Push: blown away · Push then 6 Speed: dash to them · Lightning on a thrown saber charges it · T'],
  ['Zoom · rematch · controls · mute', 'Ctrl + wheel or - = · Enter · F1 · M'], HELP_LOCK, HELP_LOADOUT,
];
const HELP_COMBOS = HELP_DUEL[11];
export const HELP_ONLINE = [
  ...HELP_DUEL.slice(0, 11), HELP_COMBOS, HELP_LOCK, HELP_LOADOUT,
  ['Online', 'Jedi vs Dark Jedi, rounds: a side wins when the other has nobody standing · top right = ping and players'],
  ['Zoom · controls · mute', 'Ctrl + wheel or - =  ·  F1  ·  M  ·  Main menu leaves the match'],
];
// the offline skirmish modes (engine/teamMatch.js)
export const HELP_SKIRMISH = [
  ...HELP_DUEL.slice(0, 11), HELP_COMBOS, HELP_LOCK, HELP_LOADOUT,
  ['Bridges', 'E at a console cuts that energy bridge for 10 s: whoever is on it falls · a fall is fatal'],
  ['Capture the Flag', 'Take the enemy flag to your home while yours is safe. Middle-mouse lock a teammate, then 9 (Force Protect) to shield and heal them; if carrying a flag, H passes it. Carrier moves 10% slower and has free Force Sense. Walk over a dropped flag to recover or return it.'],
  ['Skirmish', 'FFA first to 15 · TDM first to 50 · CTF 3 captures · Sudden Death one life · 3 s immunity after a respawn'],
  ['Zoom · controls · mute', 'Ctrl + wheel or - =  ·  F1  ·  M  ·  Main menu leaves the match'],
];
export const HELP_MISSION = [
  ...HELP_DUEL.slice(0, 11), HELP_COMBOS, HELP_LOCK, HELP_LOADOUT,
  ['Weapons', 'Q switches Bryar pistol / lightsaber · R lights the saber · LMB fire · hold RMB = charged shot'],
  ['Use / interact', 'E  (consoles, terminals)'], ['Objective', 'follow the marker · top right shows the current goal'],
  ['Zoom · checkpoint · controls · mute', 'Ctrl + wheel or - =  ·  Enter (after falling)  ·  F1  ·  M'],
];
export const HELP_BOSS_WAY = [
  ...HELP_DUEL.slice(0,6), HELP_LOCK, HELP_LOADOUT,
  ['Rancor event','Expanded ruined courtyard with grass, textured stone and dirt. Ten 5,000-HP bars (50,000 total).'],
  ['Opening cinematic','Live Game 2 camera orbit (as in the two-Jedi main menu fight). Enter, Space or click skips the Rancor reveal.'],
  ['Defend','Strafe or retreat from claw sweeps and crushing grabs. Jump over the ground slam, or use the pillars for cover.'],
  ['Boss immunity','Cannot be instantly executed, crushed, mind-controlled, pushed or levitated. Wear down all ten HP bars.'],
  ['Reward','Victory unlocks a future loot hook only. No items, cards, currencies or rewards are currently granted.'],
  ['Retry · controls','ENTER retries after defeat or victory · F1 controls · Esc opens Pause and Main Menu'],
];
// Fleet Assault aboard a cruiser (fleetAssault/boarding): the match server keeps HP, so Heal and Drain are left out
export const HELP_BOARDING = [
  ...HELP_DUEL.slice(0, 6),
  ['Quick cast 1–5', '1 Push (hold to charge) · 2 Pull · 3 Grip · 4 Lightning · 5 (none aboard: the match server keeps health)'], HELP_DUEL[7], HELP_DUEL[8], HELP_DUEL[9], HELP_DUEL[10], HELP_COMBOS,
  HELP_LOCK, HELP_LOADOUT,
  ['Aboard', 'E at a station: plant a charge (enemy ship) or defuse one (your ship) · the top right shows your mission'],
  ['Zoom · controls · mute · menu', 'Ctrl + wheel or - =  ·  F1  ·  M  ·  Esc: roles, commander orders, scoreboard'],
];
export class HUD {
  constructor(canvas) { this.c = canvas; this.x = canvas.getContext('2d'); this.msgs = []; this.help = true; this.debug = true; this.dmg = 0; this.heal = 0; this.W = 1; this.H = 1; this.dpr = 1; this.hint = 1; this.flash = 0; this.banners = []; this.helpW = 640; this.helpList = HELP; this.title = 'JEDI OUTCAST · EXPLORER'; this.subtitle = 'Ghoul2 _humanoid rig  ·  original Jedi Outcast animations  ·  click to play'; }
  banner(text, col = [1, 1, 1], life = 1.5) { const last = this.banners[this.banners.length - 1]; if (last && last.t === text && last.life > life * 0.35) { last.life = life; return; } this.banners.push({ t: text, col, life, max: life }); if (this.banners.length > 3) this.banners.shift(); }
  msg(t) { if (this.msgs.length && this.msgs[this.msgs.length - 1].t === t) { this.msgs[this.msgs.length - 1].life = 3; return; } this.msgs.push({ t, life: 3.2 }); if (this.msgs.length > 5) this.msgs.shift(); }
  hit(d) { this.dmg = Math.min(1, this.dmg + 0.25 + d * 0.02); }
  resize() { const dpr = Math.min(window.devicePixelRatio || 1, 2); const w = this.c.clientWidth, h = this.c.clientHeight; if (this.c.width !== Math.floor(w * dpr) || this.c.height !== Math.floor(h * dpr)) { this.c.width = Math.floor(w * dpr); this.c.height = Math.floor(h * dpr); } this.W = w; this.H = h; this.dpr = dpr; }
  project(R, p) {
    // Net puppets and a newly initialized camera can temporarily contain a
    // non-finite pose or view-projection entry. NaN fails both '<' and '>'
    // screen-bound checks, so without a guard it reaches Canvas2D gradients.
    const m = R?.vp;
    if (!m || m.length < 16 || !p || p.length < 3 ||
        !p.every(Number.isFinite) || !Number.isFinite(this.W) ||
        !Number.isFinite(this.H) || this.W <= 0 || this.H <= 0) return null;
    const x = m[0]*p[0]+m[4]*p[1]+m[8]*p[2]+m[12];
    const y = m[1]*p[0]+m[5]*p[1]+m[9]*p[2]+m[13];
    const w = m[3]*p[0]+m[7]*p[1]+m[11]*p[2]+m[15];
    if (!Number.isFinite(x) || !Number.isFinite(y) ||
        !Number.isFinite(w) || w <= 0.05) return null;
    const sx = (x/w*0.5+0.5)*this.W;
    const sy = (1-(y/w*0.5+0.5))*this.H;
    return Number.isFinite(sx) && Number.isFinite(sy) ? [sx,sy,w] : null;
  }
  bar(x, X, Y, W, H, k, col, label) {
    // createLinearGradient throws a TypeError for even one NaN/Infinity.
    // A bad fighter snapshot must never halt the shared 60 Hz game loop.
    if (![X,Y,W,H,X+W].every(Number.isFinite) || W <= 0 || H <= 0) return false;
    const fill = Number.isFinite(k) ? Math.max(0,Math.min(1,k)) : 0;
    x.fillStyle = 'rgba(8,10,20,0.62)'; rr(x, X, Y, W, H, H / 2); x.fill(); x.save(); rr(x, X, Y, W, H, H / 2); x.clip(); const g = x.createLinearGradient(X, 0, X + W, 0); g.addColorStop(0, col[0]); g.addColorStop(1, col[1]);
    x.fillStyle = g; x.fillRect(X, Y, W * fill, H); x.restore(); x.strokeStyle = 'rgba(190,210,255,0.35)'; x.lineWidth = 1; rr(x, X + .5, Y + .5, W - 1, H - 1, H / 2); x.stroke();
    if (label) { x.fillStyle = '#fff'; x.font = '600 11px system-ui,sans-serif'; x.textBaseline = 'middle'; x.fillText(label, X + 10, Y + H / 2 + 1); }
  }
  draw(g, dt) {
    this.resize(); const x = this.x, W = this.W, H = this.H, dpr = this.dpr, P = g.player, F = g.force; x.setTransform(dpr, 0, 0, dpr, 0, 0); x.clearRect(0, 0, W, H);
    this.dmg = Math.max(0, this.dmg - dt * 1.4); this.heal = P.healFlash > 0 ? Math.min(1, P.healFlash) : Math.max(0, this.heal - dt * 2); if (P.healFlash > 0) P.healFlash = Math.max(0, P.healFlash - dt);
    for (const m of this.msgs) m.life -= dt; this.msgs = this.msgs.filter(m => m.life > 0);
    // vignettes
    const low = P.hp / P.maxHp < 0.3 && P.status !== 'dead' ? 0.25 + 0.15 * Math.sin(g.t * 6) : 0; const v = Math.max(this.dmg * 0.6, low);
    if (v > 0.01) { const gr = x.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.85); gr.addColorStop(0, 'rgba(160,0,0,0)'); gr.addColorStop(1, `rgba(190,10,10,${v})`); x.fillStyle = gr; x.fillRect(0, 0, W, H); }
    if (this.heal > 0.01) { const gr = x.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.9); gr.addColorStop(0, 'rgba(0,200,90,0)'); gr.addColorStop(1, `rgba(30,230,110,${this.heal * 0.3})`); x.fillStyle = gr; x.fillRect(0, 0, W, H); }
    const freeSense = !!g.teamMatch?.hasFreeSense(P);
    const sightActive = !!F.active.see || freeSense;
    if (sightActive) { x.fillStyle = 'rgba(40,200,255,0.07)'; x.fillRect(0, 0, W, H); }
    if (F.active.rage) { const gr = x.createRadialGradient(W / 2, H / 2, H * 0.4, W / 2, H / 2, H * 0.9); gr.addColorStop(0, 'rgba(255,0,0,0)'); gr.addColorStop(1, 'rgba(255,40,10,0.28)'); x.fillStyle = gr; x.fillRect(0, 0, W, H); }
    // enemy / ally bars
    for (const n of g.npcs) {
      if (n.isRancorBoss) continue; // Boss Way draws all ten dedicated 5,000-HP bars, not a duplicate tiny NPC bar
      if (n.status === 'dead' && !sightActive) continue; if ((g.duel || g.net) && !sightActive) continue; const hp = n.headPos(); const s = this.project(g.R, [hp[0], hp[1] + 0.35, hp[2]]); if (!s) continue; if (s[0] < -50 || s[0] > W + 50 || s[1] < -50 || s[1] > H + 50) continue;
      const d = Math.hypot(n.pos[0] - P.pos[0], n.pos[2] - P.pos[2]); if (d > 26 && !sightActive) continue; const sc = Math.max(0.55, Math.min(1.1, 9 / (s[2] + 4)));
      const col = n.team === 'blue' ? ['#258bdc', '#96e2ff'] : n.team === 'ally' ? ['#2bd96b', '#8dffb7'] : ['#d92b2b', '#ff8f6a']; const w = 54 * sc; x.globalAlpha = n.status === 'dead' ? 0.35 : 0.95;
      this.bar(x, s[0] - w / 2, s[1] - 14 * sc, w, 5 * sc + 1, n.hp / n.maxHp, col);
      if (g.experimentalCombatActive?.() && n.experimentalStamina) {
        const broken = n.experimentalStamina.brokenUntil > g.t;
        this.bar(x, s[0] - w / 2, s[1] - 7 * sc, w, 3 * sc + 1,
          n.experimentalStamina.current / 100,
          broken ? ['#8c302e', '#ff7d60'] : ['#84601b', '#e8bf65']);
      }
      x.fillStyle = n.team === 'blue' ? '#c5eeff' : n.team === 'ally' ? '#bfffd6' : '#ffd0c8'; x.font = `600 ${Math.round(10 * sc + 1)}px system-ui,sans-serif`; x.textAlign = 'center'; x.textBaseline = 'bottom'; x.fillText(n.label, s[0], s[1] - 16 * sc); x.textAlign = 'left';
      if (sightActive) { x.strokeStyle = 'rgba(80,220,255,0.9)'; x.lineWidth = 1.5; x.beginPath(); x.moveTo(s[0], s[1] + 4 * sc); x.lineTo(s[0] + 6 * sc, s[1] + 10 * sc); x.lineTo(s[0], s[1] + 16 * sc); x.lineTo(s[0] - 6 * sc, s[1] + 10 * sc); x.closePath(); x.stroke(); }
      x.globalAlpha = 1;
    }
    // Lock-on reticle is world-positioned on the selected hostile, with a
    // health readout. Never confuse this with auto-parry or Force Dodge.
    const lock = g.lockedTarget;
    if (lock && lock.status !== 'dead' && lock.hp > 0 && !this.help) {
      const sp = this.project(g.R, lock.chest());
      if (sp && sp[0] >= -32 && sp[0] <= W + 32 && sp[1] >= -32 && sp[1] <= H + 32) {
        const px = sp[0], py = sp[1], pulse = 0.85 + 0.15 * Math.sin(g.t * 7);
        const passTarget = !!g.teamMatch?.canPassFlag(P, lock);
        const shieldTarget = !!g.teamMatch?.canShieldAlly(P, lock);
        x.save(); x.globalAlpha = pulse; x.strokeStyle = shieldTarget ? '#75bfff' : '#80ecff'; x.lineWidth = 2.2;
        x.beginPath();
        for (let corner = 0; corner < 4; corner++) {
          const a = corner * Math.PI / 2 + Math.PI / 4;
          x.arc(px, py, 23, a - 0.18, a + 0.18);
        }
        x.stroke();
        x.beginPath(); x.arc(px, py, 3.5, 0, Math.PI * 2); x.stroke();
        const name = (lock.label || 'TARGET').slice(0, 30);
        x.textAlign = 'center'; x.textBaseline = 'bottom';
        x.font = '700 12px system-ui,sans-serif'; x.fillStyle = '#e7faff';
        x.fillText(name.toUpperCase(), px, py - 31);
        this.bar(x, px - 37, py + 30, 74, 6, lock.hp / (lock.maxHp || 1),
          shieldTarget ? ['#1973b5','#8ae6ff'] : ['#aa1824', '#ff7666']);
        const posture = g.experimentalCombatActive?.() && lock.experimentalStamina;
        if (posture) this.bar(x, px - 37, py + 39, 74, 4, posture.current / 100,
          posture.brokenUntil > g.t ? ['#8c302e', '#ff7d60'] : ['#84601b', '#e8bf65']);
        x.font = '600 10px system-ui,sans-serif'; x.fillStyle = posture && posture.brokenUntil > g.t ? '#ff9079' : '#9ddfff';
        x.fillText(shieldTarget ? (passTarget ? '9 SHIELD · H PASS FLAG' : '9 · SHIELD / HEAL') :
          posture && posture.brokenUntil > g.t ? 'GUARD BROKEN' : 'LOCKED', px, py + 53);
        x.restore();
      }
    }
    // execution prompt over a foe low enough to be finished (R)
    const EX = g.execCandidate; if (EX && !this.help) { const hh = EX.victim.headPos(), sp = this.project(g.R, [hh[0], hh[1] + 0.6, hh[2]]); if (sp) { const t = '[R]  EXECUTE  ·  ' + EXECUTION_NAMES[EX.kind]; x.font = '800 14px system-ui,sans-serif'; const tw = x.measureText(t).width + 26; x.fillStyle = `rgba(60,0,0,${0.7 + 0.15 * Math.sin(g.t * 8)})`; rr(x, sp[0] - tw / 2, sp[1] - 30, tw, 26, 13); x.fill(); x.strokeStyle = '#ff6a55'; x.lineWidth = 1.5; rr(x, sp[0] - tw / 2 + 0.5, sp[1] - 29.5, tw - 1, 25, 13); x.stroke(); x.fillStyle = '#ffe1d8'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(t, sp[0], sp[1] - 17); x.textAlign = 'left'; } }
    // crosshair
    const cx = W / 2, cy = H / 2; const ready = !P.saber.holstered; x.strokeStyle = 'rgba(210,230,255,0.75)'; x.lineWidth = 1.5; x.beginPath(); x.arc(cx, cy, 7, 0, 7); x.stroke(); x.fillStyle = 'rgba(255,255,255,0.9)'; x.fillRect(cx - 1, cy - 1, 2, 2);
    if (F.charging) { const ch = F.chargeLevel(); x.strokeStyle = ch >= 1 ? '#ffffff' : 'rgba(140,210,255,0.95)'; x.lineWidth = 3; x.beginPath(); x.arc(cx, cy, 15, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0.04, ch)); x.stroke(); x.font = '700 10px system-ui,sans-serif'; x.textAlign = 'center'; x.fillStyle = '#cfeaff'; x.fillText(ch >= 1 ? 'FULL PUSH' : 'PUSH', cx, cy + 30); x.textAlign = 'left'; } // charged Force Push
    // Floating holographic HUD: twin same-facing C arcs on the player's right,
    // with HP above stamina in a translucent bottom-right telemetry pane.
    // Projection uses the EXACT renderer VP matrix used by NPC markers.
    const head=this.project(g.R,P.headPos());
    const feet=this.project(g.R,[P.pos[0],P.pos[1]+.20,P.pos[2]]);
    const avatar=head&&feet ? {
      x:(head[0]+feet[0])*.5,top:head[1]-8,bottom:feet[1]+5
    } : null;
    this.resourceLayout=layoutGame2Gauges(W,H,avatar);
    drawGame2ResourceGauges(x, {
      width: W, height: H, avatar,
      hp: P.hp, hpMax: P.maxHp,
      force: F.fp, forceMax: F.max,
      special: F.pulse || 0, specialMax: 100,
      specialReady: !!(F.pulseReady?.() || F.dominanceReady?.()),
      stamina: P.experimentalStamina?.current ?? 100,
      staminaMax: 100,
      staminaBroken: !!(g.experimentalCombatActive?.() &&
        P.experimentalStamina?.brokenUntil > g.t),
    });
    // Combat-chain prompts remain on-screen but no longer overlap a bottom HUD.
    if (g.experimentalCombatActive?.() && P.experimentalStamina) {
      const noticeX = Math.max(60, W * 0.065), noticeY = H - Math.max(108, Math.min(180, H * .21));
      const surge = F.saberSurge;
      if (surge && !surge.consumed &&
          ((F.active.speed && surge.until > g.t) || surge.contactUntil > g.t)) {
        x.font = '700 11px system-ui,sans-serif'; x.fillStyle = '#b6e4f4';
        const contact = surge.target && surge.contactUntil > g.t;
        const label = contact ? 'SPEED LINK · Q + WASD' :
          'SABER SURGE · ' + Math.max(0, surge.until - g.t).toFixed(1) + 's';
        x.fillText(label, noticeX, noticeY);
      }
      const combo = P.experimentalCombo;
      if (combo && combo.until > g.t && combo.target?.status !== 'dead') {
        x.font = '700 11px system-ui,sans-serif'; x.fillStyle = '#bcefff';
        const action = combo.phase === 'contact' && combo.links < 2 ? 'Q + WASD TO CHAIN'
          : combo.phase === 'step' || combo.phase === 'reposition' ? 'ATTACK TO LINK'
          : combo.phase === 'swing' ? 'CONNECT YOUR SABER' : 'CHAIN COMPLETE';
        x.fillText('COMBO ' + combo.links + '/2 · ' + action, noticeX, noticeY + 17);
      }
    }
    // Force powers are NOT persistently displayed. Game 2's wheel / bracket
    // selection and F cast logic remain unchanged; only the timed selector shows.
    const selId = g.forceMenu ? F.selId() : null;
    // A temporary, readable Force selector shows the highlighted power after each wheel movement.
    if (g.forceMenu && F.selShow > 0 && !this.help && selId) {
      const n = F.list.length, prev = POWER_BY_ID[F.list[(F.sel + n - 1) % n]], next = POWER_BY_ID[F.list[(F.sel + 1) % n]], current = POWER_BY_ID[selId];
      const boxW = Math.min(500, W - 32), boxX = (W - boxW) / 2, boxY = Math.max(106, H * 0.70 - 22);
      x.save(); x.globalAlpha = Math.min(1, F.selShow * 1.9);
      x.fillStyle = 'rgba(6,15,31,0.90)'; rr(x, boxX, boxY, boxW, 56, 12); x.fill();
      x.strokeStyle = '#9bdafa'; x.lineWidth = 1.5; rr(x, boxX + .5, boxY + .5, boxW - 1, 55, 12); x.stroke();
      x.textAlign = 'center'; x.textBaseline = 'top';
      x.fillStyle = '#899fbe'; x.font = '11px system-ui,sans-serif';
      x.fillText('‹ ' + prev.name.replace('Force ', ''), boxX + boxW * 0.18, boxY + 22);
      x.fillText(next.name.replace('Force ', '') + ' ›', boxX + boxW * 0.82, boxY + 22);
      x.fillStyle = '#fff'; x.font = '700 14px system-ui,sans-serif'; x.fillText(current.name.toUpperCase(), boxX + boxW / 2, boxY + 10);
      x.fillStyle = '#ffd479'; x.font = '700 11px system-ui,sans-serif'; x.fillText('F TO CAST' + (current.hold ? ' · HOLD F' : ''), boxX + boxW / 2, boxY + 33);
      x.textAlign = 'left'; x.restore();
    }
    // saber / style panel (top-left)
    const S = P.saber; x.font = '600 12px system-ui,sans-serif'; x.textBaseline = 'top'; let ty = 16;
    x.fillStyle = 'rgba(8,10,22,0.6)'; rr(x, 14, 10, 330, this.debug ? 118 : 44, 9); x.fill();
    const wpn = g.playerWeapon === 'bryar' ? (g.launcher ? 'BLASTER + GRENADES  LMB fire · RMB grenade (' + g.launcher.ammo + (g.launcher.reloadT > 0 ? ', reloading' : '') + ')' : 'BRYAR PISTOL  LMB fire · RMB charge' + (P.hasSaber ? ' · [Q] saber' : '')) : (S.holstered ? 'SABER  holstered   [R] draw' : 'SABER  ignited   [R] holster') + (g.playerWeapon ? ' · [Q] pistol' : '');
    x.fillStyle = S.holstered && g.playerWeapon !== 'bryar' ? '#9aa6c8' : '#fff'; x.fillText(wpn, 26, ty); ty += 18;
    x.fillStyle = STYLE_COL[S.level]; x.fillText('STYLE  ' + STYLE_NAMES[S.level] + '   [Tab] change stance', 26, ty); ty += 18;
    if (this.debug) {
      x.font = '11px ui-monospace,Menlo,Consolas,monospace'; x.fillStyle = '#9fd0ff'; const a = P.actor; const tn = a.torsoFollow || !a.torso.cur ? '(follows legs)' : a.torso.name;
      x.fillText('legs   ' + a.legs.name, 26, ty); ty += 15; x.fillText('torso  ' + tn, 26, ty); ty += 15; x.fillText('move   ' + (S.M[S.move]?.ls || 'LS_NONE') + '   chain ' + S.chain + '   jump lvl ' + P.jumpLevel, 26, ty); ty += 15; x.fillText('state  ' + P.status + (P.ducked ? ' · crouched' : '') + '   ' + g.fps.toFixed(0) + ' fps', 26, ty);
    }
    // messages
    x.textAlign = 'center'; x.font = '600 14px system-ui,sans-serif'; this.msgs.forEach((m, i) => { const a = Math.min(1, m.life); x.globalAlpha = a; x.fillStyle = 'rgba(8,10,22,0.55)'; const tw = x.measureText(m.t).width + 24; const my = g.duel || (g.director && g.director.boss) ? 92 : 58; rr(x, W / 2 - tw / 2, my + i * 28, tw, 24, 12); x.fill(); x.fillStyle = '#e6f0ff'; x.textBaseline = 'middle'; x.fillText(m.t, W / 2, my + 12 + i * 28); }); x.globalAlpha = 1; x.textAlign = 'left';
    // kills
    x.textAlign = 'right'; x.fillStyle = '#9aa6c8'; x.font = '12px system-ui,sans-serif'; x.textBaseline = 'top'; if (!g.net) x.fillText(g.duel ? 'reflected ' + g.combat.reflected + '   ·   F1 = controls' : 'defeated ' + g.combat.kills + ' · reflected ' + g.combat.reflected + '   ·   F1 = controls', W - 18, 16); x.textAlign = 'left';
    // pointer lock hint
    if (!g.input.locked && !this.help && g.started) { x.textAlign = 'center'; x.textBaseline = 'middle'; x.font = '600 13px system-ui,sans-serif'; const tw = x.measureText('Click to capture the mouse').width + 28; x.fillStyle = 'rgba(8,10,22,0.72)'; rr(x, W / 2 - tw / 2, H * 0.62 + 20, tw, 26, 13); x.fill(); x.fillStyle = '#dfeaff'; x.fillText('Click to capture the mouse', W / 2, H * 0.62 + 33); x.textAlign = 'left'; }
    if (!g.net && P.spawnShield > g.t && P.status !== 'dead') { x.textAlign = 'center'; x.textBaseline = 'middle'; x.font = '600 13px system-ui,sans-serif'; x.fillStyle = '#bfe3ff'; x.fillText('Respawn immunity  ' + Math.ceil(P.spawnShield - g.t) + ' s', W / 2, H * 0.36); x.textAlign = 'left'; }
    if (g.duel) this.drawDuel(g, x, W, H, dt);
    else if (g.net) g.net.drawHud(this, x, W, H, dt);
    else if (g.director) g.director.drawHud(this, x, W, H, dt);
    else if (P.status === 'dead') { x.fillStyle = 'rgba(30,0,0,0.5)'; x.fillRect(0, 0, W, H); x.fillStyle = '#ffd8d0'; x.textAlign = 'center'; x.font = '700 34px system-ui,sans-serif'; x.fillText('You have fallen', W / 2, H * 0.42); x.font = '16px system-ui,sans-serif'; x.fillText('Press Enter to rise again', W / 2, H * 0.42 + 44); x.textAlign = 'left'; }
    if (this.showFps) { x.textAlign = 'right'; x.textBaseline = 'bottom'; x.font = '600 11px ui-monospace,Menlo,Consolas,monospace'; x.fillStyle = '#9fd0ff'; x.fillText(Math.round(g.fps) + ' FPS', W - 14, H - 10); x.textAlign = 'left'; }
    if (this.help) this.drawHelp(x, W, H);
  }
  // duel overlay: boss HP / Force bars, banners, grip prompt, round intro / result
  drawDuel(g, x, W, H, dt) {
    const B = g.boss, P = g.player, R = g.round, BF = B && B.force;
    if (B) {
      const pw = Math.min(380, W - 40), px = Math.max(W < 1100 ? 360 : 0, (W - pw) / 2), py = 12; // keep clear of the saber panel on narrow screens
      const experimentalPosture = g.experimentalCombatActive?.() && B.experimentalStamina;
      x.fillStyle = 'rgba(8,6,14,0.62)'; rr(x, px - 10, py - 4, pw + 20, experimentalPosture ? 76 : 58, 10); x.fill();
      x.textAlign = 'center'; x.textBaseline = 'top'; x.font = '700 13px system-ui,sans-serif'; x.fillStyle = B.status === 'dead' ? '#8a8a96' : '#ff9a90'; x.fillText(B.label.toUpperCase(), W / 2, py);
      this.bar(x, px, py + 17, pw, 14, Math.max(0, B.hp) / B.maxHp, ['#8e1010', '#ff5a3a'], null);
      this.bar(x, px, py + 36, pw, 8, BF.fp / BF.max, ['#2b3fa8', '#7ab8ff'], null);
      if (experimentalPosture) this.bar(x, px, py + 48, pw, 7, experimentalPosture.current / 100,
        experimentalPosture.brokenUntil > g.t ? ['#8c302e', '#ff7d60'] : ['#84601b', '#e8bf65'], null);
      x.font = '600 10px system-ui,sans-serif'; x.fillStyle = '#fff'; x.textAlign = 'right'; x.fillText(Math.ceil(Math.max(0, B.hp)) + ' / ' + B.maxHp, px + pw - 8, py + 19);
      const tags = []; for (const id of Object.keys(BF.active)) tags.push(POWER_BY_ID[id].name.replace('Force ', '').toUpperCase()); if (BF.holding) tags.push(BF.holding.toUpperCase()); if (B.status === 'gripped') tags.push('GRIPPED');
      if (tags.length) { x.textAlign = 'left'; x.font = '700 9.5px system-ui,sans-serif'; let tx = px; for (const t of tags) { const w = x.measureText(t).width + 12; x.fillStyle = 'rgba(255,120,100,0.22)'; rr(x, tx, py + (experimentalPosture ? 60 : 49), w, 14, 7); x.fill(); x.fillStyle = '#ffd0c8'; x.fillText(t, tx + 6, py + (experimentalPosture ? 63 : 52)); tx += w + 4; } }
      x.textAlign = 'left';
    }
    this.drawBanners(x, W, H, dt);
    this.drawGripHint(g, x, W, H);
    if (R.state === 'intro' && !this.help) { const k = Math.max(0, 1 - R.t / 2.2); if (k > 0) { x.save(); x.globalAlpha = Math.min(1, k * 1.6); x.textAlign = 'center'; x.textBaseline = 'middle'; x.font = '800 44px system-ui,sans-serif'; x.lineWidth = 6; x.strokeStyle = 'rgba(0,0,0,0.6)'; x.strokeText('DARK JEDI', W / 2, H * 0.34); x.fillStyle = '#ff6a58'; x.fillText('DARK JEDI', W / 2, H * 0.34); x.font = '600 16px system-ui,sans-serif'; x.fillStyle = '#e8d8ff'; x.fillText('Same Force powers · same rules · break his Grip, answer his Push', W / 2, H * 0.34 + 38); x.restore(); } }
    if (R.state === 'won' || R.state === 'lost') {
      const won = R.state === 'won', a = Math.min(1, R.t / 0.8); x.fillStyle = won ? `rgba(0,20,10,${0.35 * a})` : `rgba(30,0,0,${0.5 * a})`; x.fillRect(0, 0, W, H);
      x.save(); x.globalAlpha = a; x.textAlign = 'center'; x.fillStyle = won ? '#c8ffd8' : '#ffd8d0'; x.font = '800 40px system-ui,sans-serif'; x.fillText(won ? 'VICTORY' : 'You have fallen', W / 2, H * 0.42); x.font = '16px system-ui,sans-serif';
      x.fillText(won ? 'The Dark Jedi is defeated' : 'The Dark Jedi stands victorious', W / 2, H * 0.42 + 38); if (R.t > 0.8) x.fillText('Press Enter for a rematch', W / 2, H * 0.42 + 70); x.restore(); x.textAlign = 'left';
    }
  }
  // banners (blocked / absorbed / grip broken ...), shared by the duel and the missions
  drawBanners(x, W, H, dt) {
    for (const b of this.banners) b.life -= dt; this.banners = this.banners.filter(b => b.life > 0);
    this.banners.forEach((b, i) => {
      const k = Math.min(1, b.life / Math.min(0.5, b.max)), pop = 1 + 0.18 * Math.max(0, (b.life - (b.max - 0.18)) / 0.18);
      x.save(); x.globalAlpha = k; x.translate(W / 2, H * 0.24 + i * 38); x.scale(pop, pop); x.textAlign = 'center'; x.textBaseline = 'middle'; x.font = '800 ' + (i === this.banners.length - 1 ? 26 : 20) + 'px system-ui,sans-serif';
      x.lineWidth = 5; x.strokeStyle = 'rgba(0,0,0,0.55)'; x.strokeText(b.t, 0, 0); x.fillStyle = `rgb(${b.col.map(v => Math.round(v * 255)).join(',')})`; x.fillText(b.t, 0, 0); x.restore();
    });
    x.textAlign = 'left';
  }
  drawGripHint(g, x, W, H) {
    const P = g.player;
    if (P.status === 'gripped') { x.textAlign = 'center'; x.font = '700 15px system-ui,sans-serif'; x.fillStyle = 'rgba(255,200,170,' + (0.75 + 0.25 * Math.sin(g.t * 9)) + ')'; x.textBaseline = 'bottom'; x.fillText('GRIPPED!  1 Push · 2 Pull · 0 Absorb (or select with wheel + F)', W / 2, H * 0.62); x.textAlign = 'left'; }
  }
  drawHelp(x, W, H) {
    const HL = this.helpList; const bw = Math.min(this.helpW || 640, W - 24), bh = Math.min(HL.length * 24 + 112, H - 24), X = (W - bw) / 2, Y = (H - bh) / 2;
    x.fillStyle = 'rgba(5,7,16,0.86)'; rr(x, X, Y, bw, bh, 14); x.fill(); x.strokeStyle = 'rgba(140,180,255,0.45)'; x.lineWidth = 1; rr(x, X + .5, Y + .5, bw - 1, bh - 1, 14); x.stroke();
    x.textAlign = 'center'; x.fillStyle = '#fff'; x.font = '700 20px system-ui,sans-serif'; x.textBaseline = 'top'; x.fillText(this.title, W / 2, Y + 16); x.fillStyle = '#9fb8ff'; x.font = '12px system-ui,sans-serif'; x.fillText(this.subtitle, W / 2, Y + 44); x.textAlign = 'left';
    x.font = '13px system-ui,sans-serif'; HL.forEach((h, i) => { const yy = Y + 74 + i * 24; x.fillStyle = '#8fb4ff'; x.fillText(h[0], X + 24, yy); x.fillStyle = '#e8f0ff'; x.fillText(h[1], X + Math.min(this.helpW > 700 ? 250 : 230, bw * 0.34), yy); });
    x.textAlign = 'center'; x.fillStyle = '#ffd76a'; x.fillText('Press F1, click, or use WASD to resume', W / 2, Y + bh - 26); x.textAlign = 'left';
  }
}
