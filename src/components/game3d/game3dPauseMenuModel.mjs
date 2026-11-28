// Pure Game 3D Escape-menu navigation contract; no React, DOM or Game 2 code.
// The MMO's live world is never stopped by the UI. Only local gameplay input
// is suppressed while the player's menu is visible.
export const GAME3D_PAUSE_SECTIONS=Object.freeze([
  {id:'overview',label:'Main Menu',description:'Return to your adventure'},
  {id:'services',label:'Services',description:'Open profession and progression workspaces'},
  {id:'scoreboard',label:'Ranked',description:'Live world session and match results'},
  {id:'audio',label:'Audio',description:'Theme volume'},
  {id:'controls',label:'Controls',description:'Movement and interactions'},
  {id:'graphics',label:'Graphics',description:'Rendering and art style'},
  {id:'ui',label:'UI',description:'Resize, move HUD boxes and choose weapon layouts'},
  {id:'community',label:'HUD & Community',description:'Chat, Echo, online players and interface size'},
  {id:'session',label:'Session',description:'Character and account'},
]);
const sections=new Set(GAME3D_PAUSE_SECTIONS.map(s=>s.id));
export function game3dPauseSection(value){
  return sections.has(value)?value:'overview';
}
export function game3dPauseEscape(view,confirmAction=null){
  // ESC cancels dangerous logout/exit confirmation before any other action.
  if(confirmAction)return {close:false,view:game3dPauseSection(view),confirmAction:null};
  if(game3dPauseSection(view)!=='overview')
    return {close:false,view:'overview',confirmAction:null};
  return {close:true,view:'overview',confirmAction:null};
}
export function game3dPauseGraphicsDefaults(raw){
  const value=raw&&typeof raw==='object'?raw:{};
  return {
    ...value,
    artStyle:['original','ink'].includes(value.artStyle)?value.artStyle:'original',
    inkPalette:value.inkPalette==='classic'?'classic':'vibrant',
    quality:['low','medium','high','ultra'].includes(value.quality)?value.quality:'low',
    shadows:typeof value.shadows==='boolean'?value.shadows:false,
    fpsCap:[30,60,120,144].includes(value.fpsCap)?value.fpsCap:60,
  };
}


// Retired Ultra-Sumi settings migrate safely to Classic without automatically
// enabling a costly shader. Preserve a player's other explicit choices.
export function activateCloneUltraWorldGraphics(storage=globalThis.localStorage){
  let old=null;
  try{old=JSON.parse(storage?.getItem?.('game_graphics_settings')||'null');}
  catch{old=null;}
  const result=game3dPauseGraphicsDefaults(old);
  try{if(old?.artStyle==='atomic-ultra-sumi')
    storage?.setItem?.('game_graphics_settings',JSON.stringify(result));}
  catch{/* Restricted storage: the runtime still uses the safe defaults. */}
  return result;
}
