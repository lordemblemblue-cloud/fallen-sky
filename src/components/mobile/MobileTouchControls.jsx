import { useEffect, useRef, useState } from 'react';
import {
  defaultMobileTouchLayout, isMobileTouchDevice, MOBILE_TOUCH_ACTIONS,
  MOBILE_TOUCH_SECONDARY, normalizeMobileTouchLayout, touchLandscape,
  touchLayoutStorageKey,
} from './mobileTouchModel.mjs';
import './mobileTouchControls.css';

const clamp = (v, low, high) => Math.max(low, Math.min(high, v));
const viewport = () => ({ width: window.innerWidth, height: window.innerHeight });
const readPositions = (game, landscape) => {
  try {
    return normalizeMobileTouchLayout(game, landscape,
      JSON.parse(localStorage.getItem(touchLayoutStorageKey(game, landscape)) || 'null'));
  } catch {
    return defaultMobileTouchLayout(game, landscape);
  }
};

/**
 * No mouse emulation or simulated hits here: each game routes these controls
 * to its existing input pipeline. Buttons can be moved and are saved per-game
 * and per-orientation. Nothing is drawn for mouse-only desktop browsers.
 */
export default function MobileTouchControls({
  game = 'duelist', disabled = false, onMove, onLook, onActionDown, onActionUp,
}) {
  const root = useRef(null);
  const pointer = useRef(null);
  const lookPointer = useRef(null);
  const held = useRef(new Set());
  const callbacks = useRef({});
  callbacks.current = { onMove, onLook, onActionDown, onActionUp };
  const [supported, setSupported] = useState(() => typeof window !== 'undefined' && isMobileTouchDevice(window));
  const [size, setSize] = useState(() => typeof window !== 'undefined' ? viewport() : { width: 390, height: 844 });
  const landscape = touchLandscape(size.width, size.height);
  const layoutKey = touchLayoutStorageKey(game, landscape);
  const [layout, setLayout] = useState(() => ({ key: layoutKey, positions: typeof window !== 'undefined'
    ? readPositions(game, landscape) : defaultMobileTouchLayout(game, landscape) }));
  const [editing, setEditing] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [stick, setStick] = useState({ x: 0, y: 0 });
  const [dragged, setDragged] = useState(null);

  useEffect(() => {
    const mq = window.matchMedia?.('(any-pointer: coarse)');
    const refresh = () => { setSupported(isMobileTouchDevice(window)); setSize(viewport()); };
    window.addEventListener('resize', refresh, { passive: true });
    window.addEventListener('orientationchange', refresh, { passive: true });
    window.visualViewport?.addEventListener('resize', refresh, { passive: true });
    mq?.addEventListener?.('change', refresh);
    return () => {
      window.removeEventListener('resize', refresh);
      window.removeEventListener('orientationchange', refresh);
      window.visualViewport?.removeEventListener('resize', refresh);
      mq?.removeEventListener?.('change', refresh);
    };
  }, []);
  useEffect(() => {
    setLayout({ key: layoutKey, positions: readPositions(game, landscape) });
    setEditing(false);
    setExpanded(false);
  }, [game, landscape, layoutKey]);
  useEffect(() => {
    if (layout.key !== layoutKey) return;
    try { localStorage.setItem(layoutKey, JSON.stringify(layout.positions)); }
    catch { /* private mode: still movable for this session */ }
  }, [layout, layoutKey]);

  const releaseAll = () => {
    for (const action of held.current) callbacks.current.onActionUp?.(action);
    held.current.clear();
    callbacks.current.onMove?.({ x: 0, y: 0 });
    pointer.current = null;
    lookPointer.current = null;
    setStick({ x: 0, y: 0 });
  };
  useEffect(() => {
    if (disabled || !supported || editing) {
      for (const action of held.current) callbacks.current.onActionUp?.(action);
      held.current.clear();
      callbacks.current.onMove?.({ x: 0, y: 0 });
      pointer.current = null;
    }
  }, [disabled, supported, editing]);
  useEffect(() => () => {
    for (const action of held.current) callbacks.current.onActionUp?.(action);
    held.current.clear();
    callbacks.current.onMove?.({ x: 0, y: 0 });
  }, []);

  if (!supported || disabled) return null;

  const locate = id => layout.positions[id] || defaultMobileTouchLayout(game, landscape)[id];
  const moveEdited = (id, event) => {
    const r = root.current?.getBoundingClientRect();
    if (!r?.width || !r.height) return;
    const x = clamp(((event.clientX - r.left) / r.width) * 100, 7, 93);
    const y = clamp(((event.clientY - r.top) / r.height) * 100, 7, 93);
    setLayout(prev => ({ key: layoutKey, positions: { ...prev.positions, [id]: { x, y } } }));
  };
  const startDrag = (id, event) => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setDragged({ id, pointerId: event.pointerId });
    moveEdited(id, event);
  };
  const onEditMove = (id, event) => {
    if (dragged?.id === id && dragged.pointerId === event.pointerId) moveEdited(id, event);
  };
  const endDrag = () => setDragged(null);

  const joystickMove = event => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - rect.left - rect.width / 2) / (rect.width * 0.42);
    const y = (event.clientY - rect.top - rect.height / 2) / (rect.height * 0.42);
    const length = Math.max(1, Math.hypot(x, y));
    const next = { x: clamp(x / length, -1, 1), y: clamp(-y / length, -1, 1) };
    setStick(next);
    callbacks.current.onMove?.(next);
  };
  const joystickStart = event => {
    if (editing) return startDrag('joystick', event);
    if (disabled) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    pointer.current = { kind: 'move', id: event.pointerId };
    joystickMove(event);
  };
  const joystickEnd = event => {
    if (editing) return endDrag();
    if (pointer.current?.kind === 'move' && pointer.current.id === event.pointerId) {
      pointer.current = null;
      setStick({ x: 0, y: 0 });
      callbacks.current.onMove?.({ x: 0, y: 0 });
    }
  };
  const actStart = (id, event) => {
    if (editing) return startDrag(id, event);
    if (disabled) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    if (id === 'more') { setExpanded(open => !open); return; }
    if (!held.current.has(id)) {
      held.current.add(id);
      callbacks.current.onActionDown?.(id);
    }
  };
  const actEnd = (id, event) => {
    if (editing) return endDrag();
    if (held.current.delete(id)) callbacks.current.onActionUp?.(id);
    event.stopPropagation();
  };
  const lookDown = event => {
    if (disabled || editing || lookPointer.current) return;
    if (event.pointerType === 'mouse') return;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    lookPointer.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
  };
  const lookMove = event => {
    const last = lookPointer.current;
    if (!last || last.id !== event.pointerId) return;
    event.preventDefault();
    callbacks.current.onLook?.(event.clientX - last.x, event.clientY - last.y);
    last.x = event.clientX;
    last.y = event.clientY;
  };
  const lookUp = event => {
    if (lookPointer.current?.id === event.pointerId) lookPointer.current = null;
  };

  const items = MOBILE_TOUCH_ACTIONS[game] || MOBILE_TOUCH_ACTIONS.duelist;
  const secondary = MOBILE_TOUCH_SECONDARY[game] || MOBILE_TOUCH_SECONDARY.duelist;
  return (
    <div ref={root} className="mobile-game-controls" data-testid="mobile-game-controls"
      data-game={game} data-orientation={landscape ? 'landscape' : 'portrait'}
      data-editing={editing} aria-label="Mobile game touch controls">
      <div className="mobile-look-zone" data-testid="mobile-look-zone" aria-label="Swipe to look around"
        onPointerDown={lookDown} onPointerMove={lookMove} onPointerUp={lookUp} onPointerCancel={lookUp}/>
      <div className="mobile-control-toolbar">
        <button type="button" aria-pressed={editing} onClick={() => { releaseAll(); setEditing(v => !v); }}
          className="mobile-control-editor">{editing ? 'DONE' : 'MOVE CONTROLS'}</button>
        {editing && <button type="button" className="mobile-control-editor" onClick={() => {
          setLayout({ key: layoutKey, positions: defaultMobileTouchLayout(game, landscape) });
        }}>RESET</button>}
      </div>
      {editing && <div className="mobile-control-instructions">Drag each control to reposition it · Done saves the layout</div>}
      <div className="mobile-move-stick" role="group" aria-label="Virtual movement joystick"
        style={{ '--touch-x': `${locate('joystick').x}%`, '--touch-y': `${locate('joystick').y}%` }}
        onPointerDown={joystickStart}
        onPointerMove={event => editing ? onEditMove('joystick', event) : pointer.current?.id === event.pointerId ? joystickMove(event) : null}
        onPointerUp={joystickEnd} onPointerCancel={joystickEnd}>
        <span className="mobile-move-stick-thumb" style={{ transform: `translate(${stick.x * 31}px, ${-stick.y * 31}px)` }}/>
      </div>
      {items.map(([id, label]) => {
        if (secondary.includes(id) && !expanded && !editing) return null;
        const position = locate(id);
        return <button key={id} type="button"
          data-testid={`mobile-action-${id}`} data-action={id}
          className="mobile-touch-action" data-special={id === 'special' || id === 'ultimate'}
          style={{ '--touch-x': `${position.x}%`, '--touch-y': `${position.y}%` }}
          disabled={disabled && !editing} aria-label={label === 'ULT' ? 'Ultimate ability' : label}
          onPointerDown={event => actStart(id, event)}
          onPointerMove={event => editing && onEditMove(id, event)}
          onPointerUp={event => actEnd(id, event)}
          onPointerCancel={event => actEnd(id, event)}
          onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); if (id === 'more') setExpanded(v => !v); else callbacks.current.onActionDown?.(id); } }}
          onKeyUp={event => { if (event.key === 'Enter' || event.key === ' ') callbacks.current.onActionUp?.(id); }}>
          {label}
        </button>;
      })}
    </div>
  );
}
