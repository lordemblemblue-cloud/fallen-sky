// The live creator only offers facial movements actually present on the
// selected Eve/Adam rig. No fake blendshapes or unrelated model swaps.
export const EXPRESSION_GROUPS = Object.freeze([
  {id:'warmth',label:'Warmth & personality',ids:['neutral','warm','joy','laugh','wink','wink_right','curious']},
  {id:'focus',label:'Focus & reaction',ids:['focus','resolve','surprise','disbelief','puff']},
  {id:'dramatic',label:'Story & combat',ids:['fierce','pain','sad','concern','angry','shout']},
]);
export const ADDITIONAL_PRESETS = Object.freeze([
 {id:'joy',label:'Joy',description:'A wider smile with raised brows',values:{smile:.95,brow_up:.32,eye_wide:.15}},
 {id:'laugh',label:'Laugh',description:'Smile, narrowed eyes and an open mouth',values:{smile:1,squint:.35,jaw_open:.46}},
 {id:'wink_right',label:'Right wink',description:'Close the right eyelid while smiling',values:{smile:.48},morphs:{FX_Blink_R:1}},
 {id:'curious',label:'Curious',description:'Open eyes and lifted brows',values:{brow_up:.55,eye_wide:.48}},
 {id:'resolve',label:'Resolve',description:'A calm, focused expression',values:{brow_down:.48,squint:.23,lip_press:.38}},
 {id:'disbelief',label:'Disbelief',description:'Raised brows with a subtle open jaw',values:{brow_up:.58,brow_inner:.45,jaw_open:.2}},
 {id:'concern',label:'Concern',description:'Inner brow lift and softened mouth',values:{brow_inner:.77,lip_press:.28,frown:.23}},
]);
export const EXPRESSION_DESCRIPTIONS = Object.freeze({
 neutral:'Relax every facial muscle',
 warm:'A gentle greeting',
 wink:'Left wink and a slight smile',
 focus:'Eyes on the goal',
 surprise:'Surprise with an open mouth',
 puff:'Puffed cheeks',
 fierce:'Determined combat face',
 pain:'A restrained reaction to injury',
 sad:'Inner brows and a lowered mouth',
 angry:'An intense, furrowed glare',
 shout:'A battle cry',
});
export const MUSCLE_GROUPS = Object.freeze([
 {id:'eyebrows',label:'Brow & eyes',ids:['brow_up','brow_down','brow_inner','blink','squint','eye_wide']},
 {id:'mouth',label:'Mouth & jaw',ids:['smile','jaw_open','pucker','frown','sneer','lip_press','mouth_stretch']},
 {id:'cheeks',label:'Cheeks',ids:['cheek_puff']},
]);
const finite=(n)=>Number.isFinite(Number(n))?Math.max(0,Math.min(1,Number(n))):0;
export function projectExpressionPreset(preset,controls,availableNames){
 const available=new Set(availableNames||[]);
 const byId=new Map((controls||[]).map(c=>[c.id,c]));
 const values={},morphs={};let requested=0,matched=0;
 for(const [id,value] of Object.entries(preset?.values||{})){
  if(finite(value)<=0)continue;
  const names=byId.get(id)?.morphs||[];
  requested+=names.length;
  const found=names.filter(key=>available.has(key));
  matched+=found.length;
  if(found.length)values[id]=finite(value);
 }
 for(const [key,value] of Object.entries(preset?.morphs||{})){
  if(!/^FX_[A-Za-z_]+$/.test(key)||finite(value)<=0)continue;
  requested+=1;
  if(available.has(key)){matched+=1;morphs[key]=finite(value);}
 }
 return {values,morphs,requested,matched,enabled:preset?.id==='neutral'||matched>0,partial:matched>0&&matched<requested};
}
export function supportedExpressionControls(controls,availableNames) {
 const available=new Set(availableNames||[]);
 return (controls||[]).filter(c=>c.morphs.some(name=>available.has(name)));
}
export function expressionIntensity(value) {
 return value==null?1:finite(value);
}
