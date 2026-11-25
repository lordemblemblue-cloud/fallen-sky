import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Cpu } from 'lucide-react';
import { setLaunchRendererPreference } from '@/lib/rendererBackendChoice.mjs';
import './GpuLaunchPrompt.css';

/** App-level choice, not a browser or operating-system permission dialog.
 * The existing renderer requests the actual adapter/device and handles fallback.
 */
export default function GpuLaunchPrompt({ gameTitle, onContinue, onClose }) {
  const dialogRef = useRef(null);
  const settled = useRef(false);
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);

  useEffect(() => {
    const prior = document.activeElement;
    dialogRef.current?.querySelector('button')?.focus();
    const onKey = event => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        closeRef.current?.();
        return;
      }
      if (event.key !== 'Tab') return;
      const buttons = [...(dialogRef.current?.querySelectorAll('button') || [])];
      const first = buttons[0], last = buttons[buttons.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey, true);
    return () => { document.removeEventListener('keydown', onKey, true); prior?.focus?.(); };
  }, []);

  const launch = (allow) => {
    if (settled.current) return;
    settled.current = true;
    // Yes clears any previous manual fallback selection and automatically tries
    // native WebGPU on ready scenes; No explicitly chooses classic WebGL.
    // Do not probe twice or allocate an extra GPUDevice before the real game.
    setLaunchRendererPreference(allow ? 'auto' : 'webgl', window);
    onContinue?.();
  };

  if (typeof document === 'undefined') return null;
  return createPortal(
    <div className="xs-gpu-overlay" role="presentation" data-hub-nodrag
      onPointerDown={event => event.stopPropagation()}
      onPointerMove={event => event.stopPropagation()}
      onPointerUp={event => event.stopPropagation()}>
      <section ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="xs-gpu-title"
        aria-describedby="xs-gpu-summary" className="xs-gpu-dialog">
        <p className="xs-gpu-eyebrow"><Cpu size={17} aria-hidden="true"/> {gameTitle} · Graphics</p>
        <h2 id="xs-gpu-title">Allow WebGPU?</h2>
        <p id="xs-gpu-summary" className="xs-gpu-lead">
          Use WebGPU for smoother graphics when supported by your browser?
        </p>
        <div className="xs-gpu-actions">
          <button type="button" className="xs-gpu-check" onClick={() => launch(true)}>Yes</button>
          <button type="button" className="xs-gpu-decline" onClick={() => launch(false)}>No</button>
        </div>
      </section>
    </div>, document.body
  );
}
