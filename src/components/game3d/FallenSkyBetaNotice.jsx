import { useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import './FallenSkyBetaNotice.css';

/** Non-blocking beta disclosure on the real Fallen Sky character and world views. */
export default function FallenSkyBetaNotice({ context = 'creation' }) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;
  const inWorld = context === 'world';
  return (
    <aside className="fs-beta-notice" data-context={context}
      aria-label="Fallen Sky Online early beta performance notice">
      <AlertTriangle className="fs-beta-icon" size={17} aria-hidden="true" />
      <div className="fs-beta-copy">
        <strong>EARLY BETA · FALLEN SKY ONLINE</strong>
        <p>{inWorld
          ? 'This world is still being fine-tuned and optimized. Some areas may have lag, stuttering or frame-rate drops.'
          : 'Character creation and the living world are still being fine-tuned and optimized. Loading may take longer and occasional lag or frame-rate drops are possible.'}</p>
      </div>
      <button type="button" aria-label="Dismiss early beta notice" onClick={() => setDismissed(true)}>
        <X size={15} aria-hidden="true"/>
      </button>
    </aside>
  );
}
