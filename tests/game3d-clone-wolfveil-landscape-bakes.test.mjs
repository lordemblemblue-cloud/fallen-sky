/* global URL */
// Wolfveil landscaping round 2 (2026-11-16): high-poly -> baked -> low-poly.
// Terrain macro maps from a 0.54 m evaluation (+ erosion) of the shared
// height function, ground materials baked from real 3D scatter in Blender,
// sculpted rocks baked onto LOD meshes, and the range outcrops.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,statSync,existsSync} from 'node:fs';
import * as THREE from 'three';
import {
  wolfveilHeight,wolfveilDistanceToRiver,wolfveilAnyTrailClearance,
} from '../src/components/game3d/wolfveil/WolfveilLayout.js';
import {
  wolfveilMountainness,wolfveilFightingGroundAt,wolfveilMobAreaAt,
} from '../src/components/game3d/wolfveil/WolfveilLandscapeDesign.mjs';
import {
  WOLFVEIL_TERRAIN_MACRO,wolfveilTerrainMacroRect,wolfveilTerrainMacroChecksum,
} from '../src/components/game3d/wolfveil/WolfveilTerrainMacro.mjs';
import {
  createWolfveilTerrainSplatMaterial,wolfveilSplatTint,WOLFVEIL_SPLAT_LAYERS,
} from '../src/components/game3d/wolfveil/WolfveilTerrainSplat.js';
import {
  WOLFVEIL_BAKED_ROCKS,wolfveilRockMatrix,wolfveilRockVariant,normaliseWolfveilRockGeometry,
  installWolfveilBakedRockField,
} from '../src/components/game3d/wolfveil/WolfveilBakedRocks.js';
import {planWolfveilRangeOutcrops} from '../src/components/game3d/wolfveil/WolfveilRangeOutcrops.mjs';
import {planWolfveilLandscapeMarkers} from '../src/components/game3d/wolfveil/WolfveilLandscapeMarkers.js';

const file=p=>new URL('../'+p,import.meta.url);
const read=p=>readFileSync(file(p),'utf8');
const LANDSCAPE='public/game3d/landscape/';

test('terrain macro maps match the current height function (re-bake when the design changes)',()=>{
  const meta=JSON.parse(read(LANDSCAPE+WOLFVEIL_TERRAIN_MACRO.metaFile));
  assert.equal(meta.revision,WOLFVEIL_TERRAIN_MACRO.revision);
  assert.equal(meta.span,WOLFVEIL_TERRAIN_MACRO.span);
  assert.equal(meta.normalSize,2048);
  assert.equal(meta.maskSize,1024);
  assert.equal(meta.checksum,wolfveilTerrainMacroChecksum(wolfveilHeight),
    'stale macro bake: run node scripts/bake-wolfveil-terrain-macro.mjs');
  // Erosion is shading detail only, bounded so it never contradicts the mesh.
  assert.ok(meta.erosion.erodedP99<=2.6&&meta.erosion.depositedP99<=1.3);
  for(const url of [WOLFVEIL_TERRAIN_MACRO.normalUrl,WOLFVEIL_TERRAIN_MACRO.maskUrl]){
    const size=statSync(file('public'+url)).size;
    assert.ok(size>20_000&&size<1_500_000,url+' '+size);
  }
});

test('macro maps cover the 1,100 m core in world space (+70 m Play offset)',()=>{
  assert.deepEqual(wolfveilTerrainMacroRect(70),{x0:-550,z0:-480,width:1100,depth:1100});
  const {uniforms}=createWolfveilTerrainSplatMaterial({textures:false,macro:wolfveilTerrainMacroRect(70)});
  const r=uniforms.uMacroRect.value;
  assert.deepEqual([r.x,r.y],[-550,-480]);
  assert.ok(Math.abs(r.z-1/1100)<1e-9&&Math.abs(r.w-1/1100)<1e-9);
  // Off until both maps have loaded: placeholders never flatten the normals.
  assert.equal(uniforms.uMacroOn.value,0);
});

