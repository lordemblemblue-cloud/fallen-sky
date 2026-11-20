import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {readFileSync} from 'node:fs';
import {
  FACTION_THREE_RIG,isFactionThreeMount,classifyFactionThreeBone,
  sanitizeFactionThreeNativeClips,alignFactionThreeWingBases,
  isolateFactionThreeIcoHelpers,createFactionThreeMountRig
} from '../src/components/game3d/character/factionThreeMountRig.mjs';

const faction3={id:'faction_tiger',animationRigProfile:FACTION_THREE_RIG};
const faction2={id:'faction_armored_wolf',animationRigProfile:'winged_faction_2_158'};
const source=path=>readFileSync(new URL('../src/components/game3d/'+path,import.meta.url),'utf8');

function mockTiger(){
  const root=new THREE.Group();root.name='Owner Tiger Mount';
  const make=(name,parent,x=0,y=0,z=0)=>{
    const bone=new THREE.Bone();bone.name=name;
    bone.position.set(x,y,z);
    parent.add(bone);return bone;
  };
  const pelvis=make('pelvis',root,0,1,0);
  const chest=make('chest',pelvis,0,.35,.35);
  const neck=make('neck',chest,0,.2,.38);
  const head=make('head',neck,0,.08,.23);
  const shoulderL=make('front.L.upper',chest,.42,-.10,.11);
  const shoulderR=make('front.R.upper',chest,-.42,-.10,.11);
  const wingL=make('wing.L.base',pelvis,1.6,-.65,-1.3);
  const wingR=make('wing.R.base',pelvis,-1.6,-.65,-1.3);
  const tail=[];
  let prev=pelvis;
  for(let i=1;i<=6;i++){
    const bone=make('tail.'+String(i).padStart(2,'0'),prev,
      0,i===1?-.2:0,i===1?-.42:-.18);
    tail.push(bone);prev=bone;
  }
  const createIco=(name,x,y,z,parent=root)=>{
    const m=new THREE.Mesh(new THREE.IcosahedronGeometry(.035),
      new THREE.MeshStandardMaterial());
    m.name=name;m.position.set(x,y,z);parent.add(m);return m;
  };
  root.updateWorldMatrix(true,true);
  const tailPos=tail[2].getWorldPosition(new THREE.Vector3());
  const tailIco=createIco('Icosphere_tail_ctrl',...tailPos.toArray());
  const strayIco=createIco('Icosphere_08',0,4,3);
  const realMesh=new THREE.SkinnedMesh(
    new THREE.BoxGeometry(.3,.3,.3),
    new THREE.MeshStandardMaterial());
  realMesh.name='Icosphere_Skinned_Wing';root.add(realMesh);
  return {root,head,chest,neck,wingL,wingR,tail,tailIco,strayIco,realMesh,
    shoulderL,shoulderR};
}
function makeClip(root){
 const q=new THREE.Quaternion();
 const tracks=[
   new THREE.QuaternionKeyframeTrack('tail.01.quaternion',[0,1],
     [...q.toArray(),...new THREE.Quaternion().setFromAxisAngle(
       new THREE.Vector3(0,0,1),.25).toArray()]),
   new THREE.QuaternionKeyframeTrack('wing.L.base.quaternion',[0,1],
     [...q.toArray(),...new THREE.Quaternion().setFromAxisAngle(
       new THREE.Vector3(1,0,0),.1).toArray()]),
   new THREE.VectorKeyframeTrack('tail.01.position',[0,1],[0,0,-.4,0,0,3]),
   new THREE.VectorKeyframeTrack('Icosphere_tail_ctrl.position',[0,1],
     [0,0,0,2,0,0]),
   new THREE.VectorKeyframeTrack('Owner Tiger Mount.position',[0,1],
     [0,0,0,5,0,0]),
   new THREE.QuaternionKeyframeTrack('head.quaternion',[0,1],
     [...q.toArray(),...q.toArray()]),
 ];
 return new THREE.AnimationClip('Idle_Relaxed_Tail',1,tracks);
}
test('Faction 3 only; no changes to other faction or starter mount',()=>{
 assert.equal(isFactionThreeMount(faction3),true);
 assert.equal(isFactionThreeMount(faction2),false);
 assert.equal(isFactionThreeMount({}),false);
 assert.equal(classifyFactionThreeBone('tail.06'),'tail');
 assert.equal(classifyFactionThreeBone('wing.L.base'),'wing');
 assert.equal(classifyFactionThreeBone('front.R.upper'),'shoulder');
 assert.equal(classifyFactionThreeBone('head'),null);
});
test('native Faction 3 clips retain bone animation but remove helper/root/tail displacement',()=>{
 const {root}=mockTiger();
 const original=makeClip(root);
 const output=sanitizeFactionThreeNativeClips(root,[original],faction3)[0];
 assert.equal(original.tracks.length,6);
 assert.notEqual(output,original);
 assert.deepEqual(output.tracks.map(t=>t.name),[
   'tail.01.quaternion','wing.L.base.quaternion','head.quaternion'
 ]);
 assert.deepEqual(original.tracks.map(t=>t.name).slice(2,5),[
   'tail.01.position','Icosphere_tail_ctrl.position',
   'Owner Tiger Mount.position'
 ]);
 assert.equal(sanitizeFactionThreeNativeClips(root,[original],faction2)[0],original);
 root.traverse(o=>{if(o.isMesh){o.geometry.dispose();o.material.dispose();}});
});
test('Faction 3 wings attach near BOTH real front shoulders, not rider/back legs',()=>{
 const m=mockTiger();
 m.root.updateWorldMatrix(true,true);
 const beforeLeft=m.wingL.getWorldPosition(new THREE.Vector3());
 const out=alignFactionThreeWingBases(m.root);
 assert.equal(out.anchors.length,2);
 assert.equal(out.corrected,2);
 const afterLeft=m.wingL.getWorldPosition(new THREE.Vector3());
 assert(afterLeft.distanceTo(m.shoulderL.getWorldPosition(new THREE.Vector3()))<
        beforeLeft.distanceTo(m.shoulderL.getWorldPosition(new THREE.Vector3())));
 assert.equal(m.wingL.parent.name,'pelvis'); // original skeleton intact
 assert.equal(m.wingR.parent.name,'pelvis');
 out.restore();
 assert(m.wingL.getWorldPosition(new THREE.Vector3()).distanceTo(beforeLeft)<1e-6);
 m.root.traverse(o=>{if(o.isMesh){o.geometry.dispose();o.material.dispose();}});
});
test('tiny UNWEIGHTED Icospheres use tail bone parenting; stray helpers hidden',()=>{
 const m=mockTiger();m.root.updateWorldMatrix(true,true);
 const oldParent=m.tailIco.parent;
 const result=isolateFactionThreeIcoHelpers(m.root,{
   tail:m.tail,wings:[m.wingL,m.wingR],span:.84,
 });
 assert.equal(result.attached,1);
 assert.equal(result.hidden,1);
 assert(m.tail.some(b=>b===m.tailIco.parent));
 assert.equal(m.strayIco.visible,false);
 assert.equal(m.realMesh.visible,true); // never touch skinned geometry
 assert.equal(m.realMesh.parent,m.root);
 result.restore();
 assert.equal(m.tailIco.parent,oldParent);
 assert.equal(m.strayIco.visible,true);
 m.root.traverse(o=>{if(o.isMesh){o.geometry.dispose();o.material.dispose();}});
});
test('independent tail reacts to its own mount travel and ignores camera/rider-only motion',()=>{
 const m=mockTiger();m.root.updateWorldMatrix(true,true);
 const guard=createFactionThreeMountRig(m.root,faction3);
 assert.equal(guard.active,true);
 assert.equal(guard.status().tailBones,6);
 assert.equal(guard.status().wingBones,2);
 assert.equal(guard.status().wingCorrections,2);
 const rider=new THREE.Group(),camera=new THREE.Group();
 for(let i=0;i<20;i++){
   rider.rotation.y+=.2;camera.rotation.y+=.35;
   guard.update(.016);
 }
 assert.equal(guard.status().speed,0);
 assert(Math.abs(guard.status().sway)<.00001);
 m.root.position.x+=.08;
 m.root.updateWorldMatrix(true,true);
 for(let i=0;i<15;i++)guard.update(.016);
 assert(guard.status().speed>0);
 assert(Math.abs(guard.status().sway)>0);
 // Faction 3 tail will not fold toward the head even if a source clip
 // writes an extreme rotation every frame.
 m.tail[0].quaternion.setFromAxisAngle(new THREE.Vector3(0,0,1),2.9);
 m.head.quaternion.setFromAxisAngle(new THREE.Vector3(0,1,0),2.6);
 guard.update(.016);
 assert(m.tail[0].quaternion.angleTo(new THREE.Quaternion())<.43);
 assert(m.head.quaternion.angleTo(new THREE.Quaternion())<.35);
 guard.dispose();
 assert.equal(guard.status().active,false);
 m.root.traverse(o=>{if(o.isMesh){o.geometry.dispose();o.material.dispose();}});
});
test('no new physics colliders or edits to skin weights; local, remote and preview wired',()=>{
 const module=source('character/factionThreeMountRig.mjs');
 assert.doesNotMatch(module,/skinIndex\.set|skinWeight\.set|boneInverses\.push|createRigidBody|collider\.add|player\.position|camera\.position/);
 const world=source('GameWorld3D.jsx');
 assert.match(world,/companionSecondaryRig=createFactionThreeMountRig\(companionModel,companionDef\)/);
 assert.match(world,/companionSecondaryRig\?\.update\(delta, \{ flying: /);
 const remote=source('RemoteCompanionManager.jsx');
 assert.match(remote,/createFactionThreeMountRig\(group,def\)/);
 assert.match(remote,/inst\.secondaryRig\?\.update\(delta, \{ flying: inst\.current === 'fly' \}\)/);
 const preview=source('equipment/CompanionPreview3D.jsx');
 assert.match(preview,/createFactionThreeMountRig\(root,companion\)/);
 assert.match(preview,/sanitizeFactionThreeNativeClips\(root,clips,companion\)/);
 const anim=source('character/mountAnimations.mjs');
 assert.match(anim,/sanitizeFactionThreeNativeClips\(root,embeddedClips,definition\)/);
});
