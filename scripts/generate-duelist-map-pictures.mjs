// Offline, build-time artwork only. No renderer or animation is shipped to menu cards.
// Flat-shaded raster views use the same map meshes as gameplay, not invented layouts.
import * as THREE from 'three';
import sharp from 'sharp';
import {mkdir} from 'node:fs/promises';
import {createArena} from '../src/components/duelist/client/arena.mjs';
import {createModeArchitecture} from '../src/components/duelist/client/modeArchitecture.mjs';
import {createIndustrialCtfArena} from '../src/components/duelist/client/maps/industrialCtfArena.mjs';
import {createDuelistControlPointArena} from '../src/components/duelist/client/maps/controlPointArena.mjs';
import {createMountainLakeEnvironment} from '../src/components/duelist/client/maps/controlPointDaylight.mjs';
import {createEscortArena} from '../src/components/duelist/client/maps/escortArena.mjs';
import {createEscortProps} from '../src/components/duelist/client/escortProps.mjs';
import {createFootballProps} from '../src/components/duelist/client/footballProps.mjs';
import {getModeArenaLayout} from '../src/components/duelist/sim/modeArenaLayout.mjs';
import {MODES} from '../src/components/duelist/sim/match.mjs';
const OUT='public/duelist/maps',W=960,H=540;
await mkdir(OUT,{recursive:true});
// Canvas texture authors record their base color for this offline flat-shaded illustration.
globalThis.document={createElement(){const c={width:0,height:0};const ctx=new Proxy({fillStyle:'#64717e',createLinearGradient(){return {addColorStop(i,col){if(i===0)c.previewColor??=col;}}},createRadialGradient(){return {addColorStop(){}}},measureText(){return {width:100}},fillRect(x,y,w,h){if(typeof this.fillStyle==='string'&&/^#[0-9a-f]{6}$/i.test(this.fillStyle)&&w*h>=c.width*c.height*.5)c.previewColor??=this.fillStyle;},getImageData(x,y,w,h){return {data:new Uint8ClampedArray(w*h*4),width:w,height:h}},createImageData(w,h){return {data:new Uint8ClampedArray(w*h*4),width:w,height:h}}},{get(o,k){return o[k]??(()=>{});}});c.getContext=()=>ctx;return c;}};
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const sun=new THREE.Vector3(-.45,.8,.55).normalize();
const v=new THREE.Vector3(),a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3(),normal=new THREE.Vector3(),edge=new THREE.Vector3();
const im=new THREE.Matrix4(),wm=new THREE.Matrix4(),cm=new THREE.Matrix4(),color=new THREE.Color();
const modes=['duel','ctf','football','tdm','control','escort','ffa','practice'];
for(const mode of modes){
 const scene=new THREE.Scene(),layout=getModeArenaLayout(mode),radius=layout?.radius??MODES[mode].arena;
 let camera,look=[0,0,0],eye=[radius*.78,radius*1.15,radius*1.55],span=radius*2.45;
 const disposals=[];
 if(mode==='ctf'){
  const map=createIndustrialCtfArena(scene,{textureResolution:256});disposals.push(()=>map.dispose());map.update(0);
  camera=new THREE.PerspectiveCamera(77,W/H,.1,200);eye=[0,14.4,25.7];look=[0,5,-6];
 }else if(mode==='control'){
  const map=createDuelistControlPointArena(THREE);map.setLayerVisibility('trusses',false);scene.add(map.root);disposals.push(()=>map.dispose());
  const env=createMountainLakeEnvironment();scene.add(env.environmentGroup??env.group??env.root);
  span=335;eye=[185,235,290];
 }else if(mode==='escort'){
  const map=createEscortArena(scene),props=createEscortProps(scene);props.update(95);disposals.push(()=>{props.dispose();map.dispose();});
  span=455;eye=[210,315,410];look=[0,0,0];
 }else{
  const map=createArena({radius,footprint:layout?.footprint});scene.add(map.group);disposals.push(()=>map.dispose());
  const arch=createModeArchitecture(mode,layout);if(arch){map.group.add(arch.group);disposals.push(()=>arch.dispose());}
  if(mode==='football'){const props=createFootballProps(scene,radius);disposals.push(()=>props.dispose());}
  // The procedural floor shader is approximated with a static solid surface and matching ring.
  const ring=new THREE.Mesh(new THREE.RingGeometry(radius-.22,radius+.03,96),new THREE.MeshBasicMaterial({color:0x73d9ff,side:THREE.DoubleSide}));ring.rotation.x=-Math.PI/2;ring.position.y=.025;if(!layout?.footprint)scene.add(ring);
 }
 camera??=new THREE.OrthographicCamera(-span*W/H/2,span*W/H/2,span/2,-span/2,.1,4000);
 camera.position.set(...eye);camera.lookAt(...look);camera.updateMatrixWorld(true);camera.updateProjectionMatrix();scene.updateMatrixWorld(true);
 const pix=Buffer.alloc(W*H*3),depth=new Float32Array(W*H).fill(Infinity);
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){const t=y/H,k=1-.28*Math.hypot((x-W/2)/W,(y-H/2)/H);const i=(y*W+x)*3;pix[i]=Math.round((mode==='escort'||mode==='control'?78-42*t:15+12*t)*k);pix[i+1]=Math.round((mode==='escort'||mode==='control'?112-54*t:24+14*t)*k);pix[i+2]=Math.round((mode==='escort'||mode==='control'?145-60*t:40+18*t)*k);}
 const persp=camera.isPerspectiveCamera,projection=camera.projectionMatrix.elements;
 function project(p){const z=-p.z;if(persp)return [(p.x*projection[0]/z*.5+.5)*W,(.5-p.y*projection[5]/z*.5)*H,1/z];return [(p.x*projection[0]*.5+.5)*W,(.5-p.y*projection[5]*.5)*H,z];}
 function tri(p0,p1,p2,rgb){
  const A=project(p0),B=project(p1),C=project(p2);
  const area=(B[0]-A[0])*(C[1]-A[1])-(B[1]-A[1])*(C[0]-A[0]);if(Math.abs(area)<.06)return;
  const x0=Math.max(0,Math.floor(Math.min(A[0],B[0],C[0]))),x1=Math.min(W-1,Math.ceil(Math.max(A[0],B[0],C[0]))),y0=Math.max(0,Math.floor(Math.min(A[1],B[1],C[1]))),y1=Math.min(H-1,Math.ceil(Math.max(A[1],B[1],C[1])));if(x0>x1||y0>y1)return;
  for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){
   const u=((B[0]-x-.5)*(C[1]-y-.5)-(B[1]-y-.5)*(C[0]-x-.5))/area,vv=((C[0]-x-.5)*(A[1]-y-.5)-(C[1]-y-.5)*(A[0]-x-.5))/area,w=1-u-vv;
   if(u<-.00001||vv<-.00001||w<-.00001)continue;
   const d=u*A[2]+vv*B[2]+w*C[2],z=persp?1/d:d,i=y*W+x;
   if(z>=depth[i]-.0001)continue;depth[i]=z;pix[i*3]=rgb[0];pix[i*3+1]=rgb[1];pix[i*3+2]=rgb[2];
  }
 }
 function clipTriangle(points,rgb){
  if(points.every(p=>p.z<=-.15)){tri(...points,rgb);return;}
  if(points.every(p=>p.z>-.15))return;
  const out=[];for(let i=0;i<3;i++){const p=points[i],q=points[(i+1)%3],inside=p.z<=-.15,next=q.z<=-.15;if(inside)out.push(p);if(inside!==next)out.push(p.clone().lerp(q,(-.15-p.z)/(q.z-p.z)));}
  for(let i=1;i+1<out.length;i++)tri(out[0],out[i],out[i+1],rgb);
 }
 let count=0;
 scene.traverseVisible(o=>{
  if(!o.isMesh||!o.geometry?.attributes.position||o.material?.isShadowMaterial)return;
  if(/sky.?dome|sky.?sphere|sky.?backdrop/i.test(o.name))return;
  const g=o.geometry,pos=g.attributes.position,index=g.index,vertexColors=g.attributes.color,n=index?index.count:pos.count,groups=g.groups.length?g.groups:[{start:0,count:n,materialIndex:0}];
  for(let inst=0;inst<(o.isInstancedMesh?o.count:1);inst++){
   wm.copy(o.matrixWorld);if(o.isInstancedMesh){o.getMatrixAt(inst,im);wm.multiply(im);}
   cm.multiplyMatrices(camera.matrixWorldInverse,wm);
   for(const group of groups){
    const mat=Array.isArray(o.material)?o.material[group.materialIndex]:o.material;
    if(!mat||mat.visible===false||mat.isShadowMaterial||mat.opacity<.30||mat.wireframe)continue;
    const raw=mat.map?.image?.previewColor;
    color.copy(mat.color??new THREE.Color(0x4a6379));
    if(mat.isShaderMaterial)color.setHex(0x263b53);
    else if(raw&&/^#[0-9a-f]{6}$/i.test(raw)&&color.r>.8&&color.g>.8&&color.b>.8)color.set(raw);
    if(mat.emissive&&mat.emissiveIntensity>.25)color.lerp(mat.emissive,Math.min(.65,mat.emissiveIntensity*.45));
    if(o.instanceColor){const ic=new THREE.Color();o.getColorAt(inst,ic);color.multiply(ic);}
    const base=color.clone();
    for(let i=group.start;i+2<Math.min(n,group.start+group.count);i+=3){
     const ia=index?index.getX(i):i,ib=index?index.getX(i+1):i+1,ic=index?index.getX(i+2):i+2;
     a.fromBufferAttribute(pos,ia).applyMatrix4(wm);b.fromBufferAttribute(pos,ib).applyMatrix4(wm);c.fromBufferAttribute(pos,ic).applyMatrix4(wm);
     normal.subVectors(b,a).cross(edge.subVectors(c,a)).normalize();
     const f=mat.isMeshBasicMaterial||mat.isShaderMaterial?1:.55+.55*Math.max(0,normal.dot(sun));
     color.copy(base);if(mat.vertexColors&&vertexColors){color.r*=vertexColors.getX(ia);color.g*=vertexColors.getY(ia);color.b*=vertexColors.getZ(ia);}
     color.multiplyScalar(f).convertLinearToSRGB();
     const rgb=[Math.round(clamp(color.r*255,0,255)),Math.round(clamp(color.g*255,0,255)),Math.round(clamp(color.b*255,0,255))];
     a.applyMatrix4(camera.matrixWorldInverse);b.applyMatrix4(camera.matrixWorldInverse);c.applyMatrix4(camera.matrixWorldInverse);
     clipTriangle([a,b,c],rgb);count++;
    }
   }
  }
 });
 await sharp(pix,{raw:{width:W,height:H,channels:3}}).webp({quality:84}).toFile(OUT+'/'+mode+'.webp');
 console.log(mode,count,'triangles');
 for(const d of disposals)d();
}
