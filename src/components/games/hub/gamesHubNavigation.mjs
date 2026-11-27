// Pure navigation logic for the games hub cross-scroll menu: no DOM, no React,
// so Node tests can drive it. The menu stops at both ends (no wrap-around): a
// push past the first or last game reports the edge and the UI nudges the row.

export function clampFocusIndex(index, count) {
  if (!Number.isFinite(count) || count < 1) return 0;
  const i = Number.isFinite(index) ? Math.trunc(index) : 0;
  return Math.max(0, Math.min(count - 1, i));
}

// Move the focus by delta tiles. Returns the new index, whether it moved, and
// which end it ran into ('start' | 'end' | null).
export function stepFocusIndex(index, delta, count, { wrap = false } = {}) {
  const from = clampFocusIndex(index, count);
  const step = Number.isFinite(delta) ? Math.trunc(delta) : 0;
  if (count < 1 || step === 0) return { index: from, moved: false, edge: null };
  if (wrap) {
    const to = (((from + step) % count) + count) % count;
    return { index: to, moved: to !== from, edge: null };
  }
  const raw = from + step;
  const to = clampFocusIndex(raw, count);
  const edge = raw < 0 ? 'start' : raw > count - 1 ? 'end' : null;
  return { index: to, moved: to !== from, edge };
}

export function focusIndexForId(tiles, id, fallback = 0) {
  const list = Array.isArray(tiles) ? tiles : [];
  const found = typeof id === 'string' ? list.findIndex((tile) => tile?.id === id) : -1;
  return found >= 0 ? found : clampFocusIndex(fallback, list.length);
}

// The last focused game survives visits. Storage may be missing or throw
// (private mode, blocked cookies): reading falls back to null, writing to false.
export function readStoredHubFocus(storage, key) {
  try {
    const value = storage?.getItem?.(key);
    return typeof value === 'string' && value ? value : null;
  } catch {
    return null;
  }
}

export function writeStoredHubFocus(storage, key, id) {
  try {
    if (!storage?.setItem || typeof id !== 'string') return false;
    storage.setItem(key, id);
    return true;
  } catch {
    return false;
  }
}

// Keyboard: arrows or A / D move, Home / End jump, Enter chooses. Space is left
// to the browser so a focused button (Install, Play) still works as usual.
export function hubKeyAction(key, code) {
  if (key === 'ArrowLeft' || code === 'KeyA' || key === 'a' || key === 'A') return 'left';
  if (key === 'ArrowRight' || code === 'KeyD' || key === 'd' || key === 'D') return 'right';
  if (key === 'Home') return 'first';
  if (key === 'End') return 'last';
  if (key === 'Enter' || code === 'NumpadEnter') return 'choose';
  return null;
}

// Choosing a tile: a playable game launches its route; one still in the
// works reports 'coming-soon' and goes nowhere.
export function resolveHubChoice(tile, playable) {
  if (!tile) return { launch: null, blocked: 'missing' };
  if (!playable) return { launch: null, blocked: 'coming-soon' };
  return { launch: tile.to, blocked: null };
}

// Mouse wheel / trackpad: one notch moves one tile. A trackpad fling sends a
// stream of small deltas, so after a step the stream is ignored until it
// pauses (gapMs) or lockMs has passed.
export function createWheelStepper({ threshold = 40, gapMs = 150, lockMs = 420 } = {}) {
  let acc = 0;
  let lastEventAt = -Infinity;
  let lastStepAt = -Infinity;
  let locked = false;
  return {
    push(deltaX, deltaY, now, deltaMode = 0) {
      const dx = Number(deltaX) || 0;
      const dy = Number(deltaY) || 0;
      const scale = deltaMode === 1 ? 16 : deltaMode === 2 ? 400 : 1;
      const d = (Math.abs(dx) > Math.abs(dy) ? dx : dy) * scale;
      if (now - lastEventAt > gapMs) { acc = 0; locked = false; }
      lastEventAt = now;
      if (locked && now - lastStepAt < lockMs) return 0;
      locked = false;
      if (d === 0) return 0;
      if (acc !== 0 && Math.sign(d) !== Math.sign(acc)) acc = 0;
      acc += d;
      if (Math.abs(acc) < threshold) return 0;
      const step = Math.sign(acc);
      acc = 0;
      locked = true;
      lastStepAt = now;
      return step;
    },
    reset() {
      acc = 0;
      locked = false;
      lastEventAt = -Infinity;
      lastStepAt = -Infinity;
    },
  };
}

