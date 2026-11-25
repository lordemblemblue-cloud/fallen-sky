import {payloadPose} from '../sim/escort.mjs';
import {buildEscortVehicle} from './maps/escortArena.mjs';
export function createEscortProps(scene){
 const v=buildEscortVehicle(scene);let elapsed=0;
 return{update(distance,dt=0,view){elapsed+=dt;const {x,y,z,yaw}=payloadPose(distance);v.transportGroup.position.set(x,y,z);v.transportGroup.rotation.y=yaw;
  v.transportVisual.position.y=.035*Math.sin(elapsed*5);for(const [i,f] of v.rearFlames.entries())f.scale.set(1,.7+.25*Math.sin(elapsed*12+i),1);
  v.transportThrusterMat.opacity=.72+.12*Math.sin(elapsed*9);v.escortRingMat.color.setHex(view?.contested?0xf59e0b:0x38bdf8);
 },dispose(){v.transportGroup.removeFromParent();const geo=new Set(),mat=new Set();v.transportGroup.traverse(o=>{if(o.geometry)geo.add(o.geometry);if(o.material)mat.add(o.material);});geo.forEach(g=>g.dispose());mat.forEach(m=>m.dispose());}};
}
