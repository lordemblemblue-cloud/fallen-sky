// One game, three places it runs: a web browser tab, an installed desktop
// app and a phone or handheld. Each platform keeps its OWN graphics settings
// (quality, shadows, frame cap, 3D resolution, interface size, GPU profile
// and how much of the valley stays loaded), so tuning the phone never
// changes the browser and the other way round.
//
// The renderer keeps reading the same live settings it always has
// (`game_graphics_settings`, `game3d_display_settings_v1` and the GPU profile
// key). This module only decides WHICH platform's saved profile is copied
// into those live settings, and mirrors menu changes back into that profile.
// Pure logic: no React, no Three.js, no rendering.
import {game3dPauseGraphicsDefaults} from '../game3dPauseMenuModel.mjs';
import {
  GAME3D_DISPLAY_SETTINGS_KEY,GAME3D_DISPLAY_SETTINGS_EVENT,
  GAME3D_RENDER_RESOLUTIONS,GAME3D_UI_SCALES,
} from './Game3DDisplaySettings.mjs';
import {CLONE_GPU_PROFILE_KEY,CLONE_GPU_PROFILES} from './AdaptiveGraphics.mjs';
import {WOLFVEIL_AREA_LOADING_MODES} from '../wolfveil/streaming/WolfveilAreaLoader.mjs';

export const GAME3D_PLATFORM_GRAPHICS_KEY='game3d_platform_graphics_v1';
export const GAME3D_PLATFORM_GRAPHICS_EVENT='game3dPlatformGraphicsChanged';
export const GAME3D_GRAPHICS_SETTINGS_KEY='game_graphics_settings';
export const GAME3D_PLATFORMS=Object.freeze([
  Object.freeze({id:'browser',label:'Web browser',
    description:'A browser tab on a desktop or laptop'}),
  Object.freeze({id:'desktop',label:'Desktop app',
    description:'The installed app, outside the browser tab'}),
  Object.freeze({id:'mobile',label:'Mobile',
    description:'Phones, tablets and handhelds'}),
]);
export const GAME3D_PLATFORM_IDS=Object.freeze(GAME3D_PLATFORMS.map(entry=>entry.id));
export const GAME3D_AREA_LOADING_LABELS=Object.freeze({
  single:'One area at a time',
  neighbors:'Area and its neighbours',
  all:'Whole valley',
});

// Starting points. A browser gets native-sharp adaptive resolution that only
// drops under load; the desktop app draws native pixels at top quality; a
// phone renders 720p with the lightest settings. Every platform loads one
// area at a time, because the whole valley is over budget on all of them.
export const GAME3D_PLATFORM_DEFAULTS=Object.freeze({
  browser:Object.freeze({
    graphics:Object.freeze({quality:'high',shadows:true,fpsCap:60}),
    display:Object.freeze({resolution:'auto',uiScale:'auto'}),
    gpuProfile:'auto',areaLoading:'single',preloadMeters:90,releaseGpuMemory:false,
  }),
  desktop:Object.freeze({
    graphics:Object.freeze({quality:'ultra',shadows:true,fpsCap:120}),
    display:Object.freeze({resolution:'native',uiScale:'auto'}),
    gpuProfile:'quality',areaLoading:'single',preloadMeters:140,releaseGpuMemory:false,
  }),
  mobile:Object.freeze({
    graphics:Object.freeze({quality:'low',shadows:false,fpsCap:30}),
    display:Object.freeze({resolution:'720p',uiScale:'auto'}),
    gpuProfile:'performance',areaLoading:'single',preloadMeters:60,releaseGpuMemory:true,
  }),
});

const QUALITIES=['low','medium','high','ultra'];
const FPS_CAPS=[30,60,120,144];
const RESOLUTIONS=GAME3D_RENDER_RESOLUTIONS.map(option=>option.id);
const UI_SCALES=GAME3D_UI_SCALES.map(option=>option.id);
const isPlatform=id=>GAME3D_PLATFORM_IDS.includes(id);
const pick=(value,allowed,fallback)=>allowed.includes(value)?value:fallback;
const clamp=(value,low,high)=>Math.max(low,Math.min(high,value));
const defaultHost=()=>globalThis.window??null;

