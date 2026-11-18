// Boss Way selection is a menu concern. Both variants use the same existing
// Game 2 boss arena; neither is routed through a multiplayer lobby or a mock UI.
export const BOSS_WAY_CHOICES = Object.freeze({
  rancor: Object.freeze({
    id:'rancor', label:'Rancor', choice:'boss_way_preview',
    title:'The Rancor', description:'Claw sweeps, shockwave slams, crushing grabs and terrifying roars.',
    // An original Rancor mesh is optional. Until one is supplied, the existing
    // stylized proxy is explicitly disclosed and this mode has no rewards.
    requiresPrivateModel:false,
  }),
  dragon: Object.freeze({
    id:'dragon', label:'Dragon', choice:'boss_way',
    title:'The Infernal Dragon', description:'Animated fire breath, wing attacks, aerial landings, lethal claw crushes and summoning whelps.',
    requiresPrivateModel:true,
  }),
});
export function bossWayChoice(id) {
  if (!Object.hasOwn(BOSS_WAY_CHOICES,id)) throw new Error('Invalid Boss Way selection: '+id);
  return BOSS_WAY_CHOICES[id];
}
export function bossWayVariantForSession(choice) {
  switch(choice) {
    case 'boss_way_preview': return 'rancor';
    case 'boss_way': return 'dragon';
    default: return null;
  }
}
