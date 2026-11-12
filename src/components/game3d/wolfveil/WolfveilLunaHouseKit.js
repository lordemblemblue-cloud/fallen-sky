import * as THREE from 'three';
import {WOLFVEIL_FUTURE_HOUSE_KIT} from './WolfveilPalaceLayout.mjs';

/**
 * REUSABLE CONCEPT kit, not a current town spawn.
 *
 * Draws architecture inspired by Luna's visible roof, finish and cedar trim,
 * REUSING its actual MeshStandard/Physical materials if the source mansion
 * geometry is provided. Deliberately does not shrink an entire mansion:
 * doors and story heights remain real-world player scale.
 */
export function createLunaDerivedHouseConcept(variantId,sourceArchitecture){
  const plan=WOLFVEIL_FUTURE_HOUSE_KIT.find(h=>h.id===variantId);
  if(!plan)throw new RangeError('Unknown Luna house design: '+variantId);
  if(!sourceArchitecture?.isGroup)throw new TypeError('Luna mansion source group required');
  const materials=new Map();
  sourceArchitecture.traverse(mesh=>{
    if(!mesh.isMesh)return;
    for(const mat of Array.isArray(mesh.material)?mesh.material:[mesh.material]){
      if(!mat?.color||materials.has(mat.uuid))continue;
      materials.set(mat.uuid,mat);
    }
  });
  const byBrightness=(m)=>m.color.r*.2126+m.color.g*.7152+m.color.b*.0722;
  const all=[...materials.values()];
  const byColor=(target,fallback)=>{
    if(!all.length)return fallback;
    const color=new THREE.Color(target);
    const distance=mat=>mat?Math.hypot(mat.color.r-color.r,
      mat.color.g-color.g,mat.color.b-color.b):Infinity;
    return all.reduce((best,m)=>distance(m)<distance(best)?m:best,null)||fallback;
  };
  const roof=byColor(0x252c31,new THREE.MeshStandardMaterial({color:0x252c31,roughness:.85}));
  const plaster=byColor(0xc5b9a0,new THREE.MeshStandardMaterial({color:0xc5b9a0,roughness:.92}));
  const timber=all.filter(m=>m.map&&byBrightness(m)>.45)[0]||
    byColor(0x94603d,new THREE.MeshStandardMaterial({color:0x94603d,roughness:.82}));
  const stone=byColor(0x777d81,new THREE.MeshStandardMaterial({color:0x777d81,roughness:.9}));
  const root=new THREE.Group();
  root.name='SWV_CONCEPT_Luna_Derived_'+variantId;
  root.userData={conceptOnly:true,neverSpawnWithoutApproval:true,source:'LunaManorElevatedArchitecture',
    width:plan.w,depth:plan.d,stories:plan.stories};
  const geometries=[];
  const box=(x,y,z,w,h,d,mat,yaw=0)=>{
    const geometry=new THREE.BoxGeometry(w,h,d);
    const mesh=new THREE.Mesh(geometry,mat);
    mesh.position.set(x,y,z);mesh.rotation.y=yaw;
    mesh.castShadow=true;mesh.receiveShadow=true;
    geometries.push(geometry);root.add(mesh);
  };
  const {w,d,stories}=plan;
  box(0,-.18,0,w+.5,.36,d+.5,stone);
  for(let story=0;story<stories;story++){
    const base=story*3.3,front=d*.5,rear=-d*.5;
    box(0,base+1.65,rear,w,3.3,.25,plaster);
    for(const sx of [-1,1])box(sx*w*.5,base+1.65,0,.25,3.3,d,plaster);
    if(story===0){
      const open=2.7,side=(w-open)/2;
      box(-(w+open)/4,base+1.65,front,side,3.3,.25,plaster);
      box((w+open)/4,base+1.65,front,side,3.3,.25,plaster);
      box(0,base+3.02,front,open,.55,.25,plaster);
    }else box(0,base+1.65,front,w,3.3,.25,plaster);
    for(const sx of [-1,1])for(const sz of [-1,1]){
      box(sx*w*.47,base+1.65,sz*d*.5,.33,3.3,.35,timber);
    }
    box(0,base+.1,0,w-.35,.20,d-.35,timber);
  }
  // Deep roof eaves and split planes read like the Luna original, not
  // cheap flat-roof huts. Decorative pieces are true geometry.
  const roofY=stories*3.3+.50,overhang=.72;
  for(const sign of [-1,1]){
    const geometry=new THREE.BoxGeometry(w*.55+overhang,.32,d+overhang*2);
    const wing=new THREE.Mesh(geometry,roof);
    wing.position.set(sign*w*.265,roofY+.95,0);
    wing.rotation.z=sign<0?.29:-.29;
    wing.castShadow=true;wing.receiveShadow=true;
    geometries.push(geometry);root.add(wing);
  }
  // The same dark original exterior wood treatment frames the entrance.
  box(0,2.75,d*.5+.15,3.1,.18,.23,timber);
  for(const side of [-1,1])box(side*1.4,1.5,d*.5+.15,.23,2.75,.26,timber);
  return {root,plan,dispose(){geometries.forEach(g=>g.dispose());root.parent?.remove(root);}};
}
