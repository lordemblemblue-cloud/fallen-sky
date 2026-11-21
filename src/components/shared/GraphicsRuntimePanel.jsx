import { useCallback, useEffect, useState } from 'react';
import { humanGraphicsStatus, readGraphicsRuntimeStatus } from '@/lib/graphicsRuntimeStatus.mjs';

const panelStyle = { border: '1px solid rgba(165,195,226,.20)', borderRadius: 14,
  background: 'rgba(8,17,30,.55)', color: '#e4efff', padding: '14px', fontSize: 13 };
const rowStyle = { display: 'flex', justifyContent: 'space-between', gap: 12, padding: '7px 0',
  borderBottom: '1px solid rgba(200,215,232,.10)' };

function Metric({ title, value }) {
  return <div style={rowStyle}><dt style={{ opacity: .72 }}>{title}</dt>
    <dd style={{ margin: 0, textAlign: 'right', overflowWrap: 'anywhere' }}>{value}</dd></div>;
}

/** A live observation, not a renderer toggle. Never claims the chosen browser
 * adapter is necessarily the adapter used by a currently running game.
 */
export default function GraphicsRuntimePanel({ sceneId, enabled = true }) {
  const [live, setLive] = useState(() => readGraphicsRuntimeStatus(sceneId));
  const [browser, setBrowser] = useState({ state: 'checking', name: null });
  const checkBrowser = useCallback(async () => {
    setBrowser({ state: 'checking', name: null });
    try {
      const gpu = window.navigator?.gpu;
      if (!gpu?.requestAdapter) { setBrowser({ state: 'unsupported', name: null }); return; }
      const adapter = await gpu.requestAdapter({ powerPreference: 'high-performance' });
      if (!adapter) { setBrowser({ state: 'unavailable', name: null }); return; }
      const info = adapter.info;
      const name = info && [info.vendor, info.architecture, info.device, info.description]
        .filter(v => typeof v === 'string' && v.trim()).join(' ');
      setBrowser({ state: 'available', name: name || null });
    } catch {
      setBrowser({ state: 'blocked', name: null });
    }
  }, []);
  useEffect(() => {
    if (!enabled) return undefined;
    setLive(readGraphicsRuntimeStatus(sceneId));
    const timer = window.setInterval(() => setLive(readGraphicsRuntimeStatus(sceneId)), 850);
    return () => window.clearInterval(timer);
  }, [enabled, sceneId]);
  useEffect(() => {
    if (enabled) { void checkBrowser(); }
  }, [enabled, checkBrowser]);
  if (!enabled) return null;

  const backend = { webgpu: 'WebGPU', 'webgl2-fallback': 'WebGL2 fallback',
    'classic-webgl': 'Classic WebGL', initializing: 'Initializing', none: 'No live game' }[live.backend] || live.backend;
  const browserText = { checking: 'Checking…', available: 'Adapter available',
    unsupported: 'WebGPU API not exposed', unavailable: 'No usable adapter',
    blocked: 'Browser adapter check blocked' }[browser.state] || browser.state;

  return <div style={panelStyle} data-testid={`graphics-runtime-${sceneId}`} aria-label="Graphics diagnostics">
    <h3 style={{ margin: '0 0 5px', fontSize: 16, fontWeight: 650 }}>Graphics diagnostics</h3>
    <p style={{ margin: '0 0 10px', opacity: .8 }} role="status" data-testid="graphics-runtime-status">
      {humanGraphicsStatus(live)}
    </p>
    <dl style={{ margin: 0 }}>
      <Metric title="Game renderer" value={backend}/>
      <Metric title="Verified WebGPU" value={live.webgpuActive ? 'Yes' : 'No'}/>
      <Metric title="GPU device" value={live.deviceConfirmed ? 'Initialized' : 'Not confirmed'}/>
      <Metric title="Render calls" value={live.frameCount.toLocaleString()}/>
      <Metric title="GPU lost" value={live.deviceLost ? 'Yes' : 'No'}/>
      {live.adapterName && <Metric title="Active WebGPU adapter (browser-reported)" value={live.adapterName}/>}
      {live.webglRendererName && <Metric title="WebGL renderer (browser-reported)" value={live.webglRendererName}/>}
      {live.selectionReason && <Metric title="Renderer selection reason" value={live.selectionReason}/>}
      <Metric title="Browser WebGPU adapter" value={browserText}/>
      {browser.name && <Metric title="Available adapter (not necessarily active)" value={browser.name}/>}
    </dl>
    <button type="button" onClick={() => void checkBrowser()}
      style={{ marginTop: 10, padding: '5px 10px', borderRadius: 8,
        border: '1px solid rgba(210,226,245,.4)', color: 'inherit', background: 'transparent' }}>
      Recheck browser GPU
    </button>
    <p style={{ margin: '10px 0 0', opacity: .72, fontSize: 12 }}>
      Browser adapter support does not prove the game uses WebGPU. The active renderer
      is verified only while gameplay is running; its model name may be hidden by Edge.
      Render calls are not GPU utilization measurements.
    </p>
  </div>;
}