test('terrain shader samples the macro maps, sharpens rock/snow/scree per pixel and adds valley AO',()=>{
  const {material}=createWolfveilTerrainSplatMaterial({textures:false,macro:wolfveilTerrainMacroRect(70)});
  const shader={uniforms:{},
    vertexShader:'#include <common>\n#include <begin_vertex>\n',
    fragmentShader:'#include <common>\n#include <map_fragment>\n#include <roughnessmap_fragment>\n'+
      '#include <normal_fragment_maps>\n#include <aomap_fragment>\n'};
  material.onBeforeCompile(shader);
  const f=shader.fragmentShader;
  for(const token of ['tMacroN','tMacroM','uMacroRect','mFlow','mDepo','mCav','wvMacroAO',
    'reflectedLight.indirectDiffuse*=','uRockMean'])
    assert.ok(f.includes(token),'fragment shader lacks '+token);
  assert.ok(shader.uniforms.tMacroN&&shader.uniforms.uMacroOn);
  assert.equal(material.customProgramCacheKey(),'wolfveil-baked-splat-terrain-v3-macro');
});

test('palette tints are capped so grey ground over green grass cannot blow out blue',()=>{
  const t=wolfveilSplatTint([.06,.06,.06],[1,0,0,0]);
  assert.ok(Math.max(...t)<=3.2);
});

test('ground and cliff materials are baked from real high-poly scatter (dirt, grass, rock, cobble, brick)',()=>{
  const src=read('tools/landscape-bake/bake_materials.py');
  for(const recipe of ['recipe_dirt','recipe_grass','recipe_rock','recipe_cobble','recipe_brick'])
    assert.ok(src.includes('def '+recipe),recipe);
  assert.ok(src.includes('use_selected_to_active=True')&&src.includes("'NORMAL'")&&src.includes("'AO'"));
  assert.ok(src.includes('wrap_copies'),'instances crossing a tile edge must wrap (seamless)');
  for(const id of ['grass','dirt','rock','snow','cobble','brick'])
    for(const kind of ['albedo','normal']){
      const p=LANDSCAPE+`wv_${id}_${kind}.webp`;
      assert.ok(existsSync(file(p)),p);
      assert.ok(statSync(file(p)).size<2_000_000,p+' too large');
    }
  // Layer means used for tinting track the new bakes (sRGB).
  const dirt=WOLFVEIL_SPLAT_LAYERS.find(l=>l.id==='dirt');
  assert.ok(Math.abs(dirt.mean[0]-.411)<.02&&Math.abs(dirt.mean[2]-.228)<.02);
});

// --- wv_rocks.glb: parse the JSON chunk directly (no loader needed) --------
function glbJson(path){
  const b=readFileSync(file(path));
  assert.equal(b.toString('ascii',0,4),'glTF');
  const len=b.readUInt32LE(12);
  assert.equal(b.toString('ascii',16,20),'JSON');
  return JSON.parse(b.toString('utf8',20,20+len));
}

test('wv_rocks.glb: six sculpt-baked variants x three LODs share one atlas (WebP, tangents)',()=>{
  const gltf=glbJson(LANDSCAPE+'wv_rocks.glb');
  const names=new Set(gltf.nodes.map(n=>n.name));
  const budget=[1000,320,100];
  for(const v of WOLFVEIL_BAKED_ROCKS.variants)for(let lod=0;lod<3;lod++){
    const name=`wv_rock_${v}_LOD${lod}`;
    assert.ok(names.has(name),name);
    const node=gltf.nodes.find(n=>n.name===name);
    const prim=gltf.meshes[node.mesh].primitives[0];
    for(const a of ['POSITION','NORMAL','TANGENT','TEXCOORD_0'])assert.ok(a in prim.attributes,name+' '+a);
    const tris=gltf.accessors[prim.indices].count/3;
    assert.ok(tris<=budget[lod]&&tris>=budget[lod]*.05,name+' has '+tris+' triangles');
  }
  assert.equal(gltf.materials.length,1);
  const mat=gltf.materials[0];
  assert.ok(mat.pbrMetallicRoughness.baseColorTexture&&mat.normalTexture);
  assert.ok((gltf.extensionsUsed||[]).includes('EXT_texture_webp'));
  assert.ok(statSync(file(LANDSCAPE+'wv_rocks.glb')).size<2_500_000);
});

test('baked rock geometry is normalised to the unit-stone convention (base at y=0)',()=>{
  const g=normaliseWolfveilRockGeometry(new THREE.SphereGeometry(3.7,8,6).translate(5,2,-1));
  const b=g.boundingBox;
  for(const [v,e] of [[b.min.x,-1],[b.max.x,1],[b.min.z,-1],[b.max.z,1],[b.min.y,0],[b.max.y,2]])
    assert.ok(Math.abs(v-e)<1e-5,`${v} != ${e}`);
});

