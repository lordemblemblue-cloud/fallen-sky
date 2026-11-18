// Render-only architectural and water-side finish for the *large* training
// abyss arena at (140,37), not the courtyard canopy at (0,39).
// Never use these meshes for collision or spawn selection: the authored
// radial arena, bridge, towers, galleries, water death and nav stay canonical.
import { meshBuilder } from '../level/builder.js';
import { mulberry32 } from '../level/kit.js';
import { TRAINING_ABYSS } from './trainingGarden.js';
import { buildAbyssMountainBackdrop } from './trainingAbyssMountains.js';
import { buildAbyssMountainFalls } from './trainingAbyssFalls.js';

export const ABYSS_FINISH = Object.freeze({
  cx: TRAINING_ABYSS.cx, cz: TRAINING_ABYSS.cz,
  radius: TRAINING_ABYSS.radius, waterY: TRAINING_ABYSS.waterY,
  bridge: Object.freeze({ x0:49.4,x1:89.4,z:37,width:5.2 }),
  torchAngles: Object.freeze([0,Math.PI/4,Math.PI/2,3*Math.PI/4,Math.PI,
    5*Math.PI/4,3*Math.PI/2,7*Math.PI/4]),
});
const C={
  stone:[.49,.46,.40], light:[.68,.60,.50], grout:[.17,.20,.22],
  metal:[.35,.42,.45], dark:[.105,.14,.19], bronze:[.54,.34,.19],
  gold:[.84,.64,.32], gilt:[.96,.83,.53],
  navy:[.115,.075,.076], leaf:[.13,.25,.12],
};
const V=(x,z,r,a,y)=>[x+Math.cos(a)*r,y,z+Math.sin(a)*r];
const box=(m,lo,hi,c)=>m.box(lo,hi,c);
function ring(m,x,z,r0,r1,y,color,segs=144){
  for(let i=0;i<segs;i++){
    const a=i*Math.PI*2/segs,b=(i+1)*Math.PI*2/segs;
    m.quad(V(x,z,r0,a,y),V(x,z,r1,a,y),V(x,z,r1,b,y),
      V(x,z,r0,b,y),[0,1,0],color);
  }
}
function spoke(m,x,z,a,r0,r1,w,y,c){
  const p=(r,side)=>V(x,z,r,a+side*w/(2*Math.max(1,r)),y);
  m.quad(p(r0,-1),p(r1,-1),p(r1,1),p(r0,1),[0,1,0],c);
}
function banner(mesh,mount,x,z,normal,red=true){
  const nx=normal[0],nz=normal[2],t=[-nz,nx],Y=10.4;
  // Folds are modeled ribbon segments, not flat diffuse quad decals.
  for(let i=0;i<9;i++){
    const a=(i/9-.5)*2.8,b=((i+1)/9-.5)*2.8;
    const wave=(j)=>.12*Math.cos(j*Math.PI*2.3/9);
    const pt=(offset,y,fold)=>[x+t[0]*offset+nx*fold,y,z+t[1]*offset+nz*fold];
    const co=red?(i%2?[.19,.055,.07]:[.30,.078,.073]):
      (i%2?[.055,.095,.18]:[.075,.12,.23]);
    mesh.quad(pt(a,Y,wave(i)),pt(b,Y,wave(i+1)),
      pt(b,Y-5.0-.18*(i%3),wave(i+1)+.15),
      pt(a,Y-5.0-.18*((i+1)%3),wave(i)+.15),normal,co);
  }
  box(mount,[x-.18,Y-.06,z-1.6],[x+.18,Y+.12,z+1.6],C.bronze);
  // Geometric stitched wing insignia, always facing the arena.
  for(const s of [-1,1])for(let j=0;j<4;j++){
    const v=.34+j*.23;
    const pt=(offset,height)=>[x+t[0]*offset+nx*.24,height,
      z+t[1]*offset+nz*.24];
    mesh.triangle(pt(s*.09,Y-1.9),pt(s*(v+.22),Y-1.6-j*.35),
      pt(s*(v+.1),Y-2.18-j*.31),normal,C.gilt);
  }
}
function centralCompass(m,x,z,y){
  ring(m,x,z,7.35,7.48,y,C.gold,128);
  ring(m,x,z,6.60,6.72,y,C.grout,128);
  ring(m,x,z,2.34,2.47,y,C.gilt,96);
  for(let i=0;i<8;i++){
    const a=i*Math.PI/4;
    const p=(r,t)=>V(x,z,r,t,y+.012);
    m.triangle(p(1.25,a-.28),p(6.13,a),p(1.25,a+.28),[0,1,0],
      i%2===0?C.gilt:C.gold);
  }
  ring(m,x,z,.32,.41,y+.02,C.gold,48);
}
function platform(pavers,metal,gold,detail,rand){
  const {cx:x,cz:z,radius:r}=ABYSS_FINISH;
  // Approximately 2500 individually cut, radial stone courses with dark
  // grout and slightly differing wear, rather than flat concentric paint.
  const bands=24;
  for(let j=0;j<bands;j++){
    const r0=.42+j*(r-.78)/bands,r1=.42+(j+1)*(r-.78)/bands;
    const mid=(r0+r1)*.5,segs=Math.max(16,Math.min(144,Math.round(mid*2*Math.PI/2.7)));
    for(let i=0;i<segs;i++){
      const a=i*2*Math.PI/segs,b=(i+1)*2*Math.PI/segs;
      const pad=Math.min(.018,.16/(mid+1));
      const variation=.90+rand()*.19;
      const stained=rand()<.20?.84:1.0;
      const co=C.stone.map((v,k)=>v*variation*stained*(1-(k===2?0.035:0)));
      const y=.051+(rand()-.5)*.009; // underlying authored walkable top is 0
      pavers.quad(V(x,z,r0+.07,a+pad,y),
        V(x,z,r1-.07,a+pad,y),
        V(x,z,r1-.07,b-pad,y),
        V(x,z,r0+.07,b-pad,y),[0,1,0],co);
      // A separately modeled grout seam against real uneven stone.
      if(i%5===0){
        detail.quad(V(x,z,r0+.07,a,y+.001),V(x,z,r1-.07,a,y+.001),
          V(x,z,r1-.07,a+.003,y+.001),V(x,z,r0+.07,a+.003,y+.001),
          [0,1,0],C.grout);
      }
    }
  }
  for(const [ri,ro] of [[.0,.42],[7.62,7.76],[18.8,18.98],[32.3,32.47],
    [41.2,41.37],[50.9,51.17]]){
    ring(ri<1?detail:metal,x,z,ri,ro,.076,C.dark,144);
    if(ri>1)ring(gold,x,z,ri+.04,ri+.075,.087,C.gold,144);
  }
  for(let n=0;n<24;n++)spoke(metal,x,z,n*Math.PI/12,8.1,50.8,.105,.080,C.dark);
  centralCompass(gold,x,z,.10);
  // Heavy tiered outer lip with actual side geometry and 3D fastening heads.
  ring(metal,x,z,51.29,52.0,.085,C.metal,160);
  ring(gold,x,z,51.46,51.57,.098,C.gold,160);
  for(let i=0;i<80;i++){
    const a=i*2*Math.PI/80, xx=x+Math.cos(a)*51.84,zz=z+Math.sin(a)*51.84;
    box(metal,[xx-.16,-.46,zz-.16],[xx+.16,.10,zz+.16],C.dark);
    box(gold,[xx-.077,.10,zz-.077],[xx+.077,.145,zz+.077],C.gilt);
  }
}
function bridge(stone,metal,gold){
  const b=ABYSS_FINISH.bridge;
  // Original authored walkway width and position unchanged. All extras
  // are shallow raised visual courses and exterior rails only.
  for(let x=b.x0+.15;x<b.x1-.1;x+=2.25){
    const end=Math.min(b.x1-.12,x+2.13),shade=.89+.09*Math.sin(x*.91);
    box(stone,[x,.027,b.z-2.38],[end,.050,b.z+2.38],C.stone.map(k=>k*shade));
    for(const z of [b.z-2.31,b.z+2.31])
      box(gold,[x,.053,z-.045],[end,.061,z+.045],C.gold);
  }
  for(const side of [-1,1]){
    const z=b.z+side*2.72;
    box(metal,[b.x0,-.65,z-.19],[b.x1,.14,z+.19],C.dark);
    box(gold,[b.x0,.10,z-.22],[b.x1,.19,z+.22],C.bronze);
    // Modular slim outer guard with openings between columns.
    for(let x=52;x<=87;x+=5){
      box(metal,[x,-.55,z-.24],[x+.36,1.05,z+.24],C.metal);
      box(gold,[x-.10,.98,z-.30],[x+.46,1.12,z+.30],C.bronze);
      if(x<=82){
        box(metal,[x+.34,.62,z-.085],[x+5.1,.74,z+.085],C.dark);
      }
    }
  }
}
function fireAt(steel,gold,flames,emissive,x,z,y=3.90,angle=0){
  // Wall/cylinder fixture, glowing embers and a real tapered forged bowl.
  box(steel,[x-.28,y-1.5,z-.28],[x+.28,y,z+.28],C.dark);
  for(let i=0;i<16;i++){
    const a=i*Math.PI/8,b=(i+1)*Math.PI/8;
    const pp=(r,t,h)=>V(x,z,r,t,y+h);
    steel.quad(pp(.29,a,-.28),pp(.29,b,-.28),
      pp(.52,b,.12),pp(.52,a,.12),
      [Math.cos((a+b)/2),.36,Math.sin((a+b)/2)],C.bronze);
  }
  ring(gold,x,z,.46,.56,y+.13,C.gold,32);
  ring(emissive,x,z,.02,.24,y+.05,[1,.38,.07],24);
  // Existing shader's torch animation is anchored at y=4.45.
  const base=4.47;
  for(const [s,c] of [[.43,[1,.22,.02]],[.29,[1,.53,.075]],[.15,[1,.87,.36]]]){
    const h=s===.43?1.13:s===.29?.94:.71;
    const vx=Math.cos(angle),vz=Math.sin(angle),perp=[-vz,vx];
    for(const vec of [[vx,vz],perp]){
      const p=(side,yy,k)=>[x+vec[0]*side*k,yy,z+vec[1]*side*k];
      flames.quad(p(-1,base,s),p(1,base,s),
        p(.18,base+h,s*.25),p(-.16,base+h,s*.25),
        [perp[0],0,perp[1]],c);
    }
  }
}
function architecture(stone,steel,gold,cloth,flame,glow,greenery,rand){
  const {cx:x,cz:z,radius}=ABYSS_FINISH;
  // 8 edge lamp stations, *outside* the walkable disc, so they don't make
  // invisible obstacles or impair PvP dodges and movement.
  for(let i=0;i<8;i++){
    const a=ABYSS_FINISH.torchAngles[i],r=radius+1.10;
    const xx=x+Math.cos(a)*r,zz=z+Math.sin(a)*r;
    box(stone,[xx-1.12,-1.25,zz-1.12],[xx+1.12,.33,zz+1.12],C.stone);
    box(steel,[xx-.72,.28,zz-.72],[xx+.72,.43,zz+.72],C.metal);
    fireAt(steel,gold,flame,glow,xx,zz);
    // Hanging ivy and roots below the outer shelf, wind-free decals.
    for(let n=0;n<14;n++){
      const ang=a+(.16*(rand()-.5)), rr=52.2+rand()*.25;
      const q=[x+Math.cos(ang)*rr,z+Math.sin(ang)*rr];
      const y1=-.6-rand()*.5,y2=y1-1.6-rand()*5.3;
      const leafColor=C.leaf.map(v=>v*(.69+rand()*.65));
      greenery.quad([q[0],y1,q[1]],[q[0]+.22,y1+.2,q[1]+.11],
        [q[0]+.35,y2,q[1]+.25],[q[0]-.09,y2,q[1]],
        [Math.cos(a),0,Math.sin(a)],leafColor);
    }
  }
  // Four pre-existing gallery pillars now have raised masonry shafts,
  // metal clamps, fitted sconce mounts, relief and draped cloth.
  for(const a of [-3*Math.PI/4,-Math.PI/4,Math.PI/4,3*Math.PI/4]){
    const xx=x+Math.cos(a)*69,zz=z+Math.sin(a)*69;
    for(let h=-10;h<13;h+=1.9){
      const radius=2.65;
      ring(stone,xx,zz,radius,radius+.21,h,C.stone,32);
      ring(steel,xx,zz,radius+.21,radius+.35,h+.08,C.dark,32);
    }
    for(const h of [1.2,5.4,10.85]){
      box(steel,[xx-3.06,h-.10,zz-3.06],
        [xx+3.06,h+.14,zz+3.06],C.metal);
      box(gold,[xx-3.12,h+.06,zz-3.12],
        [xx+3.12,h+.11,zz+3.12],C.bronze);
    }
    // Aim banner forward toward the approaching player at lower X.
    banner(cloth,gold,xx-3.15,zz,[1,0,0],true);
    fireAt(steel,gold,flame,glow,xx-2.62,zz,3.90,a);
  }
  // Landing pylons and actual torch lamps along both sides of the bridge.
  for(const x0 of [56.0,68.0,80.0,86.5]) for(const dir of [-1,1]){
    fireAt(steel,gold,flame,glow,x0,37+dir*3.4,3.90);
  }
  // Gilded inset panels on existing bridge support shafts above water.
  for(const x0 of [59,73,86]){
    for(const y of [-9,-6,-3]){
      box(steel,[x0-.92,y,36.0],[x0+.92,y+.27,38.0],C.metal);
      box(gold,[x0-.94,y+.09,35.98],[x0+.94,y+.15,38.02],C.bronze);
    }
  }
}
// Stage-one mountainous ring now lives in trainingAbyssMountains.js.
// The former rectangular cliff stacks and cyan flat waterfall planes are
// intentionally removed: they were visibly breaking the circular-arena view.
// New canyon waterfall detail belongs to the later material/terrain pass.
export function buildTrainingAbyssFinish(quality='medium'){
  const rand=mulberry32(424233);
  const pavers=meshBuilder(),stone=meshBuilder(),metal=meshBuilder(),
    gold=meshBuilder(),engraving=meshBuilder(),cloth=meshBuilder(),
    flame=meshBuilder(),glow=meshBuilder(),greenery=meshBuilder();
  platform(pavers,metal,gold,engraving,rand);
  bridge(pavers,metal,gold);
  architecture(stone,metal,gold,cloth,flame,glow,greenery,rand);
  const authored=Object.fromEntries(Object.entries({
    pavers,stone,metal,gold,engraving,cloth,flame,glow,greenery,
  }).map(([name,m])=>[name,m.build()]));
  return { ...authored, ...buildAbyssMountainBackdrop(quality),
    ...buildAbyssMountainFalls() };
}
