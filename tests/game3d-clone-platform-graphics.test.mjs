// Browser, desktop app and mobile each keep their own graphics settings,
// including 3D resolution, and each has its own per-area render budget.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GAME3D_PLATFORM_IDS,GAME3D_PLATFORM_DEFAULTS,GAME3D_PLATFORM_GRAPHICS_KEY,
  GAME3D_PLATFORM_GRAPHICS_EVENT,GAME3D_AREA_LOADING_LABELS,
  normalizeGame3DPlatformProfile,detectGame3DPlatform,readGame3DPlatformGraphics,
  bootGame3DPlatformGraphics,rememberGame3DPlatformSetting,selectGame3DPlatform,
  activeGame3DPlatformProfile,applyGame3DPlatformProfile,
} from '../src/components/game3d/performance/Game3DPlatformGraphics.mjs';
import {
  GAME3D_AREA_BUDGETS,GAME3D_AREA_MAX_SQUARE_METERS,game3dAreaBudget,
  evaluateGame3DAreaBudget,describeGame3DAreaBudget,
} from '../src/components/game3d/performance/Game3DAreaBudget.mjs';
import {readGame3DDisplaySettings,game3DResolutionTarget}
  from '../src/components/game3d/performance/Game3DDisplaySettings.mjs';
import {readCloneGPUProfile} from '../src/components/game3d/performance/AdaptiveGraphics.mjs';
import {WOLFVEIL_AREA_LOADING_MODES}
  from '../src/components/game3d/wolfveil/streaming/WolfveilAreaLoader.mjs';
import {WOLFVEIL_AREA_IDS,wolfveilAreaSquareMeters}
  from '../src/components/game3d/wolfveil/streaming/WolfveilFiveAreaPlan.mjs';

class FakeEvent{constructor(type,init){this.type=type;this.detail=init?.detail;}}
function makeHost({width=1920,height=1080,touch=false,standalone=false,agent='Mozilla/5.0 (Windows NT 10.0)',
  search='',stored={}}={}){
  const store=new Map(Object.entries(stored));
  const events=[];
  return {
    innerWidth:width,innerHeight:height,devicePixelRatio:1,
    location:{search},
    navigator:{userAgent:agent,maxTouchPoints:touch?5:0},
    matchMedia:query=>({matches:
      (query==='(any-pointer: coarse)'&&touch)||
      (query==='(display-mode: standalone)'&&standalone)}),
    localStorage:{
      getItem:key=>store.has(key)?store.get(key):null,
      setItem:(key,value)=>store.set(key,String(value)),
    },
    CustomEvent:FakeEvent,
    dispatchEvent(event){events.push(event);return true;},
    store,events,
  };
}
const liveGraphics=host=>JSON.parse(host.store.get('game_graphics_settings'));