export function normalizeGame3DPlatformProfile(raw,platform='browser'){
  const base=GAME3D_PLATFORM_DEFAULTS[isPlatform(platform)?platform:'browser'];
  const input=raw&&typeof raw==='object'?raw:{};
  const graphics=input.graphics&&typeof input.graphics==='object'?input.graphics:{};
  const display=input.display&&typeof input.display==='object'?input.display:{};
  const preload=Number(input.preloadMeters);
  return Object.freeze({
    // Art style and ink palette ride along untouched; they are the player's
    // look, and each platform may keep a different one.
    graphics:Object.freeze(game3dPauseGraphicsDefaults({
      ...graphics,
      quality:pick(graphics.quality,QUALITIES,base.graphics.quality),
      shadows:typeof graphics.shadows==='boolean'?graphics.shadows:base.graphics.shadows,
      fpsCap:pick(Number(graphics.fpsCap),FPS_CAPS,base.graphics.fpsCap),
    })),
    display:Object.freeze({
      resolution:pick(display.resolution,RESOLUTIONS,base.display.resolution),
      uiScale:pick(display.uiScale,UI_SCALES,base.display.uiScale),
    }),
    gpuProfile:pick(input.gpuProfile,CLONE_GPU_PROFILES,base.gpuProfile),
    areaLoading:pick(input.areaLoading,WOLFVEIL_AREA_LOADING_MODES,base.areaLoading),
    preloadMeters:Number.isFinite(preload)?clamp(Math.round(preload),30,200):base.preloadMeters,
    releaseGpuMemory:typeof input.releaseGpuMemory==='boolean'
      ?input.releaseGpuMemory:base.releaseGpuMemory,
  });
}

// Which platform is this? `?platform=mobile|desktop|browser` forces one for
// testing. A phone or handheld wins over "installed app", because an
// installed app on a phone is still a phone.
export function detectGame3DPlatform(host=defaultHost()){
  try{
    const forced=new globalThis.URLSearchParams(host?.location?.search||'').get('platform');
    if(isPlatform(forced))return forced;
  }catch{/* no query string */}
  const width=Number(host?.innerWidth)||1280,height=Number(host?.innerHeight)||720;
  const match=query=>{
    try{return Boolean(host?.matchMedia?.(query)?.matches);}catch{return false;}
  };
  const agent=String(host?.navigator?.userAgent||'');
  const coarse=match('(any-pointer: coarse)')||(Number(host?.navigator?.maxTouchPoints)||0)>0;
  const handheld=Math.min(width,height)<700||(coarse&&width<=1450&&height<=1000)||
    /Android|iPhone|iPad|iPod|Mobile/i.test(agent);
  if(handheld)return 'mobile';
  const installed=match('(display-mode: standalone)')||
    match('(display-mode: window-controls-overlay)')||
    /Electron|Tauri/i.test(agent)||Boolean(host?.__TAURI__||host?.electronAPI);
  return installed?'desktop':'browser';
}

function readJSON(host,key){
  try{return JSON.parse(host?.localStorage?.getItem(key)||'null');}
  catch{return null;}
}
function writeJSON(host,key,value){
  try{host?.localStorage?.setItem(key,JSON.stringify(value));return true;}
  catch{return false;} // private browsing: the in-session value still applies
}
// The settings the renderer is using right now, exactly as the menu saved them.
function readLiveSettings(host){
  const graphics=readJSON(host,GAME3D_GRAPHICS_SETTINGS_KEY);
  const display=readJSON(host,GAME3D_DISPLAY_SETTINGS_KEY);
  let gpuProfile=null;
  try{gpuProfile=host?.localStorage?.getItem(CLONE_GPU_PROFILE_KEY)||null;}catch{gpuProfile=null;}
  return {
    graphics:graphics&&typeof graphics==='object'?graphics:null,
    display:display&&typeof display==='object'?display:null,
    gpuProfile,
  };
}

export function readGame3DPlatformGraphics(host=defaultHost()){
  const saved=readJSON(host,GAME3D_PLATFORM_GRAPHICS_KEY);
  const detected=detectGame3DPlatform(host);
  const selected=saved&&(saved.selected==='auto'||isPlatform(saved.selected))
    ?saved.selected:'auto';
  const stored=saved?.profiles&&typeof saved.profiles==='object'?saved.profiles:{};
  const profiles=Object.freeze(Object.fromEntries(GAME3D_PLATFORM_IDS.map(id=>
    [id,normalizeGame3DPlatformProfile(stored[id],id)])));
  const active=selected==='auto'?detected:selected;
  return Object.freeze({
    firstRun:!saved,selected,detected,active,profiles,profile:profiles[active],
  });
}
function persist(host,selected,profiles){
  writeJSON(host,GAME3D_PLATFORM_GRAPHICS_KEY,{version:1,selected,profiles});
}
export function activeGame3DPlatformProfile(host=defaultHost()){
  const state=readGame3DPlatformGraphics(host);
  return {platform:state.active,profile:state.profile};
}