test('rocks rest on the LOWEST ground under their footprint; stacked or bedded rocks use the centre',()=>{
  const slope=x=>.5*x;          // 0.5 m rise per metre east
  const p={x:10,z:0,yaw:0,sx:2,sy:1,sz:1,sink:.2};
  const pos=new THREE.Vector3().setFromMatrixPosition(wolfveilRockMatrix(p,slope));
  assert.ok(Math.abs(pos.y-(.5*(10-2*.8)-.2))<1e-6,'downhill edge must not float: '+pos.y);
  const centre=new THREE.Vector3().setFromMatrixPosition(wolfveilRockMatrix({...p,grounding:'center'},slope));
  assert.ok(Math.abs(centre.y-(5-.2))<1e-6);
  const cairn=new THREE.Vector3().setFromMatrixPosition(wolfveilRockMatrix({...p,sink:-.5},slope));
  assert.ok(Math.abs(cairn.y-5.5)<1e-6);
  assert.equal(wolfveilRockVariant('standing',3),'standing');
  assert.ok(WOLFVEIL_BAKED_ROCKS.variants.includes(wolfveilRockVariant('outcrop',7)));
});

test('range outcrops sit on steep mountain flanks, clear of trails, river and encounter sites',()=>{
  const plan=planWolfveilRangeOutcrops();
  assert.ok(plan.length>=100&&plan.length<=900,'outcrops: '+plan.length);
  assert.deepEqual(planWolfveilRangeOutcrops().slice(0,5),plan.slice(0,5),'deterministic');
  for(const o of plan){
    assert.ok(wolfveilMountainness(o.x,o.z)>=.25);
    assert.ok(wolfveilAnyTrailClearance(o.x,o.z)>=9);
    assert.ok(wolfveilDistanceToRiver(o.x,o.z)>=22);
    assert.ok(!wolfveilFightingGroundAt(o.x,o.z,12)&&!wolfveilMobAreaAt(o.x,o.z,12));
    assert.ok(o.sink<=1.2*o.sy+1e-9,'buried more than 60%');
    assert.equal(o.grounding,'center');
  }
});

test('one baked field replaces wayfinding + trail stones and adds outcrops; fallback stays until ready',()=>{
  const world={group:new THREE.Group()};
  const marker=new THREE.Mesh(),stones=[new THREE.Mesh(),new THREE.Mesh()];
  const markers={plan:planWolfveilLandscapeMarkers(),mesh:marker};
  const trail={rockPlan:[{x:10,z:20,size:.4,stretch:1.1,squash:.8,yaw:1,tilt:.1,tone:.5,moss:.3}],rockMeshes:stones};
  let load=null;
  const loader={load(url,ok,progress,fail){load={url,ok,fail};}};
  const field=installWolfveilBakedRockField(world,{trailLandscaping:trail,landscapeMarkers:markers,
    heightAt:wolfveilHeight,loader});
  assert.equal(load.url,WOLFVEIL_BAKED_ROCKS.url);
  assert.equal(field.count,markers.plan.length+1+field.outcrops);
  assert.ok(field.outcrops>=100);
  assert.equal(field.ready,false);
  assert.ok(marker.visible&&stones.every(s=>s.visible),'fallback stones visible until the GLB is ready');
  assert.equal(world.group.getObjectByName('SWV_BakedRockField').visible,false);
  load.fail(new Error('offline'));
  assert.equal(field.failed,true);
  assert.ok(marker.visible,'a failed load keeps the procedural stones');
  field.dispose();
});

test('scene installs the baked rock field and the macro maps only for Game 3D',()=>{
  const scene=read('src/components/game3d/wolfveil/WolfveilScene.js');
  assert.ok(scene.includes('installWolfveilBakedRockField(world'));
  assert.ok(scene.includes('options.originAtMarket&&options.bakedRocks!==false'));
  assert.ok(scene.includes('bakedRocks?.update(playerPosition.x,playerPosition.z-offsetZ)'));
  assert.ok(scene.includes('wolfveilTerrainMacroRect(offsetZ)'));
  const meadow=read('src/components/game3d/wolfveil/WolfveilLivingMeadow.js');
  assert.ok(meadow.includes('macro:wolfveilTerrainMacroRect(offsetZ)'));
});

