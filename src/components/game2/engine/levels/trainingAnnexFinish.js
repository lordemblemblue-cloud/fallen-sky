// Game 2 — screenshot-matched Handbook annex (28..49, 25..49) visual finish.
// Render-only. Never changes the game/online collision triangles, doors or spawns.
// The owner-flagged foreign slab by the doorway is deliberately out of scope.
import { meshBuilder } from '../level/builder.js';

export const ANNEX_FINISH_BOUNDS = Object.freeze({
  x: [28.14, 48.86], z: [25.10, 48.90], y: [0.057, 9.68],
  westDoor: Object.freeze({ x: 28, z: [32, 38] }),
  eastDoor: Object.freeze({ x: 49, z: [34, 40] }),
});

const C = Object.freeze({
  chalk: [0.60, 0.58, 0.54], limestone: [0.46, 0.44, 0.40],
  grout: [0.18, 0.205, 0.215], dark: [0.105, 0.15, 0.19],
  edge: [0.38, 0.46, 0.49], alloy: [0.47, 0.53, 0.55],
  gilt: [0.68, 0.49, 0.26], amber: [0.94, 0.69, 0.35],
  glass: [0.052, 0.095, 0.13], cyan: [0.18, 0.56, 0.66],
});
const clamp = (x,a,b)=>Math.max(a,Math.min(b,x));
const box = (mesh,lo,hi,col)=>mesh.box(lo,hi,col);
function notch(floor,stone,x,z,w,d,col) {
  // Existing painted flagstone collision top is at y=0; original visible tops
  // reach 0.054. Keep this clearcoat inset within ~8 cm of the same floor.
  const lip=0.026;
  box(stone,[x+.018,.057,z+.018],[x+w-.018,.063,z+d-.018],C.grout);
  box(floor,[x+lip,.066,z+lip],[x+w-lip,.074,z+d-lip],col);
  const shine=col.map(v=>clamp(v*1.09,0,1));
  // Fine, independent bevelled edges catch grazing spotlights.
  box(stone,[x+.035,.068,z+.027],[x+w-.035,.071,z+.043],shine);
  box(stone,[x+.028,.068,z+.048],[x+.043,.071,z+d-.045],shine.map(v=>v*.86));
}

