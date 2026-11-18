// Kejim Post / Mission 1 cinematic entrance environment, stage 2.
// Visual-only terrain, reflective stones, motivated cascades and Imperial gate
// architecture. All enemy routes, original collision, objectives and doors
// remain in kejimPost.js. Only the perimeter_gate there changes gameplay.
// Every surface is real mesh geometry, not a background image.
import { meshBuilder } from '../level/builder.js';
import { mulberry32 } from '../level/kit.js';

export const KEJIM_ENTRANCE = Object.freeze({
  canyonZ: [-72,-22],
  centerPathClearance: 5.45,
  gateZ: -22.1,
  gateOpening: [-3,3],
  // Water is intentionally only on the left cliff, where there are rock shelves.
  falls: Object.freeze([
    Object.freeze({z:-45.2,start:15.3,width:.98,phase:.3}),
    Object.freeze({z:-39.5,start:18.1,width:1.36,phase:1.3}),
    Object.freeze({z:-32.9,start:13.6,width:.86,phase:2.4}),
  ]),
});
const C={
  stone:[.40,.375,.345], warmRock:[.48,.41,.35], dark:[.14,.17,.19],
  blackSteel:[.10,.135,.17], steel:[.40,.46,.49], gilt:[.65,.46,.25],
  bright:[.93,.72,.39], vegetation:[.13,.22,.075],
  wet:[.23,.29,.28], water:[.34,.69,.74], foam:[.75,.88,.87],
};
const box=(mesh,a,b,col)=>mesh.box(a,b,col);
function quad(mesh,points,col,n=[0,1,0]) {
  mesh.quad(points[0],points[1],points[2],points[3],n,col);
}
function triangle(mesh,points,col,n=[0,1,0]){
  mesh.triangle(points[0],points[1],points[2],n,col);
}
function cliffFace(mesh,side,rng,from,to,h,inner=true){
  // 10 longitudinal cuts x six vertical courses, intentionally irregular
  // yet continuous so the mountains do not read as giant squared-off walls.
  const cols=17,rows=10,verts=[];
  for(let j=0;j<=rows;j++){
    const t=j/rows,row=[];
    for(let i=0;i<=cols;i++){
      const z=from+(to-from)*i/cols;
      const terr=1.7*Math.sin(z*.18+side)+.9*Math.cos(z*.41);
      const crest=6.5*Math.sin(z*.22+side*.6)+3.2*Math.cos(z*.51);
      const y=h*t+(t>.5?t*t*crest:0)+Math.sin(i*.71+j*1.44)*.17;
      // at ground the existing cliff collider is x=±7; the facade is only
      // a few centimeters in front of it, with most folds set back.
      const foot=6.90+(.05+.18*t)*Math.sin(z*.34+side);
      const setback=1.1*t*t+1.9*Math.sin(t*Math.PI)*Math.abs(Math.sin(z*.26));
      const x=side*(foot+setback+Math.max(0,terr)*t*.38);
      row.push([x,y,z]);
    }
    verts.push(row);
  }
  for(let j=0;j<rows;j++)for(let i=0;i<cols;i++){
    const y=(j+.5)/rows;
    const faceTint=.77+(.12*Math.sin(i*6.91+j*2.41+side))+rng()*.22;
    const col=C.stone.map((k,n)=>Math.max(.05,k*faceTint*(n===0?1.02:1)));
    quad(mesh,[verts[j][i],verts[j][i+1],verts[j+1][i+1],verts[j+1][i]],
      col,[-side,.06,0]);
    void y;
  }
  // Proper distant jagged silhouette above the visible inner cliff, in
  // three depth layers. All these ridges lie OUTSIDE the navigable canyon.
  for(let layer=0;layer<3;layer++)for(let i=0;i<cols;i++){
    const z0=from+(to-from)*i/cols,z1=from+(to-from)*(i+1)/cols;
    const x=side*(11+layer*8),depth=side*(16+layer*9);
    const crest=h+4+layer*10+5.2*Math.sin(i*.59+layer*2.2);
    const peak=h+12+layer*13+4.6*Math.cos(i*.76+side+layer);
    const c=C.warmRock.map(v=>v*(.76+layer*.04+ rng()*.15));
    quad(mesh,[[x,h*.68,z0],[x,h*.68,z1],[depth,peak,z1],
      [depth,crest,z0]],c,[-side,.32,0]);
  }
}
function gate(stone,steel,bronze,gold,cloth,lights){
  // Larger silhouette around the exact old functional 6x5m sliding gate.
  // Permanent meshes NEVER overlap x=-3..3, y=0..5.
  for(const side of [-1,1]){
    const x=side*4.3;
    box(stone,[x-.94,0,-23.5],[x+.94,9.4,-18.84],C.warmRock);
    box(steel,[x-.99,1.9,-23.60],[x+.99,2.07,-18.78],C.blackSteel);
    box(steel,[x-1.08,8.78,-23.7],[x+1.08,9.18,-18.65],C.steel);
    // Panel seams, inset ribs and fabricated rivets.
    for(let y=1.35;y<8.7;y+=1.1){
      box(steel,[x-.96,y,-23.68],[x+.96,y+.09,-23.55],C.blackSteel);
      for(const dx of [-.70,.70])
        box(bronze,[x+dx-.08,y+.12,-23.76],
          [x+dx+.08,y+.26,-23.65],C.gilt);
    }
    box(steel,[x-.62,2.05,-23.76],[x+.62,7.94,-23.65],C.dark);
    box(bronze,[x-.17,2.32,-23.83],[x+.17,7.75,-23.77],C.gilt);
    box(steel,[x-.64,9.12,-23.83],[x+.64,9.75,-23.62],C.blackSteel);
    box(lights,[x-.18,9.63,-23.85],[x+.18,9.83,-23.62],[1,.11,.05]);
    // Red Imperial field banner, folded to catch sunlight.
    const edge=side*12.7;
    for(let i=0;i<8;i++){
      const dx=i*.40,xc=edge-1.5+dx;
      const b=side<0?-23.33:-23.34;
      quad(cloth,[[xc,7.4,b+.09*Math.sin(i*1.3)],
        [xc+.39,7.4,b+.09*Math.sin((i+1)*1.3)],
        [xc+.39,3.1-.15*(i%3),b+.16],
        [xc,3.1-.15*((i+1)%3),b+.16]],
        i%2?[.32,.052,.045]:[.40,.082,.054],[0,0,-1]);
    }
    box(steel,[edge-1.69,7.4,-23.53],[edge+1.69,7.55,-23.18],C.blackSteel);
    for(const spread of [-1,1]){
      // Raised cloth insignia, stylized and legible from the canyon.
      quad(gold,[[edge,5.85,-23.52],[edge+spread*.50,6.29,-23.52],
        [edge+spread*1.13,6.47,-23.52],[edge+spread*.21,5.35,-23.52]],
        C.bright,[0,0,-1]);
    }
  }
  // Catwalk lintel across the opening is entirely ABOVE the door rise;
  // opening animation is handled by the existing door engine.
  box(steel,[-3.14,8.65,-23.3],[3.14,9.14,-18.92],C.blackSteel);
  box(bronze,[-3.14,9.14,-23.35],[3.14,9.29,-19.01],C.gilt);
  for(let x=-2.8;x<3;x+=.74){
    box(steel,[x,8.54,-23.51],[x+.17,9.28,-23.34],C.steel);
  }
  // Angled gate housing and warning light band are fixed to the frame,
  // not painted as a texture floating in front of the movable door.
  box(bronze,[-3,5.08,-23.57],[3,5.20,-23.41],C.gilt);
  for(const x of [-2.86,-1.94,1.94,2.86])
    box(steel,[x-.065,.20,-23.58],[x+.065,4.83,-23.47],C.steel);
  // Keep metal close to existing perimeter geometry, NOT a second collision.
  for(const x of [-30,-24,-18,-12,12,18,24,30]){
    box(steel,[x-.35,.22,-22.31],[x+.35,7.65,-22.19],C.blackSteel);
    box(bronze,[x-.46,7.38,-22.40],[x+.46,7.64,-22.15],C.gilt);
    for(const y of [1.2,3.7,6.1])
      box(gold,[x-.24,y,-22.43],[x+.24,y+.06,-22.35],C.bright);
  }
  box(steel,[-33.8,7.22,-22.49],[33.8,7.72,-20.05],C.blackSteel);
}
function puddle(mesh,cx,cz,rx,rz,y,seed){
  // Filled irregular shoreline, not a 2D circle pasted on the ground;
  // renderer supplies moving view-dependent highlights.
  const rim=[];
  for(let i=0;i<=32;i++){
    const a=i*Math.PI*2/32;
    const r=.82+.10*Math.sin(i*1.19+seed)+.08*Math.cos(i*2.13+seed);
    rim.push([cx+rx*Math.cos(a)*r,y,cz+rz*Math.sin(a)*r]);
  }
  for(let i=0;i<32;i++)
    triangle(mesh,[[cx,y,cz],rim[i+1],rim[i]],
      [.20,.255,.28],[0,1,0]);
}
function cascadeChannel(rock,wet,foam,spray,x,z,start,width,phase) {
  // The water's path is attached to deliberately modeled rock shelves:
  // continuous inlet above -> stepped rock contact -> splash -> puddle below.
  const steps=36,rockPoint=(t,side)=>{
    const zz=z+7.3*t+.19*Math.sin(t*11+phase),
      xx=x+.35*Math.sin(t*5+phase)+side*width*.54;
    const yy=start*Math.pow(1-t,.92);
    return [xx,yy,zz];
  };
  for(let i=0;i<steps;i++){
    const a=i/steps,b=(i+1)/steps;
    const centerA=rockPoint(a,0),centerB=rockPoint(b,0);
    const leftA=rockPoint(a,-1),rightA=rockPoint(a,1);
    const leftB=rockPoint(b,-1),rightB=rockPoint(b,1);
    // Slightly flatter stone steps follow the exact same piecewise course.
    for(const p of [leftA,rightA,leftB,rightB])p[1]-=.12;
    quad(rock,[leftA,rightA,rightB,leftB],C.dark,[-1,.2,0]);
    // Water's upper surface floats centimeters over rocky ledges.
    for(const p of [leftA,rightA,leftB,rightB])p[1]+=.18;
    quad(wet,[leftA,rightA,rightB,leftB],
      [.25,.57+.1*Math.sin(i*.47+phase),.69],[-.70,.25,0]);
    if(i%9===0){
      const at=rockPoint(b,0);
      // Actual rock interruption creates visible whitewater.
      box(rock,[at[0]-.30,at[1]-.12,at[2]-.27],
        [at[0]+.25,at[1]+.28,at[2]+.30],C.warmRock);
      quad(foam,[[at[0]-.55,at[1]+.36,at[2]-.1],
        [at[0]+.55,at[1]+.36,at[2]-.1],
        [at[0]+.59,at[1]-.32,at[2]+.40],
        [at[0]-.59,at[1]-.32,at[2]+.40]],C.foam,[-.65,.7,0]);
      for(let j=0;j<7;j++){
        const off=(j-3)*width/7,drip=at[0]+off;
        quad(spray,[[drip,at[1]+.04,at[2]],
          [drip+.08,at[1]+.04,at[2]],
          [drip+.23,at[1]+.45+Math.sin(j+phase)*.2,at[2]+.24],
          [drip+.11,at[1]+.34,at[2]+.24]],C.foam,[-1,.5,0]);
      }
    }
    void centerA;void centerB;
  }
  const bottom=rockPoint(1,0);
  puddle(foam,bottom[0],bottom[2],width*1.9,1.68,.057,phase);
}
function growth(mesh,rng){
  // Natural placement on cliff terraces. Avoid center path, door,
  // and mission-interaction hit targets by fixing growth to rock edges.
  for(let i=0;i<980;i++){
    const side=i%2===0?-1:1,z=-70+rng()*47;
    const tier=rng(),height=.28+16*tier;
    const x=side*(6.7+1.2*tier+rng()*2.2);
    const w=.12+rng()*.36,h=.25+rng()*.70;
    const p=[x,height,z],tip=[x+side*rng()*.25,height+h,z+.12];
    const color=[.11+rng()*.12,.24+rng()*.18,.045+rng()*.09];
    quad(mesh,[[p[0],p[1],p[2]-w],tip,
      [tip[0],tip[1]-.08,tip[2]+.07],
      [p[0],p[1],p[2]+w]],color,[-side,.25,0]);
  }
}
function extraRocks(mesh,rng) {
  // Individual fractured talus blocks outside the main walkway.
  for(let i=0;i<165;i++){
    const side=i%2===0?-1:1,z=-72+rng()*50;
    const x=side*(6.6+rng()*5.8),r=.2+rng()*.75,y=r*.33;
    const c=C.warmRock.map(v=>v*(.75+rng()*.28));
    box(mesh,[x-r,0,z-r*.77],[x+r,y*2.6,z+r*.78],c);
  }
}
export function buildKejimEntranceRemaster(){
  const rand=mulberry32(2026102401),cliff=meshBuilder(),talus=meshBuilder(),
    wetFloor=meshBuilder(),gateStone=meshBuilder(),gateSteel=meshBuilder(),
    gateBronze=meshBuilder(),gateGold=meshBuilder(),banners=meshBuilder(),
    water=meshBuilder(),whitewater=meshBuilder(),spray=meshBuilder(),
    moss=meshBuilder(),light=meshBuilder(),wetLedges=meshBuilder();
  for(const side of [-1,1]){
    cliffFace(cliff,side,rand,-72,-22,25);
  }
  extraRocks(talus,rand);
  gate(gateStone,gateSteel,gateBronze,gateGold,banners,light);
  // Three staggered rock-fed falls; tiny sky pools sit on shelves so no
  // stream materializes from a blank rock face.
  for(const f of KEJIM_ENTRANCE.falls)
    cascadeChannel(wetLedges,water,whitewater,spray,-6.75,f.z,f.start,f.width,f.phase);
  for(const [x,z,rx,rz] of [
    [2.0,-46.5,2.1,3.1],[-.8,-36.9,2.35,2.1],
    [1.6,-31.8,2.2,4.3],[0,-26.1,2.0,2.5],
    [-4.4,-32.6,1.1,2.4],[4.7,-39.8,1.0,1.7],
    [-1.8,-53,1.5,1.4],
  ])puddle(wetFloor,x,z,rx,rz,.034,rand()*8);
  growth(moss,rand);
  return Object.fromEntries(Object.entries({
    cliff,talus,wetFloor,gateStone,gateSteel,gateBronze,gateGold,
    banners,water,whitewater,spray,moss,light,wetLedges,
  }).map(([key,m])=>[key,m.build()]));
}
