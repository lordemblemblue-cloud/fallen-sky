import { addTrainingHighlands } from './trainingHighlands.js';
// Original offline training environment. The imported arena remains the rollback path.
import { layoutKit, mulberry32 } from '../level/kit.js';
import { meshBuilder } from '../level/builder.js';
import { trainingGroundHeight, trainingPavingDistance } from './trainingGround.js';

// One replacement behind the existing training map ID, including the public online arena.
export function usesTrainingGarden({ mode, mapId = 'training', trainingGarden = true } = {}, search = globalThis.location?.search || '') {
  if (mapId !== 'training' || !['online', 'duel', 'tutorial', 'attract', 'ffa', 'tdm', 'ctf', 'sudden'].includes(mode)) return false;
  // Individual online clients must not select different collision layouts using a local flag.
  if (mode === 'online') return true;
  return trainingGarden !== false && !new URLSearchParams(search).has('g2OriginalTraining');
}

// In-world introductory handbook stations. These use verified Game Two
// controls and traversal mechanics; they do not claim to reproduce an
// external handbook that has not been supplied to this repository.
export const TRAINING_HANDBOOK = Object.freeze([
  {title:'Movement & Traversal', text:'WASD moves · Space jumps. Jump against a tall wall while moving to run alongside it; approach head-on for a brief upward run. Release and tap Space again to kick off. The eastern ridge has a sky-lift: press E while aboard.'},
  {title:'Saber Fundamentals', text:'R draws or holsters the lightsaber. Primary attack strikes; hold B to guard. Release before countering.'},
  {title:'Force Movement', text:'Hold Q and move to evade. Timed defense and Force actions depend on your current energy and animation.'},
  {title:'Situational Awareness', text:'Keep enemies in sight. Use the elevated canopy to practice spotting, approaching and avoiding attacks through cover.'},
]);

export const TRAINING_ABYSS = Object.freeze({
  cx: 140, cz: 37, radius: 52, waterY: -12, killY: -8,
  pillarOffset: 69, pillarRadius: 2.5, galleryOuter: 6.5,
});
// Unlike the distant render-only mountain panorama, these destinations have
// authored COLLISION floors and real connected walking routes.
export const TRAINING_RIDGE = Object.freeze({
  first: Object.freeze({ cx: 226, cz: 9, radius: 17 }),
  summit: Object.freeze({ cx: 264, cz: -9, radius: 19 }),
  entrance: Object.freeze([187, 0, 24]),
  lowerBridge: Object.freeze([226, 0, 9]),
  upperBridge: Object.freeze([264, 0, -9]),
});

