// Original layered SVG prototype art. No network services or new dependencies.
export const COMPANION_VISUALS=Object.freeze({"groveArcher":{"kind":"grove","height":1,"width":150,"head":104,"parts":{"back":{"size":[180,240],"pivot":[90,10]},"torso":{"size":[150,192],"pivot":[75,170]},"lower":{"size":[170,248],"pivot":[85,15]},"leg":{"size":[55,132],"pivot":[27,13]},"boot":{"size":[75,62],"pivot":[32,47]},"upper":{"size":[70,101],"pivot":[34,12]},"forearm":{"size":[53,84],"pivot":[26,9]},"hand":{"size":[44,49],"pivot":[22,11]},"neck":{"size":[58,55],"pivot":[29,22]},"face_neutral":{"size":[100,110],"pivot":[50,70]},"face_focused":{"size":[100,110],"pivot":[50,70]},"face_shout":{"size":[100,110],"pivot":[50,70]},"face_hurt":{"size":[100,110],"pivot":[50,70]},"face_closed":{"size":[100,110],"pivot":[50,70]}}},"pilgrimWarden":{"kind":"warden","height":1.08,"width":196,"head":116,"parts":{"back":{"size":[180,240],"pivot":[90,10]},"torso":{"size":[196,192],"pivot":[98,170]},"lower":{"size":[216,248],"pivot":[108,15]},"leg":{"size":[55,132],"pivot":[27,13]},"boot":{"size":[75,62],"pivot":[32,47]},"upper":{"size":[70,101],"pivot":[34,12]},"forearm":{"size":[53,84],"pivot":[26,9]},"hand":{"size":[44,49],"pivot":[22,11]},"neck":{"size":[58,55],"pivot":[29,22]},"face_neutral":{"size":[100,110],"pivot":[50,70]},"face_focused":{"size":[100,110],"pivot":[50,70]},"face_shout":{"size":[100,110],"pivot":[50,70]},"face_hurt":{"size":[100,110],"pivot":[50,70]},"face_closed":{"size":[100,110],"pivot":[50,70]}}},"mistScout":{"kind":"scout","height":0.91,"width":142,"head":100,"parts":{"back":{"size":[180,240],"pivot":[90,10]},"torso":{"size":[142,192],"pivot":[71,170]},"lower":{"size":[162,248],"pivot":[81,15]},"leg":{"size":[55,132],"pivot":[27,13]},"boot":{"size":[75,62],"pivot":[32,47]},"upper":{"size":[70,101],"pivot":[34,12]},"forearm":{"size":[53,84],"pivot":[26,9]},"hand":{"size":[44,49],"pivot":[22,11]},"neck":{"size":[58,55],"pivot":[29,22]},"face_neutral":{"size":[100,110],"pivot":[50,70]},"face_focused":{"size":[100,110],"pivot":[50,70]},"face_shout":{"size":[100,110],"pivot":[50,70]},"face_hurt":{"size":[100,110],"pivot":[50,70]},"face_closed":{"size":[100,110],"pivot":[50,70]}}}});
import {MELEE_STANCES} from './meleeSkills.mjs';
export function visualFor(id){return Object.hasOwn(COMPANION_VISUALS,id)?COMPANION_VISUALS[id]:null;}
export const companionAsset=(id,part)=>'/fantasybattle/companions/'+id+'/'+part+'.svg';
export function makeCompanionRig(id,base,manifest){
 const v=visualFor(id);if(!v)return null;
 const data=JSON.parse(JSON.stringify(base));data.id=id;data.name=id;
 const parts={...manifest.parts},prefix=id+':';
 for(const [name,p] of Object.entries(v.parts))parts[prefix+name]={origin:[0,0],size:p.size};
 const layer=(id,part,bone,pos,z,extra={})=>({id,part:prefix+part,bone,pos,pivot:v.parts[part].pivot,z,...extra});
 const scale=v.height;
 // Keep existing animation channel names, and move anatomical pivots to each body's proportions.
 const w=v.kind==='warden'?1.19:v.kind==='scout'?0.92:1;
 data.bones=data.bones.map(b=>({...b,pos:[b.pos[0]*w,b.pos[1]*scale]}));
 const bone=id=>data.bones.find(b=>b.id===id).pos;
 const p=(x,y)=>[x*w,y*scale];
 // Lower-leg and boot articulation, under the existing skirt silhouette.
 for(const [side,x] of [['Front',-30],['Back',27]]){data.bones.push({id:'leg'+side,parent:'root',pos:p(x,137)},{id:'foot'+side,parent:'leg'+side,pos:p(x,0)});}
 if(MELEE_STANCES[v.kind])data.stances=JSON.parse(JSON.stringify(MELEE_STANCES[v.kind]));
 const orig=(id)=>{const l=base.layers.find(l=>l.id===id);return {...l,...(l.pos?{pos:p(...l.pos)}:{})};};
 data.layers=[
  layer('hairBack','back',v.kind==='grove'?'head':'spine',v.kind==='grove'?p(-17,590):p(0,465),1,{grid:[4,8],spring:{stiffness:55,damping:8,limit:10}}),
  layer('legBack','leg','legBack',p(27,137),3),layer('legFront','leg','legFront',p(-30,137),4),
  layer('sandalBack','boot','footBack',p(26,0),5),layer('sandalFront','boot','footFront',p(-31,0),6),
  layer('drawUpperArm','upper','drawArm',bone('drawArm'),10,{grid:[2,3]}),
  layer('bowUpperArm','upper','bowArm',bone('bowArm'),11,{grid:[2,3]}),
  layer('neck','neck','neck',bone('neck'),20),
  layer('torso','torso','spine',p(0,300),25,{grid:[4,5]}),
  layer('skirt','lower','pelvis',p(0,305),30,{grid:[4,6],spring:{stiffness:85,damping:10,limit:5}}),
  // Original bow and hand geometry kept for the archer so authored nock alignment is preserved.
  orig('bow'),
  ...(v.kind==='grove'?[orig('quiver'),orig('bowHand'),orig('bowForearm'),orig('drawHand'),orig('drawForearm')]:[
   layer('bowHand','hand','bowHand',bone('bowHand'),41),layer('bowForearm','forearm','bowForearm',bone('bowForearm'),42),
   layer('drawHand','hand','drawHand',bone('drawHand'),43),layer('drawForearm','forearm','drawForearm',bone('drawForearm'),44)]),
  layer('face','face_neutral','head',bone('head'),50,{role:'face',grid:[4,4],depth:1,scale:v.head/100}),
  layer('faceFade','face_neutral','head',bone('head'),51,{role:'faceFade',grid:[4,4],depth:1,scale:v.head/100}),
  layer('eyesClosed','face_closed','head',bone('head'),52,{role:'blink',grid:[4,4],depth:1,scale:v.head/100})
 ];
 data.expressions={neutral:prefix+'face_neutral',focused:prefix+'face_focused',attackShout:prefix+'face_shout',hurt:prefix+'face_hurt',wink:prefix+'face_closed',pout:prefix+'face_hurt'};
 if(v.kind!=='grove'){data.sockets.bowGrip={bone:'bowHand',pos:bone('bowHand')};data.sockets.nock={bone:'drawHand',pos:bone('drawHand')};}
 for(const key of ['chest','headTop'])data.sockets[key]={...data.sockets[key],pos:p(...data.sockets[key].pos)};
 data.hurtbox={...data.hurtbox,radius:base.hurtbox.radius*w};
 return {data,manifest:{...manifest,parts}};
}
export function requiredCompanionParts(ids){return [...new Set(ids)].filter(visualFor).flatMap(id=>Object.keys(visualFor(id).parts).map(part=>({id,part,key:id+':'+part,url:companionAsset(id,part)})));}
