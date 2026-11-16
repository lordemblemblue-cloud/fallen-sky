// Three independently trainable companion roles. Training XP comes from
// eligible combat participation after a companion's first growth cap.
// The selected player weapon role determines which trained path is effective.
export const COMPANION_MASTERY_PATHS = Object.freeze([
  Object.freeze({id:'damage', label:'Damage', description:'Increases the companion contribution to physical and attribute attack.', stats:['damage','attributionAttack']}),
  Object.freeze({id:'defense', label:'Defense', description:'Increases health and defensive bonuses from the companion.', stats:['hp','defense','attributionDefense']}),
  Object.freeze({id:'range', label:'Range', description:'Increases the companion contribution to ranged attack and precision.', stats:['damage','attributionAttack','critChance']}),
]);
export const COMPANION_MASTERY_MAX_RANK=10;
export const COMPANION_MASTERY_RANK_XP=Object.freeze([0,60,150,300,500,750,1050,1400,1800,2250,2750]);
const safeXP=x=>Math.max(0,Math.min(1e9,Math.floor(Number(x)||0)));
export function normalizeCompanionMasteryRole(role) {
  const id=String(role||'').toLowerCase();
  return id==='ranged'||id==='range'?'range':id==='defensive'||id==='defense'?'defense':'damage';
}
export function normalizeCompanionRoleMastery(raw) {
  const source=raw&&typeof raw==='object'?raw:{};
  return Object.fromEntries(COMPANION_MASTERY_PATHS.map(({id})=>[
    id,{xp:safeXP(typeof source[id]==='number'?source[id]:source[id]?.xp)},
  ]));
}
export function getCompanionMasteryRank(xp) {
  let rank=0;
  for(let i=1;i<COMPANION_MASTERY_RANK_XP.length;i++) {
    if(safeXP(xp)>=COMPANION_MASTERY_RANK_XP[i])rank=i;
  }
  return rank;
}
export function getCompanionMasteryProgress(mount,role) {
  const id=normalizeCompanionMasteryRole(role);
  const xp=normalizeCompanionRoleMastery(mount?.roleMastery)[id].xp;
  const rank=getCompanionMasteryRank(xp);
  const start=COMPANION_MASTERY_RANK_XP[rank];
  const target=COMPANION_MASTERY_RANK_XP[Math.min(COMPANION_MASTERY_MAX_RANK,rank+1)];
  return {role:id,rank,xp,nextXp:rank===COMPANION_MASTERY_MAX_RANK?null:target,
    percent:rank===COMPANION_MASTERY_MAX_RANK?100:
      Math.max(0,Math.min(100,(xp-start)/Math.max(1,target-start)*100))};
}
export function awardCompanionRoleMasteryXP(mount,amount,role) {
  if(!mount||amount<=0||!Number.isFinite(Number(amount)))return mount;
  const id=normalizeCompanionMasteryRole(role);
  const source=normalizeCompanionRoleMastery(mount.roleMastery);
  const next=Math.min(COMPANION_MASTERY_RANK_XP.at(-1),source[id].xp+safeXP(amount));
  return {...mount,roleMastery:{...source,[id]:{xp:next}}};
}
// Rank bonuses are percentages of the companion's earned BASE contribution,
// never global player multipliers; no free weapon buffs or cross-role stacking.
export function applyCompanionRoleBonus(base,mount,role) {
  const id=normalizeCompanionMasteryRole(role);
  const progress=getCompanionMasteryProgress(mount,id);
  if(!base||progress.rank===0)return {...base};
  const rate=progress.rank*0.02;
  const keys=COMPANION_MASTERY_PATHS.find(path=>path.id===id).stats;
  return Object.fromEntries(Object.entries(base).map(([key,value])=>
    [key,keys.includes(key)&&Number.isFinite(Number(value))
      ? Math.round(Number(value)*(1+rate)*100)/100:value]));
}