test('three platforms, each with complete defaults of its own',()=>{
  assert.deepEqual(GAME3D_PLATFORM_IDS,['browser','desktop','mobile']);
  for(const id of GAME3D_PLATFORM_IDS){
    const profile=normalizeGame3DPlatformProfile(null,id);
    assert.equal(profile.graphics.quality,GAME3D_PLATFORM_DEFAULTS[id].graphics.quality);
    assert.equal(profile.display.resolution,GAME3D_PLATFORM_DEFAULTS[id].display.resolution);
    assert.ok(WOLFVEIL_AREA_LOADING_MODES.includes(profile.areaLoading));
    assert.equal(profile.areaLoading,'single','the whole valley is over budget everywhere');
  }
  const [browser,desktop,mobile]=GAME3D_PLATFORM_IDS.map(id=>normalizeGame3DPlatformProfile(null,id));
  // Browser: sharp but adaptive. Desktop app: native and top quality. Mobile: light.
  assert.deepEqual([browser.display.resolution,browser.graphics.quality,browser.graphics.fpsCap,
    browser.graphics.shadows,browser.gpuProfile],['auto','high',60,true,'auto']);
  assert.deepEqual([desktop.display.resolution,desktop.graphics.quality,desktop.graphics.fpsCap,
    desktop.gpuProfile],['native','ultra',120,'quality']);
  assert.deepEqual([mobile.display.resolution,mobile.graphics.quality,mobile.graphics.fpsCap,
    mobile.graphics.shadows,mobile.gpuProfile,mobile.releaseGpuMemory],
  ['720p','low',30,false,'performance',true]);
  assert.equal(browser.releaseGpuMemory,false);
  assert.deepEqual(Object.keys(GAME3D_AREA_LOADING_LABELS),[...WOLFVEIL_AREA_LOADING_MODES]);
});
test('browser default is native-sharp on a 1080p screen and never upscales a small one',()=>{
  const browser=normalizeGame3DPlatformProfile(null,'browser');
  const full=game3DResolutionTarget({resolution:browser.display.resolution,
    viewportWidth:1920,viewportHeight:1080,devicePixelRatio:1,autoRatio:1});
  assert.deepEqual([full.width,full.height],[1920,1080]);
  const laptop=game3DResolutionTarget({resolution:browser.display.resolution,
    viewportWidth:1366,viewportHeight:768,devicePixelRatio:1,autoRatio:1});
  assert.deepEqual([laptop.width,laptop.height],[1366,768]);
  const phone=game3DResolutionTarget({
    resolution:normalizeGame3DPlatformProfile(null,'mobile').display.resolution,
    viewportWidth:390,viewportHeight:844,devicePixelRatio:3});
  assert.equal(phone.height,720);
});
test('bad or missing values fall back to that platform\'s own default',()=>{
  const profile=normalizeGame3DPlatformProfile({
    graphics:{quality:'cinematic',shadows:'yes',fpsCap:75,artStyle:'ink'},
    display:{resolution:'8k',uiScale:'huge'},gpuProfile:'turbo',areaLoading:'none',
    preloadMeters:5000,releaseGpuMemory:'maybe',
  },'mobile');
  assert.equal(profile.graphics.quality,'low');
  assert.equal(profile.graphics.shadows,false);
  assert.equal(profile.graphics.fpsCap,30);
  assert.equal(profile.graphics.artStyle,'ink','the look is kept');
  assert.deepEqual(profile.display,{resolution:'720p',uiScale:'auto'});
  assert.equal(profile.gpuProfile,'performance');
  assert.equal(profile.areaLoading,'single');
  assert.equal(profile.preloadMeters,200);
  assert.equal(profile.releaseGpuMemory,true);
  assert.equal(normalizeGame3DPlatformProfile({},'console').graphics.quality,'high');
});
test('platform detection: tab, installed app, phone, and a forced test value',()=>{
  assert.equal(detectGame3DPlatform(makeHost()),'browser');
  assert.equal(detectGame3DPlatform(makeHost({standalone:true})),'desktop');
  assert.equal(detectGame3DPlatform(makeHost({agent:'Mozilla/5.0 Electron/31'})),'desktop');
  assert.equal(detectGame3DPlatform(makeHost({width:390,height:844,touch:true})),'mobile');
  assert.equal(detectGame3DPlatform(makeHost({width:1280,height:800,touch:true})),'mobile');
  assert.equal(detectGame3DPlatform(makeHost({width:390,height:844,touch:true,standalone:true})),
    'mobile','an installed app on a phone is still a phone');
  assert.equal(detectGame3DPlatform(makeHost({width:2560,height:1440,touch:true})),'browser',
    'a large touch monitor is not a handheld');
  assert.equal(detectGame3DPlatform(makeHost({search:'?platform=mobile'})),'mobile');
  assert.equal(detectGame3DPlatform(makeHost({search:'?platform=console'})),'browser');
  assert.equal(detectGame3DPlatform(null),'browser');
});
test('first run in a browser: defaults apply, and the settings the renderer reads are written',()=>{
  const host=makeHost();
  const boot=bootGame3DPlatformGraphics(host);
  assert.equal(boot.platform,'browser');
  assert.equal(boot.firstRun,true);
  assert.equal(liveGraphics(host).quality,'high');
  assert.equal(liveGraphics(host).fpsCap,60);
  assert.equal(readGame3DDisplaySettings(host,{}).resolution,'auto');
  assert.equal(readCloneGPUProfile(host),'auto');
  assert.equal(host.events.length,0,'nothing is announced before the world exists');
  const state=readGame3DPlatformGraphics(host);
  assert.equal(state.firstRun,false);
  assert.equal(state.selected,'auto');
  assert.equal(state.profiles.mobile.display.resolution,'720p');
  assert.equal(state.profiles.desktop.display.resolution,'native');
});
test('first run keeps what the player had already chosen on this device',()=>{
  const host=makeHost({stored:{
    game_graphics_settings:JSON.stringify({quality:'medium',shadows:false,fpsCap:144,artStyle:'ink',inkPalette:'classic'}),
    game3d_display_settings_v1:JSON.stringify({resolution:'1440p',uiScale:'large'}),
    axe3d_clone_gpu_profile_v1:'balanced',
  }});
  const boot=bootGame3DPlatformGraphics(host);
  assert.equal(boot.profile.graphics.quality,'medium');
  assert.equal(boot.profile.graphics.fpsCap,144);
  assert.deepEqual(boot.profile.display,{resolution:'1440p',uiScale:'large'});
  assert.equal(boot.profile.gpuProfile,'balanced');
  assert.equal(liveGraphics(host).artStyle,'ink');
  // The other platforms start from their own defaults but share the look.
  const state=readGame3DPlatformGraphics(host);
  assert.equal(state.profiles.mobile.graphics.quality,'low');
  assert.equal(state.profiles.mobile.graphics.artStyle,'ink');
  assert.equal(state.profiles.mobile.graphics.inkPalette,'classic');
});
test('first run on a phone starts from the mobile profile',()=>{
  const host=makeHost({width:390,height:844,touch:true});
  const boot=bootGame3DPlatformGraphics(host);
  assert.equal(boot.platform,'mobile');
  assert.equal(liveGraphics(host).quality,'low');
  assert.equal(liveGraphics(host).shadows,false);
  assert.equal(readGame3DDisplaySettings(host,{}).resolution,'720p');
  assert.equal(readCloneGPUProfile(host),'performance');
});
test('a change in the menu is remembered for the platform in use only',()=>{
  const host=makeHost();
  bootGame3DPlatformGraphics(host);
  rememberGame3DPlatformSetting({graphics:{quality:'ultra'}},host);
  rememberGame3DPlatformSetting({display:{resolution:'1080p'}},host);
  rememberGame3DPlatformSetting({gpuProfile:'quality'},host);
  assert.equal(host.events.length,0,'the menu already announced those changes itself');
  rememberGame3DPlatformSetting({areaLoading:'neighbors',releaseGpuMemory:true},host);
  assert.equal(host.events.length,1);
  assert.equal(host.events[0].type,GAME3D_PLATFORM_GRAPHICS_EVENT);
  assert.equal(host.events[0].detail.profile.areaLoading,'neighbors');
  const state=readGame3DPlatformGraphics(host);
  assert.equal(state.profiles.browser.graphics.quality,'ultra');
  assert.equal(state.profiles.browser.graphics.fpsCap,60,'untouched fields stay');
  assert.equal(state.profiles.browser.display.resolution,'1080p');
  assert.equal(state.profiles.browser.gpuProfile,'quality');
  assert.equal(state.profiles.browser.releaseGpuMemory,true);
  assert.equal(state.profiles.mobile.graphics.quality,'low');
  assert.equal(state.profiles.mobile.display.resolution,'720p');
  assert.equal(state.profiles.desktop.areaLoading,'single');
});
test('switching platform swaps in that platform\'s settings and leaves the other intact',()=>{
  const host=makeHost();
  bootGame3DPlatformGraphics(host);
  rememberGame3DPlatformSetting({graphics:{quality:'ultra'},display:{resolution:'1440p'}},host);
  const mobile=selectGame3DPlatform('mobile',host);
  assert.equal(mobile.active,'mobile');
  assert.equal(liveGraphics(host).quality,'low');
  assert.equal(readGame3DDisplaySettings(host,{}).resolution,'720p');
  assert.equal(readCloneGPUProfile(host),'performance');
  assert.deepEqual(host.events.map(event=>event.type),['graphicsSettingsChanged',
    'game3dDisplaySettingsChanged','game3dCloneGPUProfileChanged',GAME3D_PLATFORM_GRAPHICS_EVENT]);
  // Tune mobile, go back: the browser profile is exactly as it was left.
  rememberGame3DPlatformSetting({graphics:{fpsCap:60}},host);
  const back=selectGame3DPlatform('auto',host);
  assert.equal(back.active,'browser');
  assert.equal(liveGraphics(host).quality,'ultra');
  assert.equal(readGame3DDisplaySettings(host,{}).resolution,'1440p');
  assert.equal(readGame3DPlatformGraphics(host).profiles.mobile.graphics.fpsCap,60);
  assert.equal(selectGame3DPlatform('console',host).selected,'auto');
  assert.equal(activeGame3DPlatformProfile(host).platform,'browser');
});
test('a later start copies the active platform profile back into the live settings',()=>{
  const host=makeHost();
  bootGame3DPlatformGraphics(host);
  rememberGame3DPlatformSetting({graphics:{quality:'medium'}},host);
  // Something else on the device overwrote the live values in between.
  host.store.set('game_graphics_settings',JSON.stringify({quality:'low',fpsCap:30,shadows:false,artStyle:'original'}));
  host.store.set('game3d_display_settings_v1',JSON.stringify({resolution:'720p',uiScale:'auto'}));
  const boot=bootGame3DPlatformGraphics(host);
  assert.equal(boot.firstRun,false);
  assert.equal(liveGraphics(host).quality,'medium');
  assert.equal(liveGraphics(host).fpsCap,60);
  assert.equal(readGame3DDisplaySettings(host,{}).resolution,'auto');
});
test('blocked storage never breaks the game: defaults are still returned',()=>{
  const host=makeHost();
  host.localStorage={getItem(){throw Error('blocked');},setItem(){throw Error('blocked');}};
  const boot=bootGame3DPlatformGraphics(host);
  assert.equal(boot.platform,'browser');
  assert.equal(boot.profile.graphics.quality,'high');
  assert.equal(applyGame3DPlatformProfile('mobile',null,{host}).profile.display.resolution,'720p');
  assert.equal(readGame3DPlatformGraphics(null).active,'browser');
});
test('stored state survives a round trip and ignores an unknown platform key',()=>{
  const host=makeHost({stored:{[GAME3D_PLATFORM_GRAPHICS_KEY]:JSON.stringify({
    version:1,selected:'desktop',
    profiles:{desktop:{graphics:{quality:'high'}},console:{graphics:{quality:'ultra'}}},
  })}});
  const state=readGame3DPlatformGraphics(host);
  assert.equal(state.active,'desktop');
  assert.equal(state.detected,'browser');
  assert.equal(state.profile.graphics.quality,'high');
  assert.equal(state.profile.display.resolution,'native');
  assert.deepEqual(Object.keys(state.profiles),['browser','desktop','mobile']);
});

