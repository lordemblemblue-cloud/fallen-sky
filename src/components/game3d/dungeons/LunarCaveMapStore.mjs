// Read-only HUD presentation of enemies already simulated by GameWorld3D.
// These markers are NOT spawn instructions, reward claims, or server authority.
let markers=[];
const listeners=new Set();

export function getLunarCaveMapEnemies(){ return markers; }

export function subscribeLunarCaveMapEnemies(listener){
  if(typeof listener!=='function')return ()=>{};
  listeners.add(listener);
  listener(markers);
  return ()=>listeners.delete(listener);
}

export function publishLunarCaveMapEnemies(entries=[]){
  markers=(Array.isArray(entries)?entries:[]).slice(0,128).flatMap((enemy)=>{
    const x=Number(enemy?.x),z=Number(enemy?.z);
    if(!Number.isFinite(x)||!Number.isFinite(z)||enemy?.alive===false)return [];
    return [{
      id:String(enemy?.id??'unknown').slice(0,96),
      x,z,level:Number.isFinite(Number(enemy?.level))?Number(enemy.level):null,
      tier:typeof enemy?.tier==='string'?enemy.tier:'normal',
      name:typeof enemy?.name==='string'?enemy.name.slice(0,80):'Dungeon enemy',
    }];
  });
  listeners.forEach(fn=>fn(markers));
}
export function clearLunarCaveMapEnemies(){publishLunarCaveMapEnemies([]);}
