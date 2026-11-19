// Duelist Adventure (new build): a practice duel against a bot in the arena, on the new rules core.
// The simulation runs at a fixed 60 Hz; rendering interpolates nothing yet and simply shows the latest state.
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { MOVES, fighterVeil, isStunned } from '../core/index.mjs';
import { createWorld, addFighter, step, bodyOf } from '../sim/world.mjs';
import { createBot, think } from '../sim/bots.mjs';
import { loadFighterBody, MOVEMENT_PACK_URL, bodyName } from './assets.mjs';
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
import './duelist.css';

const STEP = 1 / 60;
const POWER_KEYS = [['push', '1'], ['pull', '2'], ['grip', '3'], ['breach', '4'], ['dash', 'Ctrl'], ['resist', 'Z']];

function startDuel(world) {
  world.time = 0;
  world.fighters.clear();
  world.bodies.clear();
  world.projectiles.length = 0;
  addFighter(world, { id: 'you', team: null, weapon: 'sword', x: 0, z: -4, yaw: 0 });
  addFighter(world, { id: 'bot', team: null, weapon: 'sword', x: 0, z: 4, yaw: Math.PI });
}

const EVASIONS = ['Front_Roll', 'Back_Flip', 'Flip_Left', 'Flip_Right'];

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
    group, model, sword, animator, trail, yaw: 0,
    root: group,
    chest: () => (chestBone ? chestBone.getWorldPosition(new THREE.Vector3()) : group.position.clone().setY(1.2)),
    hand: () => (leftHand ? leftHand.getWorldPosition(new THREE.Vector3()) : group.position.clone().setY(1.3)),
  };
}

