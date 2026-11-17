import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  GAME3D_DISPLAY_SETTINGS_KEY,GAME3D_DISPLAY_SETTINGS_EVENT,
  GAME3D_RENDER_RESOLUTIONS,GAME3D_UI_SCALES,
  game3DResolutionTarget,game3DViewportClass,getGame3DUIScale,
  normalizeGame3DDisplaySettings,readGame3DDisplaySettings,
  saveGame3DDisplaySettings,
} from '../src/components/game3d/performance/Game3DDisplaySettings.mjs';
import {
  createCloneAdaptiveGraphics,normalizedCloneFrameCost,
} from '../src/components/game3d/performance/AdaptiveGraphics.mjs';
const root=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');

test('resolution settings have safe persistent defaults and reject invalid input',()=>{
  assert.deepEqual(normalizeGame3DDisplaySettings(null),{resolution:'auto',uiScale:'auto'});
  assert.deepEqual(normalizeGame3DDisplaySettings({resolution:'unknown',uiScale:'2000%'}),
    {resolution:'auto',uiScale:'auto'});
  assert.deepEqual(GAME3D_RENDER_RESOLUTIONS.map(p=>p.id),
    ['auto','720p','900p','1080p','1440p','native']);
  assert.deepEqual(GAME3D_UI_SCALES.map(p=>p.id),
    ['auto','compact','standard','large']);
  assert.equal(Object.isFrozen(normalizeGame3DDisplaySettings({})),true);
});
test('desktop, ultrawide, phone and Steam Deck all preserve CSS aspect without stretching',()=>{
  const cases=[
    {resolution:'1080p',viewportWidth:1920,viewportHeight:1080,devicePixelRatio:1,w:1920,h:1080},
    {resolution:'1080p',viewportWidth:1280,viewportHeight:800,devicePixelRatio:1,w:1728,h:1080},
    {resolution:'720p',viewportWidth:390,viewportHeight:844,devicePixelRatio:3,w:332,h:720},
    {resolution:'native',viewportWidth:390,viewportHeight:844,devicePixelRatio:3,w:1170,h:2532},
    {resolution:'1080p',viewportWidth:3440,viewportHeight:1440,devicePixelRatio:1,w:2580,h:1080},
  ];
  for(const props of cases){
    const actual=game3DResolutionTarget(props);
    assert.equal(actual.width,props.w,JSON.stringify(props));
    assert.equal(actual.height,props.h,JSON.stringify(props));
    // Integer pixel rounding is less than 1 framebuffer pixel from the
    // CSS aspect; in no case is UI dimension modified by this function.
    assert(Math.abs(actual.aspect-actual.width/actual.height)<.002);
    assert.equal(actual.cssWidth,props.viewportWidth);
    assert.equal(actual.cssHeight,props.viewportHeight);
    assert(actual.ratio>.25);
  }
});
test('extreme high DPI, 4K/5K and invalid values stay under WebGL safety limits',()=>{
  for(const resolution of ['auto','720p','900p','1080p','1440p','native']){
    const p=game3DResolutionTarget({
      resolution,viewportWidth:5120,viewportHeight:2880,devicePixelRatio:3,
      autoRatio:1.5,maxTextureSize:4096,maxPixels:4_000_000,
    });
    assert(p.width<=4096&&p.height<=4096);
    assert(p.width*p.height<=4_000_000);
    assert(Number.isFinite(p.aspect)&&p.ratio>0);
  }
  const fourK=game3DResolutionTarget({
    resolution:'native',viewportWidth:3840,viewportHeight:2160,devicePixelRatio:1,
  });
  assert.equal(fourK.width,3840);
  assert.equal(fourK.height,2160);
  assert.equal(fourK.limited,false);
  const safe=game3DResolutionTarget({resolution:'bogus',viewportWidth:0,
    viewportHeight:-1,devicePixelRatio:Infinity});
  assert.equal(safe.mode,'auto');
  assert(safe.width>0&&safe.height>0);
});
test('UI responds to logical CSS size, not physical device resolution',()=>{
  assert.equal(getGame3DUIScale({uiScale:'auto',width:390,height:844}),.9);
  assert.equal(getGame3DUIScale({uiScale:'auto',width:1280,height:800}),1);
  assert.equal(getGame3DUIScale({uiScale:'large',width:390,height:844}),1.15);
  assert.equal(getGame3DUIScale({uiScale:'standard',width:390,height:844}),1);
  assert.equal(game3DViewportClass({width:390,height:844}),'phone');
  assert.equal(game3DViewportClass({width:800,height:600}),'handheld');
  assert.equal(game3DViewportClass({width:1920,height:1080}),'desktop');
});
function harness(){
  let ratio=1.5,seq=0,cssW=390,cssH=844;
  const callbacks=new Map(),listeners=new Map(),store=new Map([
    ['game_graphics_settings',JSON.stringify({quality:'high',fpsCap:30})],
    ['axe3d_clone_gpu_profile_v1','auto'],
  ]);
  const host={
    innerWidth:390,innerHeight:844,devicePixelRatio:3,
    location:{search:''},
    localStorage:{getItem:key=>store.get(key)||null,setItem:(key,value)=>store.set(key,value)},
    requestAnimationFrame(cb){const id=++seq;callbacks.set(id,cb);return id;},
    cancelAnimationFrame(id){callbacks.delete(id);},
    addEventListener(type,cb){listeners.set(type,cb);},
    removeEventListener(type,cb){if(listeners.get(type)===cb)listeners.delete(type);},
    dispatchEvent(event){listeners.get(event.type)?.(event);},
    CustomEvent:class{constructor(type,{detail}){this.type=type;this.detail=detail;}},
  };
  const renderer={
    domElement:{parentElement:{getBoundingClientRect:()=>({width:cssW,height:cssH})}},
    capabilities:{maxTextureSize:4096},
    getPixelRatio:()=>ratio,
    setPixelRatio(value){ratio=value;},
    getContext:()=>({isContextLost:()=>false}),
    info:{render:{frame:0}},
  };
  return{
    host,renderer,listeners,store,ratio:()=>ratio,
    resize(w,h){cssW=w;cssH=h;host.innerWidth=w;host.innerHeight=h;host.dispatchEvent({type:'resize'});},
    tick(n,ms){let time=0;for(let i=0;i<n;i++){time+=ms;renderer.info.render.frame++;
      for(const [id,cb] of [...callbacks]){callbacks.delete(id);cb(time);}
    }},
  };
}
test('live governor responds to saved resolutions and container resize without reloading world',()=>{
  const h=harness();
  const governor=createCloneAdaptiveGraphics({renderer:h.renderer,host:h.host,documentRef:{hidden:false}});
  assert.equal(h.ratio(),1.5);
  saveGame3DDisplaySettings({resolution:'720p',uiScale:'large'},h.host);
  assert.equal(h.store.has(GAME3D_DISPLAY_SETTINGS_KEY),true);
  assert.equal(h.listeners.has(GAME3D_DISPLAY_SETTINGS_EVENT),true);
  assert.equal(readGame3DDisplaySettings(h.host).uiScale,'large');
  assert(Math.abs(h.ratio()-720/844)<1e-9);
  h.tick(300,34);
  assert(Math.abs(h.ratio()-720/844)<1e-9,'manual 720p must not be downscaled by slow frame samples');
  saveGame3DDisplaySettings({resolution:'1080p',uiScale:'large'},h.host);
  assert(Math.abs(h.ratio()-1080/844)<1e-9);
  h.resize(720,1280);
  assert(Math.abs(h.ratio()-1080/1280)<1e-9,'handheld resize must recompute target without canvas CSS resizing');
  assert.equal(governor.getSnapshot().resolution,'1080p');
  governor.dispose();
  assert.equal(h.listeners.has(GAME3D_DISPLAY_SETTINGS_EVENT),false);
  assert.equal(h.listeners.has('resize'),false);
});
test('30 FPS pacing is not misclassified as GPU pressure',()=>{
  const normalized=normalizedCloneFrameCost({p95Ms:33.333,p99Ms:35,fpsCap:30});
  assert(normalized.p95Ms<19);
  assert(normalized.p99Ms<24);
  const slow=normalizedCloneFrameCost({p95Ms:55,p99Ms:65,fpsCap:30});
  assert(slow.p95Ms>25);
  assert.equal(normalizedCloneFrameCost({p95Ms:30,p99Ms:35,fpsCap:60}).p95Ms,30);
});
test('Game 3D canvas stays CSS-sized, FPS limit only skips GPU submissions',()=>{
  const world=root('src/components/game3d/GameWorld3D.jsx');
  const menu=root('src/components/game3d/PauseMenu.jsx');
  const page=root('src/pages/GameView.jsx');
  const css=root('src/components/game3d/performance/Game3DResponsiveDisplay.css');
  assert.match(world,/new ResizeObserver\(handleResize\)/);
  assert.match(world,/renderer\.setSize\(width,height,false\)/);
  assert.match(world,/camera\.aspect=width\/height/);
  assert.match(world,/canvasResizeObserver\?\.disconnect\(\)/);
  assert.match(world,/const renderThisFrame=canRenderFrame\(renderNow\)/);
  assert.match(world,/if\(renderThisFrame&&!atomicLook\?\.render\(camera\)\)inkLook\.render\(scene,camera\)/);
  assert.match(world,/if\(renderThisFrame&&!atomicLook\?\.render\(activeCamera\)\)inkLook\.render\(scene,activeCamera\)/);
  assert.match(world,/const delta = clock\.getDelta\(\)/);
  assert.match(menu,/3D render resolution/);
  assert.match(menu,/Interface size/);
  assert.match(menu,/saveGame3DDisplaySettings/);
  assert.match(menu,/Frame rate cap/);
  assert.match(page,/data-display-class=\{game3DViewportClass\(cssViewport\)\}/);
  assert.match(page,/--game3d-ui-scale/);
  assert.match(css,/safe-area-inset-bottom/);
  assert.match(css,/max-width:100%;max-height:100dvh/);
  assert.doesNotMatch(css,/transform:\s*scaleX\(|transform:\s*scaleY\(/);
  assert.doesNotMatch(world,/screen\.width|screen\.height/);
});
