import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { getPlayerPosition, subscribePlayerPosition } from '../playerPositionStore';
import { getQuestState, subscribeQuests } from '../useQuestStore';
import { QUESTS } from '../questData';
import { AXE_QUESTS } from '../axe/quests/AXEQuestFramework';
import { getQuestNavigationTarget } from './worldMapData';
import { buildHorizonQuestPlan, getHorizonScanPose } from './horizonVisionModel';
import './HorizonVisionPanel.css';

const PREF_KEY = 'axe_horizon_vision_always_on_v1';
const WIDTH = 288, HEIGHT = 96;
const DEFINITIONS = [...QUESTS, ...AXE_QUESTS];
const SCANS = [
  { id: 'ahead', label: '80m' }, { id: 'far', label: '160m' },
  { id: 'left', label: '← Left' }, { id: 'right', label: 'Right →' },
];
function readAlwaysOn() {
  try { return localStorage.getItem(PREF_KEY) === 'true'; } catch { return false; }
}
function keyAllowed(event) {
  return !event.repeat && !event.ctrlKey && !event.metaKey && !event.altKey &&
    !event.target?.isContentEditable &&
    !/^(INPUT|TEXTAREA|SELECT)$/.test(event.target?.tagName || '');
}

// Reuse the active world renderer with a tiny, offscreen capture. One camera,
// one feed, and no additional WebGL context. Camera/renderer state is restored.
// This is a periodic scout view of loaded scene geometry, NOT server-authoritative
// enemy tracking, navmesh routing, or a picture of areas absent from the scene.
function captureWorld(canvas, pose) {
  const renderer = window.__gw3dRenderer;
  const scene = window.__gw3dScene;
  const liveCamera = window.__gw3dCamera;
  if (!canvas || !pose || !renderer || !scene || !liveCamera ||
      renderer.getContext?.().isContextLost?.()) return false;
  const camera = liveCamera.clone();
  const playerY = Number(window.__localPlayerPos?.y);
  const baseY = Number.isFinite(playerY) ? playerY : pose.y;
  let groundY = baseY;
  const terrain = [];
  scene.traverse(object => {
    if (object.isMesh && /terrain|ground|floor|landscape|heightfield|path|island|platform/i.test(object.name || ''))
      terrain.push(object);
  });
  if (terrain.length) {
    const ray = new THREE.Raycaster(
      new THREE.Vector3(pose.x, Math.max(220, baseY + 140), pose.z),
      new THREE.Vector3(0, -1, 0), 0, 480,
    );
    const hit = ray.intersectObjects(terrain, true)[0];
    if (hit) groundY = hit.point.y;
  }
  camera.position.set(pose.x, groundY + 2.8, pose.z);
  camera.lookAt(pose.lookX, groundY + 1.8, pose.lookZ);
  if (camera.isPerspectiveCamera) {
    camera.aspect = WIDTH / HEIGHT;
    camera.fov = 64;
    camera.near = 0.12;
    camera.far = Math.max(320, Number(camera.far) || 320);
    camera.updateProjectionMatrix();
  }
  camera.updateMatrixWorld();
  const target = new THREE.WebGLRenderTarget(WIDTH, HEIGHT, {
    minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: true,
  });
  const previousTarget = renderer.getRenderTarget();
  const previousViewport = renderer.getViewport(new THREE.Vector4());
  const previousScissor = renderer.getScissor(new THREE.Vector4());
  const previousScissorTest = renderer.getScissorTest();
  const buffer = new Uint8Array(WIDTH * HEIGHT * 4);
  try {
    renderer.setRenderTarget(target);
    renderer.setViewport(0, 0, WIDTH, HEIGHT);
    renderer.setScissorTest(false);
    renderer.clear(true, true, true);
    renderer.render(scene, camera);
    renderer.readRenderTargetPixels(target, 0, 0, WIDTH, HEIGHT, buffer);
  } finally {
    renderer.setRenderTarget(previousTarget);
    renderer.setViewport(previousViewport);
    renderer.setScissor(previousScissor);
    renderer.setScissorTest(previousScissorTest);
    target.dispose();
  }
  const context = canvas.getContext('2d');
  if (!context) return false;
  const frame = context.createImageData(WIDTH, HEIGHT);
  // WebGL readback is bottom-up; Canvas ImageData is top-down.
  for (let row = 0; row < HEIGHT; row++) {
    const start = row * WIDTH * 4;
    frame.data.set(buffer.subarray(start, start + WIDTH * 4), (HEIGHT - 1 - row) * WIDTH * 4);
  }
  context.putImageData(frame, 0, 0);
  return true;
}

