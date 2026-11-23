import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Play } from 'lucide-react';
import GpuLaunchPrompt from './GpuLaunchPrompt';
import { GAMES_HUB_FOCUS_STORAGE_KEY, GAMES_HUB_TILES, isTilePlayable, tileBackdrop } from './gamesHubCatalog.mjs';
import {
  createHubGamepadNavigator,
  createWheelStepper,
  focusIndexForId,
  hubKeyAction,
  readStoredHubFocus,
  resistedDrag,
  resolveHubChoice,
  stepFocusIndex,
  swipeSteps,
  tilePlacement,
  writeStoredHubFocus,
} from './gamesHubNavigation.mjs';
import './gamesCrossScroll.css';

// Cross-scroll game menu: one row of game tiles that slides left and right.
// The focused tile grows, its name, line and Play button show below the row,
// and the page background cross-fades to that game's art. Only transforms and
// opacity animate. Arrow keys / A D / wheel / swipe / gamepad move; Enter, a
// click on the focused tile, Play or the gamepad A button start the game.

function hubStorage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function reducedMotion() {
  try {
    return Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  } catch {
    return false;
  }
}

function firstGamepad() {
  try {
    return Array.from(window.navigator?.getGamepads?.() || []).find((pad) => pad && pad.connected !== false) || null;
  } catch {
    return null;
  }
}

function cssPixels(element, name, fallback) {
  const value = Number.parseFloat(getComputedStyle(element).getPropertyValue(name));
  return Number.isFinite(value) ? value : fallback;
}

