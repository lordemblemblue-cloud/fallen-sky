// Pure original roof geometry for the isolated Game 3D capital city preview.
// Decorative solid shell only: no attic entrance, collision, shelter or weather physics.
const GABLED=new Set(['residence','workshop']);
const PEDIMENTED=new Set(['pediment']);

export function planCapitalCityRoofs(buildings){
  if(!Array.isArray(buildings))throw Error('Capital roofs require buildings');
  const profiles=[];
  for(const b of buildings){
    if(!b || !['x','y','z','w','h','d'].every(k=>Number.isFinite(b[k])) || !(b.w>0&&b.h>0&&b.d>0) || !b.id)
      throw Error('Invalid capital building dimensions for roof');
    const gabled=GABLED.has(b.kind);
    if(!gabled&&!PEDIMENTED.has(b.kind))continue;
    const width=b.w+(gabled?2.4:3.2);
    const depth=gabled?b.d+2.2:2.5;
    const bottom=b.y+b.h+(gabled?0:2.45);
    const rise=gabled?Math.min(4,b.w*.15):Math.min(3.4,b.w*.105);
    const centerZ=gabled?b.z:b.z-b.d/2-.45;
    const minX=b.x-width/2,maxX=b.x+width/2;
    const minZ=centerZ-depth/2,maxZ=centerZ+depth/2;
    const lf=[minX,bottom,minZ],rf=[maxX,bottom,minZ];
    const lb=[minX,bottom,maxZ],rb=[maxX,bottom,maxZ];
    const ridgeFront=[b.x,bottom+rise,minZ],ridgeBack=[b.x,bottom+rise,maxZ];
    const positions=[],uvs=[];
    function tri(a,c,d,cap=false){
      for(const p of [a,c,d]){
        positions.push(...p);
        uvs.push(Math.max(0,Math.min(1,(p[0]-minX)/width)),Math.max(0,Math.min(1,cap?(p[1]-bottom)/rise:(p[2]-minZ)/depth)));
      }
    }
    // Consistent outward-facing winding for sloping planes and both end caps.
    tri(lf,lb,ridgeBack);tri(lf,ridgeBack,ridgeFront);
    tri(rf,ridgeFront,ridgeBack);tri(rf,ridgeBack,rb);
    tri(lf,ridgeFront,rf,true);tri(lb,rb,ridgeBack,true);
    profiles.push(Object.freeze({buildingId:b.id,kind:gabled?'gable':'pediment',
      positions:Object.freeze(positions),uvs:Object.freeze(uvs),
      material:'roof',collidable:false,previewOnly:true}));
  }
  return Object.freeze(profiles);
}
