// Standard Web Gamepad mapping, compatible with Bluetooth Xbox/PlayStation
// controllers exposed by the browser. All actions flow through the existing
// game input handlers: the controller never applies client-side damage.
export const STANDARD_GAMEPAD_BINDINGS = Object.freeze({
  duelist: Object.freeze({
    0: 'jump', 1: 'roll', 2: 'guard', 3: 'heavy',
    4: 'ability1', 5: 'ability2', 6: 'ability3', 7: 'light',
    8: 'more', 9: 'shop', 10: 'sprint', 11: 'lock',
    12: 'special', 13: 'ability4', 14: 'dash', 15: 'interact',
  }),
  fallen: Object.freeze({
    0: 'jump', 1: 'roll', 2: 'guard', 3: 'attack',
    4: 'ability1', 5: 'ability2', 6: 'ability3', 7: 'attack',
    8: 'more', 10: 'sprint', 11: 'lock',
    12: 'ultimate', 13: 'ability4', 14: 'dodge', 15: 'interact',
  }),
});
export function stickDeadzone(value, deadzone = 0.17) {
  const v = Number.isFinite(value) ? Math.max(-1, Math.min(1, value)) : 0;
  if (Math.abs(v) <= deadzone) return 0;
  return Math.sign(v) * (Math.abs(v) - deadzone) / (1 - deadzone);
}
export function createStandardGamepadReader(game, handlers) {
  const mapping = STANDARD_GAMEPAD_BINDINGS[game] || STANDARD_GAMEPAD_BINDINGS.duelist;
  const held = new Set();
  let connected = false;
  const release = () => {
    for (const action of held) handlers.up?.(action);
    held.clear();
    if (connected) handlers.move?.({ x: 0, y: 0 });
    connected = false;
  };
  return {
    update(pads) {
      const pad = Array.from(pads || []).find(p => p && p.connected !== false &&
        (!p.mapping || p.mapping === 'standard'));
      if (!pad) { release(); return false; }
      connected = true;
      const desired = new Set();
      for (const [index, action] of Object.entries(mapping)) {
        const button = pad.buttons?.[Number(index)];
        if (button?.pressed || Number(button?.value || 0) > 0.58) desired.add(action);
      }
      for (const action of held) if (!desired.has(action)) {
        handlers.up?.(action);
        held.delete(action);
      }
      for (const action of desired) if (!held.has(action)) {
        held.add(action);
        handlers.down?.(action);
      }
      const x = stickDeadzone(pad.axes?.[0]);
      const y = -stickDeadzone(pad.axes?.[1]);
      handlers.move?.({ x, y });
      const rightX = stickDeadzone(pad.axes?.[2]);
      const rightY = stickDeadzone(pad.axes?.[3]);
      if (rightX || rightY) handlers.look?.(rightX * 13, rightY * 13);
      return true;
    },
    release,
    connected: () => connected,
  };
}
