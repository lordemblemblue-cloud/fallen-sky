import { useEffect, useState } from 'react';
import { subscribeOTSAim } from '../player/otsAimStore';
import './OTSAimReticle.css';

// Centre-screen reticle. It only exists while the aim input is held, and the
// centre of this screen is exactly the ray the camera reports as the shot
// direction. Purely presentational: no combat authority.
export default function OTSAimReticle() {
  const [aim, setAim] = useState({ aiming: false, side: 1 });
  useEffect(() => subscribeOTSAim(setAim), []);
  return (
    <div
      className={`ots-reticle${aim.aiming ? ' is-active' : ''}${aim.side < 0 ? ' is-left' : ''}`}
      aria-hidden="true"
    >
      <span className="ots-reticle-dot" />
      <span className="ots-reticle-tick ots-reticle-top" />
      <span className="ots-reticle-tick ots-reticle-right" />
      <span className="ots-reticle-tick ots-reticle-bottom" />
      <span className="ots-reticle-tick ots-reticle-left" />
    </div>
  );
}