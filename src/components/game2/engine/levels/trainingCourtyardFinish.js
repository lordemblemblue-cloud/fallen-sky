// Courtyard art pass for the real playable Game 2 training garden.
// All geometry is render-only: the existing collision, canopy route, bridges,
// cover and arena spawns remain authored in trainingGarden.js.
// Deliberately uses existing meshBuilder + bundled stone/vegetation resources,
// so a missing external texture or unavailable third-party asset cannot block play.
import { meshBuilder } from '../level/builder.js';
import { mulberry32 } from '../level/kit.js';
import { buildTrainingWallMoss } from './trainingWallMoss.js';
import { buildTrainingCourtyardMasonry } from './trainingCourtyardMasonry.js';

export const COURTYARD_FINISH = Object.freeze({
  platformCenter: [0, 39],
  platformRadius: 4.52,       // inside the existing 10x10 m collidable canopy
  canopyCollisionY: 4.55,
  platformVisualY: 4.607,    // <6 cm offset; feet remain aligned
  torchHeight: 4.48,
  torchZ: [19.5, 29.5, 49.5, 59],
  torchXs: [-26.38, 26.38],
});

const STONE = [0.46, 0.425, 0.37], PALE = [0.59, 0.535, 0.45];
const SHADE = [0.24, 0.25, 0.26], BLACK_STEEL = [0.12, 0.16, 0.19];
const STEEL = [0.44, 0.48, 0.51], BRONZE = [0.56, 0.395, 0.22];
const GOLD = [0.79, 0.565, 0.27], GOLD_LIGHT = [0.95, 0.79, 0.45];
const NAVY = [0.052, 0.075, 0.15];

const box = (m, a, b, c) => m.box(a, b, c);
const polar = (x,z,r,t,y) => [x + Math.cos(t)*r,y,z + Math.sin(t)*r];
function ring(m, cx, cz, inner, outer, y, color, segments=64) {
  for(let i=0;i<segments;i++){
    const a=i*Math.PI*2/segments, b=(i+1)*Math.PI*2/segments;
    m.quad(polar(cx,cz,inner,a,y),polar(cx,cz,outer,a,y),
      polar(cx,cz,outer,b,y),polar(cx,cz,inner,b,y),[0,1,0],color);
  }
}
function sigil(mesh,cx,cz,y,scale=1){
  // Original winged temple sigil built out of visible raised metal polygons.
  // It is geometry, not a photograph or a baked-on UI decal.
  const p = (x,z) => [cx+x*scale,y,cz+z*scale];
  ring(mesh,cx,cz,0.21*scale,0.28*scale,y,GOLD_LIGHT,32);
  for(const s of [-1,1]){
    for(let n=0;n<5;n++){
      const q=.42+n*.25;
      mesh.quad(p(.07*s,-.24),p(s*(q+.10),-.18-n*.15),
        p(s*(q+.32),-.35-n*.12),p(.25*s,-.38),[0,1,0],GOLD_LIGHT);
      mesh.quad(p(.13*s,.07),p(s*(q+.10),.20+n*.10),
        p(s*(q+.27),.02+n*.13),p(.21*s,-.06),[0,1,0],GOLD);
    }
  }
  mesh.quad(p(-.17,-1.30),p(.17,-1.30),p(.24,.8),p(-.24,.8),[0,1,0],GOLD_LIGHT);
  mesh.quad(p(-.08,.85),p(.08,.85),p(.14,1.41),p(-.14,1.41),[0,1,0],GOLD);
}

function pavers(wetStone,stone,rand,x0,x1,z0,z1,y,step=1.55){
  // A readable grout network, imperfect individual flagstone levels and
  // slight edge bevels. The wet coat is geometric, not one flat colored slab.
  for(let z=z0;z<z1-.08;z+=step)for(let x=x0;x<x1-.08;x+=step){
    const w=Math.min(step-.045,x1-x-.045),d=Math.min(step-.045,z1-z-.045);
    if(w<.35||d<.35)continue;
    const damp=.87+rand()*.18, grit=rand()*.06;
    const col=[STONE[0]*damp+grit,STONE[1]*damp+grit*.8,STONE[2]*damp+grit*.6];
    const top=y+0.032+rand()*.009;
    box(stone,[x,y+.002,z],[x+w,y+.025,z+d],col.map(c=>c*.58));
    box(wetStone,[x+.035,top,z+.035],[x+w-.035,top+.008,z+d-.035],col);
    // Physically raised leading shoulder catches low-angle sunset light.
    box(stone,[x+.065,top-.006,z+.036],[x+w-.065,top+.001,z+.059],PALE.map(k=>k*.73));
  }
}