export default function DuelistGame({ botLevel = 'duelist', you: youBody = 'maskedWarrior', foe: foeBody = 'huntress' }) {
  const mountRef = useRef(null);
  const [hud, setHud] = useState(null);
  const [status, setStatus] = useState('loading');
  const restartRef = useRef(null);
  const pressRef = useRef(null);
  const audioRef = useRef(null);
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return undefined;
    let disposed = false;
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
    const arena = createArena({ radius: 18 });
    scene.add(arena.group);
    const warp = createWarp(renderer, scene, camera);
    const vfx = createDuelVfx(scene, { warp, arena, camera });
    const audio = createDuelAudio();
    audioRef.current = audio;
    setMuted(audio.muted);
    const controls = createControls(renderer.domElement);
    const follow = createFollowCamera(camera);
    const world = createWorld({ arenaRadius: 18 });
    startDuel(world);
    const wake = () => audio.resume(); // browsers start sound only after the player does something
    window.addEventListener('pointerdown', wake);
    window.addEventListener('keydown', wake);
    let bot = createBot('bot', { level: botLevel, seed: 17 });
    const actors = {};
    const director = createDirector({ world, vfx, audio, actors });
    let lockOn = false;
    let clock = 0;
    const lookDir = new THREE.Vector3();
    let accumulator = 0;
    let last = performance.now();
    let hudClock = 0;
    let frame = 0;
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
    restartRef.current = () => { startDuel(world); director.reset(); bot = createBot('bot', { level: botLevel, seed: Math.floor(Math.random() * 1e6) }); setStatus('fighting'); };
    pressRef.current = (command) => controls.press(command);
    // development only: lets a test drive the duel (window.__duelist.controls.press('push'), .world, .bot(false),
    // .slow(0.1) for slow motion, .lock(true) to lock on)
    let timeScale = 1;
    let viewOffset = 0;
    let fixedShot = null;
    if (import.meta.env?.DEV) {
      window.__duelist = {
        world, controls, actors, audio,
        bot: (on) => { bot = on ? createBot('bot', { level: botLevel, seed: 17 }) : null; },
        slow: (v = 1) => { timeScale = Math.max(0, v); },
        lock: (on) => { lockOn = !!on; },
        view: (offset = 0) => { viewOffset = offset; }, // turn the camera around the player (radians)
        camera: (shot = null) => { fixedShot = shot; }, // { position: [x, y, z], target: [x, y, z] } or null to follow
        // step by hand: manual(true) stops the frame loop, advance(s) runs s seconds of frames at 60 Hz
        manual: (on) => { manual = !!on; },
        advance: (seconds, step = 1 / 60) => { for (let t = 0; t < seconds - 1e-9; t += step) tick(step); },
        // film strip: `count` frames, one every `every` game seconds, into one image over the page
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
    let film = null;
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

    Promise.all([createActor(scene, youBody, 0x9fe8ff), createActor(scene, foeBody, 0xff8a7a)]).then(([you, foe]) => {
      if (disposed) return;
      actors.you = you;
      actors.bot = foe;
      setStatus('fighting');
    }).catch((error) => { console.error('[duelist] could not load the fighters', error); setStatus('error'); });

    const tick = (dt) => {
      clock += dt;
      if (controls.takeLockToggle()) lockOn = !lockOn;
      const ready = actors.you && actors.bot;
      if (ready) {
        accumulator += dt;
        let first = true;
        const you = bodyOf(world, 'you');
        const foe = bodyOf(world, 'bot');
        const faceYaw = lockOn && foe ? Math.atan2(foe.x - you.x, foe.z - you.z) : null;
        while (accumulator >= STEP) {
          accumulator -= STEP;
          const playerInput = controls.read({ faceYaw, strafe: lockOn });
          if (!first) playerInput.presses = [];
          first = false;
          const effects = step(world, STEP, { you: playerInput, bot: bot ? think(world, bot) : {} });
          director.step(effects);
        }
        // a heavy hit holds the picture for a few hundredths of a second (the rules run on)
        const feel = director.frame(dt);
        const show = feel.stopped ? dt * 0.1 : dt;
        // place the bodies
        for (const [id, actor] of Object.entries(actors)) {
          const fighter = world.fighters.get(id);
          const body = bodyOf(world, id);
          if (!fighter || !body) continue;
          const turn = Math.atan2(Math.sin(body.yaw - actor.yaw), Math.cos(body.yaw - actor.yaw));
          actor.yaw += turn * Math.min(1, dt * 18);
          actor.group.position.set(body.x, body.y, body.z);
          actor.group.rotation.set(0, actor.yaw, 0);
          actor.animator.update(show, { fighter, body, now: world.time });
          const will = fighter.vitals.will / fighter.vitals.max.will;
          actor.sword.setWill(will, fighterVeil(fighter));
          actor.sword.update(show);
          actor.trail.update(show, actor.sword.group, fighter.vitals.collapsed ? 0.25 : 0.55 + 0.45 * will, fighter.action?.move.kind === 'attack');
        }
        const grips = [...world.fighters.values()].filter((f) => f.heldBy && actors[f.heldBy]).map((f) => ({ holder: actors[f.heldBy], held: actors[f.id] }));
        vfx.update(show, { grips });
        follow.update(dt, { target: you, yaw: (lockOn && foe ? Math.atan2(foe.x - you.x, foe.z - you.z) : controls.yaw()) + viewOffset, pitch: controls.pitch(), lockOn: lockOn ? foe : null });
        if (lockOn && foe) controls.setYaw(Math.atan2(foe.x - you.x, foe.z - you.z));
        if (fixedShot) { camera.position.fromArray(fixedShot.position); camera.lookAt(...fixedShot.target); }
        // camera shake: a quick, decaying wobble (trauma squared)
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
          const me = world.fighters.get('you');
          const them = world.fighters.get('bot');
          setHud({
            you: snapshot(me, world.time), bot: snapshot(them, world.time), lockOn,
            powers: POWER_KEYS.map(([id, key]) => ({ id, key, ready: Math.max(0, (me.cooldowns[id] ?? 0) - world.time), cost: MOVES[id].will })),
          });
          if (me.vitals.dead || them.vitals.dead) setStatus((was) => {
            const next = me.vitals.dead ? 'defeated' : 'victory';
            if (was !== next) audio.play(next === 'victory' ? 'victory' : 'loss');
            return next;
          });
        }
      } else {
        follow.update(dt, { target: { x: 0, y: 0, z: -4 }, yaw: controls.yaw(), pitch: controls.pitch() });
      }
      arena.update(dt);
      warp.update(dt);
      warp.render();
      if (film) filmFrame(dt);
    };
    let manual = false;
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
      window.removeEventListener('pointerdown', wake);
      window.removeEventListener('keydown', wake);
      arena.dispose();
      for (const actor of Object.values(actors)) { actor.animator.dispose(); actor.sword.dispose(); actor.trail.dispose(); }
      renderer.dispose();
      renderer.domElement.remove();
      if (window.__duelist?.world === world) delete window.__duelist;
    };
  }, [botLevel, youBody, foeBody]);

  return (
    <div className="duelist-game" ref={mountRef}>
      {hud && <DuelHud hud={hud} foeName={bodyName(foeBody)} onPower={(id) => pressRef.current?.(id)} />}
      <button type="button" className="duelist-sound" onClick={() => { const a = audioRef.current; if (!a) return; a.resume(); a.setMuted(!a.muted); setMuted(a.muted); }}>
        {muted ? 'Sound off' : 'Sound on'}
      </button>
      {status === 'loading' && <div className="duelist-center">Forging the arena…</div>}
      {status === 'error' && <div className="duelist-center">The fighters could not be loaded.</div>}
      {(status === 'victory' || status === 'defeated') && (
        <div className="duelist-center duelist-result">
          <div className="duelist-result-title">{status === 'victory' ? 'Victory' : 'Defeated'}</div>
          <button type="button" onClick={() => restartRef.current?.()}>Fight again</button>
        </div>
      )}
      <div className="duelist-help">Click to fight · WASD move · Shift sprint · LMB light · E heavy · RMB guard · Space roll · 1 push · 2 pull · 3 grip · 4 breach · Z resist · Tab lock on</div>
    </div>
  );
}

