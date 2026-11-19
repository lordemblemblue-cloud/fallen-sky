// Duelist Adventure (new build): a practice duel against a bot in the arena, on the new rules core.
// The simulation runs at a fixed 60 Hz; rendering interpolates nothing yet and simply shows the latest state.
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { MOVES, fighterVeil, isStunned } from '../core/index.mjs';
import { createWorld, addFighter, step, bodyOf, forwardOf } from '../sim/world.mjs';
import { createBot, think } from '../sim/bots.mjs';
import { loadFighterBody } from './assets.mjs';
import { bakeDuelMoves } from './duelMoves.mjs';
import { createCrystalSword, attachToHand } from './crystalWeapon.mjs';
import { createFighterAnimator } from './animator.mjs';
import { createArena, createSceneLighting } from './arena.mjs';
import { createDuelVfx } from './vfx.mjs';
import { createControls, createFollowCamera } from './controls.mjs';
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

async function createActor(scene, gender, swordColor) {
  const { model, clips } = await loadFighterBody(gender);
  const group = new THREE.Group();
  group.add(model);
  scene.add(group);
  const { clips: moveClips, grip, handBone } = bakeDuelMoves(model);
  const sword = createCrystalSword({ color: swordColor });
  attachToHand(sword, model.getObjectByName(THREE.PropertyBinding.sanitizeNodeName(handBone || 'mixamorig:RightHand')), grip);
  const animator = createFighterAnimator({ model, clips, moveClips });
  const chestBone = model.getObjectByName('mixamorigSpine2') || model.getObjectByName('mixamorigSpine1');
  const leftHand = model.getObjectByName('mixamorigLeftHand');
  return {
    group, model, sword, animator, yaw: 0, fallen: 0,
    root: group,
    chest: () => (chestBone ? chestBone.getWorldPosition(new THREE.Vector3()) : group.position.clone().setY(1.2)),
    hand: () => (leftHand ? leftHand.getWorldPosition(new THREE.Vector3()) : group.position.clone().setY(1.3)),
  };
}

export default function DuelistGame({ botLevel = 'duelist' }) {
  const mountRef = useRef(null);
  const [hud, setHud] = useState(null);
  const [status, setStatus] = useState('loading');
  const restartRef = useRef(null);
  const pressRef = useRef(null);

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
    const vfx = createDuelVfx(scene);
    const controls = createControls(renderer.domElement);
    const follow = createFollowCamera(camera);
    const world = createWorld({ arenaRadius: 18 });
    startDuel(world);
    let bot = createBot('bot', { level: botLevel, seed: 17 });
    const actors = {};
    let lockOn = false;
    let accumulator = 0;
    let last = performance.now();
    let hudClock = 0;
    let frame = 0;
    const lastActions = {};
    const resize = () => {
      const w = mount.clientWidth || 1;
      const h = mount.clientHeight || 1;
      renderer.setSize(w, h, false);
      renderer.domElement.style.width = '100%';
      renderer.domElement.style.height = '100%';
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(mount);
    restartRef.current = () => { startDuel(world); bot = createBot('bot', { level: botLevel, seed: Math.floor(Math.random() * 1e6) }); for (const a of Object.values(actors)) a.fallen = 0; setStatus('fighting'); };
    pressRef.current = (command) => controls.press(command);
    // development only: lets a test drive the duel (window.__duelist.controls.press('push'), .world, .bot(false),
    // .slow(0.1) for slow motion, .lock(true) to lock on)
    let timeScale = 1;
    if (import.meta.env?.DEV) {
      window.__duelist = {
        world, controls, actors,
        bot: (on) => { bot = on ? createBot('bot', { level: botLevel, seed: 17 }) : null; },
        slow: (v = 1) => { timeScale = Math.max(0, v); },
        lock: (on) => { lockOn = !!on; },
      };
    }

    Promise.all([createActor(scene, 'female', 0x9fe8ff), createActor(scene, 'male', 0xff8a7a)]).then(([you, foe]) => {
      if (disposed) return;
      actors.you = you;
      actors.bot = foe;
      setStatus('fighting');
    }).catch((error) => { console.error('[duelist] could not load the fighters', error); setStatus('error'); });

    const loop = (now) => {
      frame = requestAnimationFrame(loop);
      const dt = Math.min(0.1, (now - last) / 1000) * timeScale;
      last = now;
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
          for (const e of effects) vfx.effect(e, actors);
          // Telekinesis waves leave the hand as the power starts
          for (const [id, fighter] of world.fighters) {
            const current = fighter.action?.id || null;
            if (current !== lastActions[id] && ['push', 'pull', 'gripThrow'].includes(current)) {
              vfx.wave(current === 'gripThrow' ? 'throw' : current, actors[id], forwardOf(bodyOf(world, id).yaw));
            }
            lastActions[id] = current;
          }
        }
        // place the bodies
        for (const [id, actor] of Object.entries(actors)) {
          const fighter = world.fighters.get(id);
          const body = bodyOf(world, id);
          if (!fighter || !body) continue;
          const turn = Math.atan2(Math.sin(body.yaw - actor.yaw), Math.cos(body.yaw - actor.yaw));
          actor.yaw += turn * Math.min(1, dt * 18);
          actor.group.position.set(body.x, body.y, body.z);
          actor.fallen += ((fighter.vitals.dead ? 1 : 0) - actor.fallen) * Math.min(1, dt * 5);
          actor.group.rotation.set(-actor.fallen * Math.PI * 0.48, actor.yaw, 0, 'YXZ');
          actor.animator.update(dt, { fighter, body, now: world.time });
          actor.sword.setWill(fighter.vitals.will / fighter.vitals.max.will, fighterVeil(fighter));
          actor.sword.update(dt);
        }
        const grips = [...world.fighters.values()].filter((f) => f.heldBy && actors[f.heldBy]).map((f) => ({ holder: actors[f.heldBy], held: actors[f.id] }));
        vfx.update(dt, grips);
        follow.update(dt, { target: you, yaw: lockOn && foe ? Math.atan2(foe.x - you.x, foe.z - you.z) : controls.yaw(), pitch: controls.pitch(), lockOn: lockOn ? foe : null });
        if (lockOn && foe) controls.setYaw(Math.atan2(foe.x - you.x, foe.z - you.z));
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
          if (me.vitals.dead || them.vitals.dead) setStatus(me.vitals.dead ? 'defeated' : 'victory');
        }
      } else {
        follow.update(dt, { target: { x: 0, y: 0, z: -4 }, yaw: controls.yaw(), pitch: controls.pitch() });
      }
      arena.update(dt);
      renderer.render(scene, camera);
    };
    frame = requestAnimationFrame(loop);
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      controls.dispose();
      vfx.dispose();
      arena.dispose();
      for (const actor of Object.values(actors)) { actor.animator.dispose(); actor.sword.dispose(); }
      renderer.dispose();
      renderer.domElement.remove();
      if (window.__duelist?.world === world) delete window.__duelist;
    };
  }, [botLevel]);

  return (
    <div className="duelist-game" ref={mountRef}>
      {hud && <DuelHud hud={hud} onPower={(id) => pressRef.current?.(id)} />}
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
function DuelHud({ hud, onPower }) {
  const gripping = useRef(false);
  const tap = (id) => {
    if (id === 'grip') { onPower(gripping.current ? 'release' : 'grip'); gripping.current = !gripping.current; return; }
    onPower(id);
  };
  return (
    <>
      <Vitals title="You" v={hud.you} align="left" />
      <Vitals title="Duelist" v={hud.bot} align="right" />
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