test('per-area budgets: browser 500 calls and 1.5 M triangles, with a scenery share',()=>{
  assert.deepEqual(Object.keys(GAME3D_AREA_BUDGETS),['browser','desktop','mobile']);
  const browser=game3dAreaBudget('browser');
  assert.deepEqual([browser.drawCalls,browser.sceneryDrawCalls,browser.triangles,
    browser.sceneryTriangles,browser.targetFps,browser.floorFps],[500,350,1500000,1000000,60,30]);
  for(const budget of Object.values(GAME3D_AREA_BUDGETS)){
    assert.ok(budget.sceneryDrawCalls<budget.drawCalls);
    assert.ok(budget.sceneryTriangles<budget.triangles);
    assert.ok(budget.floorFps<=budget.targetFps);
  }
  assert.ok(game3dAreaBudget('mobile').drawCalls<browser.drawCalls);
  assert.ok(game3dAreaBudget('desktop').drawCalls>browser.drawCalls);
  assert.equal(game3dAreaBudget('console'),browser);
  // Every one of the five Wolfveil areas fits under the land ceiling.
  for(const id of WOLFVEIL_AREA_IDS)
    assert.ok(wolfveilAreaSquareMeters(id)<=GAME3D_AREA_MAX_SQUARE_METERS,id);
});
test('a measured frame is judged against its platform budget',()=>{
  const fine=evaluateGame3DAreaBudget({platform:'browser',calls:320,triangles:900000,fps:60});
  assert.equal(fine.within,true);
  assert.equal(fine.drawCallShare,.64);
  // The whole valley as recorded on 2026-11-16: town spawn and behind the sanctuary.
  const spawn=evaluateGame3DAreaBudget({platform:'browser',calls:961,triangles:1970000});
  assert.deepEqual([...spawn.over],['drawCalls','triangles']);
  const sanctuary=evaluateGame3DAreaBudget({platform:'browser',calls:222,triangles:2860000});
  assert.deepEqual([...sanctuary.over],['triangles']);
  assert.deepEqual([...evaluateGame3DAreaBudget({platform:'browser',calls:100,triangles:1000,fps:22}).over],['fps']);
  assert.equal(evaluateGame3DAreaBudget({platform:'mobile',calls:320,triangles:900000}).within,false);
  assert.equal(evaluateGame3DAreaBudget({platform:'desktop',calls:961,triangles:1970000}).within,true);
  assert.equal(describeGame3DAreaBudget(spawn,'Wolfveil Town'),
    'Wolfveil Town · browser budget: calls 961/500 (192%)  tris 1,970,000/1,500,000 (131%)  OVER: drawCalls, triangles');
  assert.equal(describeGame3DAreaBudget(null),'');
});
