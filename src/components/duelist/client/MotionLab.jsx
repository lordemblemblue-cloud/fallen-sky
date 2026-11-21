// Motion lab: every clip of the motion pack (and the roll/flip pack) on both fused bodies side by side, the
// male retargeted from the female rig the clips were made on. For checking clips, retargeting, strike timing
// and foot sliding before they go into the game (and for previewing new bodies later).
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { MOTION_CLIPS } from '../core/motionPack.data.mjs';
import { loadFighterBody, MOVEMENT_PACK_URL, BODIES } from './assets.mjs';
import { clipsForBody } from './motionLibrary.mjs';
import { createCrystalSword, attachToHand } from './crystalWeapon.mjs';
import { createClassWeapon, equipClassWeapon } from './classWeapons.mjs';
import { CRYSTAL_SWORD } from './duelMoves.mjs';
import { solveFallbackGrip } from '../../game3d/weapons/playerWeaponRuntime.js';
import { createArena, createSceneLighting } from './arena.mjs';
import './duelist.css';

const DODGES = ['Front_Roll', 'Back_Flip', 'Flip_Left', 'Flip_Right'];
const VIEWS = Object.freeze({ front: [0, 1.6, 9.8], side: [11, 1.4, 0.6], threeQuarter: [7.6, 2.2, 7.6], back: [0, 1.8, -9.8] });

