import { useEffect } from 'react';
import { toast } from 'react-hot-toast';

// Surfaces a level-up as a HUD toast. GameWorld3D dispatches `playerLevelUp` from its real XP paths
// (enemy kills and quest rewards through playerHUDStore.awardXP) after the level actually changed; the world
// plays the celebration animation and effects on the same event. Mount once anywhere inside the game view.
export default function LevelUpToastListener() {
  useEffect(() => {
    const onLevelUp = (e) => {
      const level = Number(e.detail?.level);
      toast(Number.isFinite(level) ? `✨ Level ${level} reached` : '✨ Level up', {
        duration: 3200,
        style: { background: 'rgba(28, 22, 6, 0.92)', color: '#ffe7a6', border: '1px solid rgba(255, 215, 122, 0.55)' },
      });
    };
    window.addEventListener('playerLevelUp', onLevelUp);
    return () => window.removeEventListener('playerLevelUp', onLevelUp);
  }, []);
  return null;
}
