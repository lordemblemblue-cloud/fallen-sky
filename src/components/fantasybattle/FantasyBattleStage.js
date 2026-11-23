/**
 * Fantasy Battle stage: the renderer, two archers built from the same rig, the effects, and the turn-based battle.
 *
 * Each Fighter wraps a puppetCore state, a SkillPlayer and a PuppetView and offers the puppet API:
 *   setLookTarget(x, y)          world point to look at (cursor or combat target)
 *   triggerExpression(name)      neutral | focused | attackShout | hurt (and wink, pout)
 *   playSkill(id, onHit)         onHit(info) when one of the skill's arrows lands
 *   loadSkillJSON(data)          a skill, an array of skills, or { skills: [...] }
 *   setLayerTexture(layerId, url) skin or weapon swap
 * Audio goes through stage.onAudioEvent(sfxId) (default: the Web Audio synth).
 *
 * A battle round: the player picks an action; the opponent picks; battleRules resolves the round; then each step
 * plays in initiative order (the skill, its arrows, the hits and damage numbers) before the next actor's turn.
 */
import * as THREE from 'three';
import { createSceneRenderer, destroySceneRenderer, isSceneRendererReady } from '@/lib/webgpuSceneRenderer.js';
import { buildRig, createPuppetState, stepPuppet, socketPosition, setLookTarget as lookAt, triggerExpression as expressionOf } from './core/puppetCore.mjs';
import { SkillPlayer } from './core/skillTimeline.mjs';
import { ACTIONS, ACTION_ORDER, MAX_FOCUS, createBattle, legalActions, isLegal, resolveRound, chooseAiAction, unitById, computeDamage } from './core/battleRules.mjs';
import { PuppetView, loadTextures, prepareTexture } from './render/puppetView.js';
import { FxSystem, makeBackdropTexture } from './render/stageFx.js';
import { SfxSynth } from './render/sfx.js';
import rigData from './data/archerRig.json';
import skillDoc from './data/bowSkills.json';

export const ASSET_BASE = '/fantasybattle/archer/';
export const SCENE_ID = 'fantasy-battle';
const VIEW_HEIGHT = 800;
const MIN_VIEW_WIDTH = 1360;
const CAMERA_Y = 318;
export const UNITS = Object.freeze([
  Object.freeze({ id: 'hero', name: 'Silver Archer', team: 'player', maxHp: 120, atk: 12, def: 10, spd: 11 }),
  Object.freeze({ id: 'rival', name: 'Shade Archer', team: 'enemy', maxHp: 120, atk: 11, def: 10, spd: 10 }),
]);

function normalizeSkills(data) {
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.skills)) return data.skills;
  return data ? [data] : [];
}

export class Fighter {
  constructor(stage, { id, name, rig, textures, arrowTexture, tint, x, facing, seed, renderBase }) {
    this.stage = stage;
    this.id = id;
    this.name = name;
    this.rig = rig;
    this.x = x;
    this.facing = facing;
    this.state = createPuppetState(rig, { seed });
    this.skills = new SkillPlayer(skillDoc.skills);
    this.view = new PuppetView({ rig, textures, arrowTexture, tint, renderBase });
    this.view.group.position.set(x, 0, 0);
    this.view.group.scale.set(facing, 1, 1);
    this.lookWorld = null;
    this.state.life.combatTarget = 1;
  }

  toWorld([x, y]) { return [this.x + this.facing * x, y]; }

  toLocal([x, y]) { return [(x - this.x) * this.facing, y]; }

  hurtbox() {
    const p = this.toWorld(socketPosition(this.rig, this.state, rigData.hurtbox.socket));
    return { x: p[0], y: p[1], r: rigData.hurtbox.radius };
  }

  headWorld() { return this.toWorld(socketPosition(this.rig, this.state, 'headTop')); }

  // ---- puppet API ----
  setLookTarget(x, y) { this.lookWorld = [x, y]; }

  triggerExpression(name, hold = 1.2) { expressionOf(this.state.life, name, hold); }

  playSkill(id, onHit = null, options = {}) { return this.skills.play(id, onHit, options); }

  loadSkillJSON(data) { return normalizeSkills(data).map((s) => this.skills.load(s)); }

