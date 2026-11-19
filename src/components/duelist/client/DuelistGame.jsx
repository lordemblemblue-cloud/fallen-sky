// Duelist Adventure (new build): one match in the arena (practice, duel, free for all, team deathmatch or
// capture the flag) on the new rules core. The match runs at a fixed 60 Hz (sim/match.mjs: the same rules
// the match server will run); the picture shows its latest state.
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { MOVES, fighterVeil, isStunned } from '../core/index.mjs';
import { bodyOf, hostile } from '../sim/world.mjs';
import { createMatch, stepMatch, matchView, MODES } from '../sim/match.mjs';
import { loadFighterBody, MOVEMENT_PACK_URL, BODIES } from './assets.mjs';
import { clipsForBody } from './motionLibrary.mjs';
import { bakeDuelMoves } from './duelMoves.mjs';
import { createCrystalSword, attachToHand } from './crystalWeapon.mjs';
import { createFighterAnimator } from './animator.mjs';
import { createArena, createSceneLighting } from './arena.mjs';
import { createDuelVfx } from './vfx.mjs';
import { createControls, createFollowCamera } from './controls.mjs';
import { createWarp } from './warp.mjs';
import { createSwordTrail } from './trails.mjs';
import { createDuelAudio } from './audio.mjs';
import { createDirector } from './director.mjs';
import { createNameTags, createCtfProps, fighterColor } from './matchProps.mjs';
import { ScoreLine, Countdown, RespawnNote, Feed, Result } from './MatchHud.jsx';
import './duelist.css';

const STEP = 1 / 60;
const POWER_KEYS = [['push', '1'], ['pull', '2'], ['grip', '3'], ['breach', '4'], ['dash', 'Ctrl'], ['resist', 'Z']];
const EVASIONS = ['Front_Roll', 'Back_Flip', 'Flip_Left', 'Flip_Right'];
const BODY_ORDER = Object.keys(BODIES);
const YOU_COLOR = 0x9fe8ff;

async function createActor(scene, bodyId, swordColor) {
  const { model, clips } = await loadFighterBody(bodyId);
  // the clip packs are retargeted from the body's rest pose: before anything poses it
  const [pack, dodges] = await Promise.all([
    clipsForBody(model, { rigKey: bodyId }),
    clipsForBody(model, { rigKey: bodyId, url: MOVEMENT_PACK_URL, names: EVASIONS }),
  ]);
  const group = new THREE.Group();
  group.add(model);
  scene.add(group);
  // held in Telekinesis has no clip in the pack: an authored pose
  const { clips: baked, grip, handBone } = bakeDuelMoves(model, ['held']);
  const sword = createCrystalSword({ color: swordColor });
  attachToHand(sword, model.getObjectByName(THREE.PropertyBinding.sanitizeNodeName(handBone || 'mixamorig:RightHand')), grip);
  const animator = createFighterAnimator({ model, clips: { pack, dodges, walk: clips.walk, baked } });
  const trail = createSwordTrail(scene, { color: swordColor });
  const chestBone = model.getObjectByName('mixamorigSpine2') || model.getObjectByName('mixamorigSpine1');
  const leftHand = model.getObjectByName('mixamorigLeftHand');
  return {
    group, model, sword, animator, trail, yaw: 0, at: new THREE.Vector3(),
    root: group,
    chest: () => (chestBone ? chestBone.getWorldPosition(new THREE.Vector3()) : group.position.clone().setY(1.2)),
    hand: () => (leftHand ? leftHand.getWorldPosition(new THREE.Vector3()) : group.position.clone().setY(1.3)),
  };
}

/**
 * mode: practice | duel | ffa | tdm | ctf. you: your body; foe: the opponent's in a duel or practice; bots:
 * how many opponents in practice; botLevel: trainee | duelist | master.
 */
