#!/usr/bin/env node
// Runs the REAL five-area loader against the REAL Wolfveil valley, built from
// the same scene module the game uses and real Three.js objects, with no
// browser and no GPU. It walks the player into every area and through every
// portal, checks that nothing is lost, duplicated or wrongly hidden, and
// prints what one loaded area costs next to the whole valley.
//
//   node scripts/report-wolfveil-area-loading.mjs            the valley
//   node scripts/report-wolfveil-area-loading.mjs --town     + the artisan town beside the valley
//   node scripts/report-wolfveil-area-loading.mjs --json     machine-readable
//
// What it cannot measure: frame rate, real draw calls after frustum culling,
// GPU memory. The counts here are everything the renderer would be handed
// for the loaded areas, looking in every direction at once (an upper bound).
/* global process, console, performance, setTimeout, queueMicrotask */
import {pathToFileURL} from 'node:url';

const SOURCE='../src/components/game3d/';

// Just enough of a browser for scene code that builds label canvases or
// starts model downloads. Nothing here draws anything.
export function installHeadlessStubs(){
  const g=globalThis;
  if(g.__wolfveilHeadlessStubs)return;
  g.__wolfveilHeadlessStubs=true;
  const context2d=canvas=>new Proxy({canvas},{
    get(target,key){
      if(key in target)return target[key];
      if(key==='getImageData'||key==='createImageData')return (a,b,c,d)=>{
        const width=Math.max(1,(c??a)|0),height=Math.max(1,(d??b)|0);
        return {width,height,data:new Uint8ClampedArray(width*height*4)};
      };
      if(key==='measureText')return ()=>({width:8,actualBoundingBoxAscent:8,actualBoundingBoxDescent:2});
      if(key==='createLinearGradient'||key==='createRadialGradient'||key==='createPattern')
        return ()=>({addColorStop(){}});
      return ()=>{};
    },
    set(target,key,value){target[key]=value;return true;},
  });
  const makeCanvas=()=>{
    const canvas={width:300,height:150,style:{},toDataURL:()=>'data:,',
      addEventListener(){},removeEventListener(){}};
    canvas.getContext=()=>context2d(canvas);
    return canvas;
  };
  const makeImage=()=>{
    const listeners={load:[],error:[]};
    let source='';
    return {
      width:2,height:2,naturalWidth:2,naturalHeight:2,style:{},
      addEventListener(type,fn){(listeners[type]??=[]).push(fn);},
      removeEventListener(type,fn){
        const list=listeners[type]||[],index=list.indexOf(fn);
        if(index>=0)list.splice(index,1);
      },
      get src(){return source;},
      set src(value){
        source=value;
        queueMicrotask(()=>{for(const fn of [...listeners.load])fn.call(this,{type:'load',target:this});});
      },
    };
  };
  const element=()=>({style:{},appendChild(){},removeChild(){},setAttribute(){},
    addEventListener(){},removeEventListener(){}});
  const make=tag=>tag==='canvas'?makeCanvas():tag==='img'?makeImage():element();
  g.document??={
    createElement:make,createElementNS:(_namespace,tag)=>make(tag),
    body:element(),head:element(),pointerLockElement:null,
    addEventListener(){},removeEventListener(){},
  };
  g.window??={};
  for(const [key,value] of Object.entries({
    addEventListener(){},removeEventListener(){},dispatchEvent(){return true;},
    matchMedia:()=>({matches:false,addEventListener(){},removeEventListener(){}}),
    devicePixelRatio:1,innerWidth:1920,innerHeight:1080,location:{search:'',href:'http://localhost/'},
  }))g.window[key]??=value;
  g.requestAnimationFrame??=()=>0;
  g.cancelAnimationFrame??=()=>{};
  // Three.js loaders report download progress with this browser event.
  g.ProgressEvent??=class ProgressEvent extends g.Event{
    constructor(type,init={}){
      super(type);
      this.lengthComputable=Boolean(init.lengthComputable);
      this.loaded=init.loaded||0;this.total=init.total||0;
    }
  };
  // Model loaders written for browsers and workers reach for `self`.
  g.self??=g;
  // A model download that fails with nobody listening must not end the run.
  g.__wolfveilUnhandled=[];
  g.process?.on?.('unhandledRejection',error=>{
    g.__wolfveilUnhandled.push(String(error?.message||error).slice(0,160));
  });
  // Site-relative asset paths have no site here: let them fail as a normal
  // network error instead of an "invalid URL" exception inside a loader.
  const NativeRequest=g.Request;
  if(NativeRequest)g.Request=class extends NativeRequest{
    constructor(input,init){
      super(typeof input==='string'&&input.startsWith('/')?'http://assets.invalid'+input:input,init);
    }
  };
}

// Render layer mask 0 is how the draw-call mergers switch an original off.
const isRenderable=node=>Boolean(node.geometry&&node.layers?.mask!==0&&
  (node.isMesh||node.isLine||node.isPoints||node.isSprite));
function costOf(node){
  const geometry=node.geometry;
  const groups=Array.isArray(node.material)?Math.max(1,geometry.groups?.length||node.material.length):1;
  let triangles=0;
  if(node.isMesh){
    const total=geometry.index?geometry.index.count:(geometry.attributes?.position?.count||0);
    const range=geometry.drawRange?.count;
    triangles=Math.min(total,Number.isFinite(range)?range:total)/3;
    if(node.isInstancedMesh)triangles*=node.count;
  }else if(node.isSprite)triangles=2;
  return {drawCalls:groups,triangles};
}
// Everything the renderer would be handed, honouring `visible` the way
// Three.js does (an invisible parent hides its whole subtree).
export function measureVisibleScene(root,{labelOf=()=>'scene',skip=()=>false,inView=()=>true}={}){
  const out={objects:0,drawCalls:0,triangles:0,lights:0,ids:new Set(),byLabel:new Map()};
  const walk=node=>{
    if(node.visible===false||skip(node))return;
    // Every light that is switched on is paid for by every lit surface.
    if(node.isLight&&!node.isAmbientLight&&!node.isHemisphereLight&&node.intensity>0)out.lights++;
    if(isRenderable(node)&&inView(node)){
      const cost=costOf(node);
      out.objects++;out.drawCalls+=cost.drawCalls;out.triangles+=cost.triangles;
      out.ids.add(node.uuid);
      const label=labelOf(node);
      const entry=out.byLabel.get(label)||{label,objects:0,drawCalls:0,triangles:0};
      entry.objects++;entry.drawCalls+=cost.drawCalls;entry.triangles+=cost.triangles;
      out.byLabel.set(label,entry);
    }
    for(const child of node.children)walk(child);
  };
  walk(root);
  out.triangles=Math.round(out.triangles);
  return out;
}
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));