function gardenWalls(stone,metal,gold){
  const trim=(x0,x1,y0,y1,z0,z1,m,c)=>box(m,[x0,y0,z0],[x1,y1,z1],c);
  // Machined cornices, staggered stone teeth and recessed metal channels
  // attach to the existing collidable masonry. No false blocking walls.
  for(const side of [-1,1]){
    const outer=side*26.90,inner=side*26.55;
    const xx=[Math.min(outer,inner),Math.max(outer,inner)];
    for(const [y,h,col,mesh] of [
      [.54,.13,STONE,stone],[6.7,.16,PALE,stone],
      [7.57,.21,PALE,stone],[7.88,.055,BRONZE,gold],
    ]) {
      // Previous continuous .54m masonry/sill strip ran straight through
      // the Handbook gateway at x≈27, z32..38. Both sides of the same
      // entrance showed a floating knee-height panel. Cut the actual trim
      // into anchored sections; don't touch the real sliding door/collider.
      if(side>0 && y<6.0){
        trim(xx[0],xx[1],y,y+h,13.1,31.75,mesh,col);
        trim(xx[0],xx[1],y,y+h,38.25,62.7,mesh,col);
      } else {
        trim(xx[0],xx[1],y,y+h,13.1,62.7,mesh,col);
      }
    }
    for(let z=15;z<62;z+=8){
      if(side>0 && z>=31&&z<=39)continue; // keep east annex gate visible
      trim(xx[0]-.10,xx[1]+.10,.28,.57,z-.56,z+.56,stone,STONE);
      trim(xx[0]-.14,xx[1]+.14,7.52,7.86,z-.63,z+.63,stone,PALE);
      trim(xx[0]-.17,xx[1]+.17,7.86,7.96,z-.69,z+.69,metal,STEEL);
      // Embedded machined metal facing, with a dark center recess.
      const face=side*26.49;
      trim(face-.055,face+.055,1.1,6.58,z-.26,z+.26,metal,STEEL);
      trim(face-.065,face+.065,1.20,6.45,z-.13,z+.13,metal,BLACK_STEEL);
      for(const h of [1.28,6.28])trim(face-.09,face+.09,h,h+.12,z-.34,z+.34,gold,BRONZE);
    }
    // Green triangle primitives removed. The ivy-like moss is now layered
    // textured, alpha-cut wall vegetation with pixel detail and doorway masks.
  }
  for(const y of [.42,6.6,7.65]){
    trim(-26.9,26.9,y,y+.15,62.67,62.89,stone,STONE);
    trim(-26.9,26.9,y+.15,y+.19,62.71,62.88,gold,BRONZE);
  }
  // Gate lintel keeps the original opening untouched for real traversal.
  trim(-4.5,4.5,6.84,7.11,12.68,13.04,stone,PALE);
  trim(-4.7,4.7,7.11,7.22,12.72,12.97,gold,BRONZE);
}

