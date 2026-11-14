import { useEffect, useState } from 'react';
import { CLONE_GPU_PROFILE_KEY, CLONE_GPU_PROFILES, readCloneGPUProfile } from './AdaptiveGraphics.mjs';
import { readRendererInfo } from '../debug/renderStats';

// Deliberately opt-in and low overhead: no DOM/scene traversal when closed.
// Accurate VRAM and physical memory usage are NOT exposed by a normal browser.
export default function CloneHardwarePanel({ visible = false }) {
  const [open, setOpen] = useState(false);
  const [details, setDetails] = useState(null);
  const [profile, setProfile] = useState(() => (typeof window === 'undefined'
    ? 'auto' : readCloneGPUProfile(window)));

  useEffect(() => {
    if (!open || !visible) return;
    const update = () => {
      const controller = window.__axe3dCloneGovernor;
      const renderer = window.__gw3dRenderer;
      let maxTextureSize = null;
      try {
        const gl = renderer?.getContext?.();
        maxTextureSize = gl ? gl.getParameter(gl.MAX_TEXTURE_SIZE) : null;
      } catch { /* Context unavailable */ }
      setDetails({
        measurement: controller?.getSnapshot?.() || null,
        draw: readRendererInfo(renderer),
        maxTextureSize,
      });
    };
    update();
    const interval = window.setInterval(update, 1000);
    return () => window.clearInterval(interval);
  }, [open, visible]);

  if (!visible) return null;
  const format = (value, digits = 1) => Number.isFinite(value) ? value.toFixed(digits) : '—';
  const frame = details?.measurement;
  const renderStopped = frame?.frames > 0 && Number.isFinite(frame.sampledAt) &&
    typeof performance !== 'undefined' && performance.now() - frame.sampledAt > 6000;
  const draw = details?.draw;
  return (
    <div style={{ position: 'fixed', left: 12, bottom: 70, zIndex: 1180, fontFamily: 'system-ui,sans-serif',
      color: '#ecf7ff', fontSize: 12, pointerEvents: 'auto' }} data-game3d-clone-hardware>
      <button type="button" onClick={() => setOpen(current => !current)}
        aria-expanded={open} aria-controls="axe3d-clone-hardware-panel"
        style={{ background: '#102e41ee', color: '#d9f3ff', border: '1px solid #9bd6e26b',
          padding: '6px 10px', borderRadius: 8, cursor: 'pointer' }}>
        {open ? 'Close Hardware' : 'GPU / FPS'}
      </button>
      {open && <section id="axe3d-clone-hardware-panel" aria-label="Game 3D hardware performance"
        style={{ width: 262, maxWidth: 'calc(100vw - 24px)', marginTop: 6, padding: 12,
          borderRadius: 12, background: '#061b29f5', border: '1px solid #8bc8de66',
          boxShadow: '0 12px 38px #000a' }}>
        <strong style={{ fontSize: 14 }}>Game 3D · Browser GPU</strong>
        <p style={{ margin: '5px 0 10px', color: '#aec9d9' }}>
          Live measurements from this browser, not direct system RAM/VRAM access.
        </p>
        <label htmlFor="axe3d-clone-gpu-profile" style={{ display: 'block', marginBottom: 4 }}>Render profile</label>
        <select id="axe3d-clone-gpu-profile" value={profile}
          onChange={event => {
            const next = event.target.value;
            setProfile(next);
            try { window.localStorage.setItem(CLONE_GPU_PROFILE_KEY, next); } catch { /* private browsing */ }
            window.__axe3dCloneGovernor?.setProfile?.(next);
          }}
          style={{ width: '100%', padding: 7, marginBottom: 11, borderRadius: 6,
            background: '#16364b', color: 'white', border: '1px solid #8bc8de88' }}>
          {CLONE_GPU_PROFILES.map(value => <option value={value} key={value}>
            {value === 'off' ? 'Off (original rendering)' : value.charAt(0).toUpperCase() + value.slice(1)}
          </option>)}
        </select>
        <div style={{ lineHeight: 1.85, fontVariantNumeric: 'tabular-nums' }}>
          <div>Rendered frames: <strong>{renderStopped ? 'No recent renders' : frame?.frames ? format(frame.fps, 0) + ' FPS' : 'Measuring…'}</strong></div>
          <div>Frame p95 / p99: {format(frame?.p95Ms)} / {format(frame?.p99Ms)} ms</div>
          <div>Render pixel ratio: {format(frame?.ratio, 2)}</div>
          <div>Draw calls: {draw?.calls ?? '—'} · Triangles: {draw?.triangles?.toLocaleString?.() ?? '—'}</div>
          <div>GPU textures: {draw?.textures ?? '—'} · Geometry: {draw?.geometries ?? '—'}</div>
          <div>Max texture dimension: {maxTextureSize ?? '—'}</div>
          <div>GPU memory: not exposed by browser</div>
        </div>
        <p style={{ color: '#aec9d9', margin: '10px 0 0', fontSize: 11 }}>
          Auto changes render resolution gradually when repeated slow frames are detected.
          Effects, targeting, physics, and world geometry are unchanged.
        </p>
      </section>}
    </div>
  );
}
