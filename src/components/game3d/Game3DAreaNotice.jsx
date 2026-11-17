import { useEffect } from 'react';
import { toast } from 'react-hot-toast';

// Says where the player has arrived when they pass from one Wolfveil area
// into another (the town or one of its four sides). The 3D world sends
// `game3dWorldRegionChange`; this only turns it into one short notice.
// Mount once anywhere inside the game view.
export default function Game3DAreaNotice() {
  useEffect(() => {
    const onArea = (event) => {
      const detail = event?.detail || {};
      if (!detail.label) return;
      const via = detail.gatewayLabel ? ` · ${detail.gatewayLabel}` : '';
      // One id: a quick step back across a bridge replaces the notice
      // instead of stacking a second one.
      toast(`Entering ${detail.label}${via}`, { id: 'game3d-area-notice', duration: 2600 });
    };
    window.addEventListener('game3dWorldRegionChange', onArea);
    return () => window.removeEventListener('game3dWorldRegionChange', onArea);
  }, []);
  return null;
}