export function createTrainingGarden() {
  const k = layoutKit('training_garden', 42819), L = k.L;
  L.navBounds = [-28, -48, 322, 98];
  L.playerSpawn = [0, 0, -9]; L.playerYaw = 0;
  L.duelSpawns = { player: [0, 0, -9], enemy: [0, 0, 3] };
  L.teamHomes = { blue: [-6, 0, -8], red: [6, 0.2, 54] };
  L.teamYaw = { blue: 0, red: Math.PI };
  L.ffaSpawns = [
    [-6, 0, -8], [6, 0, -8], [-6, 0, -2], [6, 0, -2], [-5, 0, 6], [5, 0, 6],
    [-16, 0.2, 18], [16, 0.2, 18], [-17, 0.2, 28], [17, 0.2, 24],
    [-15, 0.2, 38], [15, 0.2, 38], [-15, 0.2, 49], [15, 0.2, 49],
    [-10, 0.2, 55], [0, 0.2, 55], [10, 0.2, 55], [-8, 0.2, 60], [8, 0.2, 60],
    [-6, 0.3, 34], [6, 0.3, 34], [-6, 0.3, 44], [6, 0.3, 44],
  ];
  L.killY = -8;
  // Coherent warm sunset / cool skylight grade across hall, garden, and
  // canopy. The renderer keeps the same world exposure when crossing zones.
  L.env = { skyDay: 1, skyTraining: 1, sunDir: [-0.52,0.79,-0.33],
    sunCol:[1.02,0.84,0.63], ambTop:[0.35,0.45,0.57],
    ambBot:[0.14,0.17,0.16], fogCol:[0.33,0.42,0.52], fogD:0.0022 };
  k.solid([-28,-1,-18],[28,0,64],'rockDark');
  // A larger temple hall, connected directly to the garden through a six-metre gate.
  k.room({x0:-14,z0:-16,x1:14,z1:12,ceil:10,mat:'rockDark',roofMat:'rockDark',floorMat:null,strips:null,sides:{n:{gaps:[{a:-3,b:3,top:6}]}}});
  k.door('garden_gate',[-3,0,12],[3,6,12.8],false,'door');
  k.solid([-28,0,12],[-27,8,64],'rockDark');
  // East garden wall gains a second six-metre door into the Handbook annex.
  // The overhead lintel retains the original load-bearing masonry line.
  k.solid([27,0,12],[28,8,32],'rockDark');
  k.solid([27,0,38],[28,8,64],'rockDark');
  k.solid([27,6,32],[28,8,38],'rockDark');
  k.door('handbook_gate',[27,0,32],[28,6,38],false,'door');
  k.solid([-28,0,63],[28,9,64],'rockDark');
  k.solid([-27,0,12],[-14,7,13],'rockDark'); k.solid([14,0,12],[27,7,13],'rockDark');
  // Terraces and a broad central sparring floor; all raised surfaces have collision.
  k.solid([-11,0,30],[11,0.25,48],'rock');
  for(const x of [-22,18]) k.solid([x,0,53],[x+4,1.2,58],'rock');
  for(const x of [-11,9]) for(const z of [-12,7]) {
    k.solid([x,0,z],[x+2,8,z+2],'rock');
    k.deco([x-0.2,0,z-0.2],[x+2.2,0.45,z+2.2],'rock');
    k.deco([x-0.3,7.8,z-0.3],[x+2.3,8.3,z+2.3],'rock');
  }
  // Collidable broken masonry frames the clearing, leaving broad fighting lanes.
  for(const [x,z,w,h] of [[-23,23,3,2.6],[19,27,3.5,2],[-20,46,3,1.4],[21,48,2,3.8]]) {
    k.solid([x,0,z],[x+w,h,z+2],'rockDark');
    k.deco([x-0.1,h,z-0.1],[x+w+0.1,h+0.2,z+2.1],'rock');
  }
  // Buttresses, layered cornices, and gate framing break up long wall planes.
  for(const x of [-27,25.8])for(let z=16;z<63;z+=8){
    if(x>0 && z>=32 && z<=40) continue; // clear the new east gate
    k.solid([x,0,z],[x+1.2,8.6,z+1.8],'rockDark');
    k.deco([x-0.15,0,z-0.2],[x+1.35,0.45,z+2],'rock');
    k.deco([x-0.2,7.8,z-0.2],[x+1.4,8.1,z+2],'rock');
  }
  for(const x of [-4.3,3.3]){
    k.solid([x,0,11.3],[x+1,7.2,13.5],'rock');
    k.deco([x-0.18,6.8,11.1],[x+1.18,7.3,13.7],'rockDark');
  }
  k.deco([-4.5,6.3,11.1],[4.5,6.8,13.6],'rock');
  // Fern beds and rocks lie beyond the fighting lanes; their collision is a broad low planter.
  for(const [x,z] of [[-20,20],[20,36],[-21,54]])k.solid([x-2,0,z-2],[x+2,0.07,z+2],'rockDark');
  // Flame sources match the four visible bronze wall sconces in trainingHallFinish.
  // Warm practical lighting replaces the former unmotivated fluorescent hall strips.
  for(const x of [-12.88,12.88]) for(const z of [-11.1,8.2])
    k.lamp([x,4.72,z],'orange');
  // Garden light sources line up precisely with the physically modeled
  // bronze wall braziers in trainingCourtyardFinish.js. These add true
  // local light influence on players; the courtyard shader supplements
  // static geometry with the same practical-light coordinates.
  for(const x of [-26.38,26.38]) for(const z of [19.5,29.5,49.5,59])
    k.lamp([x,4.72,z],'orange');
  // Separate Handbook / Map License training annex through a real sliding
  // steel door: not a teleport or a painted portal. Existing arena route stays.
  k.solid([28,-1,25],[49,0,49],'rockDark');
  k.room({x0:28,z0:25,x1:49,z1:49,ceil:10,mat:'rockDark',
    roofMat:'rockDark',floorMat:null,skip:['w','e'],strips:'white'});
  // A NEW second door exits the Handbook into the arena bridge. It is cut
  // into the actual east wall: no fake opening or invisible collision slab.
  k.wall({x0:49,z0:25,x1:49.6,z1:49,h:10,mat:'rockDark',
    gaps:[{a:34,b:40,top:6}]});
  k.door('abyss_gate',[49,0,34],[49.6,6,40],false,'door');
  // Recessed practical steel modules; the raised rails, bolt bosses, framed
  // plaques and lamp housings deliberately break up the broad walls.
  for(const x of [30.5,35,39.5,44]) {
    k.solid([x,0,46.4],[x+2.2,1.05,47.4],'rock');
    k.deco([x+0.18,1.05,46.56],[x+2.02,1.13,47.24],'steelGloss');
    k.deco([x+0.35,1.14,46.65],[x+1.85,1.18,47.15],'glass');
    for(const edge of [x+0.12,x+1.98])
      k.deco([edge,0.27,46.37],[edge+0.1,1.12,46.45],'steelGloss');
  }
  for(const z of [28,34,40,46]) {
    for(const x of [29.1,47.6]){
      k.deco([x,1.0,z],[x+0.22,4.5,z+2.2],'steelGloss');
      k.deco([x-0.04,1.1,z+0.2],[x+0.26,4.25,z+2.0],'metalDark');
      for(const y of [1.2,4.25])
        k.deco([x-0.07,y,z+0.12],[x+0.29,y+0.11,z+2.08],'steelGloss');
    }
  }
  TRAINING_HANDBOOK.forEach((entry,i)=>{
    const x=30.5+i*4.5;
    // E near the framed lectern opens the lesson in the existing HUD,
    // leaving practice gameplay and player inputs otherwise untouched.
    k.use('handbook_'+i,[x+1.1,0,44.6],2.35,'Read '+entry.title);
    k.deco([x+0.22,1.18,46.4],[x+1.98,1.25,47.4],'metalDark');
  });
  k.lamp([38,6.7,38],'white');
  // CORRECTED SQUARE CANOPY: 10×10 m of framed glass supported at its four
  // corners by four separate diagonal steel trusses anchored to masonry walls.
  // No unsupported full-width floating cross or rectangular canopy extension.
  k.solid([-5,4.25,34],[5,4.55,44],'glass');
  for(const x of [-5,0,5])
    k.deco([x-0.10,4.57,33.92],[x+0.10,4.70,44.08],'steelGloss');
  for(const z of [34,39,44])
    k.deco([-5.12,4.57,z-0.10],[5.12,4.70,z+0.10],'steelGloss');
  for(const [corner,wall] of [
    [[-5,6.50,34],[-27,6.50,24]],
    [[-5,6.50,44],[-27,6.50,54]],
    [[5,6.50,34],[27,6.50,24]],
    [[5,6.50,44],[27,6.50,54]],
  ]) {
    k.span(corner,wall,0.55,0.54,'steelGloss',false);
    k.deco([corner[0]-0.16,4.55,corner[2]-0.16],
      [corner[0]+0.16,6.60,corner[2]+0.16],'steelGloss');
    k.deco([wall[0]-0.43,5.85,wall[2]-0.75],
      [wall[0]+0.43,7.05,wall[2]+0.75],'rockDark');
  }
  // Jumpable wall-mounted masonry steps, NOT a smooth ramp. Each collidable
  // tread projects out from the west brick wall and rises by ~0.44m. Players
  // jump across the small gaps, then cross the short canopy access catwalk.
  for(let step=0;step<10;step++){
    const z=20.5+step*1.75, y=0.55+step*(4/9);
    k.solid([-27,Math.max(0,y-0.30),z],[-23.5,y,z+1.55],'rock');
    k.deco([-27.08,y-0.33,z-0.09],[-23.42,y-0.26,z+1.64],'rockDark');
    k.deco([-26.97,y+0.015,z+0.08],[-23.52,y+0.06,z+0.19],'rock');
    if(step%3===1)
      k.deco([-26.8,y+0.035,z+1.35],[-26.25,y+0.065,z+1.51],'metalDark');
  }
  k.solid([-23.6,4.25,37.4],[-5,4.55,40.6],'rock');
  for(let x=-23.5;x< -5.4;x+=2.1){
    k.deco([x,4.57,37.45],[x+0.11,4.64,40.55],'rockDark');
    k.deco([x+0.15,4.58,37.48],[x+1.94,4.60,37.59],'steelGloss');
  }
  // New open-air abyss arena: ~8,495 square metres (over triple the
  // 54×50m garden courtyard). The east Handbook exit faces a narrow
  // stone bridge spanning the open drop to a genuinely CIRCULAR floor.
  const A=TRAINING_ABYSS;
  k.span([49.4,0,37],[89.4,0,37],5.2,0.82,'rock');
  for(const x of [59,73,86]){
    k.pillar(x,37,1.18,-18,-0.78,'rockDark',20);
    k.ring(x,37,1.2,1.65,-1.25,0.18,'steelGloss',24,false);
  }
  k.disc(A.cx,A.cz,A.radius,0,1.20,'rock',96);
  // Strong outer structural rim and concentric engraved combat rings, all
  // visual-only so they do not create snagging or invisible barriers.
  for(const [inner,outer,y,mat] of [
    [50.65,52.1,0.065,'rockDark'],
    [38.25,38.5,0.055,'steelGloss'],
    [20.1,20.3,0.055,'rockDark'],
  ])k.ring(A.cx,A.cz,inner,outer,y,0.12,mat,96,false);
  // Massive footing shafts continue BELOW the water rather than hanging
  // from nowhere. Visible sides use individually raised stone courses.
  k.pillar(A.cx,A.cz,7.0,-19,-1.17,'rockDark',40);
  for(let n=0;n<8;n++){
    const a=n*Math.PI/4;
    k.pillar(A.cx+Math.cos(a)*34,A.cz+Math.sin(a)*34,
      1.65,-19,-1.17,'rockDark',24);
  }
  // Four treehouse-like perimeter galleries: each wraps around a tower.
  // Stone connectors physically bridge from the arena circle to the annulus;
  // deep supports, hanging radial braces and raised bands add construction
  // detail without creating collision obstructions on the walkable decks.
  for(const a of [-3*Math.PI/4,-Math.PI/4,Math.PI/4,3*Math.PI/4]){
    const vx=Math.cos(a),vz=Math.sin(a);
    const cx=A.cx+vx*A.pillarOffset,cz=A.cz+vz*A.pillarOffset;
    k.pillar(cx,cz,A.pillarRadius,-19,13.3,'rockDark',32);
    k.ring(cx,cz,2.8,A.galleryOuter,0,0.82,'rock',64,true);
    k.span([A.cx+vx*50.7,0,A.cz+vz*50.7],
      [A.cx+vx*(A.pillarOffset-4.7),0,A.cz+vz*(A.pillarOffset-4.7)],
      3.2,0.72,'rock',true);
    for(let n=0;n<8;n++){
      const t=n*Math.PI/4,dx=Math.cos(t),dz=Math.sin(t);
      k.span([cx+dx*2.45,-1.1,cz+dz*2.45],
        [cx+dx*6.2,-1.1,cz+dz*6.2],0.40,0.45,'steelGloss',false);
    }
    for(const y of [-8,-0.8,4.8,10.5])
      k.ring(cx,cz,2.54,2.8,y,0.22,'steelGloss',32,false);
  }
  // Mountain ridge extension: two ACTUAL collision-backed terraced islands
  // reachable on foot from the east perimeter of the original combat arena.
  // This region deliberately excludes online spawn / team home changes.
  // All platforms share y=0 with the arena; every path joins with overlap,
  // no air gaps or non-rendering floor patches between the meshes.
  const ridge=TRAINING_RIDGE;
  k.span(ridge.entrance, ridge.lowerBridge, 7.5, 1.35, 'rock', true);
  k.disc(ridge.first.cx, ridge.first.cz, ridge.first.radius, 0, 1.8, 'rock', 96);
  k.span([238,0,3],ridge.upperBridge, 7.25, 1.35, 'rock', true);
  k.disc(ridge.summit.cx,ridge.summit.cz,ridge.summit.radius,0,2.3,'rock',96);
  // Load-bearing shafts descend below the water and never create invisible
  // barriers at player height. Their metal courses continue around their bases.
  for(const point of [ridge.first,ridge.summit]){
    k.pillar(point.cx,point.cz,3.35,-20,-1.95,'rockDark',36);
    for(const y of [-16,-10,-4.5])
      k.ring(point.cx,point.cz,3.34,3.63,y,.17,'steelGloss',36,false);
    // Outer rim remains non-blocking so the player can traverse the full disc.
    k.ring(point.cx,point.cz,point.radius-.75,point.radius-.37,.055,.12,'steelGloss',96,false);
    k.ring(point.cx,point.cz,point.radius-4.25,point.radius-4.04,.06,.10,'rockDark',96,false);
  }
  // Real vertical relief with dedicated geometric strata, not background
  // mountains pasted onto a skybox. Rocks are outside the accessible surface.
  for(const [x,z,r,h] of [
    [224,34,4.1,10],[244,33,4.8,15],[246,-30,5.8,18],
    [287,-25,5.0,13],[290,11,4.3,12],[220,-19,3.8,9]
  ])k.crag(x,z,r,h,'strataRock',15);
  // A collision-backed 12 m elevated destination beyond the original summit.
  // The car is an animated floor in World.floorAt; the bridge and terrace
  // remain authoritative static geometry for combat, camera and falling.
  // The old mountain-ridge floor and spawns are left untouched.
  k.span([282.25,12,-9],[292,12,-9],6.8,0.75,'rock',true);
  L.groundPatches.push({x0:287,x1:316,z0:-22,z1:4,y:12,tile:3.1,mat:'rock'});
  // Lower and upper docking controls; each is reachable without standing
  // inside a solid. Multiplayer uses a locked dock until synchronized lift
  // motion is supplied by its authoritative server.
  k.use('sky_lift_lower',[280,0,-9],3.2,'Call the sky lift');
  k.use('sky_lift_upper',[280,12,-9],3.2,'Return to ridge');
  for(const z of [-22,3.6])
    k.solid([292,12,z],[315.8,13.05,z+0.4],'steelGloss',false);
  k.solid([315.6,12,-21.8],[316,13.05,3.8],'steelGloss',false);
  for(const [x,z] of [[294,-18],[308,-18],[294,0],[308,0]])
    k.lamp([x,15,z],'blue');
  k.zone('sky_lift_overlook',287,-22,316,4);
  k.zone('ridge_overlook',207,-35,288,35);
  // Render-only water is deliberately below killY: a missed bridge is
  // fatal before the falling actor reaches the visible moving water.
  k.deco([55,A.waterY-0.12,-38],[211,A.waterY+0.02,112],'water');
  k.zone('abyss_arena',87,-16,193,90);

  k.zone('handbook_annex',28,25,49,49);
  k.zone('canopy_platform',-5,34,5,44);
  k.zone('training_hall',-14,-16,14,12); k.zone('garden',-27,13,27,63);
  addTrainingHighlands(k);
  return L;
}

