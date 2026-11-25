import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createControlPointSkyTexture,applyControlPointDaylight,createMountainLakeEnvironment} from '../src/components/duelist/client/maps/controlPointDaylight.mjs';

test('sky is a deterministic small opaque baked texture, without browser or GPU dependencies',()=>{
  const a=createControlPointSkyTexture(),b=createControlPointSkyTexture();
  try{
    assert.equal(a.image.width,256);assert.equal(a.image.height,128);
    assert.deepEqual(a.image.data,b.image.data);assert.equal(a.generateMipmaps,false);
    for(let i=3;i<a.image.data.length;i+=4)assert.equal(a.image.data[i],255);
    assert.ok(a.image.data.every((v,i)=>i%4===3||v>=30));
  }finally{a.dispose();b.dispose();}
});
test('daylight adds one decorative environment group, brightens both sides of the deck and restores scene settings',()=>{
  const scene=new THREE.Scene();scene.background=new THREE.Color(0x080b10);scene.fog=new THREE.Fog(0x080b10,40,140);
  const camera=new THREE.PerspectiveCamera(55,1,.05,400);
  const renderer={shadowMap:{enabled:true},toneMappingExposure:1.1};
  const lights={hemi:new THREE.HemisphereLight(0x8fb8ff,0x1a2130,1.2),sun:new THREE.DirectionalLight(0xffe2c4,2.2),rimLight:new THREE.DirectionalLight(),fills:[]};
  const materials={hexDeck:new THREE.MeshStandardMaterial({color:0xdbeafe,metalness:.62})};
  const old={background:scene.background,fog:scene.fog,ground:lights.hemi.groundColor.getHex()};
  const day=applyControlPointDaylight({scene,camera,renderer,lights,materials});
  assert.equal(scene.children.length,1);assert.equal(day.sky.material.depthWrite,false);
  assert.ok(day.sky.geometry.index.count/3<=1000);
  assert.equal(renderer.shadowMap.enabled,false);assert.equal(scene.fog.near,420);assert.equal(scene.fog.far,960);assert.ok(lights.hemi.groundColor.getHex()>old.ground);
  assert.ok(materials.hexDeck.metalness<.62);
  day.dispose();assert.equal(scene.children.length,0);assert.equal(scene.background,old.background);assert.equal(scene.fog,old.fog);assert.equal(camera.far,400);assert.equal(renderer.shadowMap.enabled,true);assert.equal(lights.hemi.groundColor.getHex(),old.ground);
  materials.hexDeck.dispose();
});

test('imported mountains face the basin, lake animates, and visible sun matches lighting',()=>{
  const e=createMountainLakeEnvironment();
  try{
    let triangles=0,meshes=0;
    e.group.traverse(o=>{if(o.isMesh){meshes++;triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;}});
    assert.ok(meshes<=10);assert.ok(triangles<=1600);
    for(const name of ['Mountain_Ring_Near','Mountain_Ring_Far']){
      const n=e.group.getObjectByName(name).geometry.attributes.normal;
      for(let i=0;i<n.count;i++)assert.ok(n.getY(i)>0,'mountain faces must face up');
    }
    const lake=e.group.getObjectByName('Mountain_Lake_Surface'),pos=lake.geometry.attributes.position;
    const first=pos.getY(0),texture=lake.material.normalMap;
    for(let i=0;i<60;i++)e.update(1/60);
    assert.notEqual(pos.getY(0),first);
    assert.ok(texture.offset.x>0);
    for(let i=0;i<pos.count;i++)assert.ok(pos.getY(i)>=-80.63&&pos.getY(i)<=-79.37);
    assert.ok(Math.abs(Math.asin(e.sunPosition.y/e.sunPosition.length())*180/Math.PI-36)<1e-6);
    assert.ok(e.group.getObjectByName('Golden_Sun_Halo').material.map);
    assert.equal(e.group.getObjectByName('Golden_Sun_Disc').material.toneMapped,false);
    e.group.visible=false;const last=pos.getY(0);e.update(.1);e.update(.1);assert.equal(pos.getY(0),last);
  }finally{e.dispose();e.dispose();}
});
