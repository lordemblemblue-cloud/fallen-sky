// Exploration telemetry is not the simulation clock. Explicit interactions bypass this filter.
export const WORLD_TELEMETRY_INTERVAL=250;
export const WORLD_HEARTBEAT_INTERVAL=2000;
export function createWorldTelemetry(){
 let last=null,lastAt=-Infinity;
 return {
  reset(){last=null;lastAt=-Infinity;},
  sample(world,now){
   if(!world||!Number.isFinite(now))return null;
   const signature=JSON.stringify(world);
   const changed=signature!==last;
   if(!changed&&now-lastAt<WORLD_HEARTBEAT_INTERVAL)return null;
   last=signature;lastAt=now;
   return {world,unchanged:!changed};
  }
 };
}
