import { addMedicalConnector, MEDICAL_CONNECTOR } from './sumiMedicalConnector.js';
import { addStrongholdOnePanelOneTile } from './sumiStrongholdOnePanel.js';
import { addSumiLandingBay } from './sumiStrongholdLandingBay.js';
// Stage 2 structural expansion: the medical bay becomes a TWO-LEVEL chamber.
// The attached overhead spine measures 90 m (z=58..148), exactly triple the
// first-stage 30 m left-turn hallway. All floor/bridge sections are collision
// geometry. The owner's reference photo may relocate these provisional parts.
const METAL='rivetedSteel', STEEL='steelGloss', DARK='metalDark',
  WALL='sumiWallSilver', FLOOR='sumiFloorGunmetal', CEILING='sumiCeilingTitanium';
export const UPPER_GALLERY = Object.freeze({
  levelY: 4.2,
  medicalPortal: Object.freeze({x0:15,x1:22,z:58,y0:4.2,y1:8.25}),
  medicalBridge: MEDICAL_CONNECTOR.bridge,
  upperVent: MEDICAL_CONNECTOR.upperVent,
  serviceIncline: MEDICAL_CONNECTOR.serviceIncline,
  startZ:58,endZ:148,length:90,
  originalHallLength:30,
  bridge: Object.freeze({x:18,z0:94,z1:110,width:5.2}),
  overlook: Object.freeze({x0:11.5,z0:148,x1:26.5,z1:164}),
});

