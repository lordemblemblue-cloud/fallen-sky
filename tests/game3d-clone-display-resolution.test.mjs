import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  GAME3D_DISPLAY_SETTINGS_KEY,GAME3D_DISPLAY_SETTINGS_EVENT,
  GAME3D_RENDER_BUFFER_APPLIED_EVENT,readGame3DActualFramebuffer,
  GAME3D_RENDER_RESOLUTIONS,GAME3D_UI_SCALES,
  game3DResolutionTarget,game3DViewportClass,getGame3DUIScale,
  normalizeGame3DDisplaySettings,publishedGame3DDisplayDefaults,readGame3DDisplaySettings,
  saveGame3DDisplaySettings,
} from '../src/components/game3d/performance/Game3DDisplaySettings.mjs';
import {
  createCloneAdaptiveGraphics,normalizedCloneFrameCost,
} from '../src/components/game3d/performance/AdaptiveGraphics.mjs';
import {createGame3DRenderFramePacer,normalizeGame3DRenderFPSCap}
  from '../src/components/game3d/performance/Game3DFramePacing.mjs';
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
    domElement:{width:Math.floor(cssW*ratio),height:Math.floor(cssH*ratio),
      parentElement:{getBoundingClientRect:()=>({width:cssW,height:cssH})}},
    capabilities:{maxTextureSize:4096},
    getPixelRatio:()=>ratio,
    setPixelRatio(value){
      ratio=value;
      this.domElement.width=Math.floor(cssW*ratio);
      this.domElement.height=Math.floor(cssH*ratio);
    },
    setSize(width,height){
      cssW=width;cssH=height;
      this.domElement.width=Math.floor(cssW*ratio);
      this.domElement.height=Math.floor(cssH*ratio);
    },
    getContext:()=>({isContextLost:()=>false}),
    info:{render:{frame:0}},
  };
  return{
    host,renderer,listeners,store,ratio:()=>ratio,
    resize(w,h){renderer.setSize(w,h,false);host.innerWidth=w;host.innerHeight=h;host.dispatchEvent({type:'resize'});},
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
  assert.match(world,/const renderThisFrame=renderPacer\.shouldRender\(renderNow\)/);
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

test('render-only FPS caps pace 144 Hz, 60 Hz and 30 Hz without simulation throttling',()=>{
  assert.equal(normalizeGame3DRenderFPSCap('144'),144);
  assert.equal(normalizeGame3DRenderFPSCap('bad'),60);
  for(const {monitor,cap} of [
    {monitor:144,cap:120},{monitor:120,cap:60},{monitor:60,cap:30},
    {monitor:60,cap:144},{monitor:90,cap:30},
  ]){
    const pacer=createGame3DRenderFramePacer(cap);
    let count=0;
    for(let frame=0;frame<monitor*2;frame++){
      if(pacer.shouldRender(frame*1000/monitor))count++;
    }
    const expected=2*Math.min(cap,monitor);
    assert(Math.abs(count-expected)<=3,
      'FPS cap '+cap+' on '+monitor+' Hz measured '+count+' renders vs '+expected);
  }
  const pacer=createGame3DRenderFramePacer(30);
  assert.equal(pacer.shouldRender(0),true);
  assert.equal(pacer.shouldRender(8),false);
  pacer.setFPSCap(120);
  assert.equal(pacer.shouldRender(8),true,'changing FPS cap takes effect immediately');
  assert.equal(pacer.shouldRender(Infinity),false);
  assert.equal(pacer.getFPSCap(),120);
});

test('mobile release builds can choose a first-run internal resolution while players retain overrides',()=>{
  const env={VITE_GAME3D_MOBILE_DEFAULT_RESOLUTION:'720p'};
  const phone={innerWidth:390,innerHeight:844,navigator:{maxTouchPoints:5}};
  const steamDeck={innerWidth:1280,innerHeight:800,navigator:{maxTouchPoints:1}};
  const desktop={innerWidth:1920,innerHeight:1080,navigator:{maxTouchPoints:0}};
  assert.equal(publishedGame3DDisplayDefaults(phone,env).resolution,'720p');
  assert.equal(publishedGame3DDisplayDefaults(steamDeck,env).resolution,'720p');
  assert.equal(publishedGame3DDisplayDefaults(desktop,env).resolution,'auto');
  assert.equal(readGame3DDisplaySettings(phone,env).resolution,'720p');
  phone.localStorage={
    getItem:key=>key===GAME3D_DISPLAY_SETTINGS_KEY
      ?JSON.stringify({resolution:'1080p',uiScale:'large'}):null,
  };
  assert.equal(readGame3DDisplaySettings(phone,env).resolution,'1080p');
  assert.equal(readGame3DDisplaySettings(phone,env).uiScale,'large');
  assert.equal(publishedGame3DDisplayDefaults(phone,{
    VITE_GAME3D_MOBILE_DEFAULT_RESOLUTION:'bogus',
  }).resolution,'auto');
});

test('measured output changes physical WebGL pixels on every fixed resolution preset',()=>{
  const h=harness();
  const governor=createCloneAdaptiveGraphics({renderer:h.renderer,host:h.host,documentRef:{hidden:false}});
  const observed=[];
  h.host.addEventListener(GAME3D_RENDER_BUFFER_APPLIED_EVENT,event=>observed.push(event.detail));
  const initial=readGame3DActualFramebuffer(h.renderer);
  assert.equal(initial.width,585);
  assert.equal(initial.height,1266);
  for(const [mode,height] of [['720p',720],['900p',900],['1080p',1080],['1440p',1440]]){
    saveGame3DDisplaySettings({resolution:mode,uiScale:'standard'},h.host);
    const actual=readGame3DActualFramebuffer(h.renderer);
    assert.equal(actual.height,height,'Actual 3D pixel height did not change for '+mode);
    assert.equal(actual.width,Math.floor(390*height/844));
    assert.equal(governor.getSnapshot().renderHeight,actual.height);
    assert.equal(observed.at(-1)?.height,actual.height);
    assert.equal(observed.at(-1)?.resolution,mode);
  }
  assert.notEqual(initial.height,readGame3DActualFramebuffer(h.renderer).height);
  saveGame3DDisplaySettings({resolution:'native',uiScale:'standard'},h.host);
  assert.deepEqual([
    readGame3DActualFramebuffer(h.renderer).width,
    readGame3DActualFramebuffer(h.renderer).height,
  ],[1170,2532]);
  governor.dispose();
});

test('GPU profile Off after manual resolution returns to auto ratio, not last manual preset',()=>{
  const h=harness();
  const governor=createCloneAdaptiveGraphics({renderer:h.renderer,host:h.host,documentRef:{hidden:false}});
  saveGame3DDisplaySettings({resolution:'720p'},h.host);
  assert.equal(readGame3DActualFramebuffer(h.renderer).height,720);
  governor.setProfile('off');
  saveGame3DDisplaySettings({resolution:'auto'},h.host);
  assert.equal(h.ratio(),1.5);
  assert.equal(readGame3DActualFramebuffer(h.renderer).height,1266);
  governor.dispose();
});

test('the live menu reports measured pixels, while the world applies the saved mode at boot',()=>{
  const world=root('src/components/game3d/GameWorld3D.jsx');
  const menu=root('src/components/game3d/PauseMenu.jsx');
  assert.match(world,/const bootTarget=game3DResolutionTarget\(/);
  assert.match(world,/renderer\.setPixelRatio\(bootTarget\.ratio\)/);
  assert.match(world,/window\.addEventListener\(GAME3D_DISPLAY_SETTINGS_EVENT,onDisplayResolution\)/);
  assert.match(world,/window\.removeEventListener\(GAME3D_DISPLAY_SETTINGS_EVENT,onDisplayResolution\)/);
  assert.match(world,/publishGame3DActualFramebuffer\(/);
  assert.match(menu,/readGame3DActualFramebuffer\(renderer\)/);
  assert.match(menu,/GAME3D_RENDER_BUFFER_APPLIED_EVENT/);
  assert.match(menu,/Applied WebGL output:/);
  assert.match(menu,/Waiting for the 3D renderer to initialize/);
  assert.doesNotMatch(menu,/3D framebuffer: approximately/);
  assert.equal(readGame3DActualFramebuffer({domElement:{width:0,height:500}}),null);
  assert.equal(readGame3DActualFramebuffer(null),null);
});