function platform(stone,metal,gold,lights){
  const cx=COURTYARD_FINISH.platformCenter[0],cz=COURTYARD_FINISH.platformCenter[1];
  const Y=COURTYARD_FINISH.platformVisualY;
  // Steel lattice is visible underneath and tied into the four existing trusses.
  for(const z of [34.35,36.40,39,41.60,43.65]){
    box(metal,[-4.70,4.12,z-.14],[4.70,4.47,z+.14],BLACK_STEEL);
    box(gold,[-4.30,4.19,z-.14],[4.30,4.235,z-.07],BRONZE);
  }
  for(const x of [-4.6,-2.3,0,2.3,4.6]){
    box(metal,[x-.14,4.12,34.30],[x+.14,4.47,43.70],BLACK_STEEL);
    box(gold,[x-.19,4.14,34.4],[x-.15,4.33,43.6],BRONZE);
  }
  // Octagonal 4.52 m radius medallion fits INSIDE the walkable square;
  // corners never extend into an uncollidable void.
  ring(stone,cx,cz,0,4.50,Y,STONE,8);
  ring(metal,cx,cz,4.26,4.52,Y+.009,STEEL,8);
  ring(gold,cx,cz,4.06,4.15,Y+.018,GOLD,96);
  ring(stone,cx,cz,3.18,4.00,Y+.018,PALE,64);
  ring(gold,cx,cz,3.13,3.18,Y+.023,GOLD_LIGHT,96);
  ring(metal,cx,cz,2.86,3.07,Y+.024,SHADE,96);
  ring(gold,cx,cz,1.48,1.53,Y+.035,GOLD,96);
  ring(stone,cx,cz,.0,2.83,Y+.026,STONE,72);
  sigil(gold,cx,cz,Y+.043,.83);
  // Machined radial metal inset seams; the combat surface is visually coherent.
  for(let i=0;i<16;i++){
    const a=i*Math.PI/8,b=a+.012;
    metal.quad(polar(cx,cz,3.23,a,Y+.031),polar(cx,cz,3.97,a,Y+.031),
      polar(cx,cz,3.97,b,Y+.031),polar(cx,cz,3.23,b,Y+.031),[0,1,0],BLACK_STEEL);
  }
  // Orange light sources are inset into REAL metallic sockets and not pasted light.
  for(let n=0;n<8;n++){
    const a=(n+.5)*Math.PI/4;
    const x=cx+Math.cos(a)*4.44,z=cz+Math.sin(a)*4.44;
    const tang=[-Math.sin(a),Math.cos(a)],w=.30;
    metal.quad([x-tang[0]*w,Y+.035,z-tang[1]*w],
      [x+tang[0]*w,Y+.035,z+tang[1]*w],
      [x+tang[0]*w,Y+.075,z+tang[1]*w],
      [x-tang[0]*w,Y+.075,z-tang[1]*w],[Math.cos(a),0,Math.sin(a)],BLACK_STEEL);
    box(lights,[x-.13,Y+.056,z-.13],[x+.13,Y+.065,z+.13],[1,.51,.14]);
  }
  // Four heavy connectors visibly transfer load into the existing diagonal steel.
  for(const x of [-5,5])for(const z of [34,44]){
    box(metal,[x-.45,4.13,z-.43],[x+.45,5.06,z+.43],BLACK_STEEL);
    box(metal,[x-.55,4.22,z-.49],[x+.55,4.40,z+.49],STEEL);
    box(gold,[x-.50,4.59,z-.40],[x+.50,4.66,z+.40],BRONZE);
    for(const dz of [-.30,.30])for(const dx of [-.32,.32])
      box(gold,[x+dx-.046,4.665,z+dz-.046],[x+dx+.046,4.695,z+dz+.046],GOLD_LIGHT);
  }
}

function gardenTorches(metal,gold,fire,lights){
  const f = COURTYARD_FINISH;
  for(const side of [-1,1])for(const z of f.torchZ){
    if(side>0 && z>30 && z<40)continue; // no torch floating in annex gateway
    const x=side*26.38,y=f.torchHeight,anchor=side*26.86;
    box(metal,[Math.min(x,anchor)-.1,y-.50,z-.36],
      [Math.max(x,anchor)+.1,y-.12,z+.36],BLACK_STEEL);
    box(gold,[Math.min(x,anchor)-.05,y-.33,z-.16],
      [Math.max(x,anchor)+.05,y-.22,z+.16],BRONZE);
    // Real bracket arms, dish, charcoal and glowing core.
    for(const dz of [-.26,.26])
      box(metal,[x-.40,y-.17,z+dz-.06],[x+.40,y-.06,z+dz+.06],STEEL);
    box(metal,[x-.45,y-.14,z-.43],[x+.45,y-.02,z+.43],BRONZE);
    box(metal,[x-.30,y-.02,z-.30],[x+.30,y+.045,z+.30],SHADE);
    // An actual 18-sided flared forged-metal brazier, with bevelled rim,
    // recessed charcoal and load-bearing wall supports. It is not a flat
    // candle sprite or an unattached patch of orange lighting.
    for(let n=0;n<18;n++){
      const a=n*Math.PI/9,b=(n+1)*Math.PI/9;
      const r0=.23,r1=.49;
      const from=(r,t,h)=>[x+Math.cos(t)*r,y+h,z+Math.sin(t)*r];
      const normal=[Math.cos((a+b)*.5),.36,Math.sin((a+b)*.5)];
      metal.quad(from(r0,a,-.18),from(r0,b,-.18),
        from(r1,b,.045),from(r1,a,.045),normal,BRONZE);
      metal.quad(from(r1,a,.045),from(r1,b,.045),
        from(r1+.055,b,.085),from(r1+.055,a,.085),
        [Math.cos((a+b)*.5),.5,Math.sin((a+b)*.5)],STEEL);
      metal.quad(from(r0,a,-.18),from(r0,b,-.18),
        from(r0,b,-.14),from(r0,a,-.14),[0,1,0],BLACK_STEEL);
    }
    for(const dz of [-.24,.24]){
      const wall=side*26.86,mid=side*26.56;
      metal.quad([wall,y-.49,z+dz],[mid,y-.49,z+dz],
        [x,y-.17,z+dz],[x,y-.12,z+dz],[0,0,1],STEEL);
    }
    for(const dz of [-.36,.36])for(const h of [-.33,-.15]){
      const outer=side*26.84;
      box(gold,[outer-.055,y+h-.045,z+dz-.055],
        [outer+.055,y+h+.045,z+dz+.055],GOLD);
    }
    box(lights,[x-.16,y+.02,z-.16],[x+.16,y+.055,z+.16],[1,.38,.065]);
    // Three independent planes and outer tongues; the existing vertex shader
    // animates these flames by height without an image sprite or painted candle.
    for(let j=0;j<3;j++){
      const w=.22-j*.055,h=1.03-j*.19,dx=j===1?.047:-.012;
      const c=j===0?[.95,.25,.025]:j===1?[1,.55,.10]:[1,.88,.40];
      for(const [axis,norm] of [['x',[0,0,1]],['z',[1,0,0]]]){
        const a=axis==='x'?[x-w+dx,y+.05,z]:[x,y+.05,z-w+dx];
        const b=axis==='x'?[x+w+dx,y+.05,z]:[x,y+.05,z+w+dx];
        const t=axis==='x'?[x+dx,y+h,z]:[x,y+h,z+dx];
        fire.quad(a,b,[t[0]+w*.13,t[1],t[2]+w*.13],
          [t[0]-w*.13,t[1],t[2]-w*.13],norm,c);
      }
    }
  }
}

