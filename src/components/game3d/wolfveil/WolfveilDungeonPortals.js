import * as THREE from 'three';
import {WOLFVEIL_EXPLORABLE_CAVES} from './WolfveilCaveLayout.mjs';
import {wolfveilAreaAtWorld} from './streaming/WolfveilFiveAreaPlan.mjs';

export const WOLFVEIL_CAVES_REGION='wolfveil-caves';

// `exclude`: cave ids whose ring is replaced by an authored doorway (the
// natural-zone prototype); every other ring keeps its region portal.
export function createWolfveilDungeonPortals(scene,{mode='surface',exclude=[],area=null}={}){
  const root=new THREE.Group();
  root.name=mode==='surface'?'SWV_CaveDestinationPortals':'SWV_CaveDestinationReturnPortal';
  const ringGeometry=new THREE.TorusGeometry(2.05,.18,6,16);
  const coreGeometry=new THREE.CircleGeometry(1.82,16);
  const ringMaterial=new THREE.MeshStandardMaterial({
    color:0x7ce7e1,emissive:0x126a78,emissiveIntensity:1.25,
    metalness:.3,roughness:.35,
  });
  const coreMaterial=new THREE.MeshBasicMaterial({
    color:0x183b52,transparent:true,opacity:.65,side:THREE.DoubleSide,
  });
  const portals=mode==='surface'
    ?WOLFVEIL_EXPLORABLE_CAVES.filter(cave=>!exclude.includes(cave.id)&&
      (!area||wolfveilAreaAtWorld({x:cave.mouth[0],z:cave.mouth[1]+70})===area)).map(cave=>({
      id:cave.id,x:cave.mouth[0],y:cave.mouthY+2.2,z:cave.mouth[1]+70,
    }))
    :[{id:'cave-return',x:-6,y:-5.8,z:70+62}];
  for(const portal of portals){
    const gate=new THREE.Group();
    gate.position.set(portal.x,portal.y,portal.z);
    const ring=new THREE.Mesh(ringGeometry,ringMaterial);
    ring.rotation.y=0;
    gate.add(ring);
    const core=new THREE.Mesh(coreGeometry,coreMaterial);
    core.position.z=-.04;
    gate.add(core);
    gate.userData.portalId=portal.id;
    root.add(gate);
  }
  scene.add(root);
  let cooldown=0;
  let elapsed=0;
  return {
    update(delta,position){
      elapsed+=Math.max(0,Math.min(delta||0,.1));
      root.children.forEach((gate,index)=>{
        gate.rotation.z=Math.sin(elapsed*1.1+index*.7)*.035;
      });
      cooldown=Math.max(0,cooldown-Math.max(0,delta||0));
      if(cooldown>0||!position||!Number.isFinite(position.x)||!Number.isFinite(position.z))return null;
      const gate=root.children.find(portal=>
        Math.hypot(position.x-portal.position.x,position.z-portal.position.z)<3.25);
      if(!gate)return null;
      cooldown=2;
      return mode==='surface'
        ?{target:WOLFVEIL_CAVES_REGION,sourceEntrance:gate.userData.portalId}
        :{target:'wolfveil',returnToGate:'sumi'};
    },
    dispose(){
      root.parent?.remove(root);
      ringGeometry.dispose();coreGeometry.dispose();
      ringMaterial.dispose();coreMaterial.dispose();
    },
  };
}