export default function MotionLab() {
  const mountRef = useRef(null);
  const labRef = useRef(null);
  const [names, setNames] = useState([]);
  const [current, setCurrent] = useState('swordIdle');
  const [speed, setSpeed] = useState(1);
  const [playing, setPlaying] = useState(true);
  const [travel, setTravel] = useState(false);
  const [time, setTime] = useState(0);
  const [view, setView] = useState('threeQuarter');
  const info = MOTION_CLIPS[current];

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return undefined;
    let disposed = false;
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.shadowMap.enabled = true;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    mount.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, 1, 0.05, 200);
    camera.position.set(0, 1.6, 9.5);
    camera.lookAt(0, 0.95, 0);
    createSceneLighting(scene);
    const arena = createArena({ radius: 12 });
    scene.add(arena.group);
    const bodies = [];
    const state = { clip: 'swordIdle', speed: 1, playing: true, travel: false, time: 0, scrub: null, view: 'threeQuarter', shownView: null };
    labRef.current = state;
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

    (async () => {
      const ids = Object.keys(BODIES);
      for (const [i, bodyId] of ids.entries()) {
        const x = (i - (ids.length - 1) / 2) * 1.8;
        const { model } = await loadFighterBody(bodyId);
        if (disposed) return;
        const group = new THREE.Group();
        group.position.x = x;
        group.add(model);
        scene.add(group);
        const solved = solveFallbackGrip(model, CRYSTAL_SWORD, ['combat'], 1.7);
        const sword = createCrystalSword();
        const rightHand = solved && model.getObjectByName(THREE.PropertyBinding.sanitizeNodeName(solved.bone));
        if (solved) attachToHand(sword, rightHand, solved.grips.combat);
        // the class forms, shown with their own clips (blades*, staff*)
        const kits = { blades: createClassWeapon('duelist'), staff: createClassWeapon('assassin') };
        if (solved) for (const kit of Object.values(kits)) equipClassWeapon(kit, { rightHand, leftHand: model.getObjectByName('mixamorigLeftHand'), grip: solved.grips.combat });
        const clips = { ...(await clipsForBody(model, { rigKey: bodyId })), ...(await clipsForBody(model, { rigKey: bodyId, url: MOVEMENT_PACK_URL, names: DODGES })) };
        const mixer = new THREE.AnimationMixer(model);
        bodies.push({ bodyId, group, model, x, mixer, clips, action: null, sword, kits });
      }
      if (!disposed) setNames(Object.keys(bodies[0].clips));
    })().catch((error) => console.error('[motion lab]', error));

    let last = performance.now();
    let frame = 0;
    let uiClock = 0;
    const pose = (dt) => {
      for (const b of bodies) {
        const clip = b.clips[state.clip];
        if (!clip) continue;
        if (!b.action || b.action.getClip() !== clip) {
          b.mixer.stopAllAction();
          b.action = b.mixer.clipAction(clip);
          b.action.play();
          state.time = 0;
        }
        b.action.paused = true;
        b.action.time = state.time;
        b.mixer.update(0);
        // the travel the pack took out of the clip, put back on the body
        const t = MOTION_CLIPS[state.clip]?.travel;
        let forward = 0;
        let right = 0;
        if (state.travel && t) {
          const u = (state.time / clip.duration) * (t.forward.length - 1);
          const i = Math.min(t.forward.length - 2, Math.floor(u));
          const f = u - i;
          forward = t.forward[i] + (t.forward[i + 1] - t.forward[i]) * f;
          right = t.right[i] + (t.right[i + 1] - t.right[i]) * f;
        }
        b.group.position.set(b.x - right, 0, forward);
        b.sword.update(dt);
        const form = /^blades/.test(state.clip) ? 'blades' : /^staff/.test(state.clip) ? 'staff' : 'sword';
        b.sword.group.visible = form === 'sword';
        for (const [name, kit] of Object.entries(b.kits)) for (const part of [kit.main, kit.off]) if (part) part.group.visible = form === name;
      }
      if (state.view !== state.shownView && VIEWS[state.view]) {
        state.shownView = state.view;
        camera.position.fromArray(VIEWS[state.view]);
        camera.lookAt(0, 0.95, 0.4);
      }
    };
    const loop = (now) => {
      frame = requestAnimationFrame(loop);
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (state.frozen) return;
      pose(dt);
      const duration = bodies[0]?.clips[state.clip]?.duration || 1;
      if (state.scrub !== null) state.time = state.scrub * duration;
      else if (state.playing) state.time = (state.time + dt * state.speed) % duration;
      uiClock += dt;
      if (uiClock > 0.1) { uiClock = 0; setTime(state.time); }
      arena.update(dt);
      renderer.render(scene, camera);
    };
    frame = requestAnimationFrame(loop);
    // Contact sheet: the clip at several times in one image (shown over the page; click it to close).
    const sheet = (clip, times, { view = state.view, size = 300, cols = 4, only = null, distance = 1 } = {}) => {
      const rows = Math.ceil(times.length / cols);
      const out = document.createElement('canvas');
      out.width = Math.min(cols, times.length) * size;
      out.height = rows * size;
      const ctx = out.getContext('2d');
      const saved = { size: renderer.getSize(new THREE.Vector2()), ratio: renderer.getPixelRatio(), aspect: camera.aspect, view: state.view, clip: state.clip, time: state.time };
      state.frozen = true;
      renderer.setPixelRatio(1);
      renderer.setSize(size, size, false);
      camera.aspect = 1;
      camera.updateProjectionMatrix();
      state.clip = clip;
      state.view = view;
      pose(0);
      // one body, closer: the camera moves towards it along the view direction
      const focus = new THREE.Vector3(bodies.find((b) => b.bodyId === only)?.x ?? 0, 0.95, 0.4);
      for (const b of bodies) b.group.visible = !only || b.bodyId === only;
      camera.position.fromArray(VIEWS[view]).sub(new THREE.Vector3(0, 0.95, 0.4)).multiplyScalar(distance).add(focus);
      camera.lookAt(focus);
      times.forEach((t, i) => {
        state.time = t;
        const keep = camera.position.clone();
        pose(0);
        camera.position.copy(keep);
        camera.lookAt(focus);
        renderer.render(scene, camera);
        ctx.drawImage(renderer.domElement, (i % cols) * size, Math.floor(i / cols) * size);
        ctx.fillStyle = '#9fe8ff';
        ctx.font = '14px sans-serif';
        ctx.fillText(`${clip} ${t.toFixed(2)}s`, (i % cols) * size + 6, Math.floor(i / cols) * size + 18);
      });
      for (const b of bodies) b.group.visible = true;
      Object.assign(state, { view: saved.view, clip: saved.clip, time: saved.time, frozen: false, shownView: null });
      renderer.setPixelRatio(saved.ratio);
      renderer.setSize(saved.size.x, saved.size.y, false);
      camera.aspect = saved.aspect;
      camera.updateProjectionMatrix();
      let img = document.getElementById('duelist-lab-sheet');
      if (!img) {
        img = document.createElement('img');
        img.id = 'duelist-lab-sheet';
        img.style.cssText = 'position:fixed;left:0;top:0;max-width:100vw;max-height:100vh;z-index:50;background:#000;cursor:pointer';
        img.onclick = () => img.remove();
        document.body.appendChild(img);
      }
      img.src = out.toDataURL('image/jpeg', 0.85);
      return { width: out.width, height: out.height };
    };
    if (import.meta.env?.DEV) window.__lab = { state, bodies, sheet };
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      for (const b of bodies) { b.mixer.stopAllAction(); b.sword.dispose(); for (const kit of Object.values(b.kits)) for (const part of [kit.main, kit.off]) part?.dispose(); }
      arena.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      if (window.__lab?.state === state) delete window.__lab;
    };
  }, []);

  useEffect(() => { if (labRef.current) Object.assign(labRef.current, { clip: current, speed, playing, travel, view }); }, [current, speed, playing, travel, view]);
  const groups = useMemo(() => {
    const out = { Sword: [], 'Twin blades': [], Staff: [], 'Being hit': [], Casting: [], Moving: [], Story: [], Other: [] };
    for (const n of names) {
      if (/^sword/.test(n)) out.Sword.push(n);
      else if (/^blades/.test(n)) out['Twin blades'].push(n);
      else if (/^staff/.test(n)) out.Staff.push(n);
      else if (/hit|knock|getUp|death|guardBreak/.test(n)) out['Being hit'].push(n);
      else if (/cast|throw|shield/.test(n)) out.Casting.push(n);
      else if (/idle$|walk|jog|sprint|crouch|jump|leap|slide|climb|Roll|Flip/.test(n)) out.Moving.push(n);
      else if (/talk|fold|phone|yes|no|interact|chest|pickup|hack|consume|pistol/.test(n)) out.Story.push(n);
      else out.Other.push(n);
    }
    return out;
  }, [names]);

  return (
    <div className="duelist-lab">
      <div className="duelist-lab-view" ref={mountRef} />
      <aside className="duelist-lab-panel">
        <div className="duelist-lab-now">
          <strong>{current}</strong>
          {info && <span>{info.source} · {info.duration}s{info.loop ? ' · loop' : ''}{info.naturalSpeed ? ` · ${info.naturalSpeed} m/s` : ''}{info.travel ? ` · travels ${info.travel.distance} m` : ''}</span>}
          {info?.peaks && <span>strikes: {info.peaks.map((p) => `${p.hand} ${p.t}s`).join(', ')}</span>}
          <span>t = {time.toFixed(2)}s</span>
        </div>
        <div className="duelist-lab-controls">
          <button type="button" onClick={() => setPlaying((p) => !p)}>{playing ? 'Pause' : 'Play'}</button>
          <label>Speed <input type="range" min="0.05" max="1.5" step="0.05" value={speed} onChange={(e) => setSpeed(+e.target.value)} /> {speed.toFixed(2)}</label>
          <label><input type="checkbox" checked={travel} onChange={(e) => setTravel(e.target.checked)} /> Travel</label>
          <label>View <select value={view} onChange={(e) => setView(e.target.value)}>{Object.keys(VIEWS).map((v) => <option key={v} value={v}>{v}</option>)}</select></label>
          <label>Scrub <input type="range" min="0" max="1" step="0.005" defaultValue="0"
            onPointerDown={() => { if (labRef.current) labRef.current.scrub = 0; }}
            onPointerUp={() => { if (labRef.current) labRef.current.scrub = null; }}
            onChange={(e) => { if (labRef.current) labRef.current.scrub = +e.target.value; }} /></label>
        </div>
        {Object.entries(groups).filter(([, list]) => list.length).map(([title, list]) => (
          <div key={title} className="duelist-lab-group">
            <div className="duelist-lab-group-title">{title}</div>
            <div className="duelist-lab-clips">
              {list.map((n) => <button type="button" key={n} className={n === current ? 'is-on' : ''} onClick={() => setCurrent(n)}>{n}</button>)}
            </div>
          </div>
        ))}
      </aside>
    </div>
  );
}
