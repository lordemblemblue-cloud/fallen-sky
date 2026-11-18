// Game 2 — real GLB relief + hardware on full-height corridor walls.
// One authored run per unobstructed hallway wall, never rows of 3m x 2m tiles.
// Large chambers, open overlook and docking hangar keep their original finishes.
// Cosmetic only: LevelSpace structural solids / portals remain authoritative.
export const SUMI_GLB_WALL = Object.freeze({
  url: 'https://media.base44.com/files/public/6876751a602125f45f1861b9/b61461336_Game2_SciFi_WallPanel_Optimized.glb',
  size: Object.freeze([3, 2, 0.278]),
  // Original 3m x 2m source is enlarged UNIFORMLY into architectural
  // bays. Keep all real GLB backing, framed 3D vents, pillars and pipes.
  sourceModuleWidth: 3,
  reliefPeriod: 4.8,
  maxNearDistance: 28,
  maxMidDistance: 90,
});

// Split ONLY at actual openings; never add an artificial column boundary.
// Removing the whole portal interval even for upper openings is deliberately
// conservative: no cladding can cover a two-storey ventilation mouth.
const clearOpenings = (lo, hi, openings) => {
  let spans = [[lo, hi]];
  for (const [left, right] of openings) {
    spans = spans.flatMap(([a,b]) =>
      right <= a || left >= b ? [[a,b]] :
        [[a,Math.min(b,left)], [Math.max(a,right),b]]
          .filter(([x,y]) => y-x > .01));
  }
  return spans;
};

// Each uninterrupted side is a fused batch of FULL GLB wall-bay sections.
// The original model is uniformly enlarged from floor to ceiling. REAL 3D
// pillars delineate natural large sections, not flat 2m overlay photos.
export function addSumiGLBWallRun(k, {
  side, fixed, start, end, bottom, top, openings=[], zone='hallway',
  visibleBands=null, allowShort=false
}) {
  if (!['s','n','e','w'].includes(side) || top-bottom < 2 ||
      end-start < (allowShort?.12:2.4)) return;
  const alongX=side==='s'||side==='n';
  const yaw={s:0,n:Math.PI,w:Math.PI/2,e:-Math.PI/2}[side];
  const toward=(side==='s'||side==='w') ? 1 : -1;
  // Place the GLB IN the structural wall, not on top of its old painted
  // surface. The original front relief is around +.08 m in source space.
  // Scale the offset uniformly with the whole 3D model so the actual relief
  // meets the hall's inner structural face; mechanical fixtures project
  // naturally into the hall from that face.
  const scale=(top-bottom)/2;
  const plane=fixed-toward*.08*scale;
  const y0=bottom, y1=top;
  // Frame-sized side cheeks are short by design. A very small edge inset
  // meets the real inverted-U vent frame; it never extends into the portal.
  const inset=allowShort?.015:.14;
  const gaps=openings.map(([a,b])=>[a-inset,b+inset]);
  for (const [a,b] of clearOpenings(start+inset,end-inset,gaps)) {
    const length=b-a;
    if (length < (allowShort?.10:2.4)) continue;
    const mid=(a+b)/2;
    const p=alongX?[mid,(y0+y1)/2,plane]:
      [plane,(y0+y1)/2,mid];
    (k.L.wallPanelInstances ||= []).push({
      p, yaw, scale:[1,1,1], side, zone,
      source:'Game2_SciFi_WallPanel_Optimized.glb',
      kind:'continuous_corridor', length,
      run:[a,b], vertical:[y0,y1],
      // Upper/lower duct portals must stay open. The genuine GLB source
      // geometry is vertically clipped to these authored solid bands.
      ...(visibleBands?{visibleBands:visibleBands.map(b=>[...b])}:{}),
      // Original GLB 3D meshes will be scaled as genuine wall bays.
    });
  }
}

const HALLS = new Set(['spine','west_corridor','east_corridor','riser','turn']);

export function addSumiGLBRoomWalls(k, rooms) {
  for (const room of rooms) {
    if (!HALLS.has(room.id)) continue;
    const [x0,z0,x1,z1]=room.box;
    const horizontal=(x1-x0)>=(z1-z0);
    // Exactly the two long sides of each passage, not its short end walls.
    const sides=horizontal?['s','n']:['w','e'];
    const skipped=new Set(room.skip||[]);
    for (const side of sides) {
      if (skipped.has(side)) continue;
      const alongX=side==='s'||side==='n';
      addSumiGLBWallRun(k,{
        side,
        fixed:side==='s'?z0:side==='n'?z1:side==='w'?x0:x1,
        start:alongX?x0:z0,
        end:alongX?x1:z1,
        bottom:0,top:room.ceiling,
        openings:room.gaps?.[side]||[],zone:room.id,
      });
    }
  }
  // Unlike a flat photo, the real GLB wall has to wrap the split-level
  // ventilation surround. Formerly ONLY x27..52 was covered; exposed gray
  // filler at x17.5..27 and above the vent was visible between the pieces.
  // Build genuine GLB relief on every STRUCTURAL span, including the small
  // vertical gray cheek between portals. Never put a solid surface across
  // either the lower or upper duct opening.
  const north='east_corridor_vent_bulkhead';
  const full=[ [17.5,20],[23,24],[27,52],[58,58.5] ];
  for(const [start,end] of full)
    addSumiGLBWallRun(k,{
      side:'n',fixed:4,start,end,bottom:0,top:8,
      zone:north,allowShort:end-start<3
    });
  // Two holes in one 8m-high face: lower x20..23 from 0..2.4 and upper
  // x20..23 from 4.2..7.05. The metal between and ABOVE those openings
  // is its own visible GLB surface with the original full-height 4x scale.
  addSumiGLBWallRun(k,{
    side:'n',fixed:4,start:20,end:23,bottom:0,top:8,
    visibleBands:[[2.4,4.2],[7.05,8]],
    zone:north,allowShort:true
  });
  // Attach GLB lintels to the upper edge of the framed service and riser
  // doors only. Gray inverted-U jamb trim remains visible and recognizable.
  for(const [start,end] of [[24,27],[52,58]])
    addSumiGLBWallRun(k,{
      side:'n',fixed:4,start,end,bottom:0,top:8,
      visibleBands:[[7.5,8]],zone:north,allowShort:true
    });
}

// Narrow enclosed upper passage, including its enclosed bridge.
// Full wall height here is y=4.2 to 9.6, not a 2m picture stripe. The open
// overlook and docking hangar must keep their own separate room finishes.
export function addSumiGLBUpperAndHangarWalls(k) {
  for (const [side,fixed] of [['w',15],['e',21]]) {
    addSumiGLBWallRun(k,{
      side,fixed,start:58,end:148,bottom:4.2,top:9.6,
      zone:'upper_gallery'
    });
  }
}