// --- paving, washed-out trail landscaping, live wind ----------------------
import {
  WOLFVEIL_PAVING,WOLFVEIL_KERB,wolfveilPavingFor,narrowWolfveilStrip,wolfveilKerbsForStrip,
  createWolfveilPavingCollector,
} from '../src/components/game3d/wolfveil/WolfveilPavedRoads.js';
import {
  planWolfveilTrailBreakLandscape,wolfveilTrailBreakGravel,
} from '../src/components/game3d/wolfveil/WolfveilTrailBreakLandscape.mjs';
import {WOLFVEIL_TRAIL_BREAKS,wolfveilRoutePointAt} from '../src/components/game3d/wolfveil/WolfveilTrailBreaks.mjs';
import {WOLFVEIL_ROUTES} from '../src/components/game3d/wolfveil/WolfveilLayout.js';
import {parseLiveWind,createLiveWind,LIVE_WIND_COMPASS} from '../src/components/game3d/render/liveWind.mjs';

test('main road is granite setts, residential lanes herringbone brick, trails stay packed dirt',()=>{
  assert.equal(wolfveilPavingFor({kind:'primary'}).surface,'cobble');
  assert.equal(wolfveilPavingFor({kind:'residential'}).surface,'brick');
  for(const kind of ['explore','ridge','riverside','frontier'])assert.equal(wolfveilPavingFor({kind}),null);
  assert.ok(WOLFVEIL_ROUTES.some(r=>r.kind==='primary')&&WOLFVEIL_ROUTES.some(r=>r.kind==='residential'));
  assert.ok(Math.abs(WOLFVEIL_PAVING.primary.meters-2.34)<1e-9&&Math.abs(WOLFVEIL_PAVING.residential.meters-2.1)<1e-9);
});

test('paving is the dirt strip narrowed to the real road width, with fitted kerbs on both edges',()=>{
  // A 6 m road with 1.4 m of feathered dirt verge, 3 m long, running +z.
  const half=(6+1.4)/2,corners=[[-half,0],[half,0],[half,3],[-half,3]];
  const paved=narrowWolfveilStrip(corners,6/7.4);
  assert.ok(Math.abs(paved[1][0]-paved[0][0]-6)<1e-9,'paved width is the route width');
  const kerbs=wolfveilKerbsForStrip(paved);
  const left=kerbs.filter(k=>k.x<0),right=kerbs.filter(k=>k.x>0);
  assert.equal(left.length,right.length);
  assert.equal(left.length,Math.round(3/WOLFVEIL_KERB.length));
  for(const k of kerbs)assert.ok(Math.abs(Math.abs(k.x)-(3+WOLFVEIL_KERB.width/2+.015))<1e-9,'kerb just outside the paving');
  const total=left.reduce((s,k)=>s+k.length+WOLFVEIL_KERB.gap,0);
  assert.ok(Math.abs(total-3)<1e-9,'kerbs fill each edge exactly');
});

test('paving drapes on the terrain triangles and is decorative only (no raycast, no collider)',()=>{
  const collector=createWolfveilPavingCollector({terrainSpan:1100,terrainSegments:310});
  const route=WOLFVEIL_ROUTES.find(r=>r.kind==='primary');
  const p=wolfveilRoutePointAt(route,40),n=(route.width+1.4)/2;
  const corners=[[p.x-n,p.z],[p.x+n,p.z],[p.x+n,p.z+1.5],[p.x-n,p.z+1.5]];
  assert.ok(collector.add(route,corners,1.4));
  assert.equal(collector.add({kind:'explore',width:2.8},corners,1.4),false);
  const world={group:new THREE.Group(),meshes:[],ownedMaterials:[],mesh(o){this.group.add(o);this.meshes.push(o);return o;}};
  const built=collector.build(world,{textures:false});
  const mesh=built.meshes.cobble;
  assert.ok(mesh.geometry.getAttribute('position').count>=6);
  assert.equal(mesh.name,'SWV_PavedRoad_cobble');
  assert.ok(mesh.userData.decorativeOnly&&mesh.userData.nonCollider);
  const hits=[];mesh.raycast(new THREE.Raycaster(),hits);assert.equal(hits.length,0);
  assert.ok(built.kerbCount>=4&&built.kerbs.name==='SWV_PavedRoad_Kerbstones');
});

