// Game 3D only: logical CSS viewport and WebGL drawing-buffer resolution are
// deliberately independent. Changing renderer pixel ratio never stretches UI,
// changes camera FOV, alters hitboxes, or changes the operating system display.
export const GAME3D_DISPLAY_SETTINGS_KEY = 'game3d_display_settings_v1';
export const GAME3D_DISPLAY_SETTINGS_EVENT = 'game3dDisplaySettingsChanged';
export const GAME3D_RENDER_RESOLUTIONS = Object.freeze([
  {id:'auto',label:'Adaptive'},
  {id:'720p',label:'720p'},
  {id:'900p',label:'900p'},
  {id:'1080p',label:'1080p'},
  {id:'1440p',label:'1440p'},
  {id:'native',label:'Native pixels'},
]);
export const GAME3D_UI_SCALES = Object.freeze([
  {id:'auto',label:'Auto fit'},
  {id:'compact',label:'Compact'},
  {id:'standard',label:'Standard'},
  {id:'large',label:'Large'},
]);
const resolutionSet=new Set(GAME3D_RENDER_RESOLUTIONS.map(o=>o.id));
const uiSet=new Set(GAME3D_UI_SCALES.map(o=>o.id));
const OUTPUT_HEIGHT=Object.freeze({'720p':720,'900p':900,'1080p':1080,'1440p':1440});
const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
export const GAME3D_MAX_RENDER_PIXELS = 8_300_000;
export const GAME3D_MAX_RENDER_RATIO = 3;
export const GAME3D_MAX_RENDER_TEXTURE_SIZE = 8192;

export function normalizeGame3DDisplaySettings(raw) {
  const input=raw&&typeof raw==='object'?raw:{};
  return Object.freeze({
    resolution:resolutionSet.has(input.resolution)?input.resolution:'auto',
    uiScale:uiSet.has(input.uiScale)?input.uiScale:'auto',
  });
}
// A mobile/handheld distribution can ship a default *internal render
// resolution* without forcing the OS screen mode or preventing players from
// selecting another preset in Settings. Set VITE_GAME3D_MOBILE_DEFAULT_RESOLUTION
// to e.g. 720p in that distribution's build environment.
export function publishedGame3DDisplayDefaults(host=null,buildEnv={}) {
  const width=Number(host?.innerWidth)||1280;
  const height=Number(host?.innerHeight)||720;
  const coarse=Boolean(host?.matchMedia?.('(any-pointer: coarse)')?.matches)||
    (Number(host?.navigator?.maxTouchPoints)||0)>0;
  const isLandscape=width>height;
  const shortSide=Math.min(width,height);
  const handheld=shortSide<700||
    (coarse&&width<=1600&&height<=1100);
  // Mobile/handheld builds may set VITE_GAME3D_MOBILE_DEFAULT_RESOLUTION (e.g. 720p)
  // so high-DPI small screens start with lower internal resolution. Players can always override.
  // Landscape phones get compact UI by default so controls fit the short screen.
  const chosen=handheld?(buildEnv?.VITE_GAME3D_MOBILE_DEFAULT_RESOLUTION||'auto'):'auto';
  return normalizeGame3DDisplaySettings({
    resolution:chosen,uiScale:handheld?'compact':'auto',
  });
}
export function readGame3DDisplaySettings(
  host=typeof window!=='undefined'?window:null,
  buildEnv=import.meta.env||{},
) {
  const defaults=publishedGame3DDisplayDefaults(host,buildEnv);
  try {
    const raw=host?.localStorage?.getItem(GAME3D_DISPLAY_SETTINGS_KEY);
    if(!raw) return defaults;
    return normalizeGame3DDisplaySettings({...defaults,...JSON.parse(raw)});
  } catch {
    return defaults;
  }
}
export function saveGame3DDisplaySettings(next,host=typeof window!=='undefined'?window:null) {
  const settings=normalizeGame3DDisplaySettings(next);
  try { host?.localStorage?.setItem(GAME3D_DISPLAY_SETTINGS_KEY,JSON.stringify(settings)); } catch {}
  host?.dispatchEvent?.(new CustomEvent(GAME3D_DISPLAY_SETTINGS_EVENT,{detail:settings}));
  return settings;
}
export function getGame3DUIScale({uiScale='auto',width=1280,height=720}={}) {
  if(uiScale==='compact')return .9;
  if(uiScale==='large')return 1.15;
  if(uiScale==='standard')return 1;
  // auto: slightly tighter on narrow phones so HUD fits landscape
  if(Math.min(width,height)<480) return .85;
  if(width<680) return .95;
  return 1;
}
export function game3DViewportClass({width=1280,height=720}={}) {
  const min=Math.min(width,height);
  if(min<=480) return 'phone';
  if(width<=980||height<=600)return 'handheld';
  return 'desktop';
}
const valid=(n,fallback)=>Number.isFinite(Number(n))&&Number(n)>0?Number(n):fallback;
// Framebuffer cap applies to auto, fixed resolutions, and native; unlike a
// CSS scale this preserves correct aspect ratios on ultrawide displays.
export function game3DResolutionTarget({
  resolution='auto',viewportWidth=1280,viewportHeight=720,devicePixelRatio=1,
  autoRatio=1,maxPixels=GAME3D_MAX_RENDER_PIXELS,
  maxTextureSize=GAME3D_MAX_RENDER_TEXTURE_SIZE,
}={}) {
  const width=Math.max(1,Math.round(valid(viewportWidth,1280)));
  const height=Math.max(1,Math.round(valid(viewportHeight,720)));
  const dpr=clamp(valid(devicePixelRatio,1),.5,8);
  const textureLimit=clamp(valid(maxTextureSize,GAME3D_MAX_RENDER_TEXTURE_SIZE),256,GAME3D_MAX_RENDER_TEXTURE_SIZE);
  const pixelLimit=valid(maxPixels,GAME3D_MAX_RENDER_PIXELS);
  const safeCeiling=Math.max(.25,Math.min(
    GAME3D_MAX_RENDER_RATIO,textureLimit/width,textureLimit/height,
    Math.sqrt(pixelLimit/(width*height))));
  const mode=resolutionSet.has(resolution)?resolution:'auto';
  const requested=mode==='auto'?valid(autoRatio,1):
    mode==='native'?dpr:OUTPUT_HEIGHT[mode]/height;
  // Explicit 1440p on 800px Steam Deck can supersample. On high-DPI phones,
  // 720p cuts GPU work without making the interactive interface tiny.
  const ratio=clamp(requested,.25,safeCeiling);
  const actualWidth=Math.max(1,Math.floor(width*ratio));
  const actualHeight=Math.max(1,Math.floor(height*ratio));
  return Object.freeze({
    mode,ratio,requestedRatio:requested,limited:ratio+1e-6<requested,
    width:actualWidth,height:actualHeight,
    cssWidth:width,cssHeight:height,
    aspect:width/height,megapixels:(actualWidth*actualHeight)/1_000_000,
  });
}
export function readGame3DRendererViewport(renderer,host=typeof window!=='undefined'?window:null) {
  // The renderer's *CSS parent* owns the display rectangle. The 3D buffer may
  // be 720p/1440p even when that parent is a 390px-wide phone viewport.
  const box=renderer?.domElement?.parentElement?.getBoundingClientRect?.();
  const width=valid(box?.width,valid(renderer?.domElement?.clientWidth,valid(host?.innerWidth,1280)));
  const height=valid(box?.height,valid(renderer?.domElement?.clientHeight,valid(host?.innerHeight,720)));
  return {width,height};
}
