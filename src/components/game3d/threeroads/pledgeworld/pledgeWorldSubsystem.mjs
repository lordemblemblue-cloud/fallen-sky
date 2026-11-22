// Pledge world: makes the pledges of the opening playable. It registers them
// with the game, watches the steps of the pledges the player has sworn, runs
// the staging the script gives each step, and reports what happened in the
// world to the quest store. See docs/game3d/three-empires/BUILD_RULES.md.
//
// Nothing here grants anything. A finished pledge becomes a completion claim
// (pledges/pledgeClaim.mjs) sent as the window event 'threeRoadsPledgeClaim'.
import { threeRoadsEnabled } from '../threeRoadsFlag.mjs';
import { installThreeRoadsPledges, removeThreeRoadsPledges } from './pledgeRegistration.mjs';

// Told to the tracker and anything else that lists quests, so it reads the
// quest list again once the pledges are in it.
export const PLEDGES_CHANGED_EVENT = 'threeRoadsPledgesChanged';

const loadGameBindings = () => import('./pledgeWorldGameBindings.js')
  .then(module => module.pledgeWorldGameBindings);

export function createPledgeWorldSubsystem(_ctx = {}, {
  win = globalThis.window,
  bindings = null,
  loadBindings = loadGameBindings,
  warn = (...args) => globalThis.console?.warn(...args),
} = {}) {
  // A second lock on the switch: GameWorld3D only creates the world when it is
  // on, and nothing is registered from anywhere else.
  if (!win || !threeRoadsEnabled(win)) return null;

  let disposed = false;
  let game = null;

  const announce = () => {
    try { win.dispatchEvent?.(new globalThis.CustomEvent(PLEDGES_CHANGED_EVENT)); } catch { /* no events here */ }
  };

  const start = found => {
    if (disposed || !found) return;
    game = found;
    installThreeRoadsPledges(game.quests);
    announce();
  };

  if (bindings) start(bindings);
  else Promise.resolve().then(loadBindings).then(start)
    .catch(error => warn('Three Roads pledges could not reach the quest store', error));

  return {
    update() {},
    dispose() {
      if (disposed) return;
      disposed = true;
      // Every area change remounts the world, so the pledges stay registered
      // across a dispose. They are taken out only if the switch has been
      // turned off in the meantime.
      if (game && !threeRoadsEnabled(win)) {
        removeThreeRoadsPledges(game.quests);
        announce();
      }
    },
  };
}
