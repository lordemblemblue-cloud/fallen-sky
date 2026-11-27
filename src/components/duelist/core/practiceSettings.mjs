// Shared allowlist for preferences, UI and authoritative match settings.
export const PRACTICE_OPTIONS = Object.freeze([
  ['unlimitedGold','Unlimited gold','Buy and sell equipment without a gold limit.',true],
  ['noCooldowns','No ability cooldowns','Repeat class abilities; normal animation and target rules still apply.',true],
  ['unlimitedUltimate','Unlimited ultimate','Keep the ultimate meter charged.',true],
  ['unlimitedWill','Unlimited Will / Force','Restore Will between simulation ticks.',true],
  ['unlimitedStamina','Unlimited stamina','Restore stamina between simulation ticks.',false],
  ['autoHeal','Automatic health restoration','Restore health while alive; lethal attacks still defeat you.',false],
  ['instantRespawn','Fast respawn','Respawn as soon as the arena has a safe spawn available.',false],
]);
export const PRACTICE_DEFAULTS = Object.freeze(Object.fromEntries(PRACTICE_OPTIONS.map(([id,,,value])=>[id,value])));
export function cleanPracticeSettings(raw) {
  return Object.fromEntries(PRACTICE_OPTIONS.map(([id,,,value])=>[id,typeof raw?.[id]==='boolean'?raw[id]:value]));
}
export function validPracticeOption(id, value) {
  return typeof id==='string' && Object.hasOwn(PRACTICE_DEFAULTS,id) && typeof value==='boolean';
}
