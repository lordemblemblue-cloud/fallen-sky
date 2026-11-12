// Combat 14.6: explicit opt-in WASD/mouse-yaw private input mapper.
// No global keyboard listener, animation tick, UI buttons, damage logic or
// automatic cutover. The caller feeds pre-validated key state manually; this
// never writes the legacy GameWorld3D movement/skill systems.
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const actor=x=>typeof x==='string'&&/^[A-Za-z0-9_.:-]{1,160}$/.test(x);
const fail=x=>{throw Error('14.6 '+x)};
export function mapPrivateWorldMovement146({
 keys={},cameraYaw=0,
}={}){
 if(!keys||typeof keys!=='object'||Array.isArray(keys)||
    !finite(cameraYaw)||Math.abs(cameraYaw)>Math.PI*2)
  fail('invalid_movement_input');
 const pressed=k=>keys[k]===true;
 const x=Number(pressed('d'))-Number(pressed('a'));
 const z=Number(pressed('s'))-Number(pressed('w'));
 const length=Math.hypot(x,z);
 const lateral=length?x/Math.max(1,length):0;
 const forward=length?z/Math.max(1,length):0;
 // Convert local WASD to world XZ relative to camera yaw, at 1 unit max.
 let rx=lateral*Math.cos(cameraYaw)+forward*Math.sin(cameraYaw);
 let rz=-lateral*Math.sin(cameraYaw)+forward*Math.cos(cameraYaw);
 if(Math.abs(rx)<1e-12)rx=0;
 if(Math.abs(rz)<1e-12)rz=0;
 return Object.freeze({x:rx,z:rz,facing:cameraYaw});
}
export function createPrivateWorldInputBridge146({
 client,view,clock=()=>Date.now(),minIntervalMs=100,
}={}){
 if(typeof client?.input!=='function'||typeof client?.attack!=='function'||
    typeof view?.getState!=='function'||typeof clock!=='function'||
    !Number.isInteger(minIntervalMs)||minIntervalMs<50||
    minIntervalMs>1000)fail('requires isolated private client');
 let enabled=false,closed=false,lastAt=-Infinity;
 let tail=Promise.resolve();
 const serial=fn=>{
  const out=tail.then(fn,fn);
  tail=out.catch(()=>{});
  return out;
 };
 const canSend=()=>enabled&&!closed&&view.getState().mode==='connected';
 const enable=()=>{
  if(closed)fail('bridge_closed');
  if(view.getState().mode!=='connected')
   fail('requires_connected_private_preview');
  enabled=true;lastAt=-Infinity;
  return {enabled:true,liveWorldAuthority:false};
 };
 const step=({keys,cameraYaw}={})=>serial(async()=>{
  if(!canSend())return Object.freeze({sent:false,reason:'preview_inactive'});
  const at=clock();
  if(!Number.isSafeInteger(at)||at<0)fail('invalid_clock');
  if(at<lastAt)fail('clock_regression');
  if(at-lastAt<minIntervalMs)
   return Object.freeze({sent:false,reason:'rate_limited'});
  const input=mapPrivateWorldMovement146({keys,cameraYaw});
  const state=await client.input(input);
  if(state?.mode!=='connected')fail('private_input_disconnected');
  lastAt=at;
  return Object.freeze({sent:true,input,rewardsAuthorized:false});
 });
 const basicAttack=({targetId,weaponPath='damage'}={})=>serial(async()=>{
  if(!canSend())return Object.freeze({sent:false,reason:'preview_inactive'});
  if(!actor(targetId)||!['damage','defense','ranged'].includes(weaponPath))
   fail('invalid_private_target');
  const state=view.getState();
  // Target selection only recognizes an alive enemy from the SAME
  // authoritative snapshot; never target arbitrary scene meshes/players.
  const enemy=state.snapshot?.enemies.find(e=>e.id===targetId&&e.alive);
  if(!enemy)return Object.freeze({sent:false,reason:'target_not_in_snapshot'});
  const reply=await client.attack({targetId,weaponPath});
  if(reply?.queued!==true||reply.hitConfirmed!==false||
     reply.rewardsAuthorized!==false)fail('untrusted_attack_ack');
  return Object.freeze({sent:true,queued:true,targetId,
   damageConfirmed:false,rewardsAuthorized:false});
 });
 const disable=()=>serial(async()=>{
  if(closed||!enabled)return {enabled:false};
  enabled=false;
  // Server resets held movement and NPC windups on disconnect; leaving
  // a preview never leaves client-side movement running in the world.
  await client.disconnect();
  return {enabled:false,serverConnectionReleased:true};
 });
 const close=()=>serial(async()=>{
  if(closed)return;
  closed=true;enabled=false;
  if(view.getState().mode==='connected')await client.disconnect();
 });
 return Object.freeze({version:'14.6',enable,step,basicAttack,disable,close,
  isEnabled:()=>enabled&&!closed,
  previewOnly:true,mutatesLiveGameplay:false,
  gameplayCutoverEnabled:false,rewardsIssued:false});
}
