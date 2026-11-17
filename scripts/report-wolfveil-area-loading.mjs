#!/usr/bin/env node
// Runs the REAL five-area loader against the REAL Wolfveil valley, built from
// the same scene module the game uses and real Three.js objects, with no
// browser and no GPU. It walks the player into every area and through every
// portal, checks that nothing is lost, duplicated or wrongly hidden, and
// prints what one loaded area costs next to the whole valley.
//
//   node scripts/report-wolfveil-area-loading.mjs            the valley
//   node scripts/report-wolfveil-area-loading.mjs --town     + the imported town model (network)
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

const isRenderable=node=>Boolean(node.geometry&&(node.isMesh||node.isLine||node.isPoints||node.isSprite));
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
export function measureVisibleScene(root,{labelOf=()=>'scene',skip=()=>false}={}){
  const out={objects:0,drawCalls:0,triangles:0,ids:new Set(),byLabel:new Map()};
  const walk=node=>{
    if(node.visible===false||skip(node))return;
    if(isRenderable(node)){
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
      const {installWolfveilImportedTown}=await import(SOURCE+'wolfveil/WolfveilImportedTownScene.mjs');
      town=installWolfveilImportedTown(scene,{});
      const deadline=Date.now()+townTimeoutMs;
      while(town.status==='loading'&&Date.now()<deadline)await sleep(250);
      noteOnce('imported town model: '+town.status);
    }catch(error){noteOnce('imported town could not be installed: '+(error?.message||error));}
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
  const frame=(dt=.1)=>{
    clock.t+=dt*1000;
    loader?.update(position);
    portals?.update(dt,position,loader?.getArea());
    try{village.update(dt,weather,position);}
    catch(error){noteOnce('village.update needs a renderer here: '+(error?.message||error));}
    try{town?.update?.(dt,position);}catch{/* town actors need a renderer */}
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
    const name=(top.name||top.type||'(unnamed)').replace(/^WV_Area_[a-z]+_/,'');
    return (inValley?'valley/':'scene/')+name;
  };
  // The portal arches are the loader's own decoration, not valley scenery.
  const measure=()=>measureVisibleScene(scene,{labelOf,
    skip:node=>node.name==='WV_Portal_AreaGateways'});
  const sameSet=(a,b)=>a.size===b.size&&[...a].every(id=>b.has(id));

  scene.updateMatrixWorld(true);
  run(1); // let owners settle before anything is measured
  const baseline=measure();
  log('whole valley: '+baseline.drawCalls+' draw calls, '+baseline.triangles+' triangles');

  // ---- mount the loader and portals as GameWorld3D does ------------------------
  let groundDisposed=false;
  village.ground.geometry.addEventListener('dispose',()=>{groundDisposed=true;});
  started=performance.now();
  loader=createWolfveilAreaLoader({
    world,position:toWorld(0,-70),portals:WOLFVEIL_AREA_PORTALS,
    now:()=>clock.t,onTransition:event=>events.push(event),
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
    const snapshot=loader.inspect();
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
    check(seen.triangles<=baseline.triangles,'more triangles in '+id+' than in the whole valley');
    const budget=evaluateGame3DAreaBudget({platform:'browser',calls:seen.drawCalls,triangles:seen.triangles});
    areas[id]={
      drawCalls:seen.drawCalls,triangles:seen.triangles,objects:seen.objects,
      drawCallShare:seen.drawCalls/baseline.drawCalls,triangleShare:seen.triangles/baseline.triangles,
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
  loader.setMode('all');run(3);
  const everything=measure();
  const allStats=loader.getStats();
  loader.setEnabled(false);
  const off=measure();
  loader.setEnabled(true);
  check(allStats.loadedInstances===allStats.sourceInstances,
    'with every area loaded the copies must add up to the source instances');
  check(Math.abs(everything.triangles-off.triangles)<=2,
    'with every area loaded the triangle total must equal the whole valley ('+
    everything.triangles+' vs '+off.triangles+')');
  loader.setMode('single');run(3);
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
    loaderOff:{drawCalls:off.drawCalls,triangles:off.triangles},
    allAreasLoaded:{drawCalls:everything.drawCalls,triangles:everything.triangles},
    areas,portals:portalResults,
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
    (result.withTown?' (with the imported town model)':' (without the imported town model)'));
  lines.push('assets: '+JSON.stringify(result.assets));
  lines.push('timings: '+JSON.stringify(result.timings));
  lines.push('');
  lines.push('Everything handed to the renderer (all directions at once):');
  lines.push('  whole valley          '+n(result.baseline.drawCalls).padStart(6)+' draw calls  '+
    n(result.baseline.triangles).padStart(11)+' triangles');
  for(const [id,area] of Object.entries(result.areas))
    lines.push('  '+id.padEnd(6)+' only loaded    '+n(area.drawCalls).padStart(6)+' draw calls  '+
      n(area.triangles).padStart(11)+' triangles   ('+pct(area.drawCallShare)+' / '+
      pct(area.triangleShare)+' of the valley)  browser budget: '+
      (area.browserBudget.within?'inside':'OVER '+area.browserBudget.over.join('+'))+
      '   switch-in frame '+area.enterFrameMs+' ms');
  lines.push('');
  lines.push('Loader: '+JSON.stringify(result.loader));
  lines.push('');
  lines.push('Largest in the whole valley by triangles:');
  for(const entry of result.baseline.largestByTriangles)
    lines.push('  '+n(entry.triangles).padStart(11)+' tris  '+String(entry.drawCalls).padStart(4)+' calls  '+entry.label);
  lines.push('Largest in the whole valley by draw calls:');
  for(const entry of result.baseline.largestByDrawCalls)
    lines.push('  '+String(entry.drawCalls).padStart(4)+' calls  '+n(entry.triangles).padStart(11)+' tris  '+entry.label);
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
