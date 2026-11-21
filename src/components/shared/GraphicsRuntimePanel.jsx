import { useCallback, useEffect, useState } from 'react';
import { humanGraphicsStatus, readGraphicsRuntimeStatus } from '@/lib/graphicsRuntimeStatus.mjs';
import { probeBrowserGPU, browserGPUStatusMessage } from '@/lib/browserGPUDetection.mjs';

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
  const [browser, setBrowser] = useState({ status: 'checking', name: null });
  // The device is detected in the user's browser, not on the remote multiplayer server.
  // Requests are shared between the two games and never uploaded or persisted.
  const checkBrowser = useCallback(async (refresh = false) => {
    setBrowser({ status: 'checking', name: null });
    const result = await probeBrowserGPU(window, { refresh });
    setBrowser(result);
  }, []);
  useEffect(() => {
    if (!enabled) return undefined;
    setLive(readGraphicsRuntimeStatus(sceneId));
    const timer = window.setInterval(() => setLive(readGraphicsRuntimeStatus(sceneId)), 850);
    return () => window.clearInterval(timer);
  }, [enabled, sceneId]);
  useEffect(() => {
    if (enabled) { void checkBrowser(false); }
  }, [enabled, checkBrowser]);
  if (!enabled) return null;

  const backend = { webgpu: 'WebGPU', 'webgl2-fallback': 'WebGL2 fallback',
    'classic-webgl': 'Classic WebGL', initializing: 'Initializing', none: 'No live game' }[live.backend] || live.backend;
  const browserText = { checking: 'Checking…', available: 'Adapter available',
    'software-fallback': 'Software fallback only',
    'insecure-context': 'HTTPS or localhost required',
    unsupported: 'WebGPU API not exposed', unavailable: 'No usable adapter',
    blocked: 'Browser adapter check blocked' }[browser.status] || browser.status;

  return <div style={panelStyle} data-testid={`graphics-runtime-${sceneId}`} aria-label="Graphics diagnostics">
    <h3 style={{ margin: '0 0 5px', fontSize: 16, fontWeight: 650 }}>Graphics diagnostics</h3>
    <p style={{ margin: '0 0 10px', opacity: .8 }} role="status" data-testid="graphics-runtime-status">
      {humanGraphicsStatus(live)}
    </p>
    <dl style={{ margin: 0 }}>
      <Metric title="Game renderer" value={backend}/>
      <Metric title="Rendering & shader path" value={live.webgpuActive
        ? 'GPU via WebGPU' : live.backend === 'classic-webgl' || live.backend === 'webgl2-fallback'
          ? 'WebGL (hardware depends on browser)' : 'Not verified'}/>
      <Metric title="Verified WebGPU" value={live.webgpuActive ? 'Yes' : 'No'}/>
      <Metric title="GPU device" value={live.deviceConfirmed ? 'Initialized' : 'Not confirmed'}/>
      <Metric title="Render calls" value={live.frameCount.toLocaleString()}/>
      <Metric title="GPU lost" value={live.deviceLost ? 'Yes' : 'No'}/>
      {live.adapterName && <Metric title="Active WebGPU adapter (browser-reported)" value={live.adapterName}/>}
      {live.webglRendererName && <Metric title="WebGL renderer (browser-reported)" value={live.webglRendererName}/>}
      {live.selectionReason && <Metric title="Renderer selection reason" value={live.selectionReason}/>}
      <Metric title="Browser WebGPU adapter" value={browserText}/>
      {browser.name && <Metric title="Detected graphics card (browser-reported)" value={browser.name}/>}
      <p role="status" style={{ margin: '9px 0 4px', opacity: .84, fontSize: 12 }}>{browserGPUStatusMessage(browser)}</p>
    </dl>
    <button type="button" onClick={() => void checkBrowser(true)}
      style={{ marginTop: 10, padding: '5px 10px', borderRadius: 8,
        border: '1px solid rgba(210,226,245,.4)', color: 'inherit', background: 'transparent' }}>
      Recheck browser GPU
    </button>
    <p style={{ margin: '10px 0 0', opacity: .72, fontSize: 12 }}>
      Graphics card detection runs automatically in your browser. It may be hidden by Edge
      and the detected available GPU may differ from the live game adapter. The game renderer
      reports WebGPU separately and only while gameplay is running. WebGPU and WebGL both use
      GPU shaders; a frame-call counter is not a GPU utilization measurement.
    </p>
  </div>;
}
