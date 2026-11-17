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
  // Specific 360-degree roles override generated clips only when the avatar
  // actually ships an authored animation for that exact movement.
  dodgeRollForward: ['Dodge_Roll_Forward', 'Roll_Forward', 'Front_Roll'],
  dodgeRollForwardLeft: ['Dodge_Roll_Forward_Left', 'Roll_Forward_Left'],
  dodgeRollForwardRight: ['Dodge_Roll_Forward_Right', 'Roll_Forward_Right'],
  dodgeStepLeft: ['Dodge_Step_Left', 'Side_Step_Left', 'Dodge_Left'],
  dodgeStepRight: ['Dodge_Step_Right', 'Side_Step_Right', 'Dodge_Right'],
  dodgeRollBackwardLeft: ['Dodge_Roll_Backward_Left', 'Roll_Backward_Left'],
  dodgeRollBackward: ['Dodge_Roll_Backward', 'Roll_Backward', 'Back_Roll'],
  dodgeRollBackwardRight: ['Dodge_Roll_Backward_Right', 'Roll_Backward_Right'],
  dodgeRollLeft: ['Dodge_Roll_Left', 'Roll_Left'],
  dodgeRollRight: ['Dodge_Roll_Right', 'Roll_Right'],
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