export default function GamesCrossScroll({ tiles = GAMES_HUB_TILES, routesByPath, onLaunch, children }) {
  const [focus, setFocus] = useState(() =>
    focusIndexForId(tiles, readStoredHubFocus(hubStorage(), GAMES_HUB_FOCUS_STORAGE_KEY)));
  const [notice, setNotice] = useState('');
  const [pendingLaunch, setPendingLaunch] = useState(null);
  const focusRef = useRef(focus);
  const surfaceRef = useRef(null);
  const rowRef = useRef(null);
  const nudgeRef = useRef(null);
  const soonRef = useRef(null);
  const tileRefs = useRef([]);
  const dragRef = useRef(null);
  const suppressClickRef = useRef(false);
  const actRef = useRef(() => {});

  const playable = useMemo(() => tiles.map((tile) => isTilePlayable(tile, routesByPath)), [tiles, routesByPath]);
  const count = tiles.length;
  const current = tiles[focus] || tiles[0];

  const focusTo = useCallback((index) => {
    focusRef.current = index;
    setFocus(index);
    setNotice('');
  }, []);

  const nudge = useCallback((edge) => {
    if (reducedMotion()) return;
    const offset = edge === 'start' ? 14 : -14;
    nudgeRef.current?.animate?.(
      [{ transform: 'translate3d(0,0,0)' }, { transform: `translate3d(${offset}px,0,0)` }, { transform: 'translate3d(0,0,0)' }],
      { duration: 260, easing: 'ease-out' },
    );
  }, []);

  const move = useCallback((delta) => {
    const result = stepFocusIndex(focusRef.current, delta, count);
    if (result.moved) focusTo(result.index);
    else if (result.edge) nudge(result.edge);
  }, [count, focusTo, nudge]);

  const choose = useCallback(() => {
    if (pendingLaunch) return;
    const index = focusRef.current;
    const tile = tiles[index];
    const { launch, blocked } = resolveHubChoice(tile, playable[index]);
    if (launch) {
      if (tile.gpuPrompt) setPendingLaunch({ to: launch, tile });
      else onLaunch?.(launch, tile);
      return;
    }
    if (blocked === 'coming-soon') {
      setNotice(`${tile.title} is coming soon.`);
      if (!reducedMotion()) {
        soonRef.current?.animate?.(
          [{ transform: 'translateX(0)' }, { transform: 'translateX(-6px)' }, { transform: 'translateX(6px)' }, { transform: 'translateX(0)' }],
          { duration: 300, easing: 'ease-in-out' },
        );
      }
    }
  }, [tiles, playable, onLaunch, pendingLaunch]);

  const act = useCallback((action) => {
    if (pendingLaunch) return;
    if (action === 'left') move(-1);
    else if (action === 'right') move(1);
    else if (action === 'first') { if (focusRef.current !== 0) focusTo(0); else nudge('start'); }
    else if (action === 'last') { if (focusRef.current !== count - 1) focusTo(count - 1); else nudge('end'); }
    else if (action === 'choose') choose();
  }, [move, focusTo, nudge, choose, count, pendingLaunch]);

  useEffect(() => { actRef.current = act; }, [act]);

  // Remember the focused game; keep keyboard focus on the focused tile while
  // the player is moving through tiles with the keyboard.
  useEffect(() => {
    focusRef.current = focus;
    writeStoredHubFocus(hubStorage(), GAMES_HUB_FOCUS_STORAGE_KEY, tiles[focus]?.id);
    const active = document.activeElement;
    if (active?.closest?.('[data-hub-tile]') && active !== tileRefs.current[focus]) {
      tileRefs.current[focus]?.focus({ preventScroll: true });
    }
  }, [focus, tiles]);

  // Keyboard. Enter on a button or link is left to that element (Install,
  // pager, Play, a tile), so nothing fires twice.
  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.isComposing) return;
      const action = hubKeyAction(event.key, event.code);
      if (!action) return;
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]')) return;
      if (action === 'choose' && (event.repeat || target?.closest('button, a, [role="button"]'))) return;
      event.preventDefault();
      actRef.current(action);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Mouse wheel and trackpad. Not passive, so a sideways trackpad swipe moves
  // the menu instead of triggering the browser's back gesture.
  useEffect(() => {
    const surface = surfaceRef.current;
    if (!surface) return undefined;
    const stepper = createWheelStepper();
    const onWheel = (event) => {
      if (event.ctrlKey) return;
      event.preventDefault();
      const step = stepper.push(event.deltaX, event.deltaY, performance.now(), event.deltaMode);
      if (step) actRef.current(step > 0 ? 'right' : 'left');
    };
    surface.addEventListener('wheel', onWheel, { passive: false });
    return () => surface.removeEventListener('wheel', onWheel);
  }, []);

  // Gamepad: polled only while one is connected.
  useEffect(() => {
    if (typeof window === 'undefined' || !window.navigator?.getGamepads) return undefined;
    const reader = createHubGamepadNavigator();
    let frame = 0;
    const tick = () => {
      frame = 0;
      const pad = firstGamepad();
      if (!pad) { reader.reset(); return; }
      for (const action of reader.update(pad, performance.now())) actRef.current(action);
      frame = requestAnimationFrame(tick);
    };
    const start = () => { if (!frame) frame = requestAnimationFrame(tick); };
    window.addEventListener('gamepadconnected', start);
    if (firstGamepad()) start();
    return () => {
      window.removeEventListener('gamepadconnected', start);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  // Swipe or drag: the row follows the finger (rubber band at the ends) and
  // settles on the nearest tile.
  const onPointerDown = (event) => {
    if (pendingLaunch) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (event.target instanceof Element && event.target.closest('[data-hub-nodrag]')) return;
    suppressClickRef.current = false;
    const row = rowRef.current;
    const tile = tileRefs.current[focusRef.current];
    const stepPx = (tile?.offsetWidth || 120) + (row ? cssPixels(row, '--xs-gap', 16) : 16);
    dragRef.current = { id: event.pointerId, x: event.clientX, y: event.clientY, dx: 0, dy: 0, active: false, stepPx };
  };

  const onPointerMove = (event) => {
    const drag = dragRef.current;
    if (!drag || drag.id !== event.pointerId) return;
    drag.dx = event.clientX - drag.x;
    drag.dy = event.clientY - drag.y;
    if (!drag.active) {
      if (Math.abs(drag.dx) < 8 || Math.abs(drag.dx) < Math.abs(drag.dy)) return;
      drag.active = true;
      try { surfaceRef.current?.setPointerCapture?.(event.pointerId); } catch { /* pointer already gone */ }
      rowRef.current?.classList.add('is-dragging');
    }
    rowRef.current?.style.setProperty('--xs-drag', `${resistedDrag(drag.dx, focusRef.current, count)}px`);
  };

  const endDrag = (event, cancelled) => {
    const drag = dragRef.current;
    if (!drag || drag.id !== event.pointerId) return;
    dragRef.current = null;
    if (!drag.active) return;
    suppressClickRef.current = true;
    rowRef.current?.classList.remove('is-dragging');
    rowRef.current?.style.setProperty('--xs-drag', '0px');
    if (cancelled) return;
    const steps = swipeSteps(drag.dx, drag.dy, drag.stepPx);
    if (steps) move(steps);
  };

  const onClickCapture = (event) => {
    if (!suppressClickRef.current) return;
    suppressClickRef.current = false;
    event.preventDefault();
    event.stopPropagation();
  };

  const onTileClick = (index) => {
    if (index === focusRef.current) choose();
    else focusTo(index);
  };

  const currentPlayable = playable[focus];

  return (
    <div
      ref={surfaceRef}
      className="xs-surface"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(event) => endDrag(event, false)}
      onPointerCancel={(event) => endDrag(event, true)}
      onClickCapture={onClickCapture}
    >
      <div className="xs-backdrops" aria-hidden="true">
        {tiles.map((tile, index) => (
          <div
            key={tile.id}
            className={`xs-backdrop${index === focus ? ' is-active' : ''}`}
            style={{ backgroundImage: `url("${tileBackdrop(tile)}"), ${tile.fallback}` }}
          />
        ))}
        <div className="xs-shade" />
      </div>

      {children}

      <section className="xs-menu" aria-label="Choose your game" aria-roledescription="game menu">
        <div ref={rowRef} className="xs-row">
          <div ref={nudgeRef} className="xs-row-nudge">
            {tiles.map((tile, index) => {
              const { rel, after, focused } = tilePlacement(index, focus);
              const live = playable[index];
              return (
                <Fragment key={tile.id}>
                <button
                  key={tile.id}
                  ref={(element) => { tileRefs.current[index] = element; }}
                  type="button"
                  data-hub-tile={tile.id}
                  className={`xs-tile${focused ? ' is-focused' : ''}${rel < 0 ? ' is-before' : ''}${live ? '' : ' is-soon'}`}
                  style={{ '--xs-rel': rel, '--xs-after': after, '--xs-accent': tile.accent, backgroundImage: tile.fallback }}
                  tabIndex={focused ? 0 : -1}
                  aria-current={focused ? 'true' : undefined}
                  aria-label={live ? tile.title : `${tile.title}, coming soon`}
                  onClick={() => onTileClick(index)}
                >
                  <img
                    src={tile.art}
                    alt=""
                    draggable={false}
                    decoding="async"
                    onError={(event) => { event.currentTarget.style.visibility = 'hidden'; }}
                  />
                  <span className="xs-tile-name" aria-hidden="true">{tile.title}</span>
                  {!live && (
                    <span className="xs-tile-soon" aria-hidden="true">
                      <span className="xs-tile-soon-long">Coming soon</span>
                      <span className="xs-tile-soon-short">Soon</span>
                    </span>
                  )}
                </button>
                {tile.releaseStatus === 'beta-experimental' &&
                  <span className={`xs-tile-beta${focused ? ' is-focused' : ''}`}
                    style={{ '--xs-rel': rel, '--xs-after': after }} aria-hidden="true">Beta Experimental</span>}
                </Fragment>
              );
            })}
          </div>
        </div>

        <div key={current.id} className="xs-details" style={{ '--xs-accent': current.accent }}>
          <h2 className="xs-title">{current.title}</h2>
          <p className="xs-tagline">{current.tagline}</p>
          {current.details?.length > 0 && (
            <ul className="xs-chips" aria-label="About this game">
              {current.details.map((detail) => <li key={detail}>{detail}</li>)}
            </ul>
          )}
          <div className="xs-actions">
            {currentPlayable ? (
              <button type="button" data-hub-play className="xs-play" onClick={choose}>
                <Play className="xs-play-icon" aria-hidden="true" />
                Play
              </button>
            ) : (
              <span ref={soonRef} className="xs-soon">Coming soon</span>
            )}
          </div>
        </div>
      </section>

      <div className="xs-footer" data-hub-nodrag>
        <p className="xs-hint xs-hint-keys">
          <kbd>&larr;</kbd><kbd>&rarr;</kbd> or <kbd>A</kbd><kbd>D</kbd> browse · <kbd>Enter</kbd> play
        </p>
        <p className="xs-hint xs-hint-touch">Swipe to browse</p>
        <nav className="xs-pager" aria-label="Browse games">
          <button type="button" className="xs-pager-button" aria-label="Previous game" disabled={focus === 0} onClick={() => move(-1)}>
            <ChevronLeft aria-hidden="true" />
          </button>
          <span className="xs-pager-count" aria-hidden="true">{focus + 1} / {count}</span>
          <button type="button" className="xs-pager-button" aria-label="Next game" disabled={focus === count - 1} onClick={() => move(1)}>
            <ChevronRight aria-hidden="true" />
          </button>
        </nav>
      </div>

      {pendingLaunch && <GpuLaunchPrompt gameTitle={pendingLaunch.tile.title}
        onClose={() => setPendingLaunch(null)}
        onContinue={() => { const choice = pendingLaunch; setPendingLaunch(null); onLaunch?.(choice.to, choice.tile); }} />}
      <p className="xs-sr-only" aria-live="polite">
        {notice || `${current.title}${currentPlayable ? '' : ', coming soon'}, game ${focus + 1} of ${count}`}
      </p>
    </div>
  );
}