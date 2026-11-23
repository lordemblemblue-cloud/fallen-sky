// Touch controls enter the SAME keyboard/mouse/gameplay pipeline as desktop.
// No direct HP, skill, cooldown, position or server state mutation occurs here.
const KEY = Object.freeze({
  jump:['Space',' '], roll:['KeyR','r'], sprint:['ControlLeft','Control'],
  interact:['KeyE','e'], mount:['KeyF','f'], crouch:['KeyQ','q'],
  ability1:['Digit1','1'], ability2:['Digit2','2'], ability3:['Digit3','3'],
  ability4:['Digit4','4'], skill5:['Digit5','5'], skill6:['Digit6','6'],
  skill7:['Digit7','7'], skill8:['Digit8','8'], skill9:['Digit9','9'],
  ultimate:['Digit0','0'],
});
const MOVE = Object.freeze({
  forward:['KeyW','w'], back:['KeyS','s'], left:['KeyA','a'], right:['KeyD','d'],
});
const movementActions = Object.keys(MOVE);

/** host is window; dependency injection lets tests verify edge-triggered input. */
export function createFallenTouchBridge(host = globalThis.window) {
  const held = new Set();
  const movement = new Set();
  const dispatchKey = (type, pair) => {
    host.dispatchEvent(new host.KeyboardEvent(type, {
      code: pair[0], key: pair[1], bubbles: true, cancelable: true,
    }));
  };
  const canvas = () => host.document?.querySelector('.game3d-view canvas') || null;
  const dispatchMouse = (type, button) => {
    const target = type === 'mousedown' ? canvas() : host;
    target?.dispatchEvent(new host.MouseEvent(type, {
      button, buttons: type === 'mousedown' ? (button === 2 ? 2 : 1) : 0,
      bubbles: true, cancelable: true, clientX: -200, clientY: -200,
    }));
  };
  const keyDown = (id, pair) => {
    if (held.has(id)) return;
    held.add(id);
    dispatchKey('keydown', pair);
  };
  const keyUp = (id, pair) => {
    if (!held.delete(id)) return;
    dispatchKey('keyup', pair);
  };
  const setMove = ({ x = 0, y = 0 } = {}) => {
    const desired = new Set([
      ...(y > 0.26 ? ['forward'] : y < -0.26 ? ['back'] : []),
      ...(x < -0.26 ? ['left'] : x > 0.26 ? ['right'] : []),
    ]);
    // Release before pressing: prevents sticky movement across quick joystick
    // direction changes and preserves onKeyUp's existing dodge state machine.
    for (const action of movementActions) if (!desired.has(action) && movement.delete(action)) {
      keyUp(action, MOVE[action]);
    }
    for (const action of desired) if (!movement.has(action)) {
      movement.add(action);
      keyDown(action, MOVE[action]);
    }
  };
  const dodge = () => {
    const direction = movementActions.find(action => movement.has(action)) || 'back';
    const pair = MOVE[direction];
    const moving = movement.has(direction);
    if (moving) { movement.delete(direction); keyUp(direction, pair); }
    // The existing authoritative dodge uses W/A/S/D double-tap recognition.
    // Both press/release edges are required; a held virtual stick alone cannot
    // generate a second tap.
    dispatchKey('keydown', pair);
    dispatchKey('keyup', pair);
    dispatchKey('keydown', pair);
    dispatchKey('keyup', pair);
    if (moving) { movement.add(direction); keyDown(direction, pair); }
  };
  return {
    move: setMove,
    look(dx, dy) {
      if (!Number.isFinite(dx) || !Number.isFinite(dy)) return;
      host.dispatchEvent(new host.CustomEvent('game3dMobileLook', { detail: { dx, dy } }));
    },
    down(action) {
      if (action === 'dodge') { dodge(); return; }
      if (action === 'attack' || action === 'guard') {
        if (held.has(action)) return;
        held.add(action);
        dispatchMouse('mousedown', action === 'attack' ? 0 : 2);
        return;
      }
      if (KEY[action]) keyDown(action, KEY[action]);
    },
    up(action) {
      if (action === 'attack' || action === 'guard') {
        if (!held.delete(action)) return;
        dispatchMouse('mouseup', action === 'attack' ? 0 : 2);
        return;
      }
      if (KEY[action]) keyUp(action, KEY[action]);
    },
    dispose() {
      setMove({ x: 0, y: 0 });
      for (const action of [...held]) {
        if (action === 'attack' || action === 'guard') {
          held.delete(action);
          dispatchMouse('mouseup', action === 'attack' ? 0 : 2);
        } else if (KEY[action]) keyUp(action, KEY[action]);
      }
    },
  };
}