export function buildTrainingAnnexFinish() {
  const floor=meshBuilder(), stone=meshBuilder(), steel=meshBuilder();
  const brass=meshBuilder(), glass=meshBuilder(), warm=meshBuilder(), cold=meshBuilder();
  const etched=meshBuilder();
  // Ceramic/stone squares follow the EXISTING 1.4m hall tile grid, not a new
  // collision floor. Slate-sage / sandstone / clay / cream echo screenshots.
  const palette = [
    [0.30,0.33,0.32],[0.42,0.38,0.33],
    [0.39,0.33,0.30],[0.48,0.44,0.35],
    [0.31,0.35,0.37],[0.45,0.39,0.31],
  ];
  let column=0;
  for(let x=28.2;x<48.8;x+=1.4,column++){
    let row=0;
    for(let z=25.2;z<48.8;z+=1.4,row++){
      const w=Math.min(1.33,48.82-x),d=Math.min(1.33,48.82-z);
      if(w<=0.16||d<=0.16)continue;
      const tint=0.96+0.035*Math.sin(x*3.91+z*2.17);
      const shade=palette[(row*3+column*5)%palette.length].map(v=>v*tint);
      notch(floor,etched,x,z,w,d,shade);
      // Inset micro-scuffs are shallow color relief, not bright white lines.
      if((row+column)%4===0){
        box(etched,[x+.16,.0741,z+.26],[x+.43,.075,z+.282],[.33,.32,.28]);
        box(etched,[x+.28,.0741,z+.31],[x+.31,.075,z+.62],[.28,.30,.30]);
      }
    }
  }

  // Architectural base, intermediate stringcourse and ceiling crown attached
  // to existing masonry. East gate x=49/z34..40 is LEFT COMPLETELY OPEN.
  const trimZ=(z,dir)=>{
    const inner=z+dir*.14,face=z+dir*.32;
    const lo=Math.min(inner,face),hi=Math.max(inner,face);
    for(const [y,h,c,m] of [
      [.19,.25,C.limestone,stone],[.48,.055,C.gilt,brass],
      [3.32,.15,C.limestone,stone],[3.49,.07,C.edge,steel],
      [7.73,.21,C.limestone,stone],[7.99,.065,C.gilt,brass],
      [9.13,.25,C.limestone,stone],[9.42,.065,C.edge,steel],
    ])box(m,[28.38,y,lo],[48.62,y+h,hi],c);
    // Inset upright bays over existing brick rather than oversized flat boxes.
    for(const x of [31.0,36.7,42.4,47.1]){
      box(stone,[x-.19,.60,lo],[x+.19,7.80,hi],C.limestone);
      box(steel,[x-.225,7.73,lo-.025],[x+.225,7.92,hi+.025],C.edge);
      for(const y of [1.04,3.85,7.12])
        box(brass,[x-.18,y,lo-.035],[x+.18,y+.045,hi+.035],C.gilt);
    }
  };
  trimZ(25,1);trimZ(49,-1);

  // East wall trim is split either side of the genuine east door.
  for(const [a,b] of [[25.45,33.60],[40.45,48.55]]){
    for(const [y,h,c,m] of [
      [.30,.20,C.limestone,stone],[.53,.06,C.gilt,brass],
      [7.80,.20,C.limestone,stone],[8.02,.07,C.edge,steel],
      [9.22,.22,C.limestone,stone],
    ])box(m,[48.52,y,a],[48.81,y+h,b],c);
    // Keep rustication as real shallow relieved stone courses.
    for(let y=.73;y<7.65;y+=.65){
      const stagger=(Math.floor(y/.65)%2)*.64;
      for(let z=a-stagger;z<b-.08;z+=1.38){
        const lo=Math.max(a,z)+.026,hi=Math.min(b,z+1.31)-.018;
        if(hi-lo<.24)continue;
        const shade=.92+.06*Math.sin(z*7.13+y*2.51);
        box(stone,[48.58,y,lo],[48.735,y+.55,hi],C.limestone.map(v=>v*shade));
      }
    }
  }

  // Suspended ceiling coffers and beams. They are shallow at 9.2m+ and never
  // interfere with the doorway, the player camera or gameplay collision.
  for(const x of [31.2,35.2,39.2,43.2,47.0]){
    box(steel,[x-.16,9.27,25.36],[x+.16,9.54,48.63],C.dark);
    box(brass,[x-.065,9.25,25.53],[x+.065,9.28,48.45],C.gilt.map(v=>v*.6));
  }
  for(const z of [28.0,32.0,36.0,40.0,44.0,47.0]){
    box(steel,[28.46,9.28,z-.14],[48.54,9.51,z+.14],C.dark);
    box(stone,[28.52,9.47,z-.035],[48.48,9.52,z+.035],C.limestone);
  }

  // Side-wall screens are the same dark rectangular modules visible in the
  // screenshots. Beveled brushed-metal frame, recessed glass and indicators.
  // Never add any panel into west door z32..38 or east door z34..40.
  for(const [side,x] of [['west',29.13],['east',47.54]]){
    for(const [start,end] of [[27.2,29.95],[43.0,45.75]]){
      const lo=x-.10,hi=x+.10;
      box(steel,[lo,1.26,start],[hi,4.57,end],C.edge);
      box(steel,[lo-.028,1.39,start+.12],[hi+.028,4.47,end-.12],C.dark);
      const face=side==='west'?hi+.035:lo-.035;
      box(glass,[face-.014,1.56,start+.28],[face+.014,4.31,end-.28],C.glass);
      for(const y of [1.42,4.36]){
        box(brass,[lo-.055,y,start-.055],[hi+.055,y+.07,end+.055],C.gilt);
      }
      for(let q=0;q<4;q++){
        const z=start+.36+q*.44;
        box(cold,[face-.020,1.76,z],[face+.020,1.795,z+.24],C.cyan);
      }
      box(warm,[face-.03,4.15,start+.45],[face+.03,4.205,start+.85],C.amber);
      for(const z of [start+.19,end-.19])for(const y of [1.48,4.40])
        box(brass,[lo-.055,y,z-.055],[hi+.055,y+.06,z+.055],C.chalk);
    }
  }

  // Source counters near north wall: maintain original counter collision
  // (x=30.5,35,39.5,44; z=46.4..47.4) and readable handbook interaction.
  for(const x of [30.5,35,39.5,44]){
    const a=x+.11,b=x+2.09,z=46.40;
    box(steel,[a,.17,z-.078],[b,1.025,z-.029],C.dark);
    for(const h of [.23,.96])
      box(brass,[a,h,z-.093],[b,h+.045,z-.044],C.gilt);
    for(const sx of [a+.055,b-.11]){
      box(steel,[sx,.25,z-.112],[sx+.055,.99,z-.037],C.edge);
      for(const yy of [.34,.85])
        box(brass,[sx-.018,yy,z-.119],[sx+.07,yy+.06,z-.045],C.chalk);
    }
    // Three shallow engraved bands, no protruding buttons in walking space.
    for(let q=0;q<3;q++)
      box(cold,[a+.22+q*.43,.72,z-.105],[a+.49+q*.43,.756,z-.077],C.cyan);
    // Brushed 4-piece metal surround seated around the *existing* glass top.
    box(steel,[a,1.18,46.43],[b,1.198,46.49],C.edge);
    box(steel,[a,1.18,47.24],[b,1.198,47.30],C.edge);
    for(const sx of [a,b-.055])
      box(steel,[sx,1.18,46.44],[sx+.055,1.198,47.29],C.edge);
    box(warm,[a+.13,1.199,46.46],[a+.54,1.205,46.50],C.amber);
  }

  // Four real, anchored recessed ceiling fixtures. The annex-only shader
  // applies point-light response to its own materials; the metal housings
  // and warm/cyan diffusers provide visible, physically placed emitters.
  for(const x of [33,44])for(const z of [29,43]){
    box(steel,[x-.92,9.06,z-.40],[x+.92,9.30,z+.40],C.dark);
    box(brass,[x-.88,9.035,z-.35],[x+.88,9.055,z+.35],C.gilt);
    box(stone,[x-.76,9.017,z-.27],[x+.76,9.037,z+.27],C.grout);
    box(warm,[x-.61,9.001,z-.17],[x-.09,9.018,z+.17],C.amber);
    box(cold,[x+.09,9.001,z-.17],[x+.61,9.018,z+.17],C.cyan);
    for(const sx of [x-.75,x+.69])for(const zz of [z-.28,z+.22])
      box(brass,[sx,9.055,zz],[sx+.055,9.066,zz+.055],C.chalk);
  }

  return {
    floor:floor.build(), stone:stone.build(), steel:steel.build(),
    brass:brass.build(), glass:glass.build(), warm:warm.build(),
    cold:cold.build(), etched:etched.build(),
  };
}
