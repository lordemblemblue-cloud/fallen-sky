import { useEffect, useRef, useState } from 'react';
import {
  defaultMobileTouchLayout, isMobileTouchDevice, MOBILE_TOUCH_ACTIONS,
  MOBILE_TOUCH_SECONDARY, normalizeMobileTouchLayout, touchLandscape,
  touchLayoutStorageKey,
} from './mobileTouchModel.mjs';
import { createStandardGamepadReader } from './mobileGamepad.mjs';
import { requestLandscapeOnGesture, showLandscapeSuggestion } from './mobileLandscape.mjs';
import { describeDuelistTouchSkill } from './duelistTouchSkill.mjs';
import DuelistTouchArtwork from './DuelistTouchArtwork.jsx';
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
  specialReady = true, specialCharge = null, lockActive = false,
  classId = null, abilityStatus = null, willValue = null,
}) {
  const root = useRef(null);
  const pointer = useRef(null);
  const lookPointer = useRef(null);
  const held = useRef(new Set());
  // Multiple fingers can share one action. A lost pointer must never keep an
  // ability held (or make it impossible to tap again).
  const actionPointers = useRef(new Map());
  const actionSources = useRef(new Map());
  const callbacks = useRef({});
  callbacks.current = { onMove, onLook, onActionDown, onActionUp,
    canUse: id => id !== 'special' || specialReady };
  const [supported, setSupported] = useState(() => typeof window !== 'undefined' && isMobileTouchDevice(window));
  const [size, setSize] = useState(() => typeof window !== 'undefined' ? viewport() : { width: 390, height: 844 });
  const landscape = touchLandscape(size.width, size.height);
  const portraitBlocked = supported && !landscape;
  const layoutKey = touchLayoutStorageKey(game, landscape);
  const [layout, setLayout] = useState(() => ({ key: layoutKey, positions: typeof window !== 'undefined'
    ? readPositions(game, landscape) : defaultMobileTouchLayout(game, landscape) }));
  const [editing, setEditing] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [stick, setStick] = useState({ x: 0, y: 0 });
  const [dragged, setDragged] = useState(null);
  const [rotateFailed, setRotateFailed] = useState(false);
  const [controllerConnected, setControllerConnected] = useState(false);

  // Touch and gamepad may hold the same button simultaneously. Release a
  // gameplay command only once ALL input sources have released that button.
  function sourceAction(id, source, down) {
    if (down && (disabled || portraitBlocked || !callbacks.current.canUse(id))) return;
    const current = actionSources.current.get(id) || new Set();
    const wasDown = current.size > 0;
    if (down) current.add(source);
    else current.delete(source);
    if (current.size) actionSources.current.set(id, current);
    else actionSources.current.delete(id);
    const isDown = current.size > 0;
    if (id === 'more') {
      if (down && !wasDown) setExpanded(expanded => !expanded);
      return;
    }
    if (!wasDown && isDown) callbacks.current.onActionDown?.(id);
    else if (wasDown && !isDown) callbacks.current.onActionUp?.(id);
  }

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
    if (landscape) setRotateFailed(false);
  }, [landscape]);
  useEffect(() => {
    if (!supported || landscape) return;
    try {
      // Installed PWAs may honor this without fullscreen; Safari in a normal
      // tab will simply reject it and show the rotate/continue choice.
      if (window.matchMedia?.('(display-mode: standalone)')?.matches) {
        window.screen?.orientation?.lock?.('landscape')?.catch?.(() => {});
      }
    } catch { /* no orientation API */ }
  }, [supported, landscape]);
  useEffect(() => {
    const gamepad = createStandardGamepadReader(game, {
      down: id => sourceAction(id, 'gamepad', true),
      up: id => sourceAction(id, 'gamepad', false),
      move: move => {
        if (!pointer.current) callbacks.current.onMove?.(move);
      },
      look: (dx, dy) => callbacks.current.onLook?.(dx, dy),
    });
    let frame = 0;
    let lastConnected = false;
    const poll = () => {
      const connected = !disabled && !editing && !portraitBlocked &&
        gamepad.update(window.navigator?.getGamepads?.());
      if (!connected && (disabled || editing || portraitBlocked)) gamepad.release();
      if (connected !== lastConnected) {
        lastConnected = connected;
        setControllerConnected(connected);
      }
      frame = window.requestAnimationFrame(poll);
    };
    frame = window.requestAnimationFrame(poll);
    return () => {
      window.cancelAnimationFrame(frame);
      gamepad.release();
      setControllerConnected(false);
    };
  }, [game, disabled, editing, portraitBlocked]);
  useEffect(() => {
    if (layout.key !== layoutKey) return;
    try { localStorage.setItem(layoutKey, JSON.stringify(layout.positions)); }
    catch { /* private mode: still movable for this session */ }
  }, [layout, layoutKey]);

  const releaseAll = () => {
    for (const action of held.current) sourceAction(action, 'touch', false);
    held.current.clear();
    actionPointers.current.clear();
    callbacks.current.onMove?.({ x: 0, y: 0 });
    pointer.current = null;
    lookPointer.current = null;
    setStick({ x: 0, y: 0 });
  };
  useEffect(() => {
    if (disabled || !supported || editing || portraitBlocked) {
      for (const action of held.current) sourceAction(action, 'touch', false);
      held.current.clear();
      actionPointers.current.clear();
      callbacks.current.onMove?.({ x: 0, y: 0 });
      pointer.current = null;
      lookPointer.current = null;
      setStick({ x: 0, y: 0 });
    }
  }, [disabled, supported, editing, portraitBlocked]);
  useEffect(() => () => {
    for (const [id] of actionSources.current) callbacks.current.onActionUp?.(id);
    actionSources.current.clear();
    held.current.clear();
    actionPointers.current.clear();
    callbacks.current.onMove?.({ x: 0, y: 0 });
  }, []);

  // iOS/Android may cancel or drop pointer capture when a finger leaves a
  // button, the OS steals the gesture, or the overlay re-renders. Recover all
  // orphaned touches at window level in addition to the element handlers.
  useEffect(() => {
    const finish = event => {
      setDragged(current => current?.pointerId === event.pointerId ? null : current);
      if (pointer.current?.id === event.pointerId) {
        pointer.current = null;
        setStick({ x: 0, y: 0 });
        callbacks.current.onMove?.({ x: 0, y: 0 });
      }
      if (lookPointer.current?.id === event.pointerId) lookPointer.current = null;
      for (const [id, owners] of actionPointers.current) {
        if (!owners.delete(event.pointerId)) continue;
        if (owners.size) continue;
        actionPointers.current.delete(id);
        held.current.delete(id);
        sourceAction(id, 'touch', false);
      }
    };
    const stop = () => { releaseAll(); setDragged(null); };
    const visibility = () => { if (document.visibilityState === 'hidden') stop(); };
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', finish);
    window.addEventListener('blur', stop);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
      window.removeEventListener('blur', stop);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, []);

  // Even when a match/class-picker disables actions, keep the required
  // landscape screen above the game: players must rotate before gameplay.
  if (!supported || (disabled && !portraitBlocked)) return null;

  const locate = id => layout.positions[id] || defaultMobileTouchLayout(game, landscape)[id];
  const moveEdited = (id, event) => {
    const r = root.current?.getBoundingClientRect();
    if (!r?.width || !r.height) return;
    const x = clamp(((event.clientX - r.left) / r.width) * 100, 7, 93);
    const y = clamp(((event.clientY - r.top) / r.height) * 100, 7, 93);
    setLayout(prev => ({ key: layoutKey, positions: { ...prev.positions, [id]: { x, y } } }));
  };
  const capture = event => {
    try { event.currentTarget.setPointerCapture?.(event.pointerId); }
    catch { /* global pointerup/cancel handlers still recover the gesture */ }
  };
  const startDrag = (id, event) => {
    event.preventDefault();
    event.stopPropagation();
    capture(event);
    setDragged({ id, pointerId: event.pointerId });
    moveEdited(id, event);
  };
  const onEditMove = (id, event) => {
    if (dragged?.id === id && dragged.pointerId === event.pointerId) moveEdited(id, event);
  };
  const endDrag = event => {
    if (!event || dragged?.pointerId === event.pointerId) setDragged(null);
  };

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
    if (disabled || portraitBlocked) return;
    event.preventDefault();
    event.stopPropagation();
    // An interrupted gesture can lose its pointerup without a usable cancel.
    // A new finger must be able to reclaim the joystick if the old capture
    // is already gone; never strand the player until a page reload.
    if (pointer.current && pointer.current.id !== event.pointerId) {
      if (event.currentTarget.hasPointerCapture?.(pointer.current.id)) return;
      callbacks.current.onMove?.({ x: 0, y: 0 });
    }
    capture(event);
    pointer.current = { kind: 'move', id: event.pointerId };
    joystickMove(event);
  };
  const joystickEnd = event => {
    if (editing) return endDrag(event);
    if (pointer.current?.kind === 'move' && pointer.current.id === event.pointerId) {
      pointer.current = null;
      setStick({ x: 0, y: 0 });
      callbacks.current.onMove?.({ x: 0, y: 0 });
    }
  };
  const actStart = (id, event) => {
    if (editing) return startDrag(id, event);
    if (disabled || portraitBlocked) return;
    event.preventDefault();
    event.stopPropagation();
    if (!callbacks.current.canUse(id)) return;
    capture(event);
    const owners = actionPointers.current.get(id) || new Set();
    if (owners.has(event.pointerId)) return;
    const first = owners.size === 0;
    owners.add(event.pointerId);
    actionPointers.current.set(id, owners);
    if (first) {
      held.current.add(id);
      sourceAction(id, 'touch', true);
    }
  };
  const actEnd = (id, event) => {
    if (editing) return endDrag(event);
    const owners = actionPointers.current.get(id);
    if (owners?.delete(event.pointerId) && owners.size === 0) {
      actionPointers.current.delete(id);
      held.current.delete(id);
      sourceAction(id, 'touch', false);
    }
    event.stopPropagation();
  };
  const lookDown = event => {
    if (disabled || portraitBlocked || editing || lookPointer.current) return;
    if (event.pointerType === 'mouse') return;
    event.preventDefault();
    capture(event);
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

  const askLandscape = async () => {
    const locked = await requestLandscapeOnGesture(window);
    setRotateFailed(!locked);
  };
  const showRotate = showLandscapeSuggestion({
    touch: supported, width: size.width, height: size.height,
  });
  const items = MOBILE_TOUCH_ACTIONS[game] || MOBILE_TOUCH_ACTIONS.duelist;
  const secondary = MOBILE_TOUCH_SECONDARY[game] || MOBILE_TOUCH_SECONDARY.duelist;
  return (
    <div ref={root} className="mobile-game-controls" data-testid="mobile-game-controls"
      data-game={game} data-orientation={landscape ? 'landscape' : 'portrait'}
      data-editing={editing} data-landscape-required={showRotate ? 'true' : undefined}
      aria-label="Mobile game touch controls">
      {showRotate && <div className="mobile-orientation-prompt" role="dialog" aria-modal="true"
        aria-label="Landscape required for mobile gameplay">
        <div className="mobile-orientation-symbol" aria-hidden="true">↻</div>
        <strong>TURN YOUR PHONE SIDEWAYS</strong>
        <p>Rotate your phone 90° to play. Games need a sideways screen on mobile.</p>
        <div className="mobile-orientation-choices">
          <button type="button" onClick={askLandscape}>TRY LANDSCAPE</button>
        </div>
        <small>{rotateFailed ? 'Your browser cannot rotate automatically. Turn the phone sideways and disable Portrait Orientation Lock if needed.' : 'If the game does not rotate, turn off your phone’s portrait orientation lock.'}</small>
      </div>}
      <div className="mobile-look-zone" data-testid="mobile-look-zone" aria-label="Swipe to look around"
        onPointerDown={lookDown} onPointerMove={lookMove} onPointerUp={lookUp} onPointerCancel={lookUp}/>
      {(game !== 'duelist' || expanded || editing || controllerConnected) &&
        <div className="mobile-control-toolbar">
          {controllerConnected && <span className="mobile-gamepad-connected">CONTROLLER CONNECTED</span>}
          {(game !== 'duelist' || expanded || editing) && <button type="button" aria-pressed={editing} onClick={() => { releaseAll(); setEditing(v => !v); }}
            className="mobile-control-editor">{editing ? 'DONE' : 'MOVE CONTROLS'}</button>}
          {editing && <button type="button" className="mobile-control-editor" onClick={() => {
            setLayout({ key: layoutKey, positions: defaultMobileTouchLayout(game, landscape) });
          }}>RESET</button>}
        </div>}
      {editing && <div className="mobile-control-instructions">Drag each control to reposition it · Done saves the layout</div>}
      <div className="mobile-move-stick" role="group" aria-label="Virtual movement joystick"
        style={{ '--touch-x': `${locate('joystick').x}%`, '--touch-y': `${locate('joystick').y}%` }}
        onPointerDown={joystickStart}
        onPointerMove={event => editing ? onEditMove('joystick', event) : pointer.current?.id === event.pointerId ? joystickMove(event) : null}
        onPointerUp={joystickEnd} onPointerCancel={joystickEnd} onLostPointerCapture={joystickEnd}>
        <span className="mobile-move-stick-thumb" style={{ transform: `translate(${stick.x * 31}px, ${-stick.y * 31}px)` }}/>
      </div>
      {items.map(([id, label]) => {
        if (secondary.includes(id) && !expanded && !editing) return null;
        const position = locate(id);
        const skill = game === 'duelist' ? describeDuelistTouchSkill(classId, id) : null;
        const status = skill?.slot ? abilityStatus?.[skill.slot - 1] : null;
        const cooldown = Math.max(0, Number(status?.ready) || 0);
        const lowWill = status && Number.isFinite(willValue) && Number(status.cost) > willValue;
        return <button key={id} type="button"
          data-testid={`mobile-action-${id}`} data-action={id}
          className="mobile-touch-action" data-special={id === 'special' || id === 'ultimate'}
          style={{ '--touch-x': `${position.x}%`, '--touch-y': `${position.y}%` }}
          disabled={(disabled || (id === 'special' && !specialReady)) && !editing}
          aria-pressed={id === 'lock' ? !!lockActive : undefined}
          data-active={id === 'lock' && !!lockActive ? 'true' : undefined}
          data-unready={id === 'special' && !specialReady ? 'true' : undefined}
          data-cooling={cooldown > 0 ? 'true' : undefined}
          data-low-will={lowWill ? 'true' : undefined}
          title={skill ? `${skill.name} · ${skill.type} — ${skill.text}` : undefined}
          aria-label={skill ? `${skill.name}, ${skill.type}${cooldown > 0 ? `, cooldown ${cooldown.toFixed(1)} seconds` : lowWill ? ', not enough Will' : ''}` :
            id === 'lock' ? 'Auto lock target' : label === 'ULT' ? 'Ultimate ability' : label}
          onPointerDown={event => actStart(id, event)}
          onPointerMove={event => editing && onEditMove(id, event)}
          onPointerUp={event => actEnd(id, event)}
          onPointerCancel={event => actEnd(id, event)}
          onLostPointerCapture={event => actEnd(id, event)}
          onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); sourceAction(id, 'keyboard', true); } }}
          onKeyUp={event => { if (event.key === 'Enter' || event.key === ' ') sourceAction(id, 'keyboard', false); }}>
          {skill ? <>
            <span className="mobile-duelist-ability-name">{skill.name}</span>
            <DuelistTouchArtwork skillId={skill.id}/>
            <span className="mobile-duelist-ability-number" aria-hidden="true">{skill.ultimate ? 'ULT' : label}</span>
            {skill.ultimate && Number.isFinite(specialCharge) &&
              <span className="mobile-duelist-ability-charge">{Math.round(specialCharge)}%</span>}
            {cooldown > 0 && <span className="mobile-duelist-ability-cooldown" aria-hidden="true">
              {cooldown >= 10 ? Math.ceil(cooldown) : cooldown.toFixed(1)}s</span>}
            <span className="mobile-duelist-ability-type" aria-hidden="true">{skill.type}</span>
          </> : <>
            <span className="mobile-action-label">{label}</span>
            {((id === 'special' && game === 'duelist') || (id === 'ultimate' && game === 'fallen')) &&
              Number.isFinite(specialCharge) && <span className="mobile-action-charge">{Math.round(specialCharge)}%</span>}
          </>}
        </button>;
      })}
    </div>
  );
}
