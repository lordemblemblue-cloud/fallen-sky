// Combat 14.5: read-only visual overlay of a separate authoritative world.
// This adapter NEVER searches for or modifies existing GameWorld3D entities,
// hero models, combat hitboxes, quest state, XP or player HUD. The caller must
// explicitly supply its own scene, marker factory and map-height sampler.
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const validMarker=m=>m&&typeof m.setPosition==='function'&&
 typeof m.setHealth==='function'&&typeof m.dispose==='function'&&
 m.object&&typeof m.object==='object';
const fail=()=>{throw Error('14.5 requires isolated preview scene and markers')};
export function createPrivateWorldScenePreview145({
 view,scene,makeMarker,sampleHeight=()=>0,
}={}){
 if(typeof view?.subscribe!=='function'||typeof view?.getState!=='function'||
    typeof scene?.add!=='function'||typeof scene?.remove!=='function'||
    typeof makeMarker!=='function'||typeof sampleHeight!=='function')fail();
 let disposed=false;
 const records=new Map();
 let lastVersion=null,seenEventSeq=-1;
 function detach(id){
  const item=records.get(id);
  if(!item)return;
  scene.remove(item.object);
  records.delete(id);
  item.dispose();
 }
 function ensure(id,kind){
  const found=records.get(id);
  if(found)return found;
  const marker=makeMarker({id,kind});
  if(!validMarker(marker))fail();
  // Enforce marker identity only; never accept the live player/NPC mesh.
  if([...records.values()].some(r=>r.object===marker.object))fail();
  scene.add(marker.object);
  records.set(id,marker);
  return marker;
 }
 const render=state=>{
  if(disposed)return;
  const snap=state?.mode==='connected'?state.snapshot:null;
  if(!snap){
   for(const id of [...records.keys()])detach(id);
   lastVersion=null;seenEventSeq=-1;return;
  }
  const version=snap.instanceId+'/'+snap.instanceEpoch+'/'+snap.mapFingerprint;
  if(lastVersion!==version){
   for(const id of [...records.keys()])detach(id);
   lastVersion=version;seenEventSeq=-1;
  }
  if(!Number.isSafeInteger(snap.eventSeq)||snap.eventSeq<seenEventSeq)
   return; // Never roll an older snapshot over a newer visual state.
  seenEventSeq=snap.eventSeq;
  const actors=[
   {...snap.player,id:'__private_player__',kind:'player',
    alive:snap.player.hp>0,maxHp:snap.player.maxHp},
   ...snap.enemies.map(e=>({...e,id:'enemy:'+e.id,kind:'enemy'})),
  ];
  const active=new Set();
  for(const actor of actors){
   if(!finite(actor.x)||!finite(actor.z)||!finite(actor.hp)||
      !finite(actor.maxHp)||actor.maxHp<1||
      actor.hp<0||actor.hp>actor.maxHp)
    fail();
   const y=sampleHeight({x:actor.x,z:actor.z,kind:actor.kind,id:actor.id});
   if(!finite(y))fail();
   const marker=ensure(actor.id,actor.kind);
   marker.setPosition(actor.x,y,actor.z);
   marker.setHealth({hp:actor.hp,maxHp:actor.maxHp,
    alive:actor.alive,kind:actor.kind});
   active.add(actor.id);
  }
  for(const id of [...records.keys()])if(!active.has(id))detach(id);
 };
 let unsubscribe;
 try{unsubscribe=view.subscribe(render)}catch(e){
  for(const id of [...records.keys()])detach(id);
  throw e;
 }
 return Object.freeze({
  version:'14.5',dispose(){
   if(disposed)return;
   disposed=true;unsubscribe?.();
   for(const id of [...records.keys()])detach(id);
  },
  getMarkerCount:()=>records.size,
  isolatedPreviewOnly:true,mutatesLiveWorld:false,
  adjustsPlayerHUD:false,grantsRewards:false,productionReady:false,
 });
}
