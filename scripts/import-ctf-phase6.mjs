import {readFileSync,writeFileSync,existsSync} from 'node:fs';
const source=readFileSync('docs/duelist/ctf-phase6-source.html','utf8');
const start=source.indexOf('    const ARENA_CONFIG =');
const end=source.indexOf('    // 5. DEBUG VISUALIZERS');
let body=source.slice(start,end).replace(/    window\.ARENA_CONFIG = ARENA_CONFIG;/,'').replace(/      window\.CTF_FLAGS = ctfFlags;/,'');
if(start<0||end<0||!body.includes('function buildArenaGeometry'))throw Error('Phase 6 source missing');
body=body.replace('mesh.receiveShadow = true; root.add(mesh);\n            collision.addSolidBox','mesh.receiveShadow = true; mesh.castShadow = true; root.add(mesh);\n            collision.addSolidBox');
body=body.replace('const skyPlane = new THREE.Mesh','const skyPlane = new THREE.Mesh'); // retain exact original sky
body=body.replace('root.add(g);\n        collision.addSolidBox(win.id','g.traverse(o=>{if(o.isMesh&&o.material!==mats.windowGlass)o.castShadow=true;});root.add(g);\n        collision.addSolidBox(win.id');
const tail=`
export {ARENA_CONFIG as CTF_ARENA_SPEC,ArenaCollisionWorld,buildArenaGeometry,buildMaterialLibrary};
export function createIndustrialCtfArena(scene,{preview=false,textureResolution=1024}={}){
 const materials=buildMaterialLibrary(textureResolution),collision=new ArenaCollisionWorld();
 const built=buildArenaGeometry(scene,materials,collision);
 const root=built.root;
 let elapsed=0;
 const home={red:ARENA_CONFIG.flags.red,blue:ARENA_CONFIG.flags.blue};
 // Do not rebuild or duplicate the Phase 6 pedestal/flag meshes.
 function update(dt,flags=null,bodyFor=()=>null){
  elapsed+=Math.max(0,dt);
  for(const fan of built.animatedFans)fan.rotation.z-=dt*1.85;
  for(const item of built.animatedCloths){
   const pos=item.geo.attributes.position,base=item.basePos;
   for(let i=0;i<pos.count;i++){const x=base[i*3],y=base[i*3+1];pos.setZ(i,item.isBanner?Math.sin(elapsed*2.1+y*1.1+item.phase)*.11*Math.max(0,(2.25-y)/4.5):Math.sin(elapsed*5.2-x*3.8+y*1.2+item.phase)*.14*x/1.5);}
   pos.needsUpdate=true;
  }
  for(const r of built.animatedRings){const p=1+Math.sin(elapsed*3.4+r.phase)*.04;r.outerRing.scale.set(p,p,1);const q=1+Math.cos(elapsed*3.4+r.phase)*.06;r.innerRing.scale.set(q,q,1);}
  for(const team of ['red','blue']){
   const rig=built.ctfFlags[team].mesh,f=flags?.[team],origin=home[team];
   const carrier=f?.carrier?bodyFor(f.carrier):null;
   const pos=carrier||f||origin;
   rig.position.set((pos.x??origin.x)-origin.x,(pos.y??origin.y)-origin.y+(carrier?.y!==undefined?.55:0),(pos.z??origin.z)-origin.z);
   rig.rotation.y=carrier?.yaw??0;
   rig.visible=!f?.carrier||!!carrier;
  }
 }
 function dispose(){
  const gs=new Set(),ms=new Set(),ts=new Set();
  root.traverse(o=>{if(o.geometry)gs.add(o.geometry);for(const m of (Array.isArray(o.material)?o.material:[o.material]))if(m){ms.add(m);for(const k of Object.keys(m))if(m[k]?.isTexture)ts.add(m[k]);}});
  root.removeFromParent();gs.forEach(g=>g.dispose());ms.forEach(m=>m.dispose());ts.forEach(t=>t.dispose());
 }
 return {...built,collision,materials,update,dispose};
}
`;
const path='src/components/duelist/client/maps/industrialCtfArena.mjs';
if(existsSync(path))throw Error('Refusing to overwrite repaired factory');
writeFileSync(path,"// Extracted from the complete Phase 6 reference, not the simplified later viewers.\nimport * as THREE from 'three';\n"+body+tail);