function snapshot(f, now) {
  const v = f.vitals;
  return {
    hp: v.hp / v.max.hp, stamina: v.stamina / v.max.stamina, will: v.will / v.max.will, shield: v.shield / v.max.shield,
    veil: fighterVeil(f), winded: v.winded, stunned: isStunned(f, now), held: !!f.heldBy, breached: Object.keys(f.breaches).length > 0,
  };
}

function Bar({ value, kind }) {
  return <div className={`duelist-bar duelist-bar-${kind}`}><div style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }} /></div>;
}

function Vitals({ title, v, align }) {
  return (
    <div className={`duelist-vitals duelist-vitals-${align}`}>
      <div className="duelist-vitals-title">{title} <span className={`duelist-veil duelist-veil-${v.veil}`}>{v.veil === 'collapsed' ? 'Veil collapsed' : v.veil === 'unstable' ? 'Veil unstable' : 'Veil stable'}</span></div>
      <Bar value={v.shield} kind="shield" />
      <Bar value={v.will} kind="will" />
      <Bar value={v.hp} kind="hp" />
      <Bar value={v.stamina} kind="stamina" />
      <div className="duelist-tags">
        {v.winded && <span>winded</span>}{v.stunned && <span>staggered</span>}{v.held && <span>held</span>}{v.breached && <span>breached</span>}
      </div>
    </div>
  );
}

// Telekinesis's hold is a press and a release: a tap on the button grips, a second tap throws.
function DuelHud({ hud, foeName, onPower }) {
  const gripping = useRef(false);
  const tap = (id) => {
    if (id === 'grip') { onPower(gripping.current ? 'release' : 'grip'); gripping.current = !gripping.current; return; }
    onPower(id);
  };
  return (
    <>
      <Vitals title="You" v={hud.you} align="left" />
      <Vitals title={foeName} v={hud.bot} align="right" />
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