test('washed-out trail stretches: stepping stones on the old line, washout boulders, scree, gravel',()=>{
  const plan=planWolfveilTrailBreakLandscape();
  const by=k=>plan.filter(p=>p.kind===k);
  assert.ok(by('stepping').length>=WOLFVEIL_TRAIL_BREAKS.length*8);
  assert.ok(by('gate').length>=WOLFVEIL_TRAIL_BREAKS.length*4);
  assert.ok(by('scree').length>=WOLFVEIL_TRAIL_BREAKS.length*6);
  for(const s of by('stepping')){
    assert.equal(s.variant,'flat');
    assert.ok(s.sy<.12,'stepping stones stay low enough to walk over');
  }
  for(const gap of WOLFVEIL_TRAIL_BREAKS){
    const route=WOLFVEIL_ROUTES.find(r=>r.id===gap.route);
    const mid=wolfveilRoutePointAt(route,(gap.from+gap.to)/2);
    assert.ok(wolfveilTrailBreakGravel(mid.x,mid.z)>.95,gap.route+' break centre is gravel');
    assert.equal(wolfveilTrailBreakGravel(mid.x+40,mid.z+40),0);
  }
  assert.deepEqual(planWolfveilTrailBreakLandscape().slice(0,3),plan.slice(0,3),'deterministic');
});

test('live wind reads the real weather: 16-point compass, "5 to 10 mph" text, eased and gusting',()=>{
  assert.equal(Object.keys(LIVE_WIND_COMPASS).length,16);
  assert.deepEqual(parseLiveWind({windDir:'NNE',windMph:'5 to 12 mph'}),{fromDeg:22.5,mph:12});
  assert.deepEqual(parseLiveWind({windDir:'W',windMph:9}),{fromDeg:270,mph:9});
  assert.deepEqual(parseLiveWind({}),{fromDeg:null,mph:null});
  const wind=createLiveWind({fromDeg:225,mph:7});
  let s=wind.update(1/60,{windDir:'N',windMph:20});
  assert.ok(s.fromDeg<226&&s.fromDeg>224,'direction eases, it does not snap');
  for(let i=0;i<900;i++)s=wind.update(1/60,{windDir:'N',windMph:20});
  assert.ok(s.fromDeg<1||s.fromDeg>359,'reached north by the shortest arc');
  assert.ok(Math.abs(s.mph-20)<1);
  assert.ok(Math.abs(s.dir[0])<.02&&s.dir[1]<-.99,'a north wind blows toward -z (south)');
  const phase=s.sheet;s=wind.update(.1,{windDir:'N',windMph:20});
  assert.ok(s.sheet>phase,'gust fronts keep travelling downwind');
  assert.ok(s.gust>=0&&s.gust<=1&&s.strength>.3);
});

test('every grass system reads the same live wind (Blaze meadow, streamed meadow clumps, scene frame)',()=>{
  const blaze=read('src/components/game3d/render/BlazeOfGrassWorld.mjs');
  assert.ok(blaze.includes('liveWind.update(step,weather)')&&blaze.includes('uWindSheet'));
  const shaders=read('src/components/game3d/render/BlazeGrassShaders.mjs');
  assert.ok(shaders.includes('liveWindSheet(origin.xz,windDir,uWindSheet.x)')&&shaders.includes('vWindSheet'));
  const meadow=read('src/components/game3d/wolfveil/WolfveilLivingMeadow.js');
  assert.ok(meadow.includes('liveWind.update(dt,weather)')&&meadow.includes('liveWindSheet(grassRoot.xz'));
  const scene=read('src/components/game3d/wolfveil/WolfveilScene.js');
  assert.ok(scene.includes('const live=liveWind.update(dt,weather);'));
});

// --- baked plant cards + restored owner elm --------------------------------
import {WOLFVEIL_PLANT_ATLAS,WOLFVEIL_FLOWER_CELLS,wolfveilPlantCell}
  from '../src/components/game3d/wolfveil/WolfveilPlantCardAtlas.mjs';
import {createWolfveilPlantCardGeometry,createWolfveilPlantCardKit}
  from '../src/components/game3d/wolfveil/WolfveilPlantCards.js';