  async setLayerTexture(layerId, url) {
    if (this.rig.layerOf(layerId) === undefined) throw new Error(`no layer ${layerId}`);
    if (!url) { this.view.setLayerTexture(layerId, null); return; }
    const tex = prepareTexture(await new THREE.TextureLoader().loadAsync(url));
    this.view.setLayerTexture(layerId, tex);
  }

  update(dt) {
    if (this.lookWorld) {
      const target = this.toLocal(this.lookWorld);
      const head = socketPosition(this.rig, this.state, 'headTop');
      const range = rigData.look.range;
      lookAt(this.state.life, (target[0] - head[0]) / range, (target[1] - (head[1] - 50)) / range);
    }
    const out = this.skills.update(dt);
    stepPuppet(this.rig, this.state, dt, this.skills.evaluate());
    this.view.flash = Math.max(0, this.view.flash - dt * 3.5);
    this.view.update(this.state);
    return out;
  }
}

export class FantasyBattleStage {
  constructor(container, { onHud = null, seed = Date.now() % 100000 } = {}) {
    this.container = container;
    this.onHud = onHud;
    this.seed = seed;
    this.mode = 'battle';
    this.phase = 'loading';
    this.speed = 1;
    this.hitStop = 0;
    this.time = 0;
    this.waiters = [];
    this.timers = [];
    this.logLines = [];
    this.cursor = null;
    this.disposed = false;
    this.sfx = new SfxSynth();
    this.onAudioEvent = (sfxId) => this.sfx.play(sfxId);
    this.settings = { parallax: 1, stiffness: 1, smear: 1, speed: 1, wireframe: false, pivots: false, hitboxes: false };
    this.numbers = [];
    this.missShown = new WeakSet();
    this.rendererInfo = null;
  }

