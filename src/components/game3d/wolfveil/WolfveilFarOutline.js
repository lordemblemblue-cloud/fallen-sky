// Wolfveil far outline: turns the tall scenery of an unloaded area into one
// coarse, flat-coloured mesh (see performance/Game3DFarProxy.mjs for the
// baking, streaming/WolfveilAreaLoader.mjs for when it is shown).
//
// One mesh and one material per area: one draw call for a whole area's
// buildings, big trees and rock faces while the player is elsewhere.
import * as THREE from 'three';
import {bakeFarProxy} from '../performance/Game3DFarProxy.mjs';

const noRaycast=()=>{};
const GREY=[.42,.42,.42];

export function createWolfveilFarOutline({scene,cellMeters=.75,maxTriangles=30000}={}){
  if(!scene?.add)throw new TypeError('A scene is required for the far outline');
  // Flat shading and both sides: clustering leaves no reliable normals or
  // winding, and from this distance neither is missed.
  const material=new THREE.MeshLambertMaterial({vertexColors:true,flatShading:true,
    side:THREE.DoubleSide});
  material.name='WV_Area_FarOutline';
  const positionsOf=new WeakMap(),colours=new WeakMap();
  const point=new THREE.Vector3();

  // Positions as plain xyz triples, whatever packing the model uses.
  function positions(geometry){
    let cached=positionsOf.get(geometry);
    if(cached)return cached;
    const attribute=geometry.attributes?.position;
    if(!attribute)return null;
    cached=new Float32Array(attribute.count*3);
    for(let i=0;i<attribute.count;i++){
      point.fromBufferAttribute(attribute,i);
      cached[i*3]=point.x;cached[i*3+1]=point.y;cached[i*3+2]=point.z;
    }
    positionsOf.set(geometry,cached);
    return cached;
  }
  // Average colour of a texture, read back through a tiny canvas. Any failure
  // (no canvas, a protected image) simply leaves the material's own colour.
  function textureTint(texture){
    try{
      const image=texture?.image;
      if(!image||typeof document==='undefined'||!(image.width>0)||!(image.height>0))return null;
      const canvas=document.createElement('canvas');
      canvas.width=canvas.height=8;
      const context=canvas.getContext('2d',{willReadFrequently:true});
      context.drawImage(image,0,0,8,8);
      const data=context.getImageData(0,0,8,8).data;
      if(!data||data.length<256)return null;
      let r=0,g=0,b=0,weight=0;
      for(let i=0;i<256;i+=4){
        const alpha=data[i+3]/255;
        r+=data[i]*alpha;g+=data[i+1]*alpha;b+=data[i+2]*alpha;weight+=alpha;
      }
      if(!(weight>0))return null;
      const tint=new THREE.Color().setRGB(r/weight/255,g/weight/255,b/weight/255,THREE.SRGBColorSpace);
      return [tint.r,tint.g,tint.b].every(Number.isFinite)?[tint.r,tint.g,tint.b]:null;
    }catch{return null;}
  }
  function colourOf(mesh){
    const used=Array.isArray(mesh.material)?mesh.material[0]:mesh.material;
    if(!used)return GREY;
    let colour=colours.get(used);
    if(colour)return colour;
    const base=used.color?.isColor?[used.color.r,used.color.g,used.color.b]:GREY;
    const tint=used.map?textureTint(used.map):null;
    colour=tint?[base[0]*tint[0],base[1]*tint[1],base[2]*tint[2]]:base;
    colours.set(used,colour);
    return colour;
  }

  return {
    material,
    /** @param {string} area @param {Array<{mesh:object,matrices:number[][]}>} sources */
    build(area,sources){
      const list=[];
      for(const {mesh,matrices} of sources){
        const xyz=mesh.geometry?positions(mesh.geometry):null;
        if(!xyz||!matrices?.length)continue;
        list.push({positions:xyz,index:mesh.geometry.index?.array||null,matrices,color:colourOf(mesh)});
      }
      const baked=bakeFarProxy(list,{cellMeters,maxTriangles});
      if(!baked.triangles)return null;
      const geometry=new THREE.BufferGeometry();
      geometry.setAttribute('position',new THREE.BufferAttribute(baked.positions,3));
      geometry.setAttribute('color',new THREE.BufferAttribute(baked.colors,3));
      geometry.setIndex(new THREE.BufferAttribute(baked.index,1));
      geometry.computeBoundingBox();geometry.computeBoundingSphere();
      const object=new THREE.Mesh(geometry,material);
      object.name='WV_Area_Far_'+area;
      object.userData={wolfveilAreaShared:true,wolfveilFarOutline:area,renderOnly:true,
        otsCameraIgnore:true};
      object.raycast=noRaycast;
      object.castShadow=false;object.receiveShadow=false;
      object.matrixAutoUpdate=false; // baked in world space
      scene.add(object);
      return {object,triangles:baked.triangles,sourceTriangles:baked.sourceTriangles,
        cellMeters:Math.round(baked.cellMeters*100)/100};
    },
    dispose(object){
      object?.parent?.remove(object);
      object?.geometry?.dispose?.();
    },
    disposeAll(){material.dispose();},
  };
}
