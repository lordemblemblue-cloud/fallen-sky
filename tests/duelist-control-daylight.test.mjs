import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createControlPointSkyTexture,applyControlPointDaylight} from '../src/components/duelist/client/maps/controlPointDaylight.mjs';

test('sky is a deterministic small opaque baked texture, without browser or GPU dependencies',()=>{
  const a=createControlPointSkyTexture(),b=createControlPointSkyTexture();
  try{
    assert.equal(a.image.width,512);assert.equal(a.image.height,256);
    assert.deepEqual(a.image.data,b.image.data);assert.equal(a.generateMipmaps,false);
    for(let i=3;i<a.image.data.length;i+=4)assert.equal(a.image.data[i],255);
    assert.ok(a.image.data.every((v,i)=>i%4===3||v>=76));
  }finally{a.dispose();b.dispose();}
});
test('daylight adds just one low-poly background mesh, brightens both sides of the deck and restores scene settings',()=>{
  const scene=new THREE.Scene();scene.background=new THREE.Color(0x080b10);scene.fog=new THREE.Fog(0x080b10,40,140);
  const camera=new THREE.PerspectiveCamera(55,1,.05,400);
  const renderer={shadowMap:{enabled:true},toneMappingExposure:1.1};
  const lights={hemi:new THREE.HemisphereLight(0x8fb8ff,0x1a2130,1.2),sun:new THREE.DirectionalLight(0xffe2c4,2.2),rimLight:new THREE.DirectionalLight(),fills:[]};
  const materials={hexDeck:new THREE.MeshStandardMaterial({color:0xdbeafe,metalness:.62})};
  const old={background:scene.background,fog:scene.fog,ground:lights.hemi.groundColor.getHex()};
  const day=applyControlPointDaylight({scene,camera,renderer,lights,materials});
  assert.equal(scene.children.length,1);assert.equal(day.sky.material.depthWrite,false);
  assert.ok(day.sky.geometry.index.count/3<=1000);
  assert.equal(renderer.shadowMap.enabled,false);assert.equal(scene.fog,null);assert.ok(lights.hemi.groundColor.getHex()>old.ground);
  assert.ok(materials.hexDeck.metalness<.62);
  day.dispose();assert.equal(scene.children.length,0);assert.equal(scene.background,old.background);assert.equal(scene.fog,old.fog);assert.equal(camera.far,400);assert.equal(renderer.shadowMap.enabled,true);assert.equal(lights.hemi.groundColor.getHex(),old.ground);
  materials.hexDeck.dispose();
});
