// Medical connector: open elevated bridge and stacked ventilation system.
// This replaces the intrusive 23m ramp and its tall, unlit side-wall meshes.
// Level 1 (existing): east corridor -> 2.4m-high duct -> medical.
// Level 2 (new): maintenance incline -> elevated air-duct -> bridge -> gallery.
const METAL='sumiWallSilver',FLOOR='sumiFloorGunmetal',
  CEILING='sumiCeilingTitanium',STEEL='steelGloss',DARK='metalDark',GRATE='gratedSteel';

export const MEDICAL_CONNECTOR=Object.freeze({
  y:4.2,
  bridge:Object.freeze({x0:19.75,x1:23.25,z0:30,z1:58,width:3.5}),
  upperVent:Object.freeze({x0:20,x1:23,z0:4,z1:30,top:7.05}),
  serviceIncline:Object.freeze({x0:24,z0:4,x1:27,z1:17,y0:0,y1:4.2}),
  northLanding:Object.freeze({x0:15,z0:55,x1:23.5,z1:58.5}),
});

function plateSupports(k,x0,x1,z0,z1,y){
  // Open rail, not full-height wall. Only fine tubular balusters, capped to
  // shoulder height, beyond the playable span. No solid vertical screening.
  // Pipe centers previously sat INSIDE the 3.5 m walking deck and were
  // non-colliding: the player could visibly pass through them. Shift their
  // decorative rails behind the EXISTING, colliding outside parapets.
  // Leave a generously clear gap at both the forward and vent junctions.
  const sides=[x0-.10,x1+.10];
  const first=z0+3.8,last=z1-4.5;
  for(const x of sides){
    for(let z=first;z<last-.2;z+=3.4){
      k.pipe([x,y+.035,z],[x,y+1.0,z],.045,STEEL,10);
      k.deco([x-.12,y+.025,z-.10],[x+.12,y+.12,z+.12],DARK);
    }
    k.pipe([x,y+1,first],[x,y+1,last],.052,STEEL,12);
    k.pipe([x,y+.20,first],[x,y+.20,last],.042,STEEL,10);
  }
}

