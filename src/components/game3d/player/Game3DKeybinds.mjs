// Player-editable physical bindings for the Game 3D service shortcuts and
// essential movement actions. This is a client preference only; it never
// grants permissions or changes server-authoritative combat behavior.
export const GAME3D_KEYBINDS_STORAGE_KEY = 'game3d_keybinds_v1';
export const GAME3D_BINDING_DEFINITIONS = Object.freeze([
  {id:'moveForward',label:'Move forward',code:'KeyW',kind:'gameplay',value:'w'},
  {id:'moveBackward',label:'Move backward',code:'KeyS',kind:'gameplay',value:'s'},
  {id:'moveLeft',label:'Move left',code:'KeyA',kind:'gameplay',value:'a'},
  {id:'moveRight',label:'Move right',code:'KeyD',kind:'gameplay',value:'d'},
  {id:'jump',label:'Jump / flight',code:'Space',kind:'gameplay',value:' '},
  {id:'interact',label:'Interact',code:'KeyE',kind:'gameplay',value:'e'},
  {id:'roll',label:'Roll / dodge',code:'KeyR',kind:'gameplay',value:'r'},
  {id:'crouch',label:'Crouch',code:'KeyQ',kind:'gameplay',value:'q'},
  {id:'appearance',label:'Appearance',code:'KeyI',kind:'menu'},
  {id:'character',label:'Character',code:'KeyC',kind:'menu'},
  {id:'quest_logbook',label:'Questbook',code:'KeyL',kind:'menu'},
  {id:'skills',label:'Skill Book',code:'KeyK',kind:'menu'},
  {id:'companion',label:'Companion',code:'KeyP',kind:'menu'},
  {id:'map',label:'Map',code:'KeyM',kind:'menu'},
  {id:'spiritual',label:'Spirituality',code:'KeyJ',kind:'menu'},
  {id:'blacksmith',label:'Blacksmith',code:'Equal',kind:'menu'},
]);
export const GAME3D_DEFAULT_KEYBINDS = Object.freeze(Object.fromEntries(
  GAME3D_BINDING_DEFINITIONS.map(binding=>[binding.id,binding.code])));

// Leave game/system-critical controls (ESC, Tab, F mount/kick, G clan,
// Z/X/V/B companion, numbers/abilities, Shift/Control/Alt) unmapped for now.
// Shift+C weapon-role cycling and all modifier shortcuts remain untouched.
const bindable = code => code==='Space'||code==='Equal'||
  (/^Key[A-Z]$/.test(code) && !['KeyF','KeyG','KeyV','KeyB','KeyZ','KeyX'].includes(code));

export const game3dCanBindCode = bindable;

export function normalizeGame3DKeybinds(candidate) {
  const defaults={...GAME3D_DEFAULT_KEYBINDS};
  if (!candidate||typeof candidate!=='object'||Array.isArray(candidate))return defaults;
  const next={...defaults};
  // A saved layout is accepted only if all bindings are individually valid
  // and unique; otherwise reset to a known, playable mapping.
  for(const def of GAME3D_BINDING_DEFINITIONS){
    const code=candidate[def.id]??def.code;
    if(typeof code!=='string'||!bindable(code))return defaults;
    next[def.id]=code;
  }
  if(new Set(Object.values(next)).size!==Object.keys(next).length)return defaults;
  return next;
}
export function readGame3DKeybinds(storage=typeof localStorage==='undefined'?null:localStorage) {
  try { return normalizeGame3DKeybinds(JSON.parse(storage?.getItem?.(GAME3D_KEYBINDS_STORAGE_KEY)||'null')); }
  catch { return {...GAME3D_DEFAULT_KEYBINDS}; }
}
export function rebindGame3DAction(current,action,code) {
  if(!GAME3D_DEFAULT_KEYBINDS[action])return {ok:false,reason:'unknown-action'};
  if(!bindable(code))return {ok:false,reason:'reserved-key'};
  const previous=normalizeGame3DKeybinds(current);
  const occupied=Object.keys(previous).find(id=>id!==action&&previous[id]===code);
  if(occupied)return {ok:false,reason:'in-use',occupied};
  return {ok:true,bindings:{...previous,[action]:code}};
}
export function saveGame3DKeybinds(bindings,storage=typeof localStorage==='undefined'?null:localStorage) {
  const normalized=normalizeGame3DKeybinds(bindings);
  try {storage?.setItem?.(GAME3D_KEYBINDS_STORAGE_KEY,JSON.stringify(normalized));}
  catch {/* incognito/browser quota: live settings can still work for this view */}
  return normalized;
}
export function game3dBindingLabel(code) {
  return code==='Space'?'SPACE':code==='Equal'?'=':
    code?.startsWith('Key')?code.slice(3):code||'—';
}
export function game3dActionForCode(code,bindings=readGame3DKeybinds()) {
  return GAME3D_BINDING_DEFINITIONS.find(def=>bindings[def.id]===code)||null;
}
