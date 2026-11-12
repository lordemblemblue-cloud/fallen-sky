// Match the actor's own clips before consulting optional uploaded FBXs. Keep
// the authored tracks and names intact: their bindings belong to this rig.
const normalized = (name = '') => String(name).toLowerCase().replace(/[^a-z0-9]/g, '');

const NATIVE_CLIP_NAMES = {
  idle: ['Stand', 'Idle', 'Unarmed_Idle'],
  // Current Adam/Eve bodies have a calm Stand and a longer living Idle with
  // stretches/yawns. Explicit AFK clips take priority when a future body has one.
  afk: ['AFK', 'Idle_AFK', 'Away_From_Keyboard', 'Idle'],
  walk: ['Walk', 'Walk_Forward', 'Walking'],
  run: ['Run', 'Run_Forward', 'Running'],
  sprint: ['Sprint', 'Sprint_Forward'],
  runBack: ['Run_Back', 'Run_Backward', 'Running_Backward'],
  combatIdle: ['Combat_Idle', 'Bow_Idle', 'Aim_Idle'],
  drawArrow: ['Bow_Draw', 'Draw_Arrow'],
  dodgeLeft: ['Dodge_Left', 'DodgeLeft'],
  dodgeRight: ['Dodge_Right', 'DodgeRight'],
  dodgeForward: ['Dodge_Forward', 'DodgeForward'],
  dodgeBackward: ['Dodge_Backward', 'DodgeBackward'],
  jumpStart: ['Jump_Start', 'JumpStart', 'Jump'],
  jumpLoop: ['Jump_Loop', 'JumpLoop'],
  jumpLand: ['Jump_Land', 'JumpLand'],
  roll: ['Front_Roll', 'Roll_Forward', 'Roll'],
};

export const PLAYER_AFK_DELAY_SECONDS = 15;

export function nativePlayerAnimationClips(target) {
  const clips = target?.animations || [];
  const result = {};
  for (const [key, names] of Object.entries(NATIVE_CLIP_NAMES)) {
    const clip = names.map(name => clips.find(candidate =>
      normalized(candidate.name) === normalized(name) && candidate.tracks?.length,
    )).find(Boolean);
    if (clip) result[key] = clip;
  }
  return result;
}
