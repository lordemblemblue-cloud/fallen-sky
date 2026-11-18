/* eslint-disable */
// Keyboard / mouse input with pointer lock (falls back to arrow-key camera when pointer lock is unavailable).
// Listeners are tracked so dispose() can remove every one of them (the game is mounted inside a React page).
import { GAME2_DEFAULT_BINDINGS } from '../settings.js';
import { requestPointerLockSafe } from '@/lib/pointerLock';
export class Input {
  constructor(canvas) {
    // Match-time settings can override these, but a standalone/tutorial game
    // must still understand Mouse1 lock-on and keyboard help dismissal.
    this.bindings = { ...GAME2_DEFAULT_BINDINGS };
    this.canvas = canvas; this.down = new Set(); this.pressedSet = new Set(); this.releasedSet = new Set(); this.btn = Array(16).fill(false); this.btnPressed = Array(16).fill(false);
    this.dx = 0; this.dy = 0; this.wheel = 0; this.zoom = 0; this.wheelThrottle = 0; this.lastWheel = -1e9; this.locked = false; this.sens = 0.0022; this.enabled = true; this.onFirstGesture = null; this.cleanups = [];
    const on = (t, type, fn, o) => { t.addEventListener(type, fn, o); this.cleanups.push(() => t.removeEventListener(type, fn, o)); };
    const prevent = new Set(['Space', 'Tab', 'F1', 'Backquote', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'F3']);
    const typing = e => { const t = e.target; return !!t && t !== canvas && t.nodeType === 1 && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)); }; // never swallow keys meant for a text field
    on(window, 'keydown', e => { if (!this.enabled || e.target?.closest?.('[data-game2-interface]') || typing(e) || e.metaKey || e.ctrlKey || e.altKey) return; if (prevent.has(e.code) || Object.values(this.bindings || {}).includes(e.code)) e.preventDefault(); if (!e.repeat) { this.down.add(e.code); this.pressedSet.add(e.code); } this.gesture(); });
    on(window, 'keyup', e => { this.down.delete(e.code); this.releasedSet.add(e.code); });
    on(window, 'blur', () => this.releaseAll());
    on(canvas, 'blur', () => this.releaseAll());
    on(document, 'visibilitychange', () => { if (document.hidden) this.releaseAll(); });
    on(window, 'pagehide', () => this.releaseAll());
    // Also listen directly on the canvas: embedded Base44 previews may run
    // inside isolated iframes that do not reliably bubble events to window.
    // A WeakSet prevents the same bubbling browser event firing twice.
    const mouseDownEvents = new WeakSet();
    const captureMouseDown = e => {
      if (mouseDownEvents.has(e)) return;
      mouseDownEvents.add(e);
      if (!this.enabled || e.target?.closest?.('[data-game2-interface]') ||
          (e.target !== canvas && document.pointerLockElement !== canvas)) return;
      if (!Number.isInteger(e.button) || e.button < 0 || e.button > 15) return;
      e.preventDefault(); // prevent back/forward/autoscroll on supported browsers
      const code = 'Mouse' + e.button;
      try { canvas.focus?.({ preventScroll: true }); } catch { canvas.focus?.(); }
      if (!this.down.has(code)) this.pressedSet.add(code);
      this.down.add(code);
      this.btn[e.button] = true;
      this.btnPressed[e.button] = true;
      this.gesture();
      if (!this.locked && e.button === 0) this.lock();
    };
    on(canvas, 'mousedown', captureMouseDown);
    on(window, 'mousedown', captureMouseDown);
    on(window, 'mouseup', e => {
      if (!Number.isInteger(e.button) || e.button < 0 || e.button > 15) return;
      if (this.btn[e.button] && (e.button === 1 || e.button >= 3)) e.preventDefault();
      this.btn[e.button] = false;
      this.down.delete('Mouse' + e.button);
      this.releasedSet.add('Mouse' + e.button);
    });
    // Browser history and context menus must not steal mouse-side gameplay binds.
    on(canvas, 'auxclick', e => { if (e.button >= 1) e.preventDefault(); });
    on(canvas, 'contextmenu', e => e.preventDefault());
    on(window, 'mousemove', e => { if (this.enabled && (this.locked || this.btn[1])) { this.dx += e.movementX || 0; this.dy += e.movementY || 0; } });
    // Browser editor iframes may deny pointer lock. Keep camera look functional while the mouse is over the game canvas.
    // Locked events bubble to window and must not be added twice.
    on(canvas, 'mousemove', e => { if (this.enabled && !this.locked && !this.btn[1]) { this.dx += e.movementX || 0; this.dy += e.movementY || 0; } });
    on(canvas, 'wheel', e => { if (!this.enabled) return; e.preventDefault(); const s = Math.sign(e.deltaY); if (e.ctrlKey) { this.zoom += s; return; } if (this.wheelThrottle && e.timeStamp - this.lastWheel < this.wheelThrottle) return; this.lastWheel = e.timeStamp; this.wheel += s; }, { passive: false }); // wheelThrottle: one step per notch even on trackpads
    on(document, 'pointerlockchange', () => {
      const wasLocked = this.locked;
      this.locked = document.pointerLockElement === canvas;
      if (wasLocked && !this.locked) this.releaseAll();
    });
  }
  releaseAll() {
    this.down.clear(); this.pressedSet.clear(); this.releasedSet.clear();
    this.btn.fill(false); this.btnPressed.fill(false);
    this.dx = this.dy = this.wheel = this.zoom = 0;
  }
  gesture() { if (this.onFirstGesture) { const f = this.onFirstGesture; this.onFirstGesture = null; f(); } }
  lock() { requestPointerLockSafe(this.canvas); }
  held(code) { return this.down.has(code); }
  pressed(code) { return this.pressedSet.has(code); }
  released(code) { return this.releasedSet.has(code); }
  endFrame() { this.pressedSet.clear(); this.releasedSet.clear(); this.btnPressed.fill(false); this.dx = this.dy = 0; this.wheel = 0; this.zoom = 0; }
  dispose() {
    for (const f of this.cleanups) f(); this.cleanups.length = 0; this.down.clear(); this.btn.fill(false);
    try { if (document.pointerLockElement === this.canvas) document.exitPointerLock(); } catch (e) { }
  }
}