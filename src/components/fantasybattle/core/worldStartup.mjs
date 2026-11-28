// The first rendered frame is the readiness boundary. A requestAnimationFrame
// tick alone does not prove the renderer can draw the restored world.
export async function renderFirstWorldFrame(app){
 if(!app||app.destroyed||app.renderFailed)throw Error('World startup cancelled or failed.');
 const renderer=app.renderer;
 if(!renderer||typeof renderer.render!=='function')throw Error('World renderer is unavailable.');
 if(app.renderInfo?.isWebGPU&&typeof renderer.renderAsync==='function'){
  await renderer.renderAsync(app.scene,app.camera);
 }else{
  await renderer.render(app.scene,app.camera);
 }
 if(app.destroyed||app.renderFailed)throw Error('World startup cancelled or failed.');
}

// Shared startup protocol. Keep readiness tied to real events, not elapsed time.
export const WORLD_STARTUP_PROTOCOL=2;
export const WORLD_STARTUP_PHASES=Object.freeze({
 frame:'Opening the world viewer…',module:'Loading the 3D engine…',
 renderer:'Initializing the graphics renderer…',restore:'Building your saved region…',
 render:'Drawing the first world frame…'
});
export function startupPhaseLabel(phase){
 return Object.hasOwn(WORLD_STARTUP_PHASES,phase)?WORLD_STARTUP_PHASES[phase]:WORLD_STARTUP_PHASES.frame;
}
export function firstRenderer(search,preferCompatibility=false){
 const requested=new globalThis.URLSearchParams(search).get('renderer');
 return requested==='webgl'||(requested!=='webgpu'&&preferCompatibility);
}
// A late or lost ready announcement is recoverable by a probe, without starting
// a second renderer. An acknowledgement is replayed until the host resumes.
export function createStartupReplay(send){
 let phase='module',ready=false,restored=null,finished=false,restoring=false;
 return {
  phase(value){if(Object.hasOwn(WORLD_STARTUP_PHASES,value)){phase=value;send({type:'startup',phase});}},
  ready(){ready=true;send({type:'ready'});},
  beginRestore(){if(finished)return true;if(restoring||restored)return false;restoring=true;return true;},
  restored(event){if(!finished){restoring=false;restored=event;}send(event);},
  finish(){finished=true;restored=null;restoring=false;},
  probe(){if(finished)return;if(restored)send(restored);else if(ready&&!restoring)send({type:'ready'});else send({type:'startup',phase});}
 };
}
