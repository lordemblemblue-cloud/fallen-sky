// Exact joints inspected from the four supplied, optimized source GLBs.
// Each gets its OWN avatar motion profile. Game 2 still owns input, physics,
// saber/Force logic and network state; this remaps only animated display bones.
// Do not 'copy' the authoritative Fighter: two Fighters would desync health,
// prediction, input, hitboxes and multiplayer.
const make=(id,bones,strength={})=>Object.freeze({
  id,bones:Object.freeze(bones),strength:Object.freeze(strength),
});
export const GAME2_AVATAR_RIG_PROFILES=Object.freeze({
  revan:make('revan',{
    pelvis:'spine_71',spine:'spine.002_55',head:'spine.006_0',
    upperarm_left:'upper_arm.L_24',upperarm_right:'upper_arm.R_47',
    forearm_left:'forearm.L_23',forearm_right:'forearm.R_46',
    hand_left:'hand.L_22',hand_right:'hand.R_45',
    thigh_left:'thigh.L_64',thigh_right:'thigh.R_70',
    shin_left:'shin.L_63',shin_right:'shin.R_69',
  },{pelvis:.55,spine:.70,head:.65}),
  artemis:make('artemis',{
    pelvis:'pelvis_010',spine:'spine_03_013',head:'head_020',
    upperarm_left:'upperarm_l_0168',upperarm_right:'upperarm_r_0218',
    forearm_left:'lowerarm_l_0148',forearm_right:'lowerarm_r_0219',
    hand_left:'hand_l_0170',hand_right:'hand_r_0220',
    thigh_left:'thigh_l_0267',thigh_right:'thigh_r_0280',
    shin_left:'calf_l_0268',shin_right:'calf_r_0281',
  },{pelvis:.44,spine:.52,head:.65,upperarm_left:.75,upperarm_right:.75}),
  atris:make('atris',{
    pelvis:'pelvis_g_06',spine:'torsoUpr_g_016',head:'head_g_043',
    upperarm_left:'lbicep_g_022',upperarm_right:'rbicep_g_069',
    forearm_left:'lforearm_g_024',forearm_right:'rforearm_g_071',
    hand_left:'lhand_g_026',hand_right:'rhand_g_072',
    thigh_left:'lthigh_g_07',thigh_right:'rthigh_g_011',
    shin_left:'lshin_g_08',shin_right:'rshin_g_012',
  },{pelvis:.45,spine:.65,upperarm_left:.80,upperarm_right:.80}),
  'visas-marr':make('visas-marr',{
    pelvis:'pelvis_g_06',spine:'torsoUpr_g_016',head:'head_g_041',
    upperarm_left:'lbicep_g_022',upperarm_right:'rbicep_g_061',
    forearm_left:'lforearm_g_024',forearm_right:'rforearm_g_063',
    hand_left:'lhand_g_026',hand_right:'rhand_g_064',
    thigh_left:'lthigh_g_07',thigh_right:'rthigh_g_011',
    shin_left:'lshin_g_08',shin_right:'rshin_g_012',
  },{pelvis:.45,spine:.65,upperarm_left:.80,upperarm_right:.80}),
});
export const GAME2_RIG_REQUIRED_ROLES=Object.freeze([
 'pelvis','spine','upperarm_left','upperarm_right','forearm_left','forearm_right',
 'thigh_left','thigh_right','shin_left','shin_right',
]);
export function game2RigProfile(id){return GAME2_AVATAR_RIG_PROFILES[id]||null;}
export function matchGame2RigBones(root,id){
  const profile=game2RigProfile(id);
  if(!profile)throw Error('Missing authored character rig profile for '+id);
  const byName=new Map();
  root.traverse(obj=>{if(obj.isBone)byName.set(obj.name,obj);});
  const bones=new Map(),missing=[];
  for(const [role,name]of Object.entries(profile.bones)){
    const bone=byName.get(name);
    if(bone)bones.set(role,{bone,rest:bone.quaternion.clone()});
    else if(GAME2_RIG_REQUIRED_ROLES.includes(role))missing.push(role+':'+name);
  }
  if(missing.length)throw Error('Character model skeleton missing required joints: '+missing.join(', '));
  return {profile,bones};
}