export function addUpperGallery(k){
  const y=UPPER_GALLERY.levelY;
  // ACTUAL opening in medical's north wall. The lower wall stays solid so
  // players cannot walk into empty air on the ground level. This replaces
  // the medical room's north wall in the base ROOMS layout.
  k.solid([8.5,0,58],[15,9,58.5],METAL);
  k.solid([22,0,58],[30.5,9,58.5],METAL);
  k.solid([15,0,58],[22,y,58.5],METAL);
  k.solid([15,8.25,58],[22,9,58.5],METAL);

  // Level, unobstructed medical bridge and two linked elevations of service duct.
  addMedicalConnector(k);

  // Two enclosed corridor lengths split by a 16 m open-truss skybridge.
  // Both segments are joined at the same y=4.2, with no phantom floor
  // beneath the bridge, and no hidden collision at the doorway.
  for(const [a,b] of [[58,94],[110,148]]){
    k.solid([14.5,y-.28,a],[21.5,y,b],FLOOR);
    k.solid([14.5,y,a],[15,9.6,b],WALL);
    k.L.solids.at(-1).glbHallFallback=true;
    k.solid([21, y,a],[21.5,9.6,b],WALL);
    k.L.solids.at(-1).glbHallFallback=true;
    k.solid([14.5,9.6,a],[21.5,9.94,b],CEILING);
    // Relief plates visually inherit Training Grounds specular steel style.
    for(let z=a+.35;z<b-.4;z+=3.0){
      const last=Math.min(z+2.6,b-.35);
      k.deco([15.2,y+.019,z],[20.8,y+.044,last],FLOOR);
      k.deco([15.15,y+.049,z],[20.85,y+.065,z+.09],DARK);
      // Render old side stamps ONLY when the GLB cannot load.
      k.deco([15.08,y+1,z],[15.16,y+3.5,last],WALL);
      k.L.deco.at(-1).glbHallFallback=true;
      k.deco([20.84,y+1,z],[20.92,y+3.5,last],WALL);
      k.L.deco.at(-1).glbHallFallback=true;
      k.deco([15.14,9.28,z],[20.86,9.34,z+.1],CEILING);
      if(Math.floor(z)%3===0){
        k.deco([15.27,y+.06,z+.35],[15.36,y+.082,z+.50],DARK);
        k.deco([20.64,y+.06,z+.35],[20.73,y+.082,z+.50],DARK);
      }
    }
    for(let z=a+5;z<b;z+=11){
      k.lamp([18,9.28,z],'white');
      for(const x of [15.24,20.76]){
        k.pipe([x,8.55,z-2],[x,8.55,z+2],.09,STEEL,12);
        k.L.pipes.at(-1).glbHallFallback=true;
        k.deco([x-.14,8.38,z-.13],[x+.14,8.7,z+.13],DARK);
        k.L.deco.at(-1).glbHallFallback=true;
      }
    }
  }

  // Owner-requested micro-detail sample, limited to the first right-hand
  // wall module and ONE floor tile in the upper corridor beyond the ramp.
  const startOldWallDeco=k.L.deco.length,startOldWallPipes=k.L.pipes.length;
  addStrongholdOnePanelOneTile(k);
  // The original one-panel photograph, vent and special fixtures should
  // NOT sit on top of the enlarged GLB wall. Keep its adjacent FLOOR sample.
  for(const d of k.L.deco.slice(startOldWallDeco))
    if(d.min[1]>4.65)d.glbHallFallback=true;
  for(const p of k.L.pipes.slice(startOldWallPipes))
    if(p.a[1]>4.65&&p.b[1]>4.65)p.glbHallFallback=true;

  const span=UPPER_GALLERY.bridge;
  k.span([span.x,y,span.z0],[span.x,y,span.z1],span.width,.38,FLOOR,true);
  // The screenshot's second opening is the exposed 16m span between two
  // interior corridors. Enclose the skybridge as a plated service TUNNEL,
  // without filling in the open void BELOW its elevated walkway.
  //
  // Both long sides meet the existing corridor wall faces at z=94/110.
  // All steel is outside the 5.2m walkable bridge core; walking remains free.
  for(const [a,b] of [[14.5,15.0],[21.0,21.5]]){
    k.solid([a,y,94],[b,9.6,110],WALL,false);
    k.L.solids.at(-1).glbHallFallback=true;
    // True raised specular segments bolted to the solid enclosing wall.
    const innerX=a<18?b:a;
    const direction=a<18?1:-1;
    for(let z=94.65;z<109.45;z+=3.2){
      k.deco([innerX+(direction>0?.015:-.075),y+.9,z],
        [innerX+(direction>0?.075:-.015),8.90,Math.min(z+2.4,109.35)],WALL);
      k.L.deco.at(-1).glbHallFallback=true;
      k.deco([innerX+(direction>0?.077:-.098),y+1.04,z+.12],
        [innerX+(direction>0?.098:-.077),8.64,Math.min(z+2.2,109.2)],STEEL);
      k.L.deco.at(-1).glbHallFallback=true;
    }
  }
  // One seamless, genuinely opaque overhead roof from z94 to z110.
  // Exclude roof from walking, just as with the adjoining galleries.
  k.solid([14.5,9.6,94],[21.5,9.94,110],CEILING,false);
  for(let z=95.2;z<109;z+=4.3){
    k.deco([15.02,9.39,z],[20.98,9.58,z+.16],METAL);
    k.deco([15.17,9.31,z+.04],[20.83,9.40,z+.12],STEEL);
  }
  // Lighting sits on the newly covered ceiling, never a floating square.
  k.deco([17.20,9.35,101.4],[18.80,9.55,102.0],METAL);
  k.deco([17.38,9.29,101.55],[18.62,9.34,101.85],'white');
  k.lamp([18,9.31,101.7],'white');

  // The enclosed steel sidewalls already serve as collision guards.
  // Remove the old see-through parapet rods formerly inside the tunnel.
  // Doorways at z94 and z110 remain full-width walking entrances.
  // Bridge ribs hang under the span so it reads as an engineered structure,
  // not an unsupported floating slab. Decorative only (no fall blockers).
  for(let z=94;z<=110;z+=4){
    k.deco([15.42,2.48,z],[20.58,2.72,z+.28],DARK);
    k.pipe([15.32,2.50,z],[15.32,y-.25,z+2],.11,STEEL,10);
    k.pipe([20.68,2.50,z],[20.68,y-.25,z+2],.11,STEEL,10);
  }
  for(const z of [94,110]){
    k.lamp([18,8.35,z],'blue');
    // Transition beam is BELOW the tread. Its former y=4.26 top stuck
    // across the player's feet like a full-width pipe at each bridge end.
    k.deco([14.5,y-.37,z-.18],[21.5,y-.29,z+.18],STEEL);
  }

  // The overlook is wider than the approach hallway. Previously its SOUTH
  // side was open to the exterior on either side of the narrow gallery mouth.
  // Seal both cheek walls at z148, leaving the 7m corridor x14.5..21.5
  // untouched at full player height and retaining the existing roof.
  k.solid([11.5,y,147.76],[14.5,10.0,148.26],WALL,false);
  k.solid([21.5,y,147.76],[26.5,10.0,148.26],WALL,false);
  for(const [x0,x1] of [[11.5,14.5],[21.5,26.5]]){
    k.deco([x0+.22,y+1.1,148.30],[x1-.22,9.25,148.38],METAL);
    k.deco([x0+.34,y+1.3,148.39],[x1-.34,8.9,148.43],STEEL);
  }
  // A narrow lintel frames the mouth while clearing the connecting hallway.
  k.deco([14.5,9.6,147.85],[21.5,9.86,148.17],METAL);

  // End room / observation platform — still on the second level.
  const t=UPPER_GALLERY.overlook;
  k.solid([t.x0,3.82,t.z0],[t.x1,y,t.z1],FLOOR);
  k.solid([t.x0,y,t.z0],[t.x0+.55,10.0,t.z1],WALL);
  k.solid([t.x1-.55,y,t.z0],[t.x1,10.0,t.z1],WALL);
  // Hangar entry: replace the sealed dead-end bulkhead with two attached
  // jambs and an 11m opening leading to a walkable ship docking bay.
  k.solid([t.x0,y,t.z1-.55],[13.0,10.0,t.z1],WALL);
  k.solid([24.0,y,t.z1-.55],[t.x1,10.0,t.z1],WALL);
  k.deco([13,9.75,t.z1-.63],[24,9.98,t.z1-.48],STEEL);
  k.solid([t.x0,10,t.z0],[t.x1,10.35,t.z1],CEILING);
  k.zone('upper_overlook',t.x0+.6,t.z0+.2,t.x1-.6,t.z1-.6);
  for(const z of [150.0,154.1,158.2]){
    for(const x of [t.x0+.72,t.x1-.85]){
      k.deco([x,y+1.1,z],[x+.13,8.8,z+3.4],STEEL);
      k.deco([x-.05,8.7,z],[x+.19,8.86,z+3.5],METAL);
    }
  }
  // Clear central route, decorative survey desk off to one side.
  k.solid([12.7,y,156],[15.25,y+1.10,160],METAL);
  k.deco([12.82,y+1.12,156.2],[15.13,y+1.17,159.8],'glass');
  k.deco([13.1,y+1.19,158.0],[14.8,y+1.21,158.12],'blue');
  for(const x of [14,24])k.lamp([x,9.25,157],'blue');

  // The berth shares an identical 4.2m floor height with the lookout.
  addSumiLandingBay(k);

  // Exterior bent metal braces every 12m, below the cantilevered spine.
  // Braces have no walking collision at ground level.
  for(let z=63;z<148;z+=12){
    for(const side of [-1,1]){
      const x=side<0?14.12:21.88,outer=x+side*.85;
      k.pipe([outer,0,z],[x,y-.25,z+2.35],.15,STEEL,14);
      k.pipe([outer,0,z+4],[x,y-.25,z+2.35],.15,METAL,14);
      k.deco([outer-.34,.05,z-.33],[outer+.34,.35,z+.34],DARK);
    }
  }
}
