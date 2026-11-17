// One circle of eight character-facing directions, in 45-degree increments.
// Pure data shared by input selection, montage playback, and tests. The world
// continues to own the actual motion / collision / stamina / invulnerability.
export const EIGHT_WAY_DODGE_MOVES = Object.freeze([
  { direction:'forward',         key:'dodgeRollForward',       kind:'roll', duration:.66, speed:5.4, pitch:1,  side:0  },
  { direction:'forwardRight',    key:'dodgeRollForwardRight',  kind:'roll', duration:.68, speed:5.2, pitch:1,  side:1  },
  { direction:'right',           key:'dodgeStepRight',         kind:'step', duration:.44, speed:6.3, pitch:0,  side:1  },
  { direction:'backwardRight',   key:'dodgeRollBackwardRight', kind:'roll', duration:.72, speed:5.0, pitch:-1, side:1  },
  { direction:'backward',        key:'dodgeRollBackward',      kind:'roll', duration:.72, speed:5.0, pitch:-1, side:0  },
  { direction:'backwardLeft',    key:'dodgeRollBackwardLeft',  kind:'roll', duration:.72, speed:5.0, pitch:-1, side:-1 },
  { direction:'left',            key:'dodgeStepLeft',          kind:'step', duration:.44, speed:6.3, pitch:0,  side:-1 },
  { direction:'forwardLeft',     key:'dodgeRollForwardLeft',   kind:'roll', duration:.68, speed:5.2, pitch:1,  side:-1 },
].map(entry=>Object.freeze(entry)));

// R with A/D is a true side roll rather than a sidestep. The regular dodge
// set still contains exactly eight directions (and two side-step animations).
export const SIDE_ROLL_VARIANTS = Object.freeze([
  Object.freeze({ direction:'left',  key:'dodgeRollLeft',  kind:'sideRoll', duration:.68, speed:4.8, pitch:0, side:-1 }),
  Object.freeze({ direction:'right', key:'dodgeRollRight', kind:'sideRoll', duration:.68, speed:4.8, pitch:0, side:1 }),
]);
export const EIGHT_WAY_DODGE_BY_DIRECTION = Object.freeze(
  Object.fromEntries(EIGHT_WAY_DODGE_MOVES.map(entry=>[entry.direction,entry])));
export const SIDE_ROLL_BY_DIRECTION = Object.freeze(
  Object.fromEntries(SIDE_ROLL_VARIANTS.map(entry=>[entry.direction,entry])));

export function dodgeDirectionFromAxes(forward=0,sideways=0,defaultDirection='forward') {
  const f=Math.sign(Number(forward)||0), s=Math.sign(Number(sideways)||0);
  if(f>0) return s<0?'forwardLeft':s>0?'forwardRight':'forward';
  if(f<0) return s<0?'backwardLeft':s>0?'backwardRight':'backward';
  if(s<0) return 'left';
  if(s>0) return 'right';
  return EIGHT_WAY_DODGE_BY_DIRECTION[defaultDirection] ? defaultDirection : 'forward';
}

export function getEightWayDodgeMove(direction='forward',{roll=false}={}) {
  if(roll && SIDE_ROLL_BY_DIRECTION[direction]) return SIDE_ROLL_BY_DIRECTION[direction];
  return EIGHT_WAY_DODGE_BY_DIRECTION[direction] || EIGHT_WAY_DODGE_BY_DIRECTION.forward;
}

// The state machine guards the entire visual recovery. Existing game balance
// owns the shorter 0.45s invulnerability window; the two timers are not coupled.
export const EIGHT_WAY_DODGE_IFRAMES_SECONDS=.45;