export default function DuelistGame({ mode = 'practice', botLevel = 'duelist', you: youBody = 'maskedWarrior', foe: foeBody = 'huntress', bots = 1 }) {
  const mountRef = useRef(null);
  const [hud, setHud] = useState(null);
  const [status, setStatus] = useState('loading');
  const [generation, setGeneration] = useState(0);
  const [fightFlash, setFightFlash] = useState(false);
  const pressRef = useRef(null);
  const audioRef = useRef(null);
  const teamRef = useRef(null);
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return undefined;
    let disposed = false;
    setStatus('loading');
    setHud(null);
    const def = MODES[mode] || MODES.practice;
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    mount.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(55, 1, 0.05, 400);
    createSceneLighting(scene);
    const arena = createArena({ radius: def.arena });
    scene.add(arena.group);
    const warp = createWarp(renderer, scene, camera);
    const vfx = createDuelVfx(scene, { warp, arena, camera });
    const audio = createDuelAudio();
    audioRef.current = audio;
    setMuted(audio.muted);
    const controls = createControls(renderer.domElement);
    const follow = createFollowCamera(camera);
    const seed = 1 + ((Date.now() / 1000) % 100000 | 0) + generation * 7919;
    const match = createMatch({ mode: def.id, seed, botLevel, players: [{ id: 'you', name: 'You' }], seats: def.id === 'practice' ? 1 + bots : null });
    const { world } = match;
    teamRef.current = match.seats.get('you')?.team || null;
    const wake = () => audio.resume(); // browsers start sound only after the player does something
    window.addEventListener('pointerdown', wake);
    window.addEventListener('keydown', wake);
    const actors = {};
    const director = createDirector({ world, vfx, audio, actors });
    const tags = createNameTags(scene);
    const ctf = match.flags ? createCtfProps(scene, match.flags) : null;
    let lockId = null;
    let clock = 0;
    const lookDir = new THREE.Vector3();
    let accumulator = 0;
    let last = performance.now();
    let hudClock = 0;
    let frame = 0;
    let fightTimer = 0;
    const resize = () => {
      const w = mount.clientWidth || 1;
      const h = mount.clientHeight || 1;
      renderer.setSize(w, h, false);
      renderer.domElement.style.width = '100%';
      renderer.domElement.style.height = '100%';
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      warp.setSize(w, h);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(mount);
    pressRef.current = (command) => controls.press(command);

    // the nearest standing hostile to the player (for lock-on and the right-hand panel)
    const nearestHostile = (range = Infinity) => {
      const me = world.fighters.get('you');
      const mine = bodyOf(world, 'you');
      if (!me || !mine) return null;
      let best = null;
      for (const f of world.fighters.values()) {
        if (f.id === 'you' || f.vitals.dead || !hostile(world, me, f)) continue;
        const b = bodyOf(world, f.id);
        const d = Math.hypot(b.x - mine.x, b.z - mine.z);
        if (d <= range && (!best || d < best.d)) best = { id: f.id, d };
      }
      return best?.id || null;
    };
    const lockedBody = () => {
      const f = lockId ? world.fighters.get(lockId) : null;
      if (!f || f.vitals.dead) { lockId = null; return null; }
      return bodyOf(world, lockId);
    };

    // development only: drive the match from a test (window.__duelist.controls.press('push'), .match, .world,
    // .bots(false) to stop the bots thinking, .slow(0.1), .lock(true), .view(rad), .camera(shot), .manual(true) +
    // .advance(s), .film(count, every, cols), .audio)
    let timeScale = 1;
    let viewOffset = 0;
    let fixedShot = null;
    let manual = false;
    let film = null;
    let botsAwake = true;
    if (import.meta.env?.DEV) {
      window.__duelist = {
        match, world, controls, actors, audio,
        bots: (on) => { botsAwake = !!on; },
        bot: (on) => { botsAwake = !!on; },
        slow: (v = 1) => { timeScale = Math.max(0, v); },
        lock: (on) => { lockId = on ? nearestHostile() : null; },
        view: (offset = 0) => { viewOffset = offset; },
        camera: (shot = null) => { fixedShot = shot; },
        manual: (on) => { manual = !!on; },
        advance: (seconds, stepSize = 1 / 60) => { for (let t = 0; t < seconds - 1e-9; t += stepSize) tick(stepSize); },
        film: (count = 12, every = 0.05, cols = 4) => new Promise((resolve) => {
          const w = renderer.domElement.width;
          const h = renderer.domElement.height;
          const scale = Math.min(1, 1200 / (cols * w));
          const canvas = document.createElement('canvas');
          canvas.width = Math.round(cols * w * scale);
          canvas.height = Math.round(Math.ceil(count / cols) * h * scale);
          film = { count, every, cols, scale, w, h, index: 0, acc: every, ctx: canvas.getContext('2d'), canvas, resolve };
        }),
      };
    }
    const filmFrame = (dt) => {
      film.acc += dt;
      if (film.acc < film.every) return;
      film.acc = 0;
      const { ctx, cols, scale, w, h, index } = film;
      const x = (index % cols) * w * scale;
      const y = Math.floor(index / cols) * h * scale;
      ctx.drawImage(renderer.domElement, x, y, w * scale, h * scale);
      ctx.fillStyle = '#9fe8ff';
      ctx.font = '14px sans-serif';
      ctx.fillText(`${world.time.toFixed(2)}s`, x + 6, y + 18);
      film.index += 1;
      if (film.index >= film.count) {
        let img = document.getElementById('duelist-film');
        if (!img) {
          img = document.createElement('img');
          img.id = 'duelist-film';
          img.style.cssText = 'position:fixed;left:0;top:0;max-width:100vw;max-height:100vh;z-index:60;background:#000;cursor:pointer';
          img.onclick = () => img.remove();
          document.body.appendChild(img);
        }
        img.src = film.canvas.toDataURL('image/jpeg', 0.85);
        film.resolve({ width: film.canvas.width, height: film.canvas.height });
        film = null;
      }
    };

    // bodies: yours; the duel or practice opponent's; everyone else in turn from the rest
    const seats = [...match.seats.values()];
    const others = BODY_ORDER.filter((b) => b !== youBody);
    let k = 0;
    const plan = seats.map((s, i) => {
      if (s.id === 'you') return { s, body: youBody, color: s.team ? fighterColor(s.team) : YOU_COLOR };
      const body = (def.id === 'duel' || def.id === 'practice') && k === 0 ? foeBody : others[k % others.length];
      k += 1;
      return { s, body, color: fighterColor(s.team, i) };
    });
    Promise.all(plan.map(({ s, body, color }) => createActor(scene, body, color).then((a) => [s, a]))).then((entries) => {
      if (disposed) { for (const [, a] of entries) { a.animator.dispose(); a.sword.dispose(); a.trail.dispose(); } return; }
      for (const [s, a] of entries) {
        actors[s.id] = a;
        if (s.id !== 'you') tags.set(s.id, s.name, s.team ? fighterColor(s.team) : 0xdfe9f5);
      }
      setStatus('ready');
    }).catch((error) => { console.error('[duelist] could not load the fighters', error); setStatus('error'); });

    const onMatchEvent = (e) => {
      const myTeam = teamRef.current;
      if (e.type === 'fight') { fightTimer = 0.9; setFightFlash(true); }
      else if (e.type === 'captured') audio.play(e.team === myTeam ? 'resist' : 'breach');
      else if (e.type === 'flagTaken') audio.play('gripStart', actors[e.by]?.chest() || null);
      else if (e.type === 'over') {
        const won = e.winner === 'you' || (myTeam && e.winner === myTeam);
        audio.play(e.winner === 'draw' ? 'loss' : won ? 'victory' : 'loss');
      }
    };

    const tick = (dt) => {
      clock += dt;
      if (controls.takeLockToggle()) lockId = lockId ? null : nearestHostile();
      if (fightTimer > 0) { fightTimer -= dt; if (fightTimer <= 0) setFightFlash(false); }
      const ready = seats.every((s) => actors[s.id]);
      if (ready) {
        accumulator += dt;
        let first = true;
        while (accumulator >= STEP) {
          accumulator -= STEP;
          const me = bodyOf(world, 'you');
          const target = lockedBody();
          const faceYaw = target && me ? Math.atan2(target.x - me.x, target.z - me.z) : null;
          const playerInput = controls.read({ faceYaw, strafe: !!target });
          if (!first) playerInput.presses = [];
          first = false;
          const { effects, events } = stepMatch(match, STEP, botsAwake ? { you: playerInput } : { you: playerInput, ...Object.fromEntries([...match.seats.values()].filter((s) => s.kind === 'bot').map((s) => [s.id, {}])) });
          director.step(effects);
          for (const e of events) onMatchEvent(e);
        }
        // a heavy hit holds the picture for a few hundredths of a second (the rules run on)
        const feel = director.frame(dt);
        const show = feel.stopped ? dt * 0.1 : dt;
        for (const [id, actor] of Object.entries(actors)) {
          const fighter = world.fighters.get(id);
          const body = bodyOf(world, id);
          if (!fighter || !body) continue;
          // a respawn is a cut, not a slide across the arena
          if (actor.at.distanceTo(new THREE.Vector3(body.x, body.y, body.z)) > 5) actor.yaw = body.yaw;
          const turn = Math.atan2(Math.sin(body.yaw - actor.yaw), Math.cos(body.yaw - actor.yaw));
          actor.yaw += turn * Math.min(1, dt * 18);
          actor.at.set(body.x, body.y, body.z);
          actor.group.position.copy(actor.at);
          actor.group.rotation.set(0, actor.yaw, 0);
          actor.animator.update(show, { fighter, body, now: world.time });
          const will = fighter.vitals.will / fighter.vitals.max.will;
          actor.sword.setWill(will, fighterVeil(fighter));
          actor.sword.update(show);
          actor.trail.update(show, actor.sword.group, fighter.vitals.collapsed ? 0.25 : 0.55 + 0.45 * will, fighter.action?.move.kind === 'attack');
        }
        const grips = [...world.fighters.values()].filter((f) => f.heldBy && actors[f.heldBy] && actors[f.id]).map((f) => ({ holder: actors[f.heldBy], held: actors[f.id] }));
        vfx.update(show, { grips });
        tags.update(actors, (id) => !!world.fighters.get(id)?.vitals.dead);
        ctf?.update(show, match.flags, actors, (id) => bodyOf(world, id));
        const me = bodyOf(world, 'you');
        const target = lockedBody();
        const followYaw = target && me ? Math.atan2(target.x - me.x, target.z - me.z) : controls.yaw();
        if (me && follow.distanceTo(me) > 8) follow.snap();
        follow.update(dt, { target: me, yaw: followYaw + viewOffset, pitch: controls.pitch(), lockOn: target });
        if (target && me) controls.setYaw(followYaw);
        if (fixedShot) { camera.position.fromArray(fixedShot.position); camera.lookAt(...fixedShot.target); }
        if (feel.shake > 0.001) {
          const t = feel.shake * feel.shake;
          camera.rotateX(Math.sin(clock * 53) * 0.022 * t);
          camera.rotateY(Math.sin(clock * 47 + 1.3) * 0.022 * t);
          camera.rotateZ(Math.sin(clock * 61 + 2.1) * 0.03 * t);
        }
        audio.listen(camera.position, camera.getWorldDirection(lookDir));
        // HUD at 10 Hz
        hudClock += dt;
        if (hudClock > 0.1) {
          hudClock = 0;
          const mine = world.fighters.get('you');
          const shownId = lockId || nearestHostile(14);
          const shown = shownId ? world.fighters.get(shownId) : null;
          setHud({
            you: mine ? snapshot(mine, world.time) : null,
            target: shown ? snapshot(shown, world.time) : null,
            targetName: shownId ? match.seats.get(shownId)?.name || '' : '',
            targetTeam: shownId ? match.seats.get(shownId)?.team || null : null,
            lockOn: !!lockId,
            view: matchView(match, 'you'),
            powers: mine ? POWER_KEYS.map(([id, key]) => ({ id, key, ready: Math.max(0, (mine.cooldowns[id] ?? 0) - world.time), cost: MOVES[id].will })) : [],
          });
        }
      } else {
        follow.update(dt, { target: { x: 0, y: 0, z: 0 }, yaw: controls.yaw(), pitch: controls.pitch() });
      }
      arena.update(dt);
      warp.update(dt);
      warp.render();
      if (film) filmFrame(dt);
    };
    const loop = (now) => {
      frame = requestAnimationFrame(loop);
      const dt = Math.min(0.1, (now - last) / 1000) * timeScale;
      last = now;
      if (!manual) tick(dt);
    };
    frame = requestAnimationFrame(loop);
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      controls.dispose();
      vfx.dispose();
      warp.dispose();
      audio.dispose();
      tags.dispose();
      ctf?.dispose();
      window.removeEventListener('pointerdown', wake);
      window.removeEventListener('keydown', wake);
      arena.dispose();
      for (const actor of Object.values(actors)) { actor.animator.dispose(); actor.sword.dispose(); actor.trail.dispose(); }
      renderer.dispose();
      renderer.domElement.remove();
      if (window.__duelist?.world === world) delete window.__duelist;
    };
  }, [mode, botLevel, youBody, foeBody, bots, generation]);

  const view = hud?.view;
  return (
    <div className="duelist-game" ref={mountRef}>
      {hud?.you && <DuelHud hud={hud} onPower={(id) => pressRef.current?.(id)} />}
      {view && <ScoreLine view={view} />}
      {view && <Countdown view={view} fightFlash={fightFlash} />}
      {view && <RespawnNote view={view} />}
      {view && <Feed view={view} />}
      {view && <Result view={view} myTeam={teamRef.current} onAgain={() => setGeneration((g) => g + 1)} />}
      <button type="button" className="duelist-sound" onClick={() => { const a = audioRef.current; if (!a) return; a.resume(); a.setMuted(!a.muted); setMuted(a.muted); }}>
        {muted ? 'Sound off' : 'Sound on'}
      </button>
      {status === 'loading' && <div className="duelist-center">Forging the arena…</div>}
      {status === 'error' && <div className="duelist-center">The fighters could not be loaded.</div>}
      <div className="duelist-help">Click to fight · WASD move · Shift sprint · LMB light · E heavy · RMB guard · Space roll · 1 push · 2 pull · 3 grip · 4 breach · Z resist · Tab lock on</div>
    </div>
  );
}