test('plant card atlas table matches the Blender bake (wv_plants.json)',()=>{
  const meta=JSON.parse(read(LANDSCAPE+'wv_plants.json'));
  assert.equal(meta.revision,WOLFVEIL_PLANT_ATLAS.revision);
  assert.equal(meta.grid,WOLFVEIL_PLANT_ATLAS.grid);
  const names=Object.keys(meta.cells);
  assert.deepEqual(names,Object.keys(WOLFVEIL_PLANT_ATLAS.cells),'same plants in the same atlas order');
  names.forEach((name,i)=>{
    const c=meta.cells[name],ours=WOLFVEIL_PLANT_ATLAS.cells[name];
    assert.equal(ours.index,i);
    assert.ok(Math.abs(c.size-ours.size)<1e-3,name+' card size '+c.size+' vs '+ours.size);
    assert.ok(c.highPolyTriangles>=700,name+' is a real high-poly model');
    const col=i%4,row=Math.floor(i/4);
    assert.deepEqual(c.rect,[col/4,row/4,(col+1)/4,(row+1)/4]);
  });
  for(const f of ['wv_plants_albedo.webp','wv_plants_normal.webp']){
    const size=statSync(file(LANDSCAPE+f)).size;
    assert.ok(size>100_000&&size<1_500_000,f+' '+size);
  }
  assert.deepEqual(WOLFVEIL_FLOWER_CELLS,['flower_white','flower_yellow','flower_purple','flower_red','flower_pink']);
  const cell=wolfveilPlantCell('fern');
  assert.ok(cell.uv[0]>.75&&cell.uv[0]<.751&&cell.uv[2]<.25,'inset fern cell');
  assert.equal(wolfveilPlantCell('nope').name,'tuft_green');
});

test('plant cards: three crossed quads, per-instance atlas cell, hidden until the atlas loads',()=>{
  const g=createWolfveilPlantCardGeometry();
  assert.equal(g.getAttribute('position').count,12);
  assert.equal(g.index.count/3,6);
  g.computeBoundingBox();
  assert.ok(g.boundingBox.min.y===0&&g.boundingBox.max.y===1);
  const world={group:new THREE.Group(),meshes:[],ownedMaterials:[],mesh(o){this.group.add(o);this.meshes.push(o);return o;}};
  const kit=createWolfveilPlantCardKit({textures:false});
  const old=new THREE.Mesh();
  const items=[{x:1,y:2,z:3,yaw:.5,size:1,dry:false,tone:.5},{x:9,y:2,z:3,yaw:0,size:1.2,dry:true,tone:.1}];
  const layer=kit.layer(world,items,{name:'SWV_BakedCard_Test',cellOf:t=>t.dry?'tuft_dry':'tuft_green',
    heightOf:(t,c)=>c.size*t.size,fallback:[old]});
  assert.equal(layer.count,2);
  const mesh=layer.meshes[0];
  assert.equal(mesh.visible,false,'cards hidden until the atlas textures are ready');
  assert.ok(old.visible,'procedural plants stay as the fallback');
  const cells=mesh.geometry.getAttribute('aCell');
  assert.equal(cells.itemSize,4);
  const m=new THREE.Matrix4();mesh.getMatrixAt(0,m);
  const s=new THREE.Vector3().setFromMatrixScale(m);
  assert.ok(Math.abs(s.y-WOLFVEIL_PLANT_ATLAS.cells.tuft_green.size)<1e-6);
  assert.ok(mesh.userData.decorativeOnly&&mesh.userData.nonCollider);
  const shader={uniforms:{},vertexShader:'#include <common>\n#include <uv_vertex>\n#include <project_vertex>\n',
    fragmentShader:'#include <normal_fragment_begin>\n#include <normal_fragment_maps>\n'};
  kit.material.onBeforeCompile(shader);
  for(const t of ['attribute vec4 aCell','liveWindSheet(plantRoot.xz','vMapUv=uv*aCell.zw+aCell.xy'])
    assert.ok(shader.vertexShader.includes(t),'vertex lacks '+t);
  assert.ok(shader.fragmentShader.includes('getTangentFrame(-vViewPosition,cardN,vNormalMapUv)'));
  kit.update({time:3,wind:[1,0],gust:.5,windSheet:12,windGust:.4});
  assert.equal(kit.uniforms.uPlantSheet.value.x,12);
  kit.dispose();
});

