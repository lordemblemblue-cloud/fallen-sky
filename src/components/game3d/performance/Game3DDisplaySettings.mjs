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
export function readGame3DDisplaySettings(host=typeof window!=='undefined'?window:null) {
  try {
    return normalizeGame3DDisplaySettings(JSON.parse(
      host?.localStorage?.getItem(GAME3D_DISPLAY_SETTINGS_KEY)||'null'));
  } catch { return normalizeGame3DDisplaySettings(null); }
}
export function saveGame3DDisplaySettings(raw,host=typeof window!=='undefined'?window:null) {
  const settings=normalizeGame3DDisplaySettings(raw);
  try { host?.localStorage?.setItem(GAME3D_DISPLAY_SETTINGS_KEY,JSON.stringify(settings)); }
  catch { /* Browsers may disable local storage; in-session change still works. */ }
  try {
    host?.dispatchEvent?.(new (host.CustomEvent||CustomEvent)(
      GAME3D_DISPLAY_SETTINGS_EVENT,{detail:settings}));
  } catch { /* Non-browser test harness. */ }
  return settings;
}
export function getGame3DUIScale({uiScale='auto',width=1280,height=720}={}) {
  if(uiScale==='compact')return .9;
  if(uiScale==='large')return 1.15;
  if(uiScale==='standard')return 1;
  // CSS viewport, not physical phone resolution: an 1170x2532 phone is
  // typically ~390x844 CSS px and needs an adaptive compact layout.
  return (width<440||height<560) ? .9 : width<680 ? .95 : 1;
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
