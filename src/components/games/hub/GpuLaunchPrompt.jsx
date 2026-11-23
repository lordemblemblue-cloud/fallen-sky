import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, Copy, Cpu, ExternalLink, ShieldAlert, X } from 'lucide-react';
import './GpuLaunchPrompt.css';

function browserHelp() {
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent || '';
  if (/Edg\//.test(ua)) return { name: 'Microsoft Edge', path: 'edge://settings/system', diagnostics: 'edge://gpu' };
  if (/Chrome\//.test(ua)) return { name: 'Google Chrome', path: 'chrome://settings/system', diagnostics: 'chrome://gpu' };
  return { name: 'Your browser', path: '', diagnostics: '' };
}

/** An advisory, not a fake permission dialog. Websites cannot change browser graphics settings. */
export default function GpuLaunchPrompt({ gameTitle, onContinue, onClose }) {
  const [state, setState] = useState('idle');
  const dialogRef = useRef(null);
  const [showHelp, setShowHelp] = useState(true);
  const [copied, setCopied] = useState(false);
  const browser = browserHelp();

  useEffect(() => {
    const prior = document.activeElement;
    dialogRef.current?.querySelector('button')?.focus();
    const onKey = event => {
      if (event.key === 'Escape') { event.preventDefault(); onClose?.(); return; }
      if (event.key !== 'Tab') return;
      const buttons = [...(dialogRef.current?.querySelectorAll('button:not([disabled])') || [])];
      const first = buttons[0], last = buttons[buttons.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey, true);
    return () => { document.removeEventListener('keydown', onKey, true); prior?.focus?.(); };
  }, [onClose]);

  const checkGraphics = async () => {
    if (state === 'checking') return;
    setState('checking');
    if (typeof navigator === 'undefined' || !window.isSecureContext || !navigator.gpu?.requestAdapter) {
      setState('unavailable');
      setShowHelp(true);
      return;
    }
    let timeout;
    try {
      const adapter = await Promise.race([
        navigator.gpu.requestAdapter({ powerPreference: 'high-performance' }),
        new Promise((resolve) => { timeout = window.setTimeout(() => resolve(null), 5000); }),
      ]);
      setState(adapter ? 'ready' : 'unavailable');
      if (!adapter) setShowHelp(true);
    } catch {
      setState('unavailable');
      setShowHelp(true);
    } finally {
      if (timeout) window.clearTimeout(timeout);
    }
  };

  const copyLocation = async () => {
    if (!browser.path || !navigator.clipboard?.writeText) return;
    try {
      await navigator.clipboard.writeText(browser.path);
      setCopied(true);
    } catch { setCopied(false); }
  };

  if (typeof document === 'undefined') return null;
  return createPortal(
    <div className="xs-gpu-overlay" role="presentation" data-hub-nodrag
      onPointerDown={event => event.stopPropagation()}
      onPointerMove={event => event.stopPropagation()}
      onPointerUp={event => event.stopPropagation()}>
      <section ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="xs-gpu-title"
        aria-describedby="xs-gpu-summary" className="xs-gpu-dialog">
        <button type="button" className="xs-gpu-close" aria-label="Close graphics setup" onClick={onClose}>
          <X size={18} aria-hidden="true" />
        </button>
        <p className="xs-gpu-eyebrow"><Cpu size={17} aria-hidden="true" /> Graphics setup · {gameTitle}</p>
        <h2 id="xs-gpu-title">Get the best graphics your device supports</h2>
        <p id="xs-gpu-summary" className="xs-gpu-lead">
          For smoother 3D play, enable <strong>Use graphics acceleration when available</strong> in your browser.
          The game will use a supported GPU renderer automatically. This can improve performance, but cannot guarantee zero lag.
        </p>
        <div className="xs-gpu-status" role="status" aria-live="polite" data-status={state}>
          {state === 'idle' && <>Check whether this browser can access WebGPU before launching.</>}
          {state === 'checking' && <>Checking for an available WebGPU adapter…</>}
          {state === 'ready' && <><CheckCircle2 size={17} aria-hidden="true" /> WebGPU is available. Your browser can provide a GPU adapter.</>}
          {state === 'unavailable' && <><ShieldAlert size={17} aria-hidden="true" /> WebGPU was not available in this check. Review the steps below; the game may use a fallback renderer.</>}
        </div>
        <div className="xs-gpu-actions">
          <button type="button" className="xs-gpu-check" onClick={checkGraphics} disabled={state === 'checking'}>
            {state === 'checking' ? 'Checking…' : state === 'ready' ? 'Check again' : 'Check my GPU'}
          </button>
          <button type="button" className="xs-gpu-guide-toggle"
            aria-expanded={showHelp} onClick={() => setShowHelp(value => !value)}>
            {showHelp ? 'Hide setup steps' : 'How to enable it'}
          </button>
        </div>
        {showHelp && <div className="xs-gpu-guide" aria-label="Browser GPU setup instructions">
          {browser.path ? <>
            <p><strong>{browser.name}:</strong> Open a new browser tab and paste this address into its address bar:</p>
            <div className="xs-gpu-address"><code>{browser.path}</code>
              <button type="button" onClick={copyLocation} aria-label="Copy browser settings address"><Copy size={15}/>{copied ? 'Copied' : 'Copy'}</button>
            </div>
            <p>Go to <strong>System</strong>, turn on <strong>Use graphics acceleration when available</strong>, then relaunch your browser.
              Check <code>{browser.diagnostics}</code> for the browser's GPU feature status.</p>
          </> : <p>Open your browser settings and search for <strong>graphics acceleration</strong> or <strong>hardware acceleration</strong>. Enable it if available, then restart your browser. Mobile browsers may not offer this switch.</p>}
          {/Windows/i.test(typeof navigator === 'undefined' ? '' : navigator.userAgent) &&
            <p><strong>Windows 11 (optional):</strong> Open <strong>Settings → System → Display → Graphics</strong>, select your browser under app graphics options and choose <strong>High performance</strong> when your computer has more than one GPU.</p>}
          <p>For improved performance, use an up-to-date browser and graphics driver, close demanding background tabs, and reduce the game's resolution or effects if the frame rate is still low.</p>
          <p className="xs-gpu-safety"><ShieldAlert size={15} aria-hidden="true"/> For security reasons, websites cannot turn browser graphics acceleration on or change your device's system settings for you. We can only check GPU support and use what your browser permits.</p>
        </div>}
        <div className="xs-gpu-footer">
          <button type="button" className="xs-gpu-continue" onClick={onContinue}>
            Continue to {gameTitle} <ExternalLink size={15} aria-hidden="true" />
          </button>
          <p>Graphics availability depends on your device, driver and browser. You can continue without enabling WebGPU.</p>
        </div>
      </section>
    </div>, document.body
  );
}
