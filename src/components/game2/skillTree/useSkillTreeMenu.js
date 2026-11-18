import { useCallback, useEffect, useRef, useState } from 'react';
import { skillTreeKey } from './catalog.js';

export function clearSkillMenuInput(game) {
  game?.input?.releaseAll();
  game?.stepPresses?.clear();
  game?.stepReleases?.clear();
  game?.pendingMouse?.fill(0);
  if (game) game.last = 0;
}

export default function useSkillTreeMenu({ gameRef, ready, blocked, onBlockingChange }) {
  const [open, setOpen] = useState(false);
  const openRef = useRef(false), ownerRef = useRef(null);
  const optionsRef = useRef({ ready, blocked, onBlockingChange });
  optionsRef.current = { ready, blocked, onBlockingChange };
  const currentGame = gameRef.current;
  const change = useCallback(next => {
    const game = next ? gameRef.current : ownerRef.current;
    if (next && (!game || game.disposed || !optionsRef.current.ready || optionsRef.current.blocked)) return;
    if (next) ownerRef.current = { game, enabled: game.input.enabled };
    const target = next ? game : game?.game;
    if (target && !target.disposed) {
      clearSkillMenuInput(target);
      target.input.enabled = next ? false : game.enabled;
    }
    openRef.current = next;
    setOpen(next);
    optionsRef.current.onBlockingChange?.(next);
    if (next) {
      try { if (document.pointerLockElement) document.exitPointerLock(); } catch { /* embedding browser */ }
    } else {
      target?.input?.canvas?.focus?.({ preventScroll: true });
      ownerRef.current = null;
    }
  }, [gameRef]);
  useEffect(() => {
    const handle = event => {
      const state = optionsRef.current;
      const mouse = event.type === 'mousedown';
      const canvas = gameRef.current?.input?.canvas;
      // Mouse-bound menus must leave their own buttons usable.
      if (mouse && (event.target?.closest?.('[data-game2-interface]') ||
          (!openRef.current && event.target !== canvas && document.pointerLockElement !== canvas))) return;
      const keyEvent = mouse ? {
        code: 'Mouse' + event.button, target: event.target, defaultPrevented: event.defaultPrevented,
        ctrlKey: event.ctrlKey, metaKey: event.metaKey, altKey: event.altKey,
      } : event;
      const action = skillTreeKey(keyEvent, { ...state, open: openRef.current, binding: gameRef.current?.input?.bindings?.skillTree || 'KeyK' });
      if (!action) return;
      event.preventDefault();
      event.stopImmediatePropagation(); // K/Esc must not also attack or open Pause
      change(action === 'open');
    };
    window.addEventListener('keydown', handle, true);
    window.addEventListener('mousedown', handle, true);
    return () => {
      window.removeEventListener('keydown', handle, true);
      window.removeEventListener('mousedown', handle, true);
    };
  }, [change, gameRef]);
  useEffect(() => { if (!ready && openRef.current) change(false); }, [ready, change]);
  useEffect(() => {
    if (openRef.current && ownerRef.current?.game !== currentGame) change(false);
  }, [currentGame, change]);
  useEffect(() => () => {
    const owner = ownerRef.current;
    if (owner?.game && !owner.game.disposed) {
      clearSkillMenuInput(owner.game);
      owner.game.input.enabled = owner.enabled;
    }
  }, []);
  return { open, openRef, close: () => change(false) };
}
