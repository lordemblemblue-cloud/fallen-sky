// Wolfveil PLAY WORLD — real shoreline terrain grading at the *existing*
// three bridge bearings, not a raised visual plank or separate walkable floor.
//
// The return function is used by WolfveilLayout.wolfveilHeight, therefore the
// generated 310-segment terrain, renderer BVH and signed dedicated map all
// receive the exact same bank grade. Source coordinates remain unshifted;
// the existing scene group provides the optional +70m viewer-Z transform.
const clamp01=x=>Math.max(0,Math.min(1,x));
const smooth=x=>{const t=clamp01(x);return t*t*(3-2*t);};

export const WOLFVEIL_BRIDGE_BANK_GRADE_REVISION='play_bridge_shore_terrain_contact_v1';

export function createWolfveilBridgeBankTerrainGrade(bridges,rawHeight,{
  outsideMeters=22, insideMeters=4, solidShoulderMeters=4,
  lateralShoulderMeters=1.5, lateralBlendMeters=7,
}={}){
  if(!Array.isArray(bridges)||!bridges.length||
    typeof rawHeight!=='function'||!(
      Number.isFinite(outsideMeters)&&outsideMeters>solidShoulderMeters+2&&
      Number.isFinite(insideMeters)&&insideMeters>=2&&
      Number.isFinite(solidShoulderMeters)&&solidShoulderMeters>=0&&
      Number.isFinite(lateralShoulderMeters)&&lateralShoulderMeters>=0&&
      Number.isFinite(lateralBlendMeters)&&lateralBlendMeters>1
    ))throw Error('Invalid Wolfveil bridge bank terrain grade');

  // Compute immutable bearings from the PREVIOUS shared terrain, before this
  // bank-local change. Never derive the bank datum from its own edited output
  // or recursively sample a bridge profile.
  const bearings=bridges.flatMap(bridge=>{
    const [ax,az]=bridge.from,[bx,bz]=bridge.to;
    const dx=bx-ax,dz=bz-az,len=Math.hypot(dx,dz);
    if(!bridge.id||!(bridge.width>=2)||!(len>10))
      throw Error('Malformed Wolfveil bridge for shoreline grading');
    const fx=dx/len,fz=dz/len,lx=-fz,lz=fx;
    return [0,1].map(end=>{
      const x=end?bx:ax,z=end?bz:az,
        outwardX=end?fx:-fx,outwardZ=end?fz:-fz,
        half=bridge.width/2;
      // The full bridge width shares ONE contact-plane datum, not separately
      // raised lanes that would twist the deck or leave one shore floating.
      const across=[-1,-.75,-.5,-.25,0,.25,.5,.75,1]
        .map(f=>rawHeight(x+lx*half*f,z+lz*half*f));
      if(!across.every(Number.isFinite))
        throw Error('Unmeasured source bank at '+bridge.id);
      return Object.freeze({
        bridgeId:bridge.id,bank:end?'to':'from',
        x,z,halfWidth:half,outwardX,outwardZ,lateralX:lx,lateralZ:lz,
        targetTerrainY:Math.max(...across),
        pregradeRangeY:Math.max(...across)-Math.min(...across),
      });
    });
  });

  function grade(x,z,baseY=rawHeight(x,z)){
    if(!Number.isFinite(x)||!Number.isFinite(z)||
       !Number.isFinite(baseY))return baseY;
    let y=baseY;
    for(const b of bearings){
      const ox=x-b.x,oz=z-b.z;
      const along=ox*b.outwardX+oz*b.outwardZ;
      if(along<=-insideMeters||along>=outsideMeters)continue;
      const sideways=Math.abs(ox*b.lateralX+oz*b.lateralZ);
      const innerWidth=b.halfWidth+lateralShoulderMeters;
      if(sideways>=innerWidth+lateralBlendMeters)continue;
      const across=1-smooth((sideways-innerWidth)/lateralBlendMeters);
      const lengthWeight=along<0
        ?smooth((along+insideMeters)/insideMeters)
        :1-smooth((along-solidShoulderMeters)/
          (outsideMeters-solidShoulderMeters));
      const weight=across*lengthWeight;
      // Raise the shoreline under low-bearing edges to meet the bearing
      // datum. Do not dig down any higher rock, dry out river midspans or
      // place an extra non-colliding visual slab.
      y=Math.max(y,baseY+(b.targetTerrainY-baseY)*weight);
    }
    return y;
  }
  grade.bearings=Object.freeze(bearings);
  grade.revision=WOLFVEIL_BRIDGE_BANK_GRADE_REVISION;
  return grade;
}
