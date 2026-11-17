/**
 * Text-authored skeletal bird flight animation for Wolfveil's owner's rigged GLB.
 * The GLB contains 21 bones and zero authored animation clips; this samples a
 * reusable, seamless wingbeat curve into those existing bind-pose joints.
 *
 * No video-to-motion generation, new GLB, mesh replacement, combat hitbox or
 * gameplay physics. The world loop applies the sampled pose to skinned clones.
 */
export const BIRD_WING_STROKE_KEYS=Object.freeze([
  // Normalized 0..1 wingbeat: rapid downstroke, slower wing recovery.
  Object.freeze([0,-0.31]),
  Object.freeze([.13,.20]),
  Object.freeze([.29,1.00]),
  Object.freeze([.42,.78]),
  Object.freeze([.61,-.12]),
  Object.freeze([.80,-.46]),
  Object.freeze([1,-.31]),
]);
const PI=Math.PI;
const TAU=2*PI;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const valid=n=>typeof n==='number'&&Number.isFinite(n);
const smooth=t=>{const c=clamp(t,0,1);return c*c*(3-2*c);};
const phase01=v=>((v%1)+1)%1;

export function sampleBirdWingStroke(phase){
  const p=phase01(valid(phase)?phase:0);
  for(let i=1;i<BIRD_WING_STROKE_KEYS.length;i++){
    const [time,to]=BIRD_WING_STROKE_KEYS[i];
    const [start,from]=BIRD_WING_STROKE_KEYS[i-1];
    if(p<=time)return from+(to-from)*smooth((p-start)/(time-start));
  }
  return BIRD_WING_STROKE_KEYS[0][1];
}

/** Interpret only joints known to belong to a bird, not feet or legs.
 * Supports Tripo-style 0_Left_Limb_0 / 0_Right_Limb_0 bone names, Blender
 * wing names and optional tail/head/neck controls if the source rig has them.
 * Bone names are matched rather than assuming arbitrary bone indices.
 */
export function classifyWolfveilBirdBone(name){
  const normalized=String(name||'').replace(/::/g,'_')
    .replace(/[^a-z0-9]+/gi,'_').toLowerCase();
  if(!normalized)return null;
  if(/(?:^|_)tail(?:_|$)/.test(normalized))return {kind:'tail'};
  if(/(?:^|_)head(?:_|$)/.test(normalized))return {kind:'head'};
  if(/(?:^|_)neck(?:_|$)/.test(normalized))return {kind:'neck'};
  const side=/(?:^|_)(left|right)(?:_|$)/.exec(normalized);
  const shortSide=/(?:^|_)(?:wing|limb)_([lr])(?:_|$)/.exec(normalized);
  const left=side?.[1]==='left'||shortSide?.[1]==='l';
  const right=side?.[1]==='right'||shortSide?.[1]==='r';
  if(!(left||right))return null;
  if(!/(?:^|_)(?:wing|limb)(?:_|$)/.test(normalized))return null;
  const segment=/(?:wing|limb)_(\d+)(?:_|$)/.exec(normalized)||
    /(?:wing|limb)_(?:left|right|l|r)_(\d+)(?:_|$)/.exec(normalized);
  const index=segment?Number(segment[1]):0;
  // 0 = shoulder; 1+ = wrist / outer flight feather chains.
  return {kind:'wing',sign:left?1:-1,segment:Math.min(3,index)};
}

/**
 * Returns a fully deterministic pose in radians / meters. Different birds
 * use their persistent phase, beat rate and glide intervals; no global lockstep.
 * Flight is flap→glide→flap, landing spreads wings to brake and takeoff beats
 * harder. Head stays stabilized and tail pitches with flight attitude.
 */
export function sampleWolfveilBirdPose(bird={}){
  const t=valid(bird.motionClock)?bird.motionClock:0;
  const phase=valid(bird.phase)?bird.phase:0;
  const hz=clamp(valid(bird.beatHz)?bird.beatHz:3.2,1.6,5.2);
  const beat=phase01(t*hz+phase/TAU);
  const stroke=sampleBirdWingStroke(beat);
  const mode=bird.mode||'flight';
  const energy=clamp(valid(bird.flapEnergy)?bird.flapEnergy:0.75,0,1);
  const bank=clamp(valid(bird.bank)?bird.bank:0,-.45,.45);
  const pitch=clamp(valid(bird.pitch)?bird.pitch:0,-.3,.3);
  const descending=mode==='descending';
  const takeoff=mode==='takeoff';
  const landed=mode==='landed';
  const glide=mode==='flight'&&bird.flightStage==='glide';
  const power=landed?0:takeoff?1:descending?.42:glide?.15:energy;
  // Keep wings slightly spread in a quiet glide, partially tucked on perch.
  const wingAngle=landed?-.14:glide?.16+stroke*.07:
    clamp(stroke*.75*power+(1-power)*.11,-.62,.98);
  const wingTipAngle=landed?-.08:glide?.06:
    clamp(-wingAngle*.32+stroke*.18*power,-.44,.44);
  const wingSweep=landed?0:glide?.12:stroke*.085*power;
  const tail=landed?0:clamp(pitch*.62-bank*.18+Math.sin(t*3+phase)*.035,-.28,.28);
  const head=landed?0:clamp(-pitch*.57+Math.sin(t*2.5+phase)*.018,-.23,.23);
  const bob=landed?0:(takeoff?.022:glide?.008:.016)*
    Math.sin(t*TAU*hz+phase);
  return {wingAngle,wingTipAngle,wingSweep,tail,head,bob,bank,pitch,
    flightStage:landed?'perch':takeoff?'takeoff':descending?'brake':glide?'glide':'flap'};
}
