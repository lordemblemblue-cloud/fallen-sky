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
  const slope=(x,z)=>.5*x;      // 0.5 m rise per metre east
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
  assert.ok(plan.length>=150&&plan.length<=900,'outcrops: '+plan.length);
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
  assert.ok(field.outcrops>100);
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
