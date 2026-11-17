/**
 * Client-side Game 3D UI preferences. No stats, owned weapons, quests or
 * combat keybinds are stored here. All distances are viewport percentages,
 * so a different monitor or mobile resolution can re-clamp safely.
 */
export const GAME3D_HUD_CUSTOMIZATION_KEY='game3d_hud_customization_v1';
export const GAME3D_HUD_CUSTOMIZATION_EVENT='game3dHudCustomizationChanged';
export const GAME3D_HUD_LAYOUTS=Object.freeze([
  {id:'horizontal',label:'Compact Horizontal',description:'Current compact weapon row above five horizontal skills'},
  {id:'vertical',label:'Concept D · Vertical Weapons',description:'Three weapons stacked vertically on the right; skills run left to right'},
]);
export const GAME3D_HUD_WIDGETS=Object.freeze([
  {id:'combat',label:'Weapon & skill dock',selector:'.jade-hud .jade-combat-concept-d'},
  {id:'weapons',label:'Weapon selector',selector:'.jade-hud .jade-combat-concept-d > .jade-weapon-position'},
  {id:'skills',label:'Skill slots',selector:'.jade-hud .jade-combat-concept-d > .jade-ability-matrix'},
  {id:'vitals',label:'HP · WILL · EXP',selector:'.jade-hud .jade-hud-template'},
  {id:'quest',label:'Quest Logbook',selector:'.jade-hud .jade-quest-tracker'},
  {id:'minimap',label:'World minimap',selector:'.jade-hud .jade-compass-block'},
  {id:'chat',label:'World chat',selector:'.game3d-world-chat'},
]);
const clamp=(n,low,high)=>Math.max(low,Math.min(high,n));
const numberOr=(n,fallback)=>Number.isFinite(Number(n))?Number(n):fallback;
const IDS=new Set(GAME3D_HUD_WIDGETS.map(widget=>widget.id));
const zero=()=>({x:0,y:0,scale:1});
export function defaultGame3DHudCustomization(){
  return {layout:'horizontal',globalScale:1,
    widgets:Object.fromEntries(GAME3D_HUD_WIDGETS.map(({id})=>[id,zero()]))};
}
export function normalizeGame3DHudCustomization(raw){
  const input=raw && typeof raw==='object'?raw:{};
  const widgets={};
  for(const {id} of GAME3D_HUD_WIDGETS){
    const item=input.widgets?.[id];
    widgets[id]={
      x:clamp(numberOr(item?.x,0),-95,95),
      y:clamp(numberOr(item?.y,0),-95,95),
      scale:clamp(numberOr(item?.scale,1),.65,1.5),
    };
  }
  return {
    layout:GAME3D_HUD_LAYOUTS.some(o=>o.id===input.layout)?input.layout:'horizontal',
    globalScale:clamp(numberOr(input.globalScale,1),.7,1.35),
    widgets,
  };
}
export function readGame3DHudCustomization(host=typeof window==='undefined'?null:window){
  try{
    return normalizeGame3DHudCustomization(
      JSON.parse(host?.localStorage?.getItem(GAME3D_HUD_CUSTOMIZATION_KEY)||'null'));
  }catch{return defaultGame3DHudCustomization();}
}
export function saveGame3DHudCustomization(raw,host=typeof window==='undefined'?null:window){
  const saved=normalizeGame3DHudCustomization(raw);
  try{host?.localStorage?.setItem(GAME3D_HUD_CUSTOMIZATION_KEY,JSON.stringify(saved));}
  catch{/* In private mode settings still work for this session via event. */}
  try{
    const C=host?.CustomEvent||(typeof CustomEvent==='undefined'?null:CustomEvent);
    if(C)host?.dispatchEvent?.(new C(GAME3D_HUD_CUSTOMIZATION_EVENT,{detail:saved}));
  }catch{/* Keep controls usable even when external event dispatch is restricted. */}
  return saved;
}
export function changeGame3DHudWidget(settings,id,patch={}){
  const current=normalizeGame3DHudCustomization(settings);
  if(!IDS.has(id))return current;
  return normalizeGame3DHudCustomization({
    ...current,widgets:{
      ...current.widgets,[id]:{...current.widgets[id],...patch},
    },
  });
}
export function resetGame3DHudWidget(settings,id){
  return changeGame3DHudWidget(settings,id,zero());
}
export function changeGame3DHudLayout(settings,layout){
  return normalizeGame3DHudCustomization({...settings,layout});
}
export function clampHudRectTranslation(rect,{x=0,y=0}={},viewport={width:1280,height:720},margin=8){
  // Offsets are fractions of the viewport; never send a saved box completely
  // off-screen. The measured rect already includes CSS and user scale.
  const width=Math.max(1,numberOr(viewport.width,1280));
  const height=Math.max(1,numberOr(viewport.height,720));
  const deltaX=width*clamp(numberOr(x,0),-95,95)/100;
  const deltaY=height*clamp(numberOr(y,0),-95,95)/100;
  const safeX=clamp(deltaX,margin-numberOr(rect?.left,0),
    width-margin-numberOr(rect?.right,0));
  const safeY=clamp(deltaY,margin-numberOr(rect?.top,0),
    height-margin-numberOr(rect?.bottom,0));
  return {x:safeX,y:safeY};
}