export function addMedicalConnector(k){
  const y=MEDICAL_CONNECTOR.y;
  // The medical room's south wall is rebuilt explicitly by the owner map
  // using skip:['s','n']. Two separate vent apertures share the original
  // x20..23 wall bay. Their steel separator supports the upper doorway.
  const zs=29.5,zn=30;
  for(const [a,b] of [[8.5,20],[23,24],[27,30.5]])
    k.solid([a,0,zs],[b,9,zn],METAL);
  k.solid([20,2.4,zs],[23,y,zn],METAL);
  k.solid([20,7.15,zs],[23,9,zn],METAL);

  // Free-spanning medical overpass: one *level* deck at 4.2 m from the new
  // south-wall upper opening to the original north upper gallery portal.
  const b=MEDICAL_CONNECTOR.bridge;
  k.span([(b.x0+b.x1)/2,y,b.z0],[(b.x0+b.x1)/2,y,b.z1],
    b.width,.27,FLOOR,true);
  plateSupports(k,b.x0,b.x1,b.z0,b.z1,y);
  // The old rails were decorative pipes with NO collision: players could
  // sidestep off a bridge into the exterior void. Actual waist-height
  // rails are narrow collision strips along the OUTSIDE of the deck.
  // End at the north landing so the player can turn toward the gallery.
  for(const x of [b.x0-.19,b.x1+.02])
    k.solid([x,y+.03,b.z0+.64],[x+.17,y+1.16,54.85],DARK,false);
  for(let z=31;z<=56;z+=3.2){
    k.deco([b.x0+.20,y+.018,z],[b.x1-.20,y+.040,z+.14],DARK);
    for(const x of [b.x0+.27,b.x1-.38]){
      k.deco([x,y+.050,z+.36],[x+.11,y+.064,z+.47],METAL);
    }
  }
  // A 2.5m-wide landing joins the offset x15..22 north-gallery doorway.
  const l=MEDICAL_CONNECTOR.northLanding;
  // Former full landing box was COPLANAR with both the medical span
  // (x19.75..23.25,z30..58) and the start of the upper gallery
  // (x14.5..21.5,z58..94). Those coincident 4.2m top triangles
  // caused the shimmering/dark-texture stripes in the screenshots.
  // Fill only the uncovered partitions, retaining every walking floor.
  k.solid([l.x0,y-.29,l.z0],[b.x0,y,58],FLOOR);
  k.solid([b.x1,y-.29,l.z0],[l.x1,y,l.z1],FLOOR);
  k.solid([21.5,y-.29,58],[b.x1,y,l.z1],FLOOR);
  // One wall-anchored support on the OUTSIDE of the medical landing.
  // The previous second diagonal at x=23.22 crossed the sightline of
  // the branching right-hand vent doorway, and was non-colliding.
  // Never run a railing across either the forward opening or side turn.
  k.pipe([l.x0+.18,y+.15,l.z0],[l.x0+.18,y+.96,l.z0+1.6],.07,STEEL,12);
  k.lamp([19.2,8.2,55.6],'white');

  // Existing lower 2.4m duct remains intact at x20..23 z4..30.
  // The new 4.2m service level is separated by an actual metal floor.
  const v=MEDICAL_CONNECTOR.upperVent;
  // Floor triangles, rather than a thick collision box, are essential here:
  // the lower duct's pathfinder must not mistake the upper floor for an
  // AABB blocking its ceiling-height clearance.
  k.L.groundPatches.push({x0:v.x0,z0:v.z0,x1:v.x1,z1:v.z1,y,mat:FLOOR,tile:3});
  k.deco([v.x0,y-.23,v.z0],[v.x1,y-.015,v.z1],FLOOR);
  for(const x of [v.x0-.27,v.x1+.05]){
    // Panelled enclosure on each side; the eastern wall has a true
    // 2.8 m-wide upper cross-duct opening (z26.8..29.7). The ceiling
    // remains continuous above the opening, with collision below.
    if(x>v.x1){
      k.solid([x,y,v.z0],[x+.22,v.top,26.8],METAL);
      k.solid([x,y,29.7],[x+.22,v.top,v.z1],METAL);
      k.solid([x,6.55,26.8],[x+.22,v.top,29.7],METAL);
    }else k.solid([x,y,v.z0],[x+.22,v.top,v.z1],METAL);
    for(let z=v.z0+.75;z<v.z1-1;z+=2.8){
      if(x>v.x1 && z+2.1>26.8 && z<29.7) continue;
      k.deco([x+.035,y+.65,z],[x+.19,y+1.95,z+2.1],DARK);
      k.deco([x+.045,y+1.9,z],[x+.20,y+1.96,z+2.1],STEEL);
      k.deco([x+.045,y+.62,z],[x+.20,y+.66,z+2.1],GRATE);
    }
  }
  k.solid([v.x0-.27,v.top,v.z0],[v.x1+.27,v.top+.26,v.z1],CEILING);
  for(let z=v.z0+1.1;z<v.z1-1;z+=3.6){
    k.deco([v.x0+.15,v.top-.12,z],[v.x1-.15,v.top-.055,z+.15],STEEL);
    k.lamp([21.5,v.top-.28,z],'blue');
  }
  // The earlier full-face grille covered an otherwise usable upper vent.
  // Narrow attached header + jambs keep the passage fully visible.
  k.deco([19.82,v.top-.19,4],[23.18,v.top+.04,4.11],GRATE);
  for(const x of [19.81,23.08])
    k.deco([x,y+.12,3.99],[x+.11,v.top-.21,4.12],STEEL);
  // A physically attached maintenance ramp is *outside* the medical room,
  // alongside the unchanged lower duct, and never creates tall opaque
  // sidewalls in the user's view.
  const r=MEDICAL_CONNECTOR.serviceIncline;
  k.ramp({...r,dir:'+z',mat:FLOOR});
  // Continuous physical fall guards on the OUTSIDE of the exposed stairs.
  // Segment heights follow the real ramp slope; inside width remains 3m,
  // with no rail crossing its access at the bottom or top.
  for(let z=r.z0;z<r.z1-.0001;z+=1.3){
    const end=Math.min(r.z1,z+1.3);
    const low=y*(z-r.z0)/(r.z1-r.z0);
    const high=y*(end-r.z0)/(r.z1-r.z0);
    for(const x of [r.x0-.23,r.x1+.04]){
      k.solid([x,low+.03,z],[x+.19,high+1.16,end],DARK,false);
      k.deco([x-.025,high+1.14,z],[x+.21,high+1.23,end],STEEL);
    }
  }
  // Rise finishes before the pre-existing east/west ground-floor vent.
  // Above that cross-duct the service connector remains a raised, thin
  // triangle-collision catwalk (no solid blocking the lower passage).
  k.L.groundPatches.push({x0:24,z0:17,x1:27,z1:30,y,mat:FLOOR,tile:2.8});
  k.deco([24,y-.23,17],[27,y-.013,30],DARK);
  // Keep the raised maintenance deck enclosed on its outside perimeter.
  // The west rail stops before z26.8 to preserve the real side duct
  // connection; its upper transverse doorway remains fully open.
  k.solid([23.78,y+.03,17],[23.96,y+1.18,26.75],DARK,false);
  k.solid([27.04,y+.03,17],[27.24,y+1.18,30],DARK,false);
  for(const [x,a,z] of [[23.78,17,26.75],[27.04,17,30]])
    k.pipe([x+.09,y+1.19,a],[x+.09,y+1.19,z],.061,STEEL,12);
  // Open narrow piping at the slope edges and anchored end brackets.
  for(const x of [r.x0-.16,r.x1+.16]){
    k.pipe([x,.50,4],[x,y+.47,17],.060,STEEL,12);
    for(let z=6;z<=16;z+=3.5){
      const h=y*(z-4)/(17-4);
      k.deco([x-.13,h-.23,z],[x+.13,h-.02,z+.2],DARK);
    }
  }
  // Medical second-level service landing x23..27 at the southern wall.
  // Landing is thin walkable mesh. Thick AABB here would obstruct
  // traversal of the original east-side duct just below.
  k.L.groundPatches.push({x0:23,z0:29.2,x1:27,z1:34,y,mat:FLOOR,tile:2});
  k.deco([23,y-.23,29.2],[27,y-.01,34],FLOOR);
  // Medical side step lies entirely on an existing x23..27 landing floor.
  // Drop the decorative truss BELOW it, rather than draw a coplanar
  // walking surface over the same top and flicker at steep camera angles.
  k.span([23,y-.065,33],[24.5,y-.065,33],2.7,.16,STEEL,false);

  // Real east-corridor north-wall opening for the start of the maintenance
  // incline (x24..27 at ground height): room gaps are authored in ROOMS.
  // Medical south-wall elevated service door at x24..27, without an
  // unwanted floor-level hole in the medical room.
  // Ramp top already reaches y≈4.12 at the southern wall; an upper
  // portal begins at 3.62m to avoid a hidden collision obstruction.
  k.solid([24,0,zs],[27,3.62,zn],METAL);
  k.solid([24,7.7,zs],[27,9,zn],METAL);
  k.lamp([25.5,7.4,31.3],'white');

  // Side-to-side upper ventilation junction ties the medical walkway to
  // the rising service path. The 4.2m upper duct is a second real route.
  // Both upper catwalks already have real floor triangles at y=4.2.
  // This transverse truss is a SUPPORT underneath the floor, not the
  // chest-high pipe/raised strip which previously crossed the player's
  // walking lane. The doorway's collision remains unmodified.
  k.span([21.5,y-.075,28.4],[25.5,y-.075,28.4],2.8,.16,GRATE,false);
  k.deco([20.15,y-.28,28.28],[26.8,y-.19,28.37],STEEL);
  k.lamp([23.4,6.65,28.3],'blue');
}
