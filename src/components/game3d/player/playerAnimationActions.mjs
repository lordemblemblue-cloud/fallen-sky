// One canonical action per uploaded file. The same descriptors drive baking,
// runtime selection and filename/command aliases, so none of the 39 motions is
// silently collapsed into another action.
export const UPLOADED_PLAYER_ACTIONS = Object.freeze([
  { key: 'fallLoop', fileName: 'fall a loop.fbx', loop: true },
  { key: 'landRun', fileName: 'fall a land to run forward.fbx' },
  { key: 'landIdle', fileName: 'fall a land to standing idle 01.fbx' },
  { key: 'aimRecoil', fileName: 'standing aim recoil.fbx' },
  { key: 'aimOverdraw', fileName: 'standing aim overdraw.fbx', loop: true },
  { key: 'equipBow', fileName: 'standing equip bow.fbx' },
  { key: 'disarmBow', fileName: 'standing disarm bow.fbx' },
  ...['left', 'right', 'forward', 'backward'].map(direction => ({
    key: `dodge${direction[0].toUpperCase()}${direction.slice(1)}`, fileName: `standing dodge ${direction}.fbx`,
  })),
  { key: 'kick', fileName: 'standing melee kick.fbx' },
  { key: 'punch', fileName: 'standing melee punch.fbx' },
  { key: 'hitReact', fileName: 'standing react small from front.fbx' },
  { key: 'headshotReact', fileName: 'standing react small from headshot.fbx' },
  ...['forward', 'back', 'left', 'right'].map(direction => ({
    key: direction === 'forward' ? 'run' : `run${direction[0].toUpperCase()}${direction.slice(1)}`,
    fileName: `standing run ${direction}.fbx`, loop: true,
  })),
  ...['forward', 'back', 'left', 'right'].map(direction => ({
    key: direction === 'forward' ? 'walk' : `walk${direction[0].toUpperCase()}${direction.slice(1)}`,
    fileName: `standing walk ${direction}.fbx`, loop: true,
  })),
  { key: 'runStop', fileName: 'standing run forward stop.fbx' },
  { key: 'turnLeft', fileName: 'standing turn 90 left.fbx' },
  { key: 'turnRight', fileName: 'standing turn 90 right.fbx' },
  { key: 'block', fileName: 'standing block.fbx', loop: true },
  { key: 'deathForward', fileName: 'standing death forward 01.fbx' },
  { key: 'deathBackward', fileName: 'standing death backward 01.fbx' },
  { key: 'diveForward', fileName: 'standing dive forward.fbx' },
  { key: 'drawArrow', fileName: 'standing draw arrow.fbx' },
  { key: 'idleArmed', fileName: 'standing idle 01.fbx', loop: true },
  { key: 'idleLook', fileName: 'standing idle 02 looking.fbx' },
  { key: 'idleExamine', fileName: 'standing idle 03 examine.fbx' },
  { key: 'idle', fileName: 'unarmed idle 01.fbx', loop: true },
  ...['forward', 'back', 'left', 'right'].map(direction => ({
    key: `aimWalk${direction === 'back' ? 'Backward' : direction[0].toUpperCase() + direction.slice(1)}`,
    fileName: `standing aim walk ${direction}.fbx`, loop: true,
  })),
].map(action => Object.freeze({ ...action, loop: !!action.loop })));

const normalize = name => String(name || '').replace(/^.*[/\\]/, '').replace(/\.fbx$/i, '').toLowerCase().replace(/[^a-z0-9]/g, '');
const aliases = new Map();
for (const action of UPLOADED_PLAYER_ACTIONS) {
  aliases.set(normalize(action.key), action.key);
  aliases.set(normalize(action.fileName), action.key);
}
for (const [name, key] of Object.entries({
  runForward: 'run', walkForward: 'walk', runBackward: 'runBack', walkBackward: 'walkBack',
  'standing aim backwards': 'aimWalkBackward', 'standing aim walk backward': 'aimWalkBackward',
  'running backwards': 'runBack', 'running backward': 'runBack',
  'standing running': 'run', 'run forward': 'run', 'running forward': 'run',
  'standing run stop': 'runStop', 'unarmed idle zero one': 'idle',
  'standing kick': 'kick', 'standing punch': 'punch',
  'standing melee attack': 'meleeAttack', 'standing unarmed punch': 'punch',
  'standing hit reaction': 'hitReact', 'standing hit react': 'hitReact',
  'standing stagger': 'hitReact', 'standing damage reaction': 'hitReact',
  fall: 'fallLoop', land: 'landIdle', death: 'deathForward',
  equip: 'equipBow', disarm: 'disarmBow', recoil: 'aimRecoil', overdraw: 'aimOverdraw',
})) aliases.set(normalize(name), key);

export const PLAYER_IDLE_VARIANTS = Object.freeze(['idleLook', 'idleExamine']);
export const PLAYER_DEATH_ACTIONS = Object.freeze(['deathForward', 'deathBackward']);
export function resolvePlayerAnimationKey(name) {
  return aliases.get(normalize(name)) || String(name || '');
}
export function uploadedPlayerAction(name) {
  const key = resolvePlayerAnimationKey(name);
  return UPLOADED_PLAYER_ACTIONS.find(action => action.key === key) || null;
}