export async function runWolfveilAreaLoadingReport({
  withTown=false,townTimeoutMs=30000,assetWaitMs=0,log=()=>{},
}={}){
  installHeadlessStubs();
  const THREE=await import('three');
  const {createWolfveilVillage}=await import(SOURCE+'wolfveil/WolfveilScene.js');
  const {createWolfveilAreaLoader}=await import(SOURCE+'wolfveil/streaming/WolfveilAreaLoader.mjs');
  const {createWolfveilAreaPortals}=await import(SOURCE+'wolfveil/WolfveilAreaPortals.js');
  const {createWolfveilFarOutline}=await import(SOURCE+'wolfveil/WolfveilFarOutline.js');
  const {WOLFVEIL_AREA_PORTALS}=await import(SOURCE+'wolfveil/streaming/WolfveilAreaPortalPlan.mjs');
  const plan=await import(SOURCE+'wolfveil/streaming/WolfveilFiveAreaPlan.mjs');
  const {evaluateGame3DAreaBudget}=await import(SOURCE+'performance/Game3DAreaBudget.mjs');

  const failures=[],notes=[],timings={};
  const check=(ok,message)=>{if(!ok&&!failures.includes(message))failures.push(message);};
  const noteOnce=message=>{if(!notes.includes(message))notes.push(message);};
  const OFFSET=plan.WOLFVEIL_AREA_Z_OFFSET;
  const toWorld=(x,z)=>({x,y:0,z:z+OFFSET});

  // ---- build the valley exactly as GameWorld3D does ------------------------
  const scene=new THREE.Scene();
  const sun=new THREE.DirectionalLight(0xffffff,1);
  scene.add(sun);
  let started=performance.now();
  const village=createWolfveilVillage(scene,{
    originAtMarket:true,silverWater:true,sunLight:sun,hideMarketStalls:true,
    importedTownAtMarket:true,spawnGroundTile:true,
    groundCover:{radius:68,cellSize:16,attemptsPerCell:450,squareHalfExtent:48},
    onHouseWalkableSurfaces(){},
  });
  timings.buildValleyMs=Math.round(performance.now()-started);
  log('valley built in '+timings.buildValleyMs+' ms');
  const world=village.world;
  let town=null;
  if(withTown){
    try{
      // The town GameWorld3D mounts today: the artisan fountain town, built
      // in code (no download), standing beside the valley in the scene.
      const {installWolfveilArtisanTown}=await import(SOURCE+'wolfveil/WolfveilArtisanTownScene.mjs');
      town=installWolfveilArtisanTown(scene,{});
      const deadline=Date.now()+townTimeoutMs;
      while(town.status==='loading'&&Date.now()<deadline)await sleep(250);
      noteOnce('town: '+town.status);
    }catch(error){noteOnce('the town could not be installed: '+(error?.message||error));}
  }
  if(assetWaitMs>0)await sleep(assetWaitMs); // let owner trees, houses and palace arrive
  const assetState=key=>{try{return village[key]??null;}catch(error){return 'unreadable: '+error.message;}};
  const assets={
    houses:assetState('houseModelStatus'),palace:assetState('palaceLoadStatus'),
    ownerLandscape:assetState('uploadedLandscapeModels'),grassTiles:assetState('grassTileStatus'),
    town:town?.status||'not requested',
  };

  const weather={weather:'clear',windMph:7,windDir:'SW'};
  const clock={t:0};
  const position=toWorld(0,-70);
  let loader=null,portals=null;
  const events=[];
  // One game frame, in the order GameWorld3D runs it.
  // The player's feet follow the turf, as in the game, unless a cave visit
  // has put them underground.
  let underground=false;
  const frame=(dt=.1)=>{
    clock.t+=dt*1000;
    if(!underground){
      const turf=village.worldHeight?.(position.x,position.z);
      if(Number.isFinite(turf))position.y=turf;
    }
    loader?.update(position);
    portals?.update(dt,position,loader?.getArea());
    try{village.update(dt,weather,position);}
    catch(error){noteOnce('village.update needs a renderer here: '+(error?.message||error));}
    try{town?.update?.(dt,position);}
    catch(error){noteOnce('the town update stops headless: '+String(error?.message||error).slice(0,120));}
    scene.updateMatrixWorld();
  };
  const run=seconds=>{for(let i=0;i<Math.round(seconds*10);i++)frame(.1);};
  const moveTo=(x,z)=>{const next=toWorld(x,z);position.x=next.x;position.z=next.z;};
  const labelOf=node=>{
    let top=node,inValley=false;
    while(top.parent&&top.parent!==scene){
      if(top.parent===world.group){inValley=true;break;}
      top=top.parent;
    }
    // Per-area copies report under their source; streamed tiles (name ending
    // in grid coordinates) report as one family.
    const name=(top.name||top.type||'(unnamed)').replace(/^WV_Area_[a-z]+_/,'')
      .replace(/_-?\d+:-?\d+$/,'_*');
    return (inValley?'valley/':'scene/')+name;
  };
  // The portal arches are the loader's own decoration, not valley scenery.
  const measure=()=>measureVisibleScene(scene,{labelOf,
    skip:node=>node.name==='WV_Portal_AreaGateways'});
  const sameSet=(a,b)=>a.size===b.size&&[...a].every(id=>b.has(id));

  scene.updateMatrixWorld(true);
  run(1); // let owners settle before anything is measured
  const baseline=measure();
  // What is inside anything that costs many draw calls, grouped by mesh and
  // material name with the numbers stripped (Stair_12 and Stair_13 are one row).
  const family=node=>{
    const material=Array.isArray(node.material)?node.material[0]:node.material;
    return ((node.name||node.type||'mesh')+' / '+(material?.name||material?.type||'material'))
      .replace(/[-_ ]?\d+(?:[.:x]\d+)*/g,'#');
  };
  const breakdowns={};
  const describe=(label,root)=>{
    const rows=new Map();
    let materials=new Set(),geometries=new Set();
    root.traverse(node=>{
      if(!isRenderable(node))return;
      const cost=costOf(node),key=family(node);
      const row=rows.get(key)||{family:key,objects:0,drawCalls:0,triangles:0,instanced:0};
      row.objects++;row.drawCalls+=cost.drawCalls;row.triangles+=cost.triangles;
      if(node.isInstancedMesh)row.instanced++;
      rows.set(key,row);
      for(const material of Array.isArray(node.material)?node.material:[node.material])materials.add(material);
      geometries.add(node.geometry);
    });
    breakdowns[label]={materials:materials.size,geometries:geometries.size,
      rows:[...rows.values()].sort((a,b)=>b.drawCalls-a.drawCalls).slice(0,18)
        .map(row=>({...row,triangles:Math.round(row.triangles)}))};
  };
  for(const child of world.group.children){
    const calls=measureVisibleScene(child).drawCalls;
    if(calls>=20)describe('valley/'+(child.name||child.type),child);
  }
  if(town?.root)describe('scene/'+town.root.name,town.root);
  log('whole valley: '+baseline.drawCalls+' draw calls, '+baseline.triangles+' triangles');

  // ---- mount the loader and portals as GameWorld3D does ------------------------
  let groundDisposed=false;
  village.ground.geometry.addEventListener('dispose',()=>{groundDisposed=true;});
  started=performance.now();
  // The outline builder GameWorld3D uses, timed: a bake happens while playing.
  const farOutline=createWolfveilFarOutline({scene});
  const bakeMs={};
  loader=createWolfveilAreaLoader({
    world,position:toWorld(0,-70),portals:WOLFVEIL_AREA_PORTALS,
    now:()=>clock.t,onTransition:event=>events.push(event),
    groundHeightAt:(x,z)=>village.worldHeight(x,z),
    farProxy:{...farOutline,build(area,sources){
      const before=performance.now();
      const built=farOutline.build(area,sources);
      bakeMs[area]=Math.round((performance.now()-before)*10)/10;
      return built;
    }},
  });
  if(town?.root)loader.addUnits([town.root]);
  portals=createWolfveilAreaPortals(world);
  timings.mountLoaderMs=Math.round(performance.now()-started);
  check(portals.count===WOLFVEIL_AREA_PORTALS.length,'every planned portal gets an arch');
  started=performance.now();
  run(8); // two scans to accept scenery, a third to split settled batches
  timings.settleEightSecondsMs=Math.round(performance.now()-started);
  check(loader.getStats().failed===null,'loader failed open at spawn: '+loader.getStats().failed);

  const effectivelyVisible=node=>{
    for(let at=node;at;at=at.parent)if(at.visible===false)return false;
    return true;
  };
  const areaOfNode=node=>{
    const e=node.matrixWorld.elements;
    return plan.wolfveilAreaAtLocal(e[12],e[14]-OFFSET);
  };
  const floors=[...(world.walkableSurfaces||[])];
  const floorsVisibleAtBaseline=new Set(floors.filter(effectivelyVisible));

  // ---- what ONE camera view draws ----------------------------------------
  // The renderer skips every object whose bounds are outside the camera's
  // view. This is the same test, with the game's own camera, looking in
  // eight directions from behind the player.
  const {GAME3D_GAME2_CAMERA}=await import(SOURCE+'player/Game3DGame2Camera.mjs');
  const viewCamera=new THREE.PerspectiveCamera(GAME3D_GAME2_CAMERA.fov||60,16/9,.1,3200);
  const frustum=new THREE.Frustum(),projection=new THREE.Matrix4();
  const measureViews=()=>{
    scene.updateMatrixWorld(true);
    const back=GAME3D_GAME2_CAMERA.distance||3.45,views=[];
    for(let k=0;k<8;k++){
      const yaw=k*Math.PI/4,sin=Math.sin(yaw),cos=Math.cos(yaw);
      viewCamera.position.set(position.x-sin*back,position.y+2.3,position.z-cos*back);
      viewCamera.lookAt(position.x+sin*20,position.y+.6,position.z+cos*20);
      viewCamera.updateMatrixWorld(true);
      projection.multiplyMatrices(viewCamera.projectionMatrix,viewCamera.matrixWorldInverse);
      frustum.setFromProjectionMatrix(projection);
      const seen=measureVisibleScene(scene,{inView:node=>node.frustumCulled===false||
        (node.isSprite?frustum.intersectsSprite(node):frustum.intersectsObject(node))});
      views.push({drawCalls:seen.drawCalls,triangles:seen.triangles});
    }
    const pick=key=>({worst:Math.max(...views.map(view=>view[key])),
      average:Math.round(views.reduce((sum,view)=>sum+view[key],0)/views.length)});
    return {drawCalls:pick('drawCalls'),triangles:pick('triangles'),fov:viewCamera.fov};
  };

  // ---- one spot deep inside every area ----------------------------------
  const spots={town:[-34,-12],south:[-34,-407],west:[-370,-155],east:[336,-155],north:[0,395]};
  const areas={};
  for(const id of plan.WOLFVEIL_AREA_IDS){
    moveTo(...spots[id]);
    started=performance.now();
    frame();
    const enterMs=performance.now()-started;
    run(3);
    const stats=loader.getStats();
    const seen=measure();
    const views=measureViews();
    const snapshot=loader.inspect();
    // Grass that streams around the player differs from spot to spot, so the
    // fair comparison is the same spot, same frame, with the loader off.
    loader.setEnabled(false);
    const whole=measure();
    loader.setEnabled(true);
    check(stats.area===id,'expected to stand in '+id+' but the loader says '+stats.area);
    check(stats.loadedAreas.length===1&&stats.loadedAreas[0]===id,
      'deep inside '+id+' only that area should be loaded, got '+stats.loadedAreas.join('+'));
    check(effectivelyVisible(village.ground),'the terrain must stay drawn in '+id);
    for(const unit of snapshot.units){
      if(unit.area===id)check(unit.open,'scenery of the loaded area '+id+' is hidden: '+(unit.object.name||unit.object.type));
      else check(unit.targets.every(target=>target.visible===false),
        'scenery of unloaded '+unit.area+' is still drawn from '+id+': '+(unit.object.name||unit.object.type));
    }
    for(const batch of snapshot.batches){
      check(batch.source.count===batch.count,'a split batch lost instances: '+batch.source.name);
      check(batch.source.visible===false,'a split batch still draws its whole-map source: '+batch.source.name);
      const expected=batch.areas[id]||0,copy=batch.clones[id];
      check(expected===0||(copy&&copy.count===expected),
        'the '+id+' copy of '+batch.source.name+' is missing or the wrong size');
      check(Object.keys(batch.clones).every(area=>area===id),
        'copies of unloaded areas are still alive for '+batch.source.name);
    }
    for(const floor of floors){
      if(!floorsVisibleAtBaseline.has(floor)||areaOfNode(floor)!==id)continue;
      check(effectivelyVisible(floor),'a walkable floor in the loaded area '+id+' is hidden: '+(floor.name||'floor'));
    }
    check(seen.triangles<=whole.triangles,'loading only '+id+' draws more triangles than the whole valley from the same spot');
    check(seen.drawCalls<=whole.drawCalls,'loading only '+id+' issues more draw calls than the whole valley from the same spot');
    const budget=evaluateGame3DAreaBudget({platform:'browser',calls:seen.drawCalls,triangles:seen.triangles});
    areas[id]={
      drawCalls:seen.drawCalls,triangles:seen.triangles,objects:seen.objects,lights:seen.lights,
      views,
      wholeValleyHere:{drawCalls:whole.drawCalls,triangles:whole.triangles,lights:whole.lights},
      drawCallShare:seen.drawCalls/whole.drawCalls,triangleShare:seen.triangles/whole.triangles,
      browserBudget:{within:budget.within,over:[...budget.over],
        drawCallShare:budget.drawCallShare,triangleShare:budget.triangleShare},
      loader:{units:stats.units,batches:stats.batches,sceneryTriangles:stats.triangles,
        instances:[stats.loadedInstances,stats.sourceInstances]},
      enterFrameMs:Math.round(enterMs*10)/10,
      largest:[...seen.byLabel.values()].sort((a,b)=>b.triangles-a.triangles).slice(0,8)
        .map(entry=>({...entry,triangles:Math.round(entry.triangles)})),
    };
    log(id+': '+seen.drawCalls+' draw calls, '+seen.triangles+' triangles');
  }

  // ---- every portal, walked both ways -----------------------------------
  const portalResults=[];
  for(const portal of WOLFVEIL_AREA_PORTALS){
    const ends=[-30,30].map(d=>[portal.x+portal.dirX*d,portal.z+portal.dirZ*d]);
    const result={id:portal.id,crossings:[]};
    for(const [from,to] of [[ends[0],ends[1]],[ends[1],ends[0]]]){
      const origin=plan.wolfveilAreaAtLocal(...from),destination=plan.wolfveilAreaAtLocal(...to);
      moveTo(...from);run(1);
      check(loader.getArea()===origin,portal.id+': expected to start in '+origin+', got '+loader.getArea());
      const before=events.length;
      let bothLoaded=false,archSeen=false;
      for(let step=1;step<=40;step++){
        moveTo(from[0]+(to[0]-from[0])*step/40,from[1]+(to[1]-from[1])*step/40);
        frame();
        const loaded=loader.getStats().loadedAreas;
        if(loaded.includes(origin)&&loaded.includes(destination))bothLoaded=true;
        if(portals.visibleIds().includes(portal.id))archSeen=true;
      }
      const event=events.slice(before).find(entry=>entry.to===destination);
      const ok=Boolean(event)&&event.gateway===portal.id&&bothLoaded&&archSeen&&
        loader.getArea()===destination;
      check(Boolean(event),portal.id+': no arrival notice walking '+origin+' to '+destination);
      check(!event||event.gateway===portal.id,
        portal.id+': arrival was credited to '+(event?.gateway||'no portal')+' ('+origin+' to '+destination+')');
      check(bothLoaded,portal.id+': both sides were never loaded together during the crossing');
      check(archSeen,portal.id+': its arch was never shown while walking through it');
      result.crossings.push({from:origin,to:destination,ok,label:event?.label||null});
    }
    result.ok=result.crossings.every(crossing=>crossing.ok);
    portalResults.push(result);
  }

  // ---- nothing lost, nothing duplicated ----------------------------------
  // Each comparison is made inside one frame, so a model that finishes
  // downloading in the meantime cannot make two honest counts disagree.
  moveTo(...spots.town);run(3);
  const report=loader.getReport();
  // Per-area copies are built a few per frame, so "every area" is only
  // complete once the loader reports nothing left to build.
  const settleBuilds=(limit=600)=>{
    let frames=0;
    do{frame(.1);frames++;}while(loader.getStats().batches.building>0&&frames<limit);
    return frames;
  };
  loader.setMode('all');
  const allModeFrames=settleBuilds();
  run(1);
  const everything=measure();
  const allStats=loader.getStats();
  loader.setEnabled(false);
  const off=measure();
  loader.setEnabled(true);
  check(allStats.batches.building===0,
    'switching to every area never finished building its copies ('+
    allStats.batches.building+' still waiting after '+allModeFrames+' frames)');
  check(allStats.loadedInstances===allStats.sourceInstances,
    'with every area loaded the copies must add up to the source instances');
  const allModeGap=[];
  for(const label of new Set([...everything.byLabel.keys(),...off.byLabel.keys()])){
    const on=everything.byLabel.get(label)?.triangles||0;
    const whole=off.byLabel.get(label)?.triangles||0;
    if(Math.abs(on-whole)>1)allModeGap.push(label+' '+Math.round(on)+' vs '+Math.round(whole));
  }
  check(Math.abs(everything.triangles-off.triangles)<=2,
    'with every area loaded the triangle total must equal the whole valley ('+
    everything.triangles+' vs '+off.triangles+(allModeGap.length?
      '; differs in: '+allModeGap.slice(0,6).join(', '):'')+')');
  loader.setMode('single');settleBuilds();run(3);
  const exported=await loader.withFullMapExport(async()=>measure());
  loader.setEnabled(false);
  const offAtExport=measure();
  loader.setEnabled(true);
  check(sameSet(exported.ids,offAtExport.ids),'full-map export must see exactly the original objects');
  run(1);
  check(loader.getStats().loadedAreas.join('+')==='town','single-area loading resumes after an export');

  // ---- graphics memory release -------------------------------------------
  loader.setOptions({releaseGpuMemory:true,releaseDelaySeconds:1});
  moveTo(...spots.east);run(4);
  const release=loader.getStats().gpuRelease;
  check(!groundDisposed,'the terrain geometry must never be released');
  check(loader.getStats().failed===null,'loader failed open during GPU release: '+loader.getStats().failed);
  moveTo(...spots.town);run(2);
  check(!loader.getStats().gpuRelease.areas.includes('town'),'a reloaded area must not stay marked as released');
  loader.setOptions({releaseGpuMemory:false});

  // ---- land survey: what stands in each area, where it is bare, what floats --
  // Scattered scenery only (instanced meshes), as its owners show it with the
  // loader off. Ground is the visible ground mesh, where everything is planted.
  const {createWolfveilTerrainSurfaceSampler}=await import(SOURCE+'wolfveil/WolfveilTerrainSurfaceSampler.mjs');
  const groundAt=createWolfveilTerrainSurfaceSampler();
  const KINDS=[['grass',/grass|meadow|tuft|blade/i],['flowers',/flower|bloom|petal/i],
    ['shrubs and ferns',/shrub|fern|bush|reed/i],
    ['trees',/tree|elm|cedar|pine|maple|bamboo|crown|trunk|canopy|branch|foliage/i],
    ['stones',/stone|rock|boulder|basalt|pebble/i],['logs',/log|stump/i]];
  // "SWV_Instanced_<material>" batches are building parts (bridge planks of
  // cedar, piers of basalt), not planted scenery.
  const kindOf=name=>/^SWV_Instanced_/.test(name)?'other':
    (KINDS.find(([,test])=>test.test(name))||['other'])[0];
  const SQUARE=25;
  const survey=Object.fromEntries(plan.WOLFVEIL_AREA_IDS.map(id=>[id,
    {kinds:{},planted:new Set(),floating:[],buried:0,checked:0,squares:0}]));
  for(let x=-550+SQUARE/2;x<550;x+=SQUARE)for(let z=-550+SQUARE/2;z<550;z+=SQUARE){
    const area=plan.wolfveilAreaAtLocal(x,z);
    if(area)survey[area].squares++;
  }
  loader.setEnabled(false);
  scene.updateMatrixWorld(true);
  world.group.traverse(node=>{
    if(!node.isInstancedMesh||node.userData.wolfveilAreaClone||!effectivelyVisible(node)||
       /^SWV_Near_GrassBlades_|^WV_Area_/.test(node.name))return;
    if(!node.geometry.boundingBox)node.geometry.computeBoundingBox();
    const box=node.geometry.boundingBox,w=node.matrixWorld.elements,a=node.instanceMatrix.array;
    const cx=(box.min.x+box.max.x)/2,cy=(box.min.y+box.max.y)/2,cz=(box.min.z+box.max.z)/2;
    const hx=(box.max.x-box.min.x)/2,hy=(box.max.y-box.min.y)/2,hz=(box.max.z-box.min.z)/2;
    const kind=kindOf(node.name),m=new Array(16);
    for(let i=0;i<node.count;i++){
      const o=i*16;
      for(let c=0;c<4;c++)for(let r=0;r<4;r++)
        m[c*4+r]=w[r]*a[o+c*4]+w[4+r]*a[o+c*4+1]+w[8+r]*a[o+c*4+2]+w[12+r]*a[o+c*4+3];
      const x=m[0]*cx+m[4]*cy+m[8]*cz+m[12],y=m[1]*cx+m[5]*cy+m[9]*cz+m[13];
      const z=m[2]*cx+m[6]*cy+m[10]*cz+m[14]-OFFSET;
      const area=plan.wolfveilAreaAtLocal(x,z);
      if(!area)continue;
      const entry=survey[area];
      entry.kinds[kind]=(entry.kinds[kind]||0)+1;
      if(kind==='other')continue; // roof tiles, fences: not planted scenery
      if(kind!=='grass')entry.planted.add(Math.floor(x/SQUARE)+':'+Math.floor(z/SQUARE));
      const ground=groundAt(x,z);
      if(!Number.isFinite(ground))continue;
      entry.checked++;
      const half=Math.abs(m[1])*hx+Math.abs(m[5])*hy+Math.abs(m[9])*hz,gap=y-half-ground;
      // A bloom rides on its stem and a crown on its trunk: above the ground
      // by design.
      if(gap>.5&&!/bloom|foliage|crown|canopy/i.test(node.name))entry.floating.push({name:node.name,x:Math.round(x),z:Math.round(z),gap:Math.round(gap*10)/10});
      else if(y+half<ground-.1)entry.buried++;
    }
  });
  loader.setEnabled(true);run(.3);
  const surveyResult=Object.fromEntries(Object.entries(survey).map(([id,entry])=>{
    const byName={};
    for(const item of entry.floating)byName[item.name]=(byName[item.name]||0)+1;
    return [id,{hectares:Math.round(entry.squares*SQUARE*SQUARE/1000)/10,kinds:entry.kinds,
      squares:entry.squares,bareSquares:Math.max(0,entry.squares-entry.planted.size),
      checked:entry.checked,buried:entry.buried,floating:entry.floating.length,
      floatingByName:Object.entries(byName).sort((x,y)=>y[1]-x[1]).slice(0,4),
      worstFloating:entry.floating.sort((x,y)=>y.gap-x.gap).slice(0,3)}];
  }));

  // ---- near grass: every blade planted, far cells drawn with fewer segments --
  let grassResult=null;
  const nearGrass=village.individualGrass?.nearGrass;
  if(nearGrass?.setDetailLevels){
    const lawn=()=>{
      const out={cells:0,blades:0,triangles:0,perBlade:new Set()};
      world.group.traverse(node=>{
        if(!node.isInstancedMesh||!/^SWV_Near_GrassBlades_/.test(node.name)||node.visible===false)return;
        const each=node.geometry.index.count/3;
        out.cells++;out.blades+=node.count;out.triangles+=each*node.count;out.perBlade.add(each);
      });
      return out;
    };
    moveTo(...spots.south);run(6); // long enough for every cell around the player to be planted
    const light=lawn(),levels=[...nearGrass.detail];
    nearGrass.setDetailLevels(false);run(.2);
    const full=lawn();
    nearGrass.setDetailLevels(true);run(.2);
    const again=lawn();
    check(full.perBlade.size===1&&full.perBlade.has(21),
      'with detail levels off every blade must be the full 21 triangles ('+[...full.perBlade]+')');
    check([...light.perBlade].every(each=>[21,9,3].includes(each))&&light.perBlade.size===3,
      'near grass must draw blades of 21, 9 and 3 triangles ('+[...light.perBlade].sort((a,b)=>b-a)+')');
    check(light.blades===full.blades&&light.cells===full.cells,
      'detail levels must not remove a single blade ('+light.blades+' vs '+full.blades+')');
    check(light.triangles<full.triangles*.5,
      'detail levels must at least halve the near grass ('+light.triangles+' vs '+full.triangles+')');
    check(again.triangles===light.triangles,'switching grass detail off and on must give the same lawn');
    check(levels.reduce((sum,count)=>sum+count,0)===light.cells&&levels[0]>0,
      'cells per detail level must add up, with full detail around the player ('+levels+')');
    grassResult={cells:light.cells,blades:light.blades,cellsPerLevel:levels,
      triangles:light.triangles,fullTriangles:full.triangles};
  }

  // ---- far scenery: what an unloaded area still shows on the horizon ------
  // Typical standing height of one instance (world Y extent), as the loader
  // measures it, and an inventory of everything tall the loader manages.
  const instanceHeightOf=mesh=>{
    if(!mesh.geometry.boundingBox)mesh.geometry.computeBoundingBox();
    const size=mesh.geometry.boundingBox.getSize(new THREE.Vector3());
    const w=mesh.matrixWorld.elements,a=mesh.instanceMatrix.array,heights=[];
    const step=Math.max(1,Math.floor(mesh.count/24));
    for(let i=0;i<mesh.count;i+=step){
      const o=i*16,row=c=>w[1]*a[o+c*4]+w[5]*a[o+c*4+1]+w[9]*a[o+c*4+2];
      heights.push(Math.abs(row(0))*size.x+Math.abs(row(1))*size.y+Math.abs(row(2))*size.z);
    }
    heights.sort((x,y)=>x-y);
    return heights[heights.length>>1]||0;
  };
  const trianglesOf=mesh=>(mesh.geometry.index?mesh.geometry.index.count:
    mesh.geometry.attributes.position.count)/3;
  moveTo(...spots.town);run(.5);
  const farStats=loader.getStats().farScenery;
  const farKept=loader.getReport().alwaysLoaded.largest
    .filter(entry=>/far scenery/.test(entry.reason||''));
  const census=loader.inspect();
  const tallSplit=census.batches.map(batch=>({name:batch.source.name||'(unnamed)',
    instances:batch.count,height:instanceHeightOf(batch.source),
    triangles:Math.round(trianglesOf(batch.source)*batch.count),
    // Why it does or does not get an outline: how its material is drawn.
    drawn:(Array.isArray(batch.source.material)?batch.source.material:[batch.source.material])
      .map(material=>[material?.type,material?.transparent?'transparent':'opaque',
        'opacity '+material?.opacity,material?.depthWrite===false?'no depth':'depth',
        material?.alphaTest?'cutout '+material.alphaTest:'',material?.visible===false?'hidden':'']
        .filter(Boolean).join(' ')).join(' | ')}))
    .filter(entry=>entry.height>=4).sort((x,y)=>y.triangles-x.triangles);
  const tallUnits=[];
  for(const unit of census.units){
    const box=new THREE.Box3().setFromObject(unit.object);
    if(box.isEmpty())continue;
    const size=box.getSize(new THREE.Vector3());
    if(size.y<4)continue;
    tallUnits.push({name:unit.object.name||'(unnamed)',area:unit.area,height:size.y,
      width:Math.max(size.x,size.z),triangles:Math.round(unit.triangles),drawCalls:unit.drawCalls});
  }
  tallUnits.sort((x,y)=>y.height*y.width-x.height*x.width);
  // Far scenery is drawn from every area and never duplicated.
  let farResult=null;
  if(farStats?.enabled){
    const farObjects=[];
    scene.traverse(node=>{
      if(node.isInstancedMesh&&farKept.some(entry=>entry.name===node.name)&&
         !node.userData.wolfveilAreaClone)farObjects.push(node);
    });
    // A fallback tree that its owner switched off (the real model arrived)
    // is the owner's business, not the loader's.
    loader.setEnabled(false);
    const ownerHidden=new Set(farObjects.filter(node=>node.visible===false));
    loader.setEnabled(true);run(.3);
    const perArea={},outlineShown={};
    const outlineAreas=Object.keys(loader.getStats().farOutline.areas);
    for(const id of plan.WOLFVEIL_AREA_IDS){
      moveTo(...spots[id]);run(1);settleBuilds();
      const hidden=farObjects.filter(node=>node.visible===false&&!ownerHidden.has(node)).map(node=>node.name);
      check(!hidden.length,'far scenery hidden while standing in '+id+': '+hidden.slice(0,4).join(', '));
      perArea[id]=measure();
      // Outlines: every unloaded area that has one shows it; a loaded area never does.
      const state=loader.getStats();
      outlineShown[id]=[...state.farOutline.shown].sort();
      const expected=outlineAreas.filter(area=>!state.loadedAreas.includes(area)).sort();
      check(outlineShown[id].join()===expected.join(),'standing in '+id+' the outlines shown were ['+
        outlineShown[id]+'], expected ['+expected+']');
    }
    const outline=loader.getStats().farOutline;
    check(outline.enabled&&!outline.failed,'the far outline switched itself off: '+outline.failed);
    for(const [area,info] of Object.entries(outline.areas)){
      check(info.triangles>0&&info.triangles<=30000,
        'the '+area+' outline must stay within 30,000 triangles ('+info.triangles+')');
      check(info.triangles<info.sourceTriangles,
        'the '+area+' outline must be lighter than what it stands for ('+info.triangles+' vs '+info.sourceTriangles+')');
    }
    let outlineBroken=0;
    scene.traverse(node=>{
      if(!node.userData?.wolfveilFarOutline)return;
      const array=node.geometry.attributes.position.array;
      for(let i=0;i<array.length;i++)if(!Number.isFinite(array[i])){outlineBroken++;break;}
    });
    check(!outlineBroken,outlineBroken+' far outlines contain unreadable positions');
    // The price of the horizon: the same spots with the rule switched off.
    loader.setOptions({farScenery:false});
    moveTo(...spots.town);run(8);settleBuilds();
    const without={};
    for(const id of plan.WOLFVEIL_AREA_IDS){moveTo(...spots[id]);run(1);settleBuilds();without[id]=measure();}
    loader.setOptions({farScenery:true});
    moveTo(...spots.town);run(8);settleBuilds();
    check(loader.getStats().farScenery.batches===farStats.batches,
      'switching far scenery off and on again must find the same batches ('+
      loader.getStats().farScenery.batches+' vs '+farStats.batches+')');
    farResult={stats:farStats,kept:farKept,outline:{...outline,bakeMs,shownFrom:outlineShown},
      cost:Object.fromEntries(plan.WOLFVEIL_AREA_IDS.map(id=>[id,{
        drawCalls:perArea[id].drawCalls-without[id].drawCalls,
        triangles:perArea[id].triangles-without[id].triangles}]))};
  }

  // ---- planted sides: the four-sides plan as it stands in the valley ------
  let plantedResult=null;
  {
    const built=village.info?.plantedSides||null;
    check(Boolean(built),'the planted sides were not drawn (see the console error)');
    if(built){
      const meshes=[];
      world.group.traverse(node=>{
        if(node.isInstancedMesh&&node.userData?.source==='wolfveil_four_sides'&&
           !node.userData.wolfveilAreaClone)meshes.push(node);
      });
      check(meshes.length===built.drawCalls,
        'planted batches in the scene: '+meshes.length+', built: '+built.drawCalls);
      const drawnNow=mesh=>effectivelyVisible(mesh)||loader.inspect().batches
        .some(batch=>batch.source===mesh&&Object.values(batch.clones).some(effectivelyVisible));
      const seenFrom={};
      for(const id of ['town',...built.sides]){
        moveTo(...spots[id]);run(1.5);settleBuilds();
        seenFrom[id]=meshes.filter(drawnNow).map(mesh=>mesh.name).sort();
      }
      for(const side of built.sides){
        const own=meshes.filter(mesh=>mesh.userData.side===side);
        const missing=own.filter(mesh=>!seenFrom[side].includes(mesh.name)).map(mesh=>mesh.name);
        check(!missing.length,'standing in the '+side+' its planted scenery is not drawn: '+missing.join(', '));
        // Trees stay on the horizon from the town; ferns and flowers do not.
        const tall=own.filter(mesh=>instanceHeightOf(mesh)>=4).map(mesh=>mesh.name);
        const low=own.filter(mesh=>instanceHeightOf(mesh)<4).map(mesh=>mesh.name);
        const lost=tall.filter(name=>!seenFrom.town.includes(name));
        const leaked=low.filter(name=>seenFrom.town.includes(name));
        check(!lost.length,'from the town the '+side+' trees are missing from the horizon: '+lost.join(', '));
        check(!leaked.length,'from the town the '+side+' ground plants are still drawn: '+leaked.join(', '));
      }
      check(village.treeTrunkColliders>=built.sides.length,
        'planted trees must block the way (trunks: '+village.treeTrunkColliders+')');
      moveTo(...spots.town);run(1.5);settleBuilds();
      plantedResult={...built,trunks:village.treeTrunkColliders,seenFrom};
    }
  }

  // ---- town: owned by its own performance work on main -------------------
  // The town batches itself, swaps far buildings for its own proxies and
  // hides the rest: report what it hands the renderer from the square.
  let townResult=null;
  if(town){
    moveTo(...spots.town);run(1);
    loader.setEnabled(false);
    const fromSquare=measureVisibleScene(town.root);
    loader.setEnabled(true);run(.3);
    townResult={own:town.performanceStats||null,
      fromSquare:{drawCalls:fromSquare.drawCalls,triangles:fromSquare.triangles}};
  }

  // ---- caves: buried parts only underground, identical props one draw ----
  const caves=village.caveSystem;
  let caveResult=null;
  if(caves?.drawBudget?.stats()){
    const byMaterial=node=>{
      const list=Array.isArray(node.material)?node.material:[node.material];
      return list.map(material=>material?.name||material?.uuid||'none').join('+');
    };
    const measureCaves=()=>measureVisibleScene(caves.group,{labelOf:byMaterial});
    const boundsOf=()=>{
      scene.updateMatrixWorld(true);
      const box=new THREE.Box3().setFromObject(caves.group);
      return [box.min.x,box.min.y,box.min.z,box.max.x,box.max.y,box.max.z];
    };
    moveTo(...spots.town);run(.5);
    const onSurface=measureCaves();
    const surfaceStats=caves.drawBudget.stats();
    // The owner's sumi-e hallway along the modular tunnels.
    const halls=caves.modularCave?.halls||null,hallsObject=caves.modularCave?.hallsObject||null;
    check(Boolean(halls&&hallsObject),'the sumi-e hallway was not built (see the console warning)');
    let hallsSeen=null;
    if(hallsObject){
      check(!effectivelyVisible(hallsObject),'on the surface the buried hallway must not be drawn');
      hallsSeen=await caves.withInteriorShown(async()=>{
        const shown=effectivelyVisible(hallsObject),count=measureVisibleScene(hallsObject,{labelOf:byMaterial});
        return {shown,drawCalls:count.drawCalls,triangles:count.triangles};
      });
      check(hallsSeen.shown,'underground the hallway must be drawn');
      check(hallsSeen.drawCalls===halls.drawCalls&&hallsSeen.triangles===halls.triangles,
        'the hallway on screen ('+hallsSeen.drawCalls+' calls, '+hallsSeen.triangles+' triangles) is not what was baked ('+
        halls.drawCalls+', '+halls.triangles+')');
      check(halls.drawCalls<=14,'the hallway must stay a handful of draw calls: '+halls.drawCalls);
    }
    check(surfaceStats.interiorShown===false,
      'standing in town the buried cave interior must be switched off ('+surfaceStats.reason+')');
    // As built (budget off) against merged with the whole network shown.
    caves.drawBudget.setEnabled(false);
    const built=measureCaves(),builtBounds=boundsOf();
    caves.drawBudget.setEnabled(true);
    const merged=await caves.withInteriorShown(async()=>({count:measureCaves(),bounds:boundsOf()}));
    check(!caves.drawBudget.isInteriorShown(),'after a map export the cave interior must be hidden again');
    check(merged.count.triangles===built.triangles,
      'merging cave props must not add or lose triangles ('+merged.count.triangles+' vs '+built.triangles+')');
    const materialGap=[];
    for(const label of new Set([...built.byLabel.keys(),...merged.count.byLabel.keys()])){
      const was=built.byLabel.get(label)?.triangles||0,now=merged.count.byLabel.get(label)?.triangles||0;
      if(Math.abs(was-now)>.5)materialGap.push(label+' '+now+' vs '+was);
    }
    check(!materialGap.length,'cave triangles moved between materials: '+materialGap.slice(0,5).join(', '));
    const drift=Math.max(...builtBounds.map((value,i)=>Math.abs(value-merged.bounds[i])));
    check(drift<=.05,'merged cave props must occupy the same space as built (bounds moved '+drift.toFixed(3)+' m)');
    check(merged.count.drawCalls<built.drawCalls,
      'merging cave props must lower the draw calls ('+merged.count.drawCalls+' vs '+built.drawCalls+')');
    check(onSurface.drawCalls<merged.count.drawCalls,
      'on the surface fewer cave draws than underground ('+onSurface.drawCalls+' vs '+merged.count.drawCalls+')');
    // Walk in through the first arch: the interior must be there on arrival.
    const cave=caves.caves[0];
    const body={x:cave.mouth[0],y:cave.mouthY,z:cave.mouth[1]+OFFSET};
    const entered=caves.interact(body);
    let inside=null,wholeSceneInside=null,left=null;
    check(entered?.action==='enter','pressing E at the first cave arch did not enter the cave');
    if(entered?.action==='enter'){
      check(caves.drawBudget.isInteriorShown(),'the cave interior was not drawn on the frame the player arrived');
      underground=true;position.x=body.x;position.y=body.y;position.z=body.z;
      run(.5);
      check(caves.drawBudget.isInteriorShown(),'the cave interior switched off while the player stood inside');
      inside=measureCaves();wholeSceneInside=measure();
      left=caves.interact(position);
      if(left?.action==='exit'){
        underground=false;run(.5);
        check(!caves.drawBudget.isInteriorShown(),'back on the surface the cave interior must switch off again');
      }else noteOnce('the cave visit ended underground: no exit prompt where the arch drops the player');
    }
    caveResult={
      asBuilt:{drawCalls:built.drawCalls,triangles:built.triangles},
      onSurface:{drawCalls:onSurface.drawCalls,triangles:onSurface.triangles},
      insideCave:inside&&{drawCalls:inside.drawCalls,triangles:inside.triangles},
      wholeSceneInsideCave:wholeSceneInside&&{drawCalls:wholeSceneInside.drawCalls,triangles:wholeSceneInside.triangles},
      visit:{entered:entered?.name||null,left:left?.action||null},
      boundsDriftMeters:drift,budget:caves.drawBudget.stats(),halls,
    };
  }else check(!caves,'the cave draw budget failed to install (see the console warning)');

  // ---- hand everything back ----------------------------------------------
  check(loader.getStats().failed===null,'loader failed open: '+loader.getStats().failed);
  const finalStats=loader.getStats();
  loader.setEnabled(false);
  const offAtEnd=measure();
  loader.dispose();portals.dispose();
  const after=measure();
  check(sameSet(after.ids,offAtEnd.ids),'after dispose the scene must draw exactly what it drew with the loader off');
  let accessors=0,leftovers=0;
  scene.traverse(node=>{
    if(Object.getOwnPropertyDescriptor(node,'visible')?.get)accessors++;
    if(/^WV_(Area|Portal)_/.test(node.name||''))leftovers++;
  });
  check(accessors===0,accessors+' objects still carry the loader\'s visibility gate after dispose');
  check(leftovers===0,leftovers+' loader or portal objects were left in the scene');
  try{village.dispose();}catch(error){noteOnce('village.dispose: '+(error?.message||error));}
  const unhandled=[...new Set(globalThis.__wolfveilUnhandled||[])];
  if(unhandled.length)noteOnce('model downloads that failed without a handler: '+unhandled.slice(0,6).join(' | '));

  const top=(key,count=14)=>[...baseline.byLabel.values()].sort((a,b)=>b[key]-a[key]).slice(0,count)
    .map(entry=>({...entry,triangles:Math.round(entry.triangles)}));
  return {
    three:THREE.REVISION,withTown:Boolean(town),assets,timings,notes,failures,
    baseline:{drawCalls:baseline.drawCalls,triangles:baseline.triangles,objects:baseline.objects,
      largestByTriangles:top('triangles'),largestByDrawCalls:top('drawCalls')},
    breakdowns,
    loaderOff:{drawCalls:off.drawCalls,triangles:off.triangles},
    allAreasLoaded:{drawCalls:everything.drawCalls,triangles:everything.triangles},
    areas,portals:portalResults,caves:caveResult,town:townResult,
    survey:surveyResult,nearGrass:grassResult,farScenery:farResult,planted:plantedResult,tallScenery:{splitBatches:tallSplit.slice(0,20),units:tallUnits.slice(0,30),
      unitCount:tallUnits.length},
    loader:{units:finalStats.units,batches:finalStats.batches,
      sourceInstances:finalStats.sourceInstances,gpuRelease:release},
    report,
  };
}

