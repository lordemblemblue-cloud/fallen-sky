import { WOLFVEIL_PALACE_APPROACH } from './WolfveilPalaceLayout.mjs';

/**
 * Authored natural details along Wolfveil's palace ascent. Only reads the
 * existing physical terrain height; no independent collision floor, no GLBs,
 * no random runtime reshuffle or obstructing stones within the tread width.
 */
export const WOLFVEIL_PALACE_DRESSING = Object.freeze({
  rocksPerSide: 68,
  lanternPairs: 4,
  rockSetback: 1.7,
  rockShoulderWidth: 3.3,
  lampSetback: 5.7,
});

const fract = x => x - Math.floor(x);
const noise = (index, seed) => fract(Math.sin(index * 127.1 + seed * 311.7) * 43758.5453);
const PALETTE = Object.freeze([0x666b67,0x82847b,0x77766c,0x565d59,0x899082]);

export function planWolfveilPalaceDressing(groundAt) {
  if(typeof groundAt !== 'function') throw new TypeError('Palace dressing requires the shared terrain sampler');
  const a = WOLFVEIL_PALACE_APPROACH, s = WOLFVEIL_PALACE_DRESSING;
  const lanterns = [];
  for (let i = 0; i < s.lanternPairs; i++) {
    const z = a.fromZ + 12 + (a.toZ - a.fromZ - 24) * i / (s.lanternPairs - 1);
    for(const side of [-1,1]) {
      const x = a.x + side * (a.width/2 + s.lampSetback);
      lanterns.push({x,z,y:groundAt(x,z),side});
    }
  }

  const rocks = [];
  for(let i=0;i<s.rocksPerSide;i++) {
    const progress=(i+.5)/s.rocksPerSide;
    const zBase=a.fromZ + 2.2 + (a.toZ-a.fromZ-4.6)*progress;
    for(const side of [-1,1]) {
      const n=i*2+(side+1)/2;
      const x=a.x+side*(a.width/2+s.rockSetback+s.rockShoulderWidth*noise(n,3));
      const z=zBase+(noise(n,9)-.5)*.75;
      // The Japanese lantern bases are clear of nearby loose stones.
      if(lanterns.some(l=>Math.hypot(x-l.x,z-l.z)<1.6))continue;
      const size=.28+noise(n,12)*.67;
      const y=groundAt(x,z)+size*.06; // mostly buried in natural soil
      rocks.push({x,z,y,scaleX:size*(.86+noise(n,17)*.56),
        scaleY:size*(.37+noise(n,19)*.16),
        scaleZ:size*(.76+noise(n,21)*.48),
        yaw:noise(n,26)*Math.PI*2,pitch:(noise(n,29)-.5)*.25,
        color:PALETTE[Math.floor(noise(n,31)*PALETTE.length)]});
    }
  }
  return {rocks,lanterns,decorativeOnly:true};
}