function snapshot(f, now) {
  const v = f.vitals;
  return {
    hp: v.hp / v.max.hp, stamina: v.stamina / v.max.stamina, will: v.will / v.max.will, shield: v.shield / v.max.shield,
    veil: fighterVeil(f), winded: v.winded, stunned: isStunned(f, now), held: !!f.heldBy, breached: Object.keys(f.breaches).length > 0,
    dead: v.dead,
  };
}

function Bar({ value, kind }) {
  return <div className={`duelist-bar duelist-bar-${kind}`}><div style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }} /></div>;
}

function Vitals({ title, v, align, color = null }) {
  return (
    <div className={`duelist-vitals duelist-vitals-${align}`}>
      <div className="duelist-vitals-title" style={color ? { color } : undefined}>{title} <span className={`duelist-veil duelist-veil-${v.veil}`}>{v.dead ? 'Fallen' : v.veil === 'collapsed' ? 'Veil collapsed' : v.veil === 'unstable' ? 'Veil unstable' : 'Veil stable'}</span></div>
      <Bar value={v.shield} kind="shield" />
      <Bar value={v.will} kind="will" />
      <Bar value={v.hp} kind="hp" />
      <Bar value={v.stamina} kind="stamina" />
      <div className="duelist-tags">
        {v.winded && <span>winded</span>}{v.stunned && !v.dead && <span>staggered</span>}{v.held && <span>held</span>}{v.breached && <span>breached</span>}
      </div>
    </div>
  );
}

