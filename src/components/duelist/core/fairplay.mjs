// Server-side input budget per fighter (a token bucket): a client that sends presses faster than any person
// could has the extra ones dropped before they reach the rules, so macros and packet floods gain nothing.
import { INPUT } from './tuning.mjs';

export function createInputRateLimiter({ perSecond = INPUT.maxPerSecond, burst = INPUT.burst } = {}) {
  let tokens = burst;
  let last = null;
  return {
    // true: the press may be applied; false: drop it
    allow(now) {
      if (last !== null) tokens = Math.min(burst, tokens + (now - last) * perSecond);
      last = now;
      if (tokens < 1) return false;
      tokens -= 1;
      return true;
    },
    tokens: () => tokens,
  };
}

// Commands a client may send; anything else is rejected before it reaches the rules.
// ability1-4: the class's four abilities (without a class: push, pull, grip, breach); special: the class special
export const CLIENT_COMMANDS = Object.freeze(new Set(['light', 'heavy', 'push', 'pull', 'grip', 'release', 'breach', 'resist',
  'roll', 'dash', 'jump', 'mode', 'itemActive', 'blockDown', 'blockUp', 'ability1', 'ability2', 'ability3', 'ability4', 'special', 'taunt']));
export const isClientCommand = (command) => CLIENT_COMMANDS.has(command);