// Swipe / drag: a mostly-horizontal drag of at least minPx moves one tile per
// stepPx dragged (at least one). Dragging left (negative dx) goes to the next game.
export function swipeSteps(dx, dy, stepPx, { minPx = 36, maxSteps = Infinity } = {}) {
  const x = Number(dx) || 0;
  const y = Number(dy) || 0;
  if (Math.abs(x) < minPx || Math.abs(x) < Math.abs(y) * 1.2) return 0;
  const size = Number(stepPx) > 0 ? Number(stepPx) : 120;
  const steps = Math.min(maxSteps, Math.max(1, Math.round(Math.abs(x) / size)));
  return x < 0 ? steps : -steps;
}

// Rubber band past either end while dragging.
export function resistedDrag(dx, index, count, factor = 0.35) {
  const x = Number(dx) || 0;
  const pastStart = index <= 0 && x > 0;
  const pastEnd = index >= count - 1 && x < 0;
  return pastStart || pastEnd ? x * factor : x;
}

// Per-tile placement for the CSS: tiles before the focus slide left, the
// focused one grows, and the ones after it make room for the larger tile.
export function tilePlacement(index, focusIndex) {
  const rel = index - focusIndex;
  return { rel, after: rel > 0 ? 1 : 0, focused: rel === 0 };
}

// Standard-mapping gamepad: D-pad left/right (buttons 14/15) or the left stick
// move, with a hold-to-repeat; A (button 0) chooses. The first reading of a pad
// only records what is already held, so a button still down from a game does
// not launch anything on arrival.
export function createHubGamepadNavigator({ deadzone = 0.5, repeatDelayMs = 420, repeatMs = 170 } = {}) {
  let baseline = false;
  let heldDir = 0;
  let nextRepeatAt = Infinity;
  let aWasDown = false;
  const pressed = (button) => Boolean(button && (button.pressed || Number(button.value || 0) > 0.5));
  const reset = () => {
    baseline = false;
    heldDir = 0;
    nextRepeatAt = Infinity;
    aWasDown = false;
  };
  return {
    update(pad, now) {
      if (!pad) { reset(); return []; }
      const buttons = pad.buttons || [];
      const stick = Number(pad.axes?.[0]) || 0;
      let dir = 0;
      if (pressed(buttons[14])) dir = -1;
      else if (pressed(buttons[15])) dir = 1;
      else if (Math.abs(stick) >= deadzone) dir = Math.sign(stick);
      const aDown = pressed(buttons[0]);
      const actions = [];
      if (!baseline) {
        baseline = true;
        heldDir = dir;
        nextRepeatAt = dir ? now + repeatDelayMs : Infinity;
        aWasDown = aDown;
        return actions;
      }
      if (dir !== heldDir) {
        heldDir = dir;
        if (dir) {
          actions.push(dir < 0 ? 'left' : 'right');
          nextRepeatAt = now + repeatDelayMs;
        } else {
          nextRepeatAt = Infinity;
        }
      } else if (dir && now >= nextRepeatAt) {
        actions.push(dir < 0 ? 'left' : 'right');
        nextRepeatAt = now + repeatMs;
      }
      if (aDown && !aWasDown) actions.push('choose');
      aWasDown = aDown;
      return actions;
    },
    reset,
  };
}