// Telekinesis's hold is a press and a release: a tap on the button grips, a second tap throws.
function DuelHud({ hud, onPower }) {
  const gripping = useRef(false);
  const tap = (id) => {
    if (id === 'grip') { onPower(gripping.current ? 'release' : 'grip'); gripping.current = !gripping.current; return; }
    onPower(id);
  };
  const teamColor = hud.targetTeam === 'red' ? '#ff6f61' : hud.targetTeam === 'blue' ? '#5fb4ff' : null;
  return (
    <>
      <Vitals title="You" v={hud.you} align="left" />
      {hud.target && <Vitals title={hud.targetName} v={hud.target} align="right" color={teamColor} />}
      <div className="duelist-powers">
        {hud.powers.map((p) => (
          <button type="button" key={p.id} className={`duelist-power ${p.ready > 0 ? 'is-cooling' : ''}`} onClick={() => tap(p.id)}>
            <span className="duelist-power-key">{p.key}</span>
            <span className="duelist-power-name">{p.id === 'grip' ? 'telekinesis' : p.id}</span>
            {p.ready > 0 && <span className="duelist-power-cd">{p.ready.toFixed(1)}</span>}
          </button>
        ))}
      </div>
      {hud.lockOn && <div className="duelist-lock">Locked on</div>}
    </>
  );
}