test('scene swaps flowers, shrubs, ferns, reeds and tufts to baked cards (Game 3D only)',()=>{
  const scene=read('src/components/game3d/wolfveil/WolfveilScene.js');
  assert.ok(scene.includes('options.originAtMarket&&options.groundCover&&options.bakedPlants!==false'));
  assert.ok(scene.includes('plantCards?.update(frame)'));
  const living=read('src/components/game3d/wolfveil/WolfveilLivingLandscape.js');
  for(const n of ['SWV_BakedCard_Wildflowers','SWV_BakedCard_Shrubs','SWV_BakedCard_Ferns','SWV_BakedCard_Reeds'])
    assert.ok(living.includes(n),n);
  assert.ok(read('src/components/game3d/wolfveil/WolfveilTrailLandscaping.js').includes('SWV_BakedCard_GrassTufts'));
  assert.ok(read('tools/landscape-bake/bake_plants.py').includes('def plant_fern'));
});

test("the owner's elm model is present in the clone (no lollipop placeholder elms)",()=>{
  const b=readFileSync(file('public/game3d/elm-owner-optimized.glb'));
  assert.equal(b.toString('ascii',0,4),'glTF');
  assert.ok(b.length>1_000_000);
  assert.ok(read('src/components/game3d/render/forestOwnerElmAssets.js').includes('/game3d/elm-owner-optimized.glb'));
});

// --- existing rock meshes folded into the baked field ----------------------
import {createWolfveilBakedRockField} from '../src/components/game3d/wolfveil/WolfveilBakedRocks.js';

test('path-edge / owner-square / gorge stones fold into the baked field without touching their meshes',()=>{
  const world={group:new THREE.Group()};
  let ready=null;
  const field=createWolfveilBakedRockField(world,[],{heightAt:()=>0,loader:{load(url,ok){ready=ok;}}});
  const geo=new THREE.IcosahedronGeometry(1,1),shared=new THREE.MeshStandardMaterial();
  shared.name='Wolfveil_WeatheredPathEdgeStone';
  const stones=new THREE.InstancedMesh(geo,shared,2);
  const m=new THREE.Matrix4();
  stones.setMatrixAt(0,m.compose(new THREE.Vector3(0,0,0),new THREE.Quaternion(),new THREE.Vector3(.3,.12,.3)));
  stones.setMatrixAt(1,m.compose(new THREE.Vector3(10,0,0),new THREE.Quaternion(),new THREE.Vector3(.3,.12,.3)));
  stones.setColorAt(0,new THREE.Color(.2,.3,.2));stones.setColorAt(1,new THREE.Color(.4,.4,.4));
  const square=new THREE.InstancedMesh(geo,shared,1);   // owner square sharing the material
  const gorgeMat=new THREE.MeshStandardMaterial();
  const gorge=new THREE.InstancedMesh(geo,gorgeMat,1);
  gorge.setMatrixAt(0,m.compose(new THREE.Vector3(2,0,2),new THREE.Quaternion(),new THREE.Vector3(3,2,3)));
  world.group.add(stones,square,gorge);
  assert.equal(field.adopt(stones,{variants:['rubble','flat'],copyColors:true,scale:.9}),2);
  assert.equal(field.adopt(gorge,{variants:['boulder'],keepRaycast:true}),1);
  assert.equal(field.count,3);
  assert.ok(stones.visible&&gorge.material===gorgeMat,'nothing changes until the GLB is ready');
  const scene=new THREE.Group();
  for(const v of WOLFVEIL_BAKED_ROCKS.variants)for(let lod=0;lod<3;lod++){
    const node=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshStandardMaterial());
    node.name=`wv_rock_${v}_LOD${lod}`;scene.add(node);
  }
  ready({scene});
  assert.equal(field.ready,true);
  assert.equal(stones.visible,false,'decorative stones hide once baked copies are live');
  assert.equal(square.visible,true,'a mesh that was not adopted is untouched');
  assert.equal(shared.colorWrite,true,'the shared owner-tile material is never mutated');
  assert.ok(gorge.visible&&gorge.material!==gorgeMat&&gorge.material.colorWrite===false,
    'raycast meshes keep raycasting through an invisible material clone');
  field.setFilter(x=>x<5);
  field.update(0,0);
  const drawn=field.lodCounts.reduce((a,b)=>a+b,0);
  assert.equal(drawn,2,'region filter drops the stone at x=10');
  field.dispose();
  assert.equal(stones.visible,true);
  assert.equal(gorge.material,gorgeMat);
});