export function formatWolfveilAreaLoadingReport(result){
  const n=value=>Math.round(value).toLocaleString('en-US');
  const pct=value=>Math.round(value*100)+'%';
  const lines=[];
  lines.push('Wolfveil five-area loading, real valley, Three.js r'+result.three+
    (result.withTown?' (with the artisan town)':' (without the town)'));
  lines.push('assets: '+JSON.stringify(result.assets));
  lines.push('timings: '+JSON.stringify(result.timings));
  lines.push('');
  lines.push('Everything handed to the renderer (all directions at once), standing deep inside each area:');
  lines.push('  area     whole valley from here         only this area loaded          kept      browser budget (500 calls / 1.5 M tris)');
  for(const [id,area] of Object.entries(result.areas))
    lines.push('  '+id.padEnd(6)+
      n(area.wholeValleyHere.drawCalls).padStart(7)+' calls '+n(area.wholeValleyHere.triangles).padStart(10)+' tris  '+
      n(area.drawCalls).padStart(7)+' calls '+n(area.triangles).padStart(10)+' tris   '+
      (pct(area.drawCallShare)+' / '+pct(area.triangleShare)).padEnd(10)+
      (area.browserBudget.within?'inside':'OVER '+area.browserBudget.over.join('+')).padEnd(26)+
      'switch-in frame '+area.enterFrameMs+' ms');
  lines.push('  (whole valley at the spawn: '+n(result.baseline.drawCalls)+' draw calls, '+
    n(result.baseline.triangles)+' triangles)');
  lines.push('');
  lines.push('One camera view, after the renderer\'s own culling (game camera, '+
    Object.values(result.areas)[0].views.fov+' degree view, eight directions):');
  lines.push('  area     worst direction                 average direction              browser budget (500 calls / 1.5 M tris)');
  for(const [id,area] of Object.entries(result.areas)){
    const v=area.views,over=[v.drawCalls.worst>500?'drawCalls':'',v.triangles.worst>1.5e6?'triangles':''].filter(Boolean);
    lines.push('  '+id.padEnd(6)+n(v.drawCalls.worst).padStart(7)+' calls '+n(v.triangles.worst).padStart(10)+' tris  '+
      n(v.drawCalls.average).padStart(7)+' calls '+n(v.triangles.average).padStart(10)+' tris   '+
      (over.length?'OVER '+over.join('+'):'inside'));
  }
  lines.push('');
  lines.push('Largest things on screen with only that area loaded:');
  for(const [id,area] of Object.entries(result.areas)){
    lines.push('  '+id+':');
    for(const entry of area.largest)
      lines.push('    '+n(entry.triangles).padStart(10)+' tris  '+String(entry.drawCalls).padStart(4)+' calls  '+
        String(entry.objects).padStart(4)+' objects  '+entry.label);
  }
  lines.push('');
  lines.push('Lights switched on (each one is paid for by every lit surface): '+
    Object.entries(result.areas).map(([id,area])=>id+' '+area.lights+' of '+area.wholeValleyHere.lights).join(', '));
  if(result.survey){
    lines.push('');
    lines.push('Land survey (scattered scenery as built; ground is the visible ground mesh; 25 m squares):');
    for(const [id,a] of Object.entries(result.survey)){
      lines.push('  '+id+': '+a.hectares+' ha. '+Object.entries(a.kinds).sort((x,y)=>y[1]-x[1])
        .map(([kind,count])=>kind+' '+n(count)).join(', '));
      lines.push('    squares with nothing planted but grass: '+a.bareSquares+' of '+a.squares+
        ' ('+Math.round(100*a.bareSquares/Math.max(1,a.squares))+'%)');
      lines.push('    off the ground, of '+n(a.checked)+' checked: '+a.floating+' more than 0.5 m above it, '+
        a.buried+' wholly under it'+(a.floating?'. Mostly '+a.floatingByName.map(([name,count])=>name+' x'+count).join(', ')+
        '. Worst: '+a.worstFloating.map(item=>item.gap+' m at x '+item.x+', z '+item.z+' ('+item.name+')').join('; '):''));
    }
  }
  if(result.nearGrass){
    const g=result.nearGrass;
    lines.push('');
    lines.push('Grass that follows the player (standing in the south): '+g.cells+' cells, '+n(g.blades)+
      ' blades. Every blade at full detail: '+n(g.fullTriangles)+' tris. By distance (21 / 9 / 3 triangles a blade, cells '+
      g.cellsPerLevel.join(' / ')+'): '+n(g.triangles)+' tris.');
  }
  if(result.planted){
    const p=result.planted;
    lines.push('');
    lines.push('Planted sides ('+p.sides.join(', ')+'): '+n(p.pieces)+' pieces, '+n(p.triangles)+
      ' triangles in '+p.drawCalls+' draw calls. Tree trunks that block the way, owner\'s and planted: '+n(p.trunks)+'.');
    for(const [key,entry] of Object.entries(p.byKind))
      lines.push('  '+key.replace(':',' ')+': '+n(entry.pieces)+' pieces, '+n(entry.triangles)+' triangles');
    lines.push('  Seen from the town: '+(p.seenFrom.town.join(', ')||'none'));
  }
  lines.push('');
  if(result.farScenery){
    const f=result.farScenery;
    lines.push('Far scenery (tall, cheap instanced scenery drawn from every area): '+
      f.stats.batches+' batches, '+n(f.stats.instances)+' instances, '+n(f.stats.triangles)+' triangles');
    for(const entry of f.kept)lines.push('  '+n(entry.triangles).padStart(9)+' tris  '+
      String(entry.drawCalls).padStart(3)+' calls  '+entry.name);
    lines.push('  what the horizon costs against unloading it: '+Object.entries(f.cost)
      .map(([id,c])=>id+' '+(c.drawCalls>=0?'+':'')+c.drawCalls+' calls '+(c.triangles>=0?'+':'')+n(c.triangles)+' tris').join(', '));
    lines.push('Far outline (tall scenery of an unloaded area as one coarse mesh, one draw call each):');
    for(const [area,info] of Object.entries(f.outline.areas))lines.push('  '+area.padEnd(6)+
      String(info.sources).padStart(4)+' tall objects  '+n(info.sourceTriangles).padStart(9)+' tris -> '+
      n(info.triangles).padStart(7)+' tris at '+info.cellMeters+' m grid, baked in '+
      (f.outline.bakeMs[area]??'?')+' ms');
    if(!Object.keys(f.outline.areas).length)lines.push('  no area has tall scenery to outline');
  }else lines.push('Far scenery: switched off');
  lines.push('Tall instanced scenery that is still unloaded (4 m and taller, too heavy to keep whole):');
  for(const entry of result.tallScenery.splitBatches)lines.push('  '+n(entry.triangles).padStart(9)+' tris  '+
    String(entry.instances).padStart(5)+' x '+entry.height.toFixed(1).padStart(5)+' m  '+entry.name+
    '   ['+entry.drawn+']');
  if(!result.tallScenery.splitBatches.length)lines.push('  none');
  lines.push('Tall single objects that are unloaded with their area ('+result.tallScenery.unitCount+
    ' in all; largest by silhouette):');
  for(const entry of result.tallScenery.units)lines.push('  '+entry.area.padEnd(6)+
    entry.height.toFixed(1).padStart(6)+' m tall '+entry.width.toFixed(1).padStart(6)+' m wide  '+
    n(entry.triangles).padStart(8)+' tris '+String(entry.drawCalls).padStart(4)+' calls  '+entry.name);
  if(result.town){
    lines.push('');
    lines.push('Town (artisan plaza, optimised by its own code on main): from the square '+
      result.town.fromSquare.drawCalls+' calls, '+n(result.town.fromSquare.triangles)+' tris; its own report '+
      JSON.stringify(result.town.own));
  }
  if(result.caves){
    const c=result.caves,row=entry=>entry?String(entry.drawCalls).padStart(4)+' calls  '+
      n(entry.triangles).padStart(8)+' tris':'   not measured';
    lines.push('');
    lines.push('Caves and tunnels (drawn from anywhere in the valley until now):');
    lines.push('  as built, always drawn      '+row(c.asBuilt));
    lines.push('  now, on the surface         '+row(c.onSurface));
    lines.push('  now, inside a cave          '+row(c.insideCave)+'   (whole scene while inside: '+row(c.wholeSceneInsideCave)+')');
    if(c.halls)lines.push('  sumi-e hallway: '+c.halls.runs+' runs, '+c.halls.meters+' m. As the owner\'s kit builds it: '+
      n(c.halls.meshesBefore)+' meshes, '+n(c.halls.trianglesBefore)+' triangles. Baked: '+c.halls.drawCalls+' draw calls, '+
      n(c.halls.triangles)+' triangles.');
    lines.push('  visit: entered '+(c.visit.entered||'nothing')+', then '+(c.visit.left||'stayed inside')+
      '; bounds moved '+c.boundsDriftMeters.toFixed(4)+' m');
    lines.push('  '+JSON.stringify(c.budget));
  }
  lines.push('');
  lines.push('Loader: '+JSON.stringify(result.loader));
  lines.push('');
  lines.push('Largest in the whole valley by triangles:');
  for(const entry of result.baseline.largestByTriangles)
    lines.push('  '+n(entry.triangles).padStart(11)+' tris  '+String(entry.drawCalls).padStart(4)+' calls  '+entry.label);
  lines.push('Largest in the whole valley by draw calls:');
  for(const entry of result.baseline.largestByDrawCalls)
    lines.push('  '+String(entry.drawCalls).padStart(4)+' calls  '+n(entry.triangles).padStart(11)+' tris  '+entry.label);
  for(const [label,detail] of Object.entries(result.breakdowns||{})){
    lines.push('');
    lines.push('Inside '+label+' ('+detail.materials+' materials, '+detail.geometries+' geometries):');
    for(const row of detail.rows)
      lines.push('  '+String(row.drawCalls).padStart(4)+' calls  '+n(row.triangles).padStart(9)+' tris  '+
        String(row.objects).padStart(4)+' objects'+(row.instanced?' ('+row.instanced+' instanced)':'')+'  '+row.family);
  }
  lines.push('');
  lines.push('Still drawn in every area ('+result.report.alwaysLoaded.objects+' objects, '+
    n(result.report.alwaysLoaded.drawCalls)+' draw calls, '+n(result.report.alwaysLoaded.triangles)+' triangles):');
  for(const entry of result.report.alwaysLoaded.largest)
    lines.push('  '+n(entry.triangles).padStart(11)+' tris  '+String(entry.drawCalls).padStart(4)+' calls  '+
      entry.name+'  ['+entry.reason+']');
  lines.push('Handed back to their owner (they change or move): '+
    (result.report.leftToOwner.join(', ')||'none'));
  lines.push('');
  lines.push('Per area (scenery the loader manages):');
  for(const [id,area] of Object.entries(result.report.areas))
    lines.push('  '+id.padEnd(6)+JSON.stringify(area));
  lines.push('');
  lines.push('Portals walked both ways: '+result.portals.filter(portal=>portal.ok).length+' of '+
    result.portals.length+' correct');
  for(const portal of result.portals.filter(entry=>!entry.ok))
    lines.push('  NOT OK '+portal.id+' '+JSON.stringify(portal.crossings));
  if(result.notes.length){lines.push('');lines.push('Notes:');for(const note of result.notes)lines.push('  '+note);}
  lines.push('');
  lines.push(result.failures.length?'FAILED CHECKS ('+result.failures.length+'):':'All checks passed.');
  for(const failure of result.failures)lines.push('  - '+failure);
  return lines.join('\n');
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const withTown=process.argv.includes('--town');
  const json=process.argv.includes('--json');
  try{
    const result=await runWolfveilAreaLoadingReport({
      withTown,assetWaitMs:withTown?12000:0,
      log:json?()=>{}:message=>console.log('… '+message),
    });
    console.log(json?JSON.stringify(result,null,1):'\n'+formatWolfveilAreaLoadingReport(result));
    process.exit(result.failures.length?1:0);
  }catch(error){
    console.error('The report could not run:',error);
    process.exit(2);
  }
}