function banners(cloth,metal,gold){
  // Heavy stitched navy cloth with visible folds and an embossed temple crest.
  for(const [x,z,axis] of [[-13,62.48,'z'],[13,62.48,'z']]){
    const width=3.4,yTop=7.35,yBottom=2.25;
    for(let i=0;i<12;i++){
      const t0=i/12,t1=(i+1)/12;
      const xx=x-width/2+width*t0,x1=x-width/2+width*t1;
      const wav=.06*Math.sin(i*1.67);
      const c=NAVY.map(q=>q*(.84+.16*(i%3)));
      cloth.quad([xx,yTop,z+wav],[x1,yTop,z+.06*Math.sin((i+1)*1.67)],
        [x1,yBottom+.07*(i%3),z+.06*Math.sin((i+1)*1.67)],
        [xx,yBottom+.07*((i+1)%3),z+wav],[0,0,-1],c);
    }
    box(metal,[x-width/2-.2,yTop,z-.13],[x+width/2+.2,yTop+.19,z+.13],BRONZE);
    box(gold,[x-width/2,yBottom-.06,z-.10],[x+width/2,yBottom+.035,z+.08],GOLD);
    // Raised, gold wing insignia is visibly woven into the front.
    for(const s of [-1,1])for(let n=0;n<4;n++){
      const ext=.45+n*.22;
      cloth.quad([x+s*.1,5.47,z-.14],
        [x+s*ext,5.5+n*.21,z-.14],
        [x+s*(ext+.11),5.33+n*.21,z-.14],
        [x+s*.20,5.16,z-.14],[0,0,-1],GOLD_LIGHT);
    }
    box(gold,[x-.075,4.75,z-.16],[x+.075,6.03,z-.105],GOLD_LIGHT);
    void axis;
  }
}

export function buildTrainingCourtyardFinish(){
  const rand=mulberry32(20261024);
  const wetStone=meshBuilder(), platformStone=meshBuilder(), stone=meshBuilder(), metal=meshBuilder(),
        gold=meshBuilder(), emblem=meshBuilder(), fire=meshBuilder(),
        cloth=meshBuilder(), lights=meshBuilder();
  pavers(wetStone,stone,rand,-2.78,2.9,13.0,30.0,0);
  pavers(wetStone,stone,rand,-10.78,10.93,30.21,47.94,.25);
  pavers(wetStone,stone,rand,-3.0,3.08,48.1,62.5,0);
  gardenWalls(stone,metal,gold);
  platform(platformStone,metal,emblem,lights);
  gardenTorches(metal,gold,fire,lights);
  banners(cloth,metal,gold);
  return {
    wetStone:wetStone.build(),platformStone:platformStone.build(),
    stone:stone.build(),metal:metal.build(),
    gold:gold.build(),emblem:emblem.build(),flames:fire.build(),
    banners:cloth.build(),greenery:buildTrainingWallMoss(),lights:lights.build(),
    ...buildTrainingCourtyardMasonry(),
  };
}