// Copy a platform profile into the live settings the renderer reads. With
// `announce` the existing change events fire, so an already running world
// applies the new values straight away.
export function applyGame3DPlatformProfile(platform,profile,{host=defaultHost(),announce=true}={}){
  const clean=normalizeGame3DPlatformProfile(profile,platform);
  const previous=readJSON(host,GAME3D_GRAPHICS_SETTINGS_KEY);
  const graphics=game3dPauseGraphicsDefaults({
    ...(previous&&typeof previous==='object'?previous:{}),...clean.graphics});
  writeJSON(host,GAME3D_GRAPHICS_SETTINGS_KEY,graphics);
  writeJSON(host,GAME3D_DISPLAY_SETTINGS_KEY,clean.display);
  try{host?.localStorage?.setItem(CLONE_GPU_PROFILE_KEY,clean.gpuProfile);}catch{/* blocked */}
  if(announce){
    const EventType=host?.CustomEvent||globalThis.CustomEvent;
    const send=(type,detail)=>{
      try{if(EventType)host?.dispatchEvent?.(new EventType(type,{detail}));}
      catch{/* a blocked UI event must not stop the game */}
    };
    send('graphicsSettingsChanged',graphics);
    send(GAME3D_DISPLAY_SETTINGS_EVENT,clean.display);
    host?.__axe3dCloneGovernor?.setProfile?.(clean.gpuProfile);
    send('game3dCloneGPUProfileChanged',{profile:clean.gpuProfile});
    send(GAME3D_PLATFORM_GRAPHICS_EVENT,{platform,profile:clean});
  }
  return {platform,profile:clean,graphics};
}

// Run once before the world reads its settings. First run on a device: the
// detected platform's profile is created from that platform's defaults, but
// anything the player had already chosen on this device is kept. Later runs
// copy the active platform's profile back in, which matters when the same
// device opens the game both in a tab and as the installed app.
export function bootGame3DPlatformGraphics(host=defaultHost()){
  const state=readGame3DPlatformGraphics(host);
  if(!state.firstRun){
    applyGame3DPlatformProfile(state.active,state.profile,{host,announce:false});
    return {platform:state.active,profile:state.profile,firstRun:false};
  }
  const live=readLiveSettings(host);
  const base=GAME3D_PLATFORM_DEFAULTS[state.active];
  const seeded=normalizeGame3DPlatformProfile({
    ...base,
    graphics:{...base.graphics,...(live.graphics||{})},
    display:{...base.display,...(live.display||{})},
    gpuProfile:live.gpuProfile||base.gpuProfile,
  },state.active);
  // The look (art style, ink palette) carries over to the other platforms.
  const look=live.graphics?{artStyle:live.graphics.artStyle,inkPalette:live.graphics.inkPalette}:{};
  const profiles=Object.fromEntries(GAME3D_PLATFORM_IDS.map(id=>[id,id===state.active?seeded
    :normalizeGame3DPlatformProfile({...GAME3D_PLATFORM_DEFAULTS[id],
      graphics:{...GAME3D_PLATFORM_DEFAULTS[id].graphics,...look}},id)]));
  persist(host,'auto',profiles);
  applyGame3DPlatformProfile(state.active,seeded,{host,announce:false});
  return {platform:state.active,profile:seeded,firstRun:true};
}

// The menu changed one setting: remember it for the platform in use only.
export function rememberGame3DPlatformSetting(patch,host=defaultHost()){
  const state=readGame3DPlatformGraphics(host);
  const input=patch&&typeof patch==='object'?patch:{};
  const current=state.profile;
  const next=normalizeGame3DPlatformProfile({
    ...current,...input,
    graphics:{...current.graphics,...(input.graphics||{})},
    display:{...current.display,...(input.display||{})},
  },state.active);
  persist(host,state.selected,{...state.profiles,[state.active]:next});
  if('areaLoading' in input||'preloadMeters' in input||'releaseGpuMemory' in input){
    const EventType=host?.CustomEvent||globalThis.CustomEvent;
    try{
      if(EventType)host?.dispatchEvent?.(new EventType(GAME3D_PLATFORM_GRAPHICS_EVENT,
        {detail:{platform:state.active,profile:next}}));
    }catch{/* the saved value still stands */}
  }
  return {platform:state.active,profile:next};
}

// The player picked a platform profile (or Auto). Its saved settings become
// the live ones; the profile they were using is left exactly as it was.
export function selectGame3DPlatform(selected,host=defaultHost()){
  const state=readGame3DPlatformGraphics(host);
  const choice=selected==='auto'||isPlatform(selected)?selected:'auto';
  persist(host,choice,state.profiles);
  const active=choice==='auto'?state.detected:choice;
  const applied=applyGame3DPlatformProfile(active,state.profiles[active],{host,announce:true});
  return {selected:choice,detected:state.detected,active,profile:applied.profile,
    graphics:applied.graphics};
}