export default function HorizonVisionPanel({ region = 'wolfveil' }) {
  const [alwaysOn, setAlwaysOn] = useState(readAlwaysOn);
  const [open, setOpen] = useState(readAlwaysOn);
  const [mode, setMode] = useState('forward');
  const [scan, setScan] = useState('ahead');
  const [previewQuestId, setPreviewQuestId] = useState(null);
  const [questState, setQuestState] = useState(getQuestState);
  const [position, setPosition] = useState(getPlayerPosition);
  const [status, setStatus] = useState('Press N to scan ahead');
  const positionRef = useRef(position);
  const canvasRef = useRef(null);

  useEffect(() => subscribeQuests(setQuestState), []);
  useEffect(() => {
    let last = 0;
    return subscribePlayerPosition(next => {
      positionRef.current = next;
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      if (now - last < 280) return;
      last = now;
      setPosition({ ...next });
    });
  }, []);
  useEffect(() => {
    const onKey = event => {
      if (!keyAllowed(event) || window.__axeServiceModeOpen ||
          window.__axeUiModalOpen || window.__axeWorldMapOpen) return;
      // While the mouse is captured for combat, keyboard peeks still work.
      const peek = { ArrowLeft: 'left', ArrowRight: 'right',
        ArrowUp: 'far', ArrowDown: 'ahead' };
      if (open && event.shiftKey && peek[event.code]) {
        event.preventDefault();
        setMode('forward');
        setScan(peek[event.code]);
        return;
      }
      if (event.code !== 'KeyN') return;
      event.preventDefault();
      if (event.shiftKey) {
        setOpen(true);
        setMode(current => current === 'forward' ? 'quest' : 'forward');
      } else setOpen(current => !current);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const plan = useMemo(() => buildHorizonQuestPlan({
    questState, position, region, resolveTarget: getQuestNavigationTarget,
    questDefinitions: DEFINITIONS,
  }), [questState, position, region]);
  const selected = plan.candidates.find(c => c.questId === previewQuestId) || plan.primary;
  const pose = getHorizonScanPose({
    position, target: selected?.target, mode, scan,
  });
  const available = mode !== 'quest' || !!pose;
  const canDisplay = open && typeof window !== 'undefined' &&
    !window.__axeServiceModeOpen && !window.__axeWorldMapOpen;

  useEffect(() => {
    if (!canDisplay || !available) {
      if (open && !available) setStatus('Quest area unavailable or not charted');
      return undefined;
    }
    let cancelled = false;
    const draw = () => {
      if (cancelled || window.__axeServiceModeOpen || window.__axeWorldMapOpen) return;
      const currentPlan = buildHorizonQuestPlan({
        questState, position: positionRef.current, region,
        resolveTarget: getQuestNavigationTarget, questDefinitions: DEFINITIONS,
      });
      const picked = currentPlan.candidates.find(c => c.questId === previewQuestId) || currentPlan.primary;
      const currentPose = getHorizonScanPose({
        position: positionRef.current, target: picked?.target, mode, scan,
      });
      try {
        setStatus(captureWorld(canvasRef.current, currentPose)
          ? 'Live loaded-scene preview · periodic update'
          : 'Live scene unavailable · map markers only');
      } catch {
        setStatus('Preview unavailable on this device');
      }
    };
    draw();
    const timer = window.setInterval(draw, 1800);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [canDisplay, available, questState, previewQuestId, mode, scan, region]);

  const toggleAlways = event => {
    const next = event.target.checked;
    setAlwaysOn(next);
    if (next) setOpen(true);
    try { localStorage.setItem(PREF_KEY, String(next)); } catch { /* private mode */ }
  };
  const previewQuest = candidate => {
    setPreviewQuestId(candidate.questId);
    setMode('quest');
    setOpen(true);
  };

  return <section className="axe-horizon" data-expanded={open ? 'true' : 'false'}
    aria-label="Horizon Vision navigation preview">
    {!open ? <button type="button" className="axe-horizon-activate"
        onClick={() => setOpen(true)} title="Horizon Vision (N)" aria-label="Open Horizon Vision">
        <span aria-hidden="true">◈</span> SCAN
      </button> : <>
      <header className="axe-horizon-top">
        <span className="axe-horizon-heading"><span aria-hidden="true">◈</span> HORIZON</span>
        <span className="axe-horizon-state">{mode === 'quest' ? 'QUEST VIEW' : 'SCOUT VIEW'}</span>
        <label className="axe-horizon-pin" title="Keep Horizon Vision on between game sessions">
          <input type="checkbox" checked={alwaysOn} onChange={toggleAlways}/>
          <span>Keep on</span>
        </label>
        <button type="button" className="axe-horizon-close"
          onClick={() => setOpen(false)} aria-label="Close Horizon Vision">×</button>
      </header>
      <div className="axe-horizon-controls" aria-label="Horizon scan controls">
        <div className="axe-horizon-modes" aria-label="View mode">
          <button type="button" aria-pressed={mode === 'forward'}
            onClick={() => setMode('forward')}>Scout</button>
          <button type="button" aria-pressed={mode === 'quest'}
            onClick={() => { setPreviewQuestId(null); setMode('quest'); }}>Quest</button>
        </div>
        {mode === 'forward' && <div className="axe-horizon-scans" aria-label="Scan direction">
          {SCANS.map(item => <button type="button" key={item.id}
            aria-pressed={scan === item.id} onClick={() => setScan(item.id)}>{item.label}</button>)}
        </div>}
      </div>
      <div className="axe-horizon-feed">
        <canvas width={WIDTH} height={HEIGHT} ref={canvasRef}
          aria-label="Loaded world scene preview"/>
        {!available && <span className="axe-horizon-empty">Objective not loaded</span>}
        <span className="axe-horizon-range">{pose?.label || 'No target'}
          {pose ? ' · ' + pose.distance + 'm' : ''}</span>
        <span className="axe-horizon-status" role="status" title={status}>
          {status.startsWith('Live loaded-scene') ? 'LIVE' : 'NO FEED'}
        </span>
      </div>
      {plan.primary && <div className="axe-horizon-primary" title={plan.primary.title}>
        <span>✦ {plan.primary.title}</span>
        <small>{plan.primary.distance}m{plan.primary.available ? '' : ' · charted'}</small>
      </div>}
      {plan.suggestions.length > 0 && <details className="axe-horizon-quests">
        <summary>{plan.suggestions.length} other quests <span>⌄</span></summary>
        <div className="axe-horizon-quest-list">
          {plan.suggestions.slice(0, 3).map(candidate => <button
            type="button" key={candidate.questId} onClick={() => previewQuest(candidate)}
            title="Preview without changing your pinned quest">
            <span>{candidate.related ? '✦ ' : candidate.onWay ? '↗ ' : ''}{candidate.title}</span>
            <small>{candidate.distance}m</small>
          </button>)}
        </div>
      </details>}
    </>}
  </section>;
}