  async init() {
    const manifestLoad = fetch(`${ASSET_BASE}parts.json`).then((r) => r.json());
    const names = [...rigData.layers.map((l) => l.part), ...Object.values(rigData.expressions), 'arrow'];
    const texturesLoad = loadTextures(names, ASSET_BASE);
    let { renderer, ready, kind, reason } = createSceneRenderer(SCENE_ID, { antialias: true, alpha: false, powerPreference: 'high-performance', gameplay: true });
    try {
      await ready;
    } catch (error) {
      console.warn('[fantasy-battle] WebGPU did not start; using WebGL', error);
      destroySceneRenderer(renderer);
      renderer = new THREE.WebGLRenderer({ antialias: true });
      kind = 'webgl';
      reason = 'webgpu-failed';
    }
    if (this.disposed) { destroySceneRenderer(renderer); return; }
    this.renderer = renderer;
    this.rendererInfo = { kind, reason };
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.domElement.className = 'fb-canvas';
    this.container.appendChild(renderer.domElement);
    this.overlay = document.createElement('div');
    this.overlay.className = 'fb-numbers';
    this.container.appendChild(this.overlay);
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x120f1c);
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -100, 100);
    this.camera.position.set(0, CAMERA_Y, 10);
    this.resize();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.container);
    this.onPointer = (e) => this.pointer(e);
    renderer.domElement.addEventListener('pointermove', this.onPointer);
    renderer.domElement.addEventListener('pointerdown', this.onPointer);

    const [manifest, textures] = await Promise.all([manifestLoad, texturesLoad]);
    if (this.disposed) { for (const t of textures.values()) t.dispose(); return; }
    this.manifest = manifest;
    this.rig = buildRig(rigData, manifest);
    this.textures = textures;
    this.rendererInfo.api = renderer.isWebGPURenderer ? (renderer.backend?.isWebGPUBackend ? 'WebGPU' : 'WebGL2 (WebGPU renderer)') : 'WebGL';
    this.buildScene();
    this.restart();
    this.last = performance.now();
    this.loop = (now) => { this.raf = requestAnimationFrame(this.loop); this.frame(now); };
    this.raf = requestAnimationFrame(this.loop);
  }

  buildScene() {
    const backdrop = new THREE.Mesh(new THREE.PlaneGeometry(2600, 1300), new THREE.MeshBasicMaterial({ map: makeBackdropTexture(), depthTest: false, depthWrite: false }));
    backdrop.position.set(0, 880 - 650, -5);
    backdrop.renderOrder = 0;
    this.backdrop = backdrop;
    this.scene.add(backdrop);
    const arrowTexture = this.textures.get('arrow');
    this.fx = new FxSystem(this.scene, arrowTexture);
    this.fighters = {
      hero: new Fighter(this, { id: 'hero', name: UNITS[0].name, rig: this.rig, textures: this.textures, arrowTexture, tint: 0xffffff, x: -430, facing: 1, seed: 11, renderBase: 100 }),
      rival: new Fighter(this, { id: 'rival', name: UNITS[1].name, rig: this.rig, textures: this.textures, arrowTexture, tint: 0xb9a6e8, x: 430, facing: -1, seed: 29, renderBase: 300 }),
    };
    for (const f of Object.values(this.fighters)) {
      const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: this.fx.tex.shadow, transparent: true, depthTest: false, depthWrite: false }));
      shadow.scale.set(380, 70, 1);
      shadow.position.set(f.x, 6, 0);
      shadow.renderOrder = 2;
      this.scene.add(shadow, f.view.group);
    }
    this.applySettings();
  }

  resize() {
    if (!this.renderer) return;
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(w, h, false);
    const aspect = w / h;
    let vh = VIEW_HEIGHT;
    let vw = vh * aspect;
    if (vw < MIN_VIEW_WIDTH) { vw = MIN_VIEW_WIDTH; vh = vw / aspect; }
    Object.assign(this.camera, { left: -vw / 2, right: vw / 2, top: vh / 2, bottom: -vh / 2 });
    this.camera.updateProjectionMatrix();
    this.viewSize = { w, h };
  }

  pointer(e) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const v = new THREE.Vector3(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1, 0).unproject(this.camera);
    this.cursor = { x: v.x, y: v.y, at: this.time };
    if (e.type === 'pointerdown') this.sfx.ensure();
  }

  worldToScreen(x, y) {
    const v = new THREE.Vector3(x, y, 0).project(this.camera);
    return [(v.x + 1) / 2 * this.viewSize.w, (1 - v.y) / 2 * this.viewSize.h];
  }

  // ---- settings and debug ----
  setSettings(patch) {
    Object.assign(this.settings, patch);
    this.applySettings();
  }

  applySettings() {
    if (!this.fighters) return;
    this.speed = this.settings.speed;
    for (const f of Object.values(this.fighters)) {
      Object.assign(f.state.settings, { parallax: this.settings.parallax, stiffness: this.settings.stiffness, smear: this.settings.smear });
      f.view.setDebug({ wireframe: this.settings.wireframe, pivots: this.settings.pivots });
    }
    this.fx.setDebugHitboxes(this.settings.hitboxes);
  }

  setMuted(muted) { this.sfx.setMuted(muted); }

  // ---- time ----
  wait(seconds) { return new Promise((resolve) => this.timers.push({ at: this.time + seconds, resolve })); }

  waitUntil(check) { return new Promise((resolve) => this.waiters.push({ check, resolve })); }

  frame(now) {
    const real = Math.min(0.05, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    let dt = real * this.speed;
    if (this.hitStop > 0) { this.hitStop = Math.max(0, this.hitStop - real); dt = 0; }
    this.step(dt, real);
  }

  /** One frame with explicit game and real time steps (tests and recordings drive this directly). */
  step(dt, real = dt) {
    this.time += dt;
    const { hero, rival } = this.fighters;
    // look targets: the player follows the cursor while choosing or practising, otherwise the combat target
    const cursorFresh = this.cursor && this.time - this.cursor.at < 4;
    const heroBusy = hero.skills.busy;
    if (cursorFresh && !heroBusy && (this.mode === 'practice' || this.phase === 'choose')) hero.setLookTarget(this.cursor.x, this.cursor.y);
    else hero.setLookTarget(...this.lookPointOf(rival));
    rival.setLookTarget(...this.lookPointOf(hero));
    for (const f of [hero, rival]) {
      const { events } = f.update(dt);
      for (const e of events) this.handleEvent(f, e);
      const charge = f.state.params.charge ?? 0;
      const tip = f.view.lastArrow && (f.state.params.nocked ?? 0) > 0.5 ? f.toWorld(f.view.lastArrow.tip) : null;
      this.fx.glowAt(`charge:${f.id}`, tip?.[0] ?? 0, tip?.[1] ?? 0, tip ? charge : 0);
      const ward = this.fx.wards.get(f.id);
      if (ward) ward.mesh.position.set(f.x + f.facing * 150, f.hurtbox().y + 10, 0);
    }
    this.fx.update(dt, (target) => target.hurtbox());
    this.checkMisses();
    this.fx.drawHitboxes(this.settings.hitboxes ? Object.values(this.fighters).map((f) => f.hurtbox()) : []);
    for (const t of this.timers.filter((x) => this.time >= x.at)) t.resolve();
    this.timers = this.timers.filter((x) => this.time < x.at);
    for (const w of this.waiters.filter((x) => x.check())) w.resolve();
    this.waiters = this.waiters.filter((x) => !x.done && !x.check());
    const [sx, sy] = this.fx.shakeOffset();
    if (this.hitStop > 0 || real > 0) this.fx.updateShake(dt > 0 ? 0 : real);
    this.camera.position.set(sx, CAMERA_Y + sy, 10);
    if (isSceneRendererReady(this.renderer)) this.renderer.render(this.scene, this.camera);
    this.updateNumbers(real);
  }

  lookPointOf(f) {
    const hb = f.hurtbox();
    return [hb.x, hb.y + 60];
  }

  // ---- skill events ----
  handleEvent(fighter, e) {
    switch (e.type) {
      case 'playSFX': this.onAudioEvent?.(e.sfxId, fighter.id); break;
      case 'screenShake': this.fx.addShake(e.intensity ?? 1, e.duration ?? 0.15); break;
      case 'hitStop': this.hitStop = Math.max(this.hitStop, e.duration ?? 0.05); break;
      case 'onHitFrame': e.run.hitWindowEnd = e.time + (e.activeFor ?? 0.8); break;
      case 'expression': fighter.triggerExpression(e.name, e.hold ?? 0.8); break;
      case 'spawnEffect':
        if (e.effect === 'ward') {
          this.fx.ward(fighter.id, fighter.x, fighter.hurtbox().y + 10, fighter.facing);
          if (!(this.roundGuards?.has(fighter.id))) this.wait(e.duration ?? 0.9).then(() => this.fx.clearWard(fighter.id));
        }
        break;
      case 'spawnArrow': this.spawnArrowFrom(fighter, e); break;
      default: break;
    }
  }

  spawnArrowFrom(fighter, e) {
    const run = e.run;
    const target = run.options?.target || (fighter.id === 'hero' ? this.fighters.rival : this.fighters.hero);
    const last = fighter.view.lastArrow;
    const nockLocal = last ? last.nock : socketPosition(fighter.rig, fighter.state, 'nock');
    const angleLocal = last ? last.angle : 0;
    const from = fighter.toWorld(nockLocal);
    const angle = fighter.facing > 0 ? angleLocal : Math.PI - angleLocal;
    let result = null;
    if (run.options?.hits) result = run.options.hits.shift() ?? { hit: false, damage: 0, extra: true };
    else if (run.options?.practice !== false) result = this.practiceResult(run.id, e.arrow?.volleyIndex);
    const hb = target.hurtbox();
    const spread = e.arrow?.spread ?? 0;
    const aim = result?.hit
      ? [hb.x, hb.y + spread * 10 + (Math.random() - 0.5) * 30]
      : [hb.x + fighter.facing * 260, hb.y + (Math.random() < 0.5 ? 240 : -230)];
    const timeLeft = Math.max(0.1, (run.hitWindowEnd ?? e.time + 0.9) - e.time);
    const arrow = this.fx.spawnArrow({
      from, angle, target, aim, speed: e.arrow?.speed, arc: e.arrow?.arc, scale: e.arrow?.scale ?? 1,
      style: e.trail?.style, trailLength: e.trail?.length, activeFor: timeLeft, result,
      renderBase: 900, impact: { hitStop: e.arrow?.impactHitStop ?? 0, shake: e.arrow?.impactShake ?? 0 },
      onHit: (a) => this.arrowLanded(fighter, target, a, run),
    });
    arrow.meta = { attacker: fighter, run };
    this.missShown.delete(arrow);
  }

  practiceResult(skillId, volleyIndex = 0) {
    const action = ACTIONS[skillId] || ACTIONS.quickShot;
    const hero = UNITS[0];
    return { hit: true, crit: skillId === 'chargedShot', guarded: false, damage: computeDamage({ power: action.power ?? 16, atk: hero.atk, def: UNITS[1].def, variance: 0.5 + 0.1 * (volleyIndex || 0), crit: skillId === 'chargedShot' }), practice: true };
  }

  arrowLanded(attacker, target, arrow, run) {
    const r = arrow.result;
    const hb = target.hurtbox();
    const point = [arrow.head[0], arrow.head[1]];
    this.fx.burst(point[0], point[1], { crit: r.crit, guarded: r.guarded });
    this.onAudioEvent?.(r.guarded ? 'guardHit' : r.crit ? 'crit' : 'hit', target.id);
    this.fx.addShake(arrow.impact.shake || (r.crit ? 3 : 1.6), 0.18);
    if (arrow.impact.hitStop) this.hitStop = Math.max(this.hitStop, arrow.impact.hitStop);
    target.view.flash = r.guarded ? 0.4 : 1;
    if (r.guarded) this.fx.flashWard(target.id);
    this.number(hb.x, hb.y + 40, String(r.damage), r.crit ? 'crit' : r.guarded ? 'guarded' : 'hit', r.crit ? 'CRIT' : r.guarded ? 'GUARD' : '');
    if (!r.practice) {
      const d = this.display[target.id];
      d.hp = r.hpAfter;
      if (r.ko) {
        target.skills.stop();
        target.playSkill('defeat');
        target.state.life.combatTarget = 0;
        this.koPending = { winner: attacker, loser: target };
        this.onAudioEvent?.('defeat', target.id);
      }
      this.emitHud();
    }
    if (!r.ko) {
      const react = r.guarded ? 'guardHit' : 'hitReact';
      if (!target.skills.busy || target.skills.current?.id === 'hitReact' || target.skills.current?.id === 'guardHit') {
        target.skills.stop();
        target.playSkill(react);
      }
      target.triggerExpression(r.guarded ? 'focused' : 'hurt', 0.5);
    }
    run.onHit?.({ attacker: attacker.id, target: target.id, ...r });
  }

  checkMisses() {
    for (const a of this.fx.arrows) {
      if (!a.result || a.result.hit || this.missShown.has(a) || !a.target) continue;
      const hb = a.target.hurtbox();
      const dir = a.meta?.attacker?.facing ?? 1;
      if ((a.head[0] - hb.x) * dir > 0) {
        this.missShown.add(a);
        if (!a.result.extra) this.number(hb.x, hb.y + 40, 'MISS', 'miss', '');
        this.onAudioEvent?.('miss', a.target.id);
      }
    }
  }

  // ---- damage numbers (DOM overlay) ----
  number(x, y, text, kind, tag) {
    const el = document.createElement('div');
    el.className = `fb-number fb-number-${kind}`;
    el.innerHTML = tag ? `<small>${tag}</small>${text}` : text;
    this.overlay.appendChild(el);
    // numbers close together in time stack upward instead of covering each other
    const near = this.numbers.filter((n) => n.age < 0.6 && Math.abs(n.x - x) < 160).length;
    this.numbers.push({ el, x: x + (Math.random() - 0.5) * 40, y: y + near * 46, age: 0, life: 1.15 });
  }

  updateNumbers(real) {
    for (const n of this.numbers) {
      n.age += real;
      const t = n.age / n.life;
      const [sx, sy] = this.worldToScreen(n.x, n.y + 90 * Math.sqrt(t));
      const pop = t < 0.12 ? 0.6 + 3.3 * t : 1;
      n.el.style.transform = `translate(-50%, -50%) translate(${sx.toFixed(1)}px, ${sy.toFixed(1)}px) scale(${pop.toFixed(3)})`;
      n.el.style.opacity = String(t < 0.7 ? 1 : Math.max(0, 1 - (t - 0.7) / 0.3));
    }
    for (const n of this.numbers) if (n.age >= n.life) n.el.remove();
    this.numbers = this.numbers.filter((n) => n.age < n.life);
  }

  // ---- battle ----
  restart() {
    this.seed = (this.seed * 1103515245 + 12345) % 2147483647;
    this.battle = createBattle({ seed: this.seed, units: UNITS });
    this.display = Object.fromEntries(this.battle.units.map((u) => [u.id, { hp: u.hp, focus: u.focus }]));
    this.koPending = null;
    this.round = null;
    this.activeActor = null;
    this.roundGuards = new Set();
    for (const f of Object.values(this.fighters)) {
      f.skills.stop();
      f.state.life.combatTarget = this.mode === 'battle' ? 1 : 0.6;
      this.fx.clearWard(f.id);
    }
    this.phase = this.mode === 'battle' ? 'choose' : 'practice';
    this.logLines = [];
    this.log(this.mode === 'battle' ? 'Round 1. Choose an action.' : 'Practice: play any skill; the shade takes the hits.');
  }

  setMode(mode) {
    if (mode === this.mode || this.phase === 'playing') return;
    this.mode = mode;
    this.restart();
  }

  log(line) {
    this.logLines = [...this.logLines.slice(-3), line];
    this.emitHud();
  }

  legal() {
    if (!this.battle) return [];
    return legalActions(this.battle, 'hero').map((a) => ({ ...a, enabled: a.enabled && this.phase === 'choose' }));
  }

  /** The player's choice for this round (battle mode). Returns false when it cannot be taken now. */
  async chooseAction(actionId) {
    if (this.mode !== 'battle' || this.phase !== 'choose' || !isLegal(this.battle, 'hero', actionId)) return false;
    this.sfx.ensure();
    const rivalAction = chooseAiAction(this.battle, 'rival');
    const { battle, round } = resolveRound(this.battle, { hero: actionId, rival: rivalAction });
    this.phase = 'playing';
    this.round = round;
    this.log(`Round ${round.number}: you chose ${ACTIONS[actionId].name}; the shade chose ${ACTIONS[rivalAction].name}.`);
    await this.playRound(round);
    if (this.disposed) return true;
    this.battle = battle;
    for (const u of battle.units) this.display[u.id] = { hp: u.hp, focus: u.focus };
    this.round = null;
    if (battle.phase === 'over') {
      this.phase = 'over';
      this.log(battle.winner === 'player' ? 'Victory! The shade is down.' : 'Defeat. The shade stands over you.');
    } else {
      this.phase = 'choose';
      this.log(`Round ${battle.round}. Choose an action.`);
    }
    return true;
  }

  async playRound(round) {
    this.roundGuards = new Set(round.steps.filter((s) => s.action === 'guard' && !s.skipped).map((s) => s.actor));
    for (const step of round.steps) {
      if (this.disposed) return;
      this.activeActor = step.actor;
      this.emitHud();
      if (step.skipped) continue;
      const actor = this.fighters[step.actor];
      const target = this.fighters[step.target];
      this.display[step.actor].focus = step.focus[1];
      const hits = step.hits.filter((h) => h.hit).length;
      if (ACTIONS[step.action].kind === 'attack') this.log(`${actor.name}: ${ACTIONS[step.action].name}, ${hits}/${step.hits.length} hit${step.hits.length > 1 ? 's' : ''}.`);
      else this.log(`${actor.name} guards.`);
      actor.playSkill(ACTIONS[step.action].skill, null, { hits: step.hits.map((h) => ({ ...h })), target, step });
      const run = actor.skills.current;
      await this.waitUntil(() => actor.skills.current !== run && !this.fx.arrows.some((a) => a.meta?.run === run));
      await this.wait(0.35);
      if (this.koPending) {
        const { winner } = this.koPending;
        winner.skills.stop();
        winner.playSkill('victory');
        winner.state.life.combatTarget = 0;
        this.onAudioEvent?.('victory', winner.id);
        this.koPending = null;
        await this.wait(1.2);
      }
    }
    for (const id of this.roundGuards) this.fx.clearWard(id);
    this.roundGuards = new Set();
    this.activeActor = null;
  }

  /** Practice mode: play a skill on the player at once (cancel windows and the input buffer apply). */
  practice(skillId) {
    if (this.mode !== 'practice' || !this.fighters) return null;
    this.sfx.ensure();
    return this.fighters.hero.playSkill(skillId, null, { target: this.fighters.rival });
  }

  /** Keys 1-3 (bow skills) and 4/G (guard): choose in battle, play in practice. */
  handleKey(key) {
    const k = key.toLowerCase() === 'g' ? '4' : key;
    const action = ACTION_ORDER.find((id) => ACTIONS[id].hotkey === k);
    if (!action) return false;
    if (this.mode === 'battle') this.chooseAction(action);
    else this.practice(ACTIONS[action].skill);
    return true;
  }

  hudState() {
    const units = (this.battle?.units || UNITS).map((u) => ({
      id: u.id, name: u.name, maxHp: u.maxHp, hp: this.display?.[u.id]?.hp ?? u.maxHp, focus: this.display?.[u.id]?.focus ?? 1, maxFocus: MAX_FOCUS,
      spd: u.spd, guarding: this.roundGuards?.has(u.id) ?? false,
    }));
    const order = this.round
      ? this.round.order.map((id) => ({ id, name: unitById(this.battle, id).name, action: ACTIONS[this.round.choices[id]].name, active: this.activeActor === id }))
      : [...units].sort((a, b) => b.spd - a.spd).map((u) => ({ id: u.id, name: u.name, action: null, active: false }));
    return {
      mode: this.mode, phase: this.phase, round: this.round?.number ?? this.battle?.round ?? 1, units, order,
      legal: this.legal(), log: this.logLines, winner: this.battle?.winner ?? null, renderer: this.rendererInfo,
      skills: this.fighters ? [...this.fighters.hero.skills.library.values()].map((s) => ({ id: s.id, name: s.name, hotkey: s.hotkey })) : [],
    };
  }

  emitHud() { this.onHud?.(this.hudState()); }

  // ---- capture ----
  /** Render now and return the frame as a PNG data URL (blank on WebGPU canvases; use ?renderer=webgl). */
  captureFrame() {
    this.renderer.render(this.scene, this.camera);
    return this.renderer.domElement.toDataURL('image/png');
  }

  /** Record the three bow skills in practice mode as a WebM clip. */
  async recordClip() {
    if (typeof MediaRecorder === 'undefined') throw new Error('this browser cannot record video');
    const previousMode = this.mode;
    this.mode = 'practice';
    this.restart();
    const stream = this.renderer.domElement.captureStream(60);
    const mimeType = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find((m) => MediaRecorder.isTypeSupported(m)) || '';
    const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 6_000_000 });
    const chunks = [];
    recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    const stopped = new Promise((resolve) => { recorder.onstop = resolve; });
    recorder.start(100);
    const hero = this.fighters.hero;
    await this.wait(0.6);
    for (const id of ['quickShot', 'chargedShot', 'volley']) {
      this.practice(id);
      const run = hero.skills.current;
      await this.waitUntil(() => hero.skills.current !== run && this.fx.arrows.length === 0);
      await this.wait(0.45);
    }
    recorder.stop();
    await stopped;
    for (const t of stream.getTracks()) t.stop();
    this.mode = previousMode;
    this.restart();
    return new Blob(chunks, { type: 'video/webm' });
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.resizeObserver?.disconnect();
    this.renderer?.domElement.removeEventListener('pointermove', this.onPointer);
    this.renderer?.domElement.removeEventListener('pointerdown', this.onPointer);
    for (const w of this.waiters) w.resolve();
    for (const t of this.timers) t.resolve();
    if (this.fighters) for (const f of Object.values(this.fighters)) f.view.dispose();
    this.fx?.dispose();
    if (this.textures) for (const t of this.textures.values()) t.dispose();
    this.backdrop?.material.map?.dispose();
    this.backdrop?.geometry.dispose();
    this.backdrop?.material.dispose();
    this.sfx.dispose();
    this.overlay?.remove();
    if (this.renderer) {
      this.renderer.domElement.remove();
      destroySceneRenderer(this.renderer);
    }
  }
}
