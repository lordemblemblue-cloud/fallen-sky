// Game 3D Wolfveil: continuously advancing, softly undulating wavefronts.
// No radial emitters, discrete packet cells or uniformly scrolling texture.
// Only the shading normal responds; the actual river geometry and collision
// stay fixed, as do the camera and all surrounding scenery.
export const WOLFVEIL_GLASS_RIPPLES=Object.freeze({
  spacing:9.4,
  downstreamSpeed:1.6,
  lateralWidth:19,
  bendAmplitude:1.65,
  bendFrequency:.29,
  secondBendAmplitude:.54,
  secondBendFrequency:.71,
  crestPower:3.0,
  trailingPower:4.0,
  trailingOffset:1.13,
  trailingWeight:.23,
  normalStrength:.018,
});

const TAU=Math.PI*2;
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));

export function wolfveilGlassWavePhase(travel,bankX,time,p=WOLFVEIL_GLASS_RIPPLES){
  if(![travel,bankX,time].every(Number.isFinite))return 0;
  const cross=(bankX-.5)*p.lateralWidth;
  const advected=travel-time*p.downstreamSpeed;
  const bend=p.bendAmplitude*Math.sin(cross*p.bendFrequency+advected*.018+time*.10)
    +p.secondBendAmplitude*Math.sin(cross*p.secondBendFrequency-advected*.012+time*.13);
  return TAU*(advected+bend)/p.spacing;
}

/**
 * Reference for the ONE continuously moving primary wavefront, followed by
 * its low-amplitude trailing disturbance. A cross-river phase distortion
 * turns a straight hard stripe into a gently wiggling natural crest.
 */
export function sampleWolfveilGlassRipple(travel,bankX,time,p=WOLFVEIL_GLASS_RIPPLES){
  if(![travel,bankX,time].every(Number.isFinite))return 0;
  const cross=(bankX-.5)*p.lateralWidth;
  const phase=wolfveilGlassWavePhase(travel,bankX,time,p);
  const primary=Math.pow(clamp(.5+.5*Math.cos(phase),0,1),p.crestPower);
  const trailing=Math.pow(clamp(.5+.5*Math.cos(phase-p.trailingOffset),0,1),
    p.trailingPower)*p.trailingWeight;
  const irregularity=.72+.28*(.5+.5*Math.sin(travel*.047+cross*.16));
  return clamp((primary+trailing)*irregularity,0,1);
}
