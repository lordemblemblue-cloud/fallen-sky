// Original, renderer-independent PvP arena blockouts. Coordinates are metres.
// All solid geometry is explicit and shared: never mount the art without its authority collision.
// These layouts are opt-in until vertical collision, bots and camera are integrated.
const box = (id, kind, x, y, z, width, height, depth) =>
  Object.freeze({ id, kind, x0:x-width/2, x1:x+width/2, y0:y, y1:y+height, z0:z-depth/2, z1:z+depth/2 });

function building(id, x, z, stairsSide = 1) {
  const parts = [
    box(id+'-west', 'wall', x-3.2, 0, z, 0.4, 3.2, 5.6),
    box(id+'-east', 'wall', x+3.2, 0, z, 0.4, 3.2, 5.6),
    box(id+'-roof', 'deck', x, 3.0, z, 6.8, 0.2, 5.6),
    box(id+'-roof-cover', 'cover', x-stairsSide*2.5, 3.2, z, 0.45, 0.9, 2.8),
  ];
  // Open north/south portal through the lower floor; an external stepped
  // maintenance duct leads to the roof independently of a fighter's jump skill.
  for (let i=0; i<8; i++) {
    const h=(i+1)*0.4;
    parts.push(box(id+'-step-'+i, 'step', x+stairsSide*1.6, 0, z-2.8-(7-i+0.5)*0.72, 2.2, h, 0.72));
  }
  return parts;
}
const cover=(id,x,z,w=2.4,d=1.1)=>box(id,'cover',x,0,z,w,0.85,d);
const layout=(id,radius,parts)=>Object.freeze({id,radius,parts:Object.freeze(parts)});
const MAPS=Object.freeze({
  control:layout('meridian-observatory-district',28,[
    ...building('relay',-9,0),
    ...building('east-lab',3,10,-1),
    cover('north-screen',2,-10), cover('south-screen',-1,15),
    cover('east-screen',15,8,1.1,2.4), cover('west-screen',-18,-3,1.1,2.4),
  ]),
  escort:layout('meridian-freight-district',28,[
    ...building('loading-bay',7,-9,-1),
    ...building('service-bay',-14,10),
    cover('loading-screen',9,2), cover('defense-screen',13,12),
    cover('west-screen',-11,-7,1.1,2.4), cover('arrival-screen',-7,16),
  ]),
  tdm:layout('meridian-combat-district',22,[
    ...building('west-station',-7,2),
    ...building('east-station',7,2,-1),
    cover('north-west',-5,-12), cover('north-east',5,-12),
    cover('south-west',-5,12), cover('south-east',5,12),
    cover('center-screen',0,0,2.2,1.0),
  ]),
});
export function getModeArenaLayout(mode) { return Object.hasOwn(MAPS,mode) ? MAPS[mode] : null; }

// Query a horizontal circle against the footprint of a box. The vertical
// interval is separately checked for a fighter's feet/head; standing exactly
// on a platform does not count as interpenetration.
export function overlapsArenaFootprint(part,x,z,radius=0) {
  const dx=x-Math.max(part.x0,Math.min(x,part.x1));
  const dz=z-Math.max(part.z0,Math.min(z,part.z1));
  return radius===0 ? dx===0 && dz===0 : dx*dx+dz*dz<radius*radius;
}
export function arenaBodyBlockers(map,{x,y,z,radius,height}) {
  return map.parts.filter(p=>y<p.y1-1e-6 && y+height>p.y0+1e-6 && overlapsArenaFootprint(p,x,z,radius));
}
// A support candidate for downward movement, not a replacement for swept
// movement: callers must first resolve horizontal movement and head clearance.
export function arenaLandingHeight(map,{x,z,previousY,nextY}) {
  if (nextY>previousY) return null;
  let landing=nextY<=0 && previousY>=0 ? 0 : null;
  for (const p of map.parts) {
    if (p.y1<=previousY+1e-6 && p.y1>=nextY-1e-6 && overlapsArenaFootprint(p,x,z)) {
      landing=Math.max(landing??-Infinity,p.y1);
    }
  }
  return landing;
}