// Bevelled individual stone blocks. Soil and supplied foliage are built in trainingGround.js.
// These are decoration only. Gameplay collision is authored above, never derived from grass.
export function buildTrainingGardenDetail() {
  const stone=meshBuilder(),rand=mulberry32(2817);
  const r=(a,b)=>a+(b-a)*rand();
  const block=(x,y,z,w,h,d,c)=>{
    const b=Math.min(0.055,w/5,h/5,d/5), x1=x+w,y1=y+h,z1=z+d;
    const C=c.map(v=>v*r(0.94,1.06));
    stone.box([x+b,y+b,z+b],[x1-b,y1-b,z1-b],C);
    // Inset broad faces and sloped bevel shoulders catch the light at every joint.
    for(const [axis,sgn] of [[0,-1],[0,1],[2,-1],[2,1]]) {
      const n=[0,0,0];n[axis]=sgn;
      const u=axis===0?2:0, lo=[x,y,z], hi=[x1,y1,z1];
      const p=(a,v,inset)=>{const q=[0,0,0];q[axis]=(sgn>0?hi[axis]:lo[axis])+sgn*inset;q[u]=a;q[1]=v;return q;};
      const a=lo[u],d=hi[u];
      const P=[p(a+b,y+b,0),p(d-b,y+b,0),p(d-b,y1-b,0),p(a+b,y1-b,0)];
      stone.quad(...P,n,C);
      const Q=[p(a,y,-b),p(d,y,-b),p(d,y1,-b),p(a,y1,-b)];
      for(let j=0;j<4;j++) stone.quad(Q[j],Q[(j+1)%4],P[(j+1)%4],P[j],n,C.map(v=>v*0.87));
    }
    stone.quad([x+b,y1,z+b],[x1-b,y1,z+b],[x1-b,y1,z1-b],[x+b,y1,z1-b],[0,1,0],C.map(v=>v*1.08));
  };
  const wall=(axis,fixed,a,b,h,sign)=>{
    for(let y=0;y<h;y+=0.64) for(let t=a-(Math.floor(y/0.64)%2)*0.72;t<b;t+=1.45) {
      const lo=Math.max(a,t),hi=Math.min(b,t+1.4);if(hi-lo<0.12)continue;
      const shade=r(0.94,1.06),c=[0.40*shade,0.38*shade,0.32*shade];
      const dep=r(0.08,0.16),pos=sign>0?fixed:fixed-dep;
      if(axis==='x')block(pos,y+0.025,lo,dep,0.585,hi-lo,c);
      else block(lo,y+0.025,pos,hi-lo,0.585,dep,c);
    }
  };
  wall('x',-14,-16,12,10,1);wall('x',14,-16,12,10,-1);wall('z',-16,-14,14,10,1);
  wall('z',12,-14,-3,7,-1);wall('z',12,3,14,7,-1);
  wall('x',-27,13,63,8,1);wall('x',27,13,32,8,-1);wall('x',27,38,63,8,-1);wall('z',63,-27,-5,9,-1);wall('z',63,5,27,9,-1);
  wall('z',12.8,-27,-3,7,1);wall('z',12.8,3,27,7,1);
  // Annex walls and floor carry the same staggered, physically bevelled
  // masonry relief as the original hall rather than smooth texture planes.
  wall('x',49,25,34,9,-1);wall('x',49,40,49,9,-1);
  wall('z',25,28,49,9,1);wall('z',49,28,49,9,-1);
  for(let x=28.2;x<49;x+=1.4)for(let z=25.2;z<49;z+=1.4)
    block(x,0.01,z,1.33,0.044,1.33,[r(0.32,0.42),r(0.31,0.37),r(0.27,0.32)]);
  // Individually offset paving, with visible joints instead of a featureless slab.
  for(let x=-13.8;x<14;x+=1.4)for(let z=-15.8;z<12;z+=1.4)
    block(x,0.002,z,1.35,0.045,1.35,[r(0.31,0.40),r(0.30,0.36),r(0.24,0.29)]);
  for(let x=-10.8;x<11;x+=1.55)for(let z=30.2;z<48;z+=1.55)
    block(x,0.252,z,1.49,0.035,1.49,[r(0.40,0.48),r(0.38,0.44),r(0.29,0.35)]);
  // Broken flagstones lead through the gate, then open into the garden.
  for(let z=12.8;z<30;z+=1.4)for(let x=-2.8;x<3;x+=1.4)
    block(x,0.003,z,1.33,0.035,1.33,[0.38,0.37,0.28]);
  // Irregular boulders have broad sloping faces and broken silhouettes, rather than box shapes.
  const rock=(cx,cz,size)=>{
    const rings=[];for(let j=0;j<4;j++){
      const ring=[];for(let i=0;i<9;i++){const a=i/9*Math.PI*2,rr=size*[1,1.05,0.72,0.24][j]*r(0.85,1.14);ring.push([cx+Math.cos(a)*rr,j*size*0.53,cz+Math.sin(a)*rr]);}rings.push(ring);
    }
    for(let j=0;j<3;j++)for(let i=0;i<9;i++){
      const a=rings[j][i],b=rings[j][(i+1)%9],c=rings[j+1][(i+1)%9],e=rings[j+1][i];
      const n=[Math.cos((i+0.5)/9*6.283),0.45,Math.sin((i+0.5)/9*6.283)];
      stone.quad(a,b,c,e,n,[0.29,0.30,0.26]);
    }
    for(let i=0;i<9;i++)stone.quad(rings[3][i],rings[3][(i+1)%9],[cx,size*1.7,cz],[cx,size*1.7,cz],[0,1,0],[0.32,0.33,0.28]);
  };
  for(const [x,z,s] of [[-20,20,1.5],[20,36,1.4],[-21,54,1.7],[23,59,1.3],[-24,43,1.1]])rock(x,z,s);

  // Close-range, genuine 3D debris: slightly fractured mineral chips cast
  // directional specular highlights and break up large flat soil expanses.
  // Fixed RNG seed keeps multiplayer world geometry deterministic.
  for(let i=0;i<1750;i++){
    const x=r(-26.3,26.3),z=r(13.6,62.4);
    if(trainingPavingDistance(x,z)<.85 || Math.abs(x)>26.1)continue;
    // Distribute grit irregularly; prevent identical repeated gray slabs.
    const y=trainingGroundHeight(x,z);
    const angle=r(0,Math.PI*2),radius=r(.045,.18);
    const a=[x+Math.cos(angle)*radius,y+.009,z+Math.sin(angle)*radius];
    const b=[x+Math.cos(angle+2.14)*radius*.91,y+.014,z+Math.sin(angle+2.14)*radius*.91];
    const c=[x+Math.cos(angle+4.12)*radius*.83,y+.023,z+Math.sin(angle+4.12)*radius*.83];
    const center=[x,y+.03,z];
    const shade=r(.72,1.12),co=[.38*shade,.355*shade,.30*shade];
    const norm=[0.09*Math.sin(angle),.991,0.09*Math.cos(angle)];
    stone.triangle(a,b,center,norm,co);
    stone.triangle(b,c,center,norm,co.map(v=>v*.86));
    stone.triangle(c,a,center,norm,co.map(v=>v*.71));
  }
  return {stone:stone.build()};
}
