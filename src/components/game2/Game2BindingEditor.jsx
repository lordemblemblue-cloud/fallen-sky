import { useEffect, useRef, useState } from 'react';
import {
  GAME2_BINDING_LABELS, GAME2_VALID_CODES,
  game2BindingLabel, game2MouseCode, rebindGame2Action,
} from './settings.js';

// Shared by the main menu and in-match Esc menu. The action selector click
// happens BEFORE listening begins; the next keyboard/mouse down event is bound.
export default function Game2BindingEditor({ bindings, onChange }) {
  const [listening, setListening] = useState(null);
  const suppressMouseClick = useRef(null);
  useEffect(() => {
    if (!listening) return undefined;
    const take = (event, code) => {
      // Never hijack browser/system commands as game bindings.
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      event.preventDefault();
      event.stopImmediatePropagation?.();
      event.stopPropagation();
      if (code === 'Escape') { setListening(null); return; }
      if (!code || !GAME2_VALID_CODES.test(code)) return;
      if (event.type === 'mousedown') suppressMouseClick.current = event.button;
      onChange(rebindGame2Action(bindings, listening, code));
      setListening(null);
    };
    const keyDown = event => take(event, event.code);
    const mouseDown = event => take(event, game2MouseCode(event.button));
    window.addEventListener('keydown', keyDown, true);
    window.addEventListener('mousedown', mouseDown, true);
    return () => {
      window.removeEventListener('keydown', keyDown, true);
      window.removeEventListener('mousedown', mouseDown, true);
    };
  }, [listening, bindings, onChange]);

  // A browser can emit click/auxclick/contextmenu after the captured mousedown.
  // Suppress that one follow-up event so binding Mouse0 doesn't also select
  // another control or unintentionally Resume/Exit the match.
  useEffect(() => {
    const swallow = event => {
      if (suppressMouseClick.current === null) return;
      if (event.button !== suppressMouseClick.current) {
        // A different mouse event is a later user interaction, not the capture.
        suppressMouseClick.current = null;
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation?.();
      event.stopPropagation();
      suppressMouseClick.current = null;
    };
    const noNavigation = event => {
      if (suppressMouseClick.current !== event.button) return;
      event.preventDefault();
      if (event.type === 'contextmenu') suppressMouseClick.current = null;
    };
    window.addEventListener('click', swallow, true);
    window.addEventListener('auxclick', swallow, true);
    window.addEventListener('mouseup', noNavigation, true);
    window.addEventListener('contextmenu', noNavigation, true);
    return () => {
      window.removeEventListener('click', swallow, true);
      window.removeEventListener('auxclick', swallow, true);
      window.removeEventListener('mouseup', noNavigation, true);
      window.removeEventListener('contextmenu', noNavigation, true);
    };
  }, []);

  return (
    <div data-testid="game2-keyboard-mouse-bindings" data-game2-interface="bindings">
      <p className="mb-3 text-xs leading-5 text-slate-400">
        Select an action, then press a keyboard key or click a mouse button, including the
        middle wheel button and side/thumb buttons. Existing assignments swap automatically.
        Esc cancels. Some browsers reserve mouse back/forward buttons.
      </p>
      <div className="max-h-[50vh] space-y-1.5 overflow-y-auto pr-1">
        {Object.entries(GAME2_BINDING_LABELS).map(([action, label]) => (
          <button type="button" key={action} onClick={() => setListening(action)}
            aria-label={'Change ' + label + ', current: ' + game2BindingLabel(bindings?.[action])}
            className={'flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm ' +
              (listening === action ? 'border-cyan-300 bg-cyan-300/10' : 'border-white/10 bg-white/[0.04] hover:bg-white/[0.08]')}>
            <span>{label}</span>
            <span className="shrink-0 font-mono text-xs text-cyan-100">
              {listening === action ? 'PRESS KEY / MOUSE…' : game2BindingLabel(bindings?.[action])}
            </span>
          </button>
        ))}
      </div>
      {listening && <p role="status" className="mt-2 text-xs text-cyan-200">
        Waiting for keyboard or mouse input to change {GAME2_BINDING_LABELS[listening]}…
      </p>}
    </div>
  );
}
