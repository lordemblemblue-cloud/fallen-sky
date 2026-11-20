// Fall animation → ash dissolve → respawn menu. The world draws the actor
// throughout the sequence; do not place a black overlay over the fall.
import React, { useEffect, useState } from 'react';
import { subscribePlayerHUD } from '../playerHUDStore';
import { getPlayerPosition } from '../playerPositionStore';
import { subscribeDeath, setDeathPhase, getDeathState } from './deathStore';
import { DEATH_UI_DELAY_MS } from './deathSequence.mjs';
import RespawnMapOverlay from './RespawnMapOverlay';

export default function DeathFlowController() {
  const [phase, setPhase] = useState(getDeathState().phase);
  useEffect(() => subscribeDeath(s => setPhase(s.phase)), []);
  useEffect(() => {
    let timer = null;
    let sequence = 0;
    const stop = subscribePlayerHUD(hud => {
      if (hud.hp > 0 || getDeathState().phase !== 'alive') return;
      const pos = getPlayerPosition();
      const deathId = ++sequence;
      setDeathPhase('dying', { deathPosition: { x: pos.x, z: pos.z } });
      window.dispatchEvent(new CustomEvent('playerDeathAnimation'));
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(() => {
        // A stale timer cannot open a map after revival or a later death.
        if (sequence === deathId && getDeathState().phase === 'dying') setDeathPhase('respawn');
      }, DEATH_UI_DELAY_MS);
    });
    return () => { sequence++; if (timer !== null) clearTimeout(timer); stop(); };
  }, []);
  return phase === 'respawn' ? <RespawnMapOverlay /> : null;
}
