import {ACTIONS} from './battleRules.mjs';
// Angles are degrees relative to each weapon's idle angle. Bone rotations are absolute
// offsets over rest pose. Damage remains entirely owned by the deterministic round resolver.
const clamp=x=>Math.max(0,Math.min(1,x));
const smooth=x=>{const u=clamp(x);return u*u*(3-2*u);};
const rot=rotation=>({rotation});
const pose=(spine,lead,elbow,off,offElbow,front=0,back=0,drop=0)=>({
 spine:rot(spine),bowArm:rot(lead),bowForearm:rot(elbow),drawArm:rot(off),drawForearm:rot(offElbow),
 legFront:rot(front),legBack:rot(back),pelvis:{offset:[0,drop]}
});
export const MELEE_STANCES=Object.freeze({
 warden:{relaxed:pose(1,14,28,8,44),combat:pose(4,30,55,35,82,-6,6,-5)},
 scout:{relaxed:pose(-2,8,26,-8,28),combat:pose(-8,45,48,-26,65,-12,12,-12)}
});
const params=(main=0,off=0,shield=0)=>({meleeMain:main,meleeOff:off,shieldAngle:shield});
const k=(time,phase,bones,p,expression='focused')=>({time,phase,bones,params:p,expression,easing:'easeInOutCubic'});
const impact=(time,heavy=false)=>({time,type:'spawnEffect',effect:'meleeImpact',heavy});
const clip=(id,name,duration,keyframes,events=[],hold=false)=>({id,name,totalDuration:duration,blendInTime:.1,blendOutTime:hold?0:.18,cancelWindowStart:duration,keyframes,events,hold});
const idle=kind=>MELEE_STANCES[kind].combat;
const swordWind=pose(13,-25,115,45,78,12,-13,-10);
const swordHit=pose(-14,98,14,18,75,-18,11,-7);
const swordBack=pose(-8,74,64,28,76,-9,8,-8);
const daggerWind=pose(7,12,102,-42,103,15,-16,-20);
const daggerHit=pose(-19,108,7,-42,95,-23,17,-13);
const daggerOff=pose(-12,34,92,91,12,-18,11,-15);
const brace=pose(7,31,61,72,99,-13,12,-16);
const bash=pose(-17,22,70,112,19,-21,15,-12);
const attack=(id,kind,duration,frames,times,heavy=false)=>clip(id,ACTIONS[id].name,duration,[k(0,'anticipation',idle(kind),params()),...frames,k(duration,'recovery',idle(kind),params())],times.map(time=>impact(time,heavy)));
export const MELEE_SKILLS=Object.freeze([
 attack('swordSlash','warden',.92,[k(.20,'anticipation',swordWind,params(70)),k(.39,'active',swordHit,params(-86,0,-10),'attackShout'),k(.53,'recovery',swordBack,params(-30))],[.39]),
 attack('shieldBash','warden',1.10,[k(.25,'anticipation',brace,params(8,0,24)),k(.52,'active',bash,params(20,0,-30),'attackShout'),k(.67,'recovery',brace,params(0,0,14))],[.52],true),
 attack('swordFlurry','warden',1.26,[k(.20,'anticipation',swordWind,params(75)),k(.38,'active',swordHit,params(-80),'attackShout'),k(.54,'anticipation',swordBack,params(-55)),k(.73,'active',pose(9,42,95,28,70,-16,12,-8),params(82),'attackShout'),k(.90,'recovery',idle('warden'),params(15))],[.38,.73]),
 attack('daggerJab','scout',.78,[k(.17,'anticipation',daggerWind,params(35,15)),k(.32,'active',daggerHit,params(-45,12),'attackShout'),k(.46,'recovery',idle('scout'),params(-10,4))],[.32]),
 attack('daggerLunge','scout',1.02,[k(.25,'anticipation',pose(8,-15,125,-25,108,22,-21,-24),params(78,30)),k(.49,'active',pose(-28,112,4,-35,65,-30,23,-19),params(-67,15),'attackShout'),k(.67,'recovery',daggerWind,params(20,10))],[.49],true),
 attack('daggerFlurry','scout',1.32,[k(.16,'anticipation',daggerWind,params(45,20)),k(.31,'active',daggerHit,params(-68,12),'attackShout'),k(.43,'anticipation',daggerWind,params(25,55)),k(.56,'active',daggerOff,params(12,-82),'attackShout'),k(.69,'anticipation',daggerWind,params(55,40)),k(.83,'active',pose(-22,98,15,78,24,-22,20,-17),params(-55,-60),'attackShout'),k(1.0,'recovery',idle('scout'),params())],[.31,.56,.83])
]);
export const isMeleeSkill=id=>MELEE_SKILLS.some(s=>s.id===id);
// Separate guard, recoil, celebration and collapse clips, with the original IDs so the
// stage's existing event protocol and archer library remain compatible.
export function classAnimationLibrary(kind){
 if(kind!=='warden'&&kind!=='scout')return [];
 const tank=kind==='warden',base=idle(kind);
 const guard=tank?brace:pose(-3,67,89,63,100,-15,16,-20);
 const recoil=tank?pose(14,18,46,56,108,7,-11,-13):pose(22,-13,56,-25,70,17,-23,-18);
 const guardParams=tank?params(10,0,24):params(35,-35);
 return [
  clip('guard','Guard',.75,[k(0,'anticipation',base,params()),k(.18,'active',guard,guardParams),k(.75,'recovery',guard,guardParams)],[{time:.15,type:'spawnEffect',effect:'ward',duration:.65},{time:.15,type:'playSFX',sfxId:'guard'}]),
  clip('guardHit','Guard Impact',.46,[k(0,'active',guard,guardParams),k(.08,'active',tank?pose(12,35,63,67,115,-9,15,-20):recoil,guardParams),k(.28,'recovery',guard,guardParams),k(.46,'recovery',guard,guardParams)]),
  clip('hitReact','Hit Reaction',.60,[k(0,'active',base,params(),'hurt'),k(.09,'active',recoil,params(15,18),'hurt'),k(.35,'recovery',base,params()),k(.60,'recovery',base,params())]),
  clip('victory','Victory',1.2,[k(0,'anticipation',base,params()),k(.42,'active',tank?pose(0,115,32,10,42):pose(-4,80,61,-35,70),params(tank?70:42,-32),'neutral'),k(1.2,'recovery',tank?pose(0,75,50,10,40):pose(-3,50,48,-20,52),params(tank?35:18,-18),'neutral')],[],true),
  clip('defeat','Defeat',1.25,[k(0,'active',base,params(),'hurt'),k(.28,'active',recoil,params(25,25),'hurt'),k(.75,'recovery',pose(35,-18,18,-20,23,35,-45,-82),params(72,50),'hurt'),k(1.25,'recovery',pose(53,-25,7,-32,14,42,-50,-112),params(85,65),'hurt')],[],true)
 ];
}
// After a guard clip, keep a braced pose until the round ends without replaying SFX or ward events.
export function guardPose(kind){
 const tank=kind==='warden';if(!tank&&kind!=='scout')return null;
 return {id:'guardHold',weight:1,bones:tank?brace:pose(-3,67,89,63,100,-15,16,-20),params:tank?params(10,0,24):params(35,-35),expression:'focused'};
}
// Smooth acceleration/deceleration, a stationary impact window, and a complete return.
export function approachWeight(t,duration,skillId){
 if(!Number.isFinite(t)||!Number.isFinite(duration)||duration<=0)return 0;
 const skill=MELEE_SKILLS.find(s=>s.id===skillId);
 const first=skill?.events[0]?.time??duration*.45,last=skill?.events.at(-1)?.time??duration*.55;
 const arrive=Math.max(.05,first-.07),retreat=Math.min(duration-.05,last+.09);
 return smooth(t/arrive)*smooth((duration-t)/Math.max(.05,duration-retreat));
}
