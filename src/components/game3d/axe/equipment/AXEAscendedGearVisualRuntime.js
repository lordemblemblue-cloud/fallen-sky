import * as THREE from 'three';
import {
  getEquippedAXEItems, getActiveEquippedAXEWeapon, subscribeAXEEquipmentInventory,
} from './AXEEquipmentInventoryStore';
import { getAXEAdvancementState, subscribeAXEItemAdvancement } from './AXEItemAdvancementStore';
import { evaluateAXESetBonuses } from './AXESetBonusSystem';
import { getAXESetAscensionRank } from './AXESetAscensionRules.mjs';

// An original silver-and-cyan spiritual aura, created procedurally. No anime
// character artwork, copied visual assets, or missing GLB is needed. Minimal
// geometry, no particle emitter/point lights and no model traversals per frame.
const norm = n => String(n || '').toLowerCase()
  .replace(/^mixamorig/,'').replace(/[^a-z0-9]/g,'');
const HANDS = ['lefthandsocket','lefthand','handl','bip01lhand',
  'righthandsocket','righthand','handr','bip01rhand'];
function findHand(model) {
  const nodes=new Map();
  model.traverse(n => {
    const name=norm(n.name);
    if (HANDS.includes(name) && !nodes.has(name)) nodes.set(name,n);
  });
  return HANDS.map(n=>nodes.get(n)).find(Boolean) || null;
}

export function createAXEAscendedGearVisualRuntime({model} = {}) {
  if (!model) return {update(){},lateUpdate(){},dispose(){},getStatus:()=>({})};

  const hand=findHand(model);
  // The GLB/FBX root may be scaled to centimeters. Geometry stays in meters.
  const unit=1/(Number(model.scale?.y)||1);
  const body=new THREE.Group();
  body.name='AXE_Spiritual_Ascended_Set_Aura';
  body.scale.setScalar(unit);
  model.add(body);
  const weapon=new THREE.Group();
  weapon.name='AXE_Spiritual_Ascended_Weapon_Aura';
  weapon.scale.setScalar(unit);
  model.add(weapon);

  const geos=[],mats=[];
  function material(color,alpha) {
    const m=new THREE.MeshBasicMaterial({color,transparent:true,opacity:alpha,
      depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide});
    mats.push(m);return m;
  }
  function add(group,geo,mat,y=0) {
    geos.push(geo);
    const mesh=new THREE.Mesh(geo,mat);
    mesh.position.y=y;group.add(mesh);return mesh;
  }
  const shell=add(body,new THREE.SphereGeometry(.72,12,9),material(0x9adfff,.045),.98);
  shell.scale.y=1.43;
  const waist=add(body,new THREE.TorusGeometry(.65,.017,5,36),material(0xe7f9ff,.42),.42);
  waist.rotation.x=Math.PI/2;
  const shoulders=add(body,new THREE.TorusGeometry(.52,.013,5,32),material(0x83cfff,.38),1.42);
  shoulders.rotation.x=1.18;
  const core=add(weapon,new THREE.CylinderGeometry(.12,.19,.74,9,1,true),
    material(0x74d4ff,.085),.35);
  const ring=add(weapon,new THREE.TorusGeometry(.22,.018,5,32),material(0xe4fbff,.66),.43);
  ring.rotation.x=.4;
  const tip=add(weapon,new THREE.TorusGeometry(.17,.012,5,24),material(0x83e7ff,.45),.8);
  tip.rotation.x=1.1;

  let elapsed=0,bodyAuraRank=0,weaponAuraRank=0,weaponId=null,disposed=false;
  const refresh=()=>{
    if(disposed)return;
    const worn=getEquippedAXEItems().map(i=>({
      ...i,advancement:getAXEAdvancementState(i.instanceId),
    }));
    const status=evaluateAXESetBonuses(worn);
    bodyAuraRank=Math.max(0,...status.activeSets.map(s=>Number(s.fullAuraRank)||0));
    const item=getActiveEquippedAXEWeapon();
    weaponId=item?.instanceId||null;
    weaponAuraRank=item ? getAXESetAscensionRank({
      ...item,advancement:getAXEAdvancementState(item.instanceId),
    }) : 0;
    body.visible=bodyAuraRank>0;
    weapon.visible=weaponAuraRank>0 && !!hand;
  };
  const unsubscribeInventory=subscribeAXEEquipmentInventory(refresh);
  const unsubscribeAdvancement=subscribeAXEItemAdvancement(refresh);
  refresh();

  const handWorld=new THREE.Vector3();
  return {
    update(delta=0) {
      if(disposed)return;
      elapsed+=Math.max(0,Math.min(.1,Number(delta)||0));
      if(body.visible){
        const pulse=1+Math.sin(elapsed*2.1)*.025;
        shell.scale.set(pulse,1.43*pulse,pulse);
        shell.material.opacity=.035+.01*bodyAuraRank+.009*Math.sin(elapsed*2.8);
        waist.rotation.z+=delta*.19;
        shoulders.rotation.z-=delta*.13;
      }
      if(weapon.visible){
        const intensity=.65+weaponAuraRank*.08;
        ring.material.opacity=Math.min(.9,intensity*(.8+.2*Math.sin(elapsed*4)));
        ring.rotation.z+=delta*.9;
        tip.rotation.z-=delta*.65;
        core.material.opacity=.05+weaponAuraRank*.018;
      }
    },
    // Called after mixer poses the hands, so the aura follows a real equipped
    // weapon socket rather than remaining at a fixed world-space coordinate.
    lateUpdate(){
      if(!weapon.visible||!hand||disposed)return;
      // Update this socket's ancestry only; never traverse the whole skinned
      // avatar on every frame in a crowded combat scene.
      hand.updateWorldMatrix(true,false);
      hand.getWorldPosition(handWorld);
      weapon.position.copy(model.worldToLocal(handWorld));
    },
    getStatus:()=>({bodyAuraRank,weaponAuraRank,weaponId,hasHand:!!hand}),
    dispose(){
      if(disposed)return;
      disposed=true;
      unsubscribeInventory?.();
      unsubscribeAdvancement?.();
      body.removeFromParent();weapon.removeFromParent();
      for(const geo of geos)geo.dispose();
      for(const m of mats)m.dispose();
    },
  };
}
