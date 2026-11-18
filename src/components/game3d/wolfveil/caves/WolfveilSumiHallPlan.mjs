// Where the owner's sumi-e hallway goes in Wolfveil's caves.
//
// The cave network already has three connected tunnels sized for the owner's
// hallway (WolfveilModularCaveKit.mjs): rotunda to the three-way junction,
// junction to the treasure vault, junction toward the canyon. They were bare
// rock. This lays the owner's hallway along them, built from the parts of
// the owner's kit: tiled path, painted brick walls, crown, gold end frames.
//
// It changes nothing about where a player can walk: the floor and the walls
// that stop a player stay exactly where the cave layout has them. Pure
// numbers, in Wolfveil-local metres.
import {WOLFVEIL_MODULAR_JUNCTION as JUNCTION,WOLFVEIL_MODULAR_TREASURE_ROOM as VAULT,
  WOLFVEIL_MODULAR_CANYON as CANYON,WOLFVEIL_MODULAR_CORRIDOR_SPECS as TUNNELS} from '../WolfveilModularCaveKit.mjs';
import {WOLFVEIL_CAVE_HUB as HUB} from '../WolfveilCaveLayout.mjs';

/** The owner's hallway, as its file builds it. */
export const WOLFVEIL_SUMI_HALL=Object.freeze({
  halfWidth:2.42,     // wall line each side of the centre; the tunnels' own half-width
  pathWidth:3.8,      // the tiled path between the curbs
  wallHeight:3.9,rows:9,
  tileTop:.12,        // how far the tiles stand above the kit's own ground line
  tileLift:.08,       // tiles stand this far above the cave's stone floor, so their gold rims clear it
  frame:Object.freeze({gold:[.48,3.92,.48],silver:[.54,3.92,.16]}),
});

const tunnel=id=>{const found=TUNNELS.find(spec=>spec.id===id);if(!found)throw new Error('No cave tunnel '+id);return found;};
const HW=WOLFVEIL_SUMI_HALL.halfWidth;

// Where two wall lines on the same side of two meeting runs cross, measured
// along each run from the shared corner. Positive runs past the corner.
function mitre(forwardA,forwardB,side){
  // The wall line is the centre line moved sideways: left is -x in a run's own frame.
  const normal=f=>[side*f[1],-side*f[0]];
  const na=normal(forwardA),nb=normal(forwardB);
  const cross=forwardA[0]*forwardB[1]-forwardA[1]*forwardB[0];
  if(Math.abs(cross)<1e-6)return {a:0,b:0};
  // corner + na*HW + a*forwardA = corner + nb*HW + b*forwardB
  const dx=(nb[0]-na[0])*HW,dz=(nb[1]-na[1])*HW;
  return {a:(dx*forwardB[1]-dz*forwardB[0])/cross,b:(dx*forwardA[1]-dz*forwardA[0])/cross};
}

/**
 * Every straight run of hallway.
 * A run has its own frame: `s` runs along it from -length/2 to +length/2;
 * `left` and `right` are its two walls (the kit's -x and +x walls).
 * @returns {{runs:Array<{id,from:[x,z],to:[x,z],middle:[x,z],yaw,length,floorY,
 *   floor:[s0,s1], left:{span:[s0,s1],openings:Array<{min,max}>}, right:{...},
 *   frames:number[]}>, meters:number}}
 */
export function planWolfveilSumiHalls(){
  const floorY=JUNCTION.y,runs=[];
  const run=(id,from,to)=>{
    const dx=to[0]-from[0],dz=to[1]-from[1],length=Math.hypot(dx,dz);
    const made={id,from,to,middle:[(from[0]+to[0])/2,(from[1]+to[1])/2],forward:[dx/length,dz/length],
      yaw:Math.atan2(dx,dz),length,floorY,floor:[-length/2,length/2],
      left:{span:[-length/2,length/2],openings:[]},right:{span:[-length/2,length/2],openings:[]},frames:[]};
    runs.push(made);return made;
  };
  // Along a run's own measure for a point in the world.
  const along=(r,point)=>(point[0]-r.middle[0])*r.forward[0]+(point[1]-r.middle[1])*r.forward[1];
  // Which wall of run `r` faces the point: -1 left, +1 right.
  const sideOf=(r,point)=>((point[0]-r.middle[0])*r.forward[1]-(point[1]-r.middle[1])*r.forward[0])>0?1:-1;

  // 1. The stem: out of the rotunda's rim, down to the junction.
  const stem=run('rotunda_to_junction',[HUB.x,HUB.z-HUB.radius],[JUNCTION.x,JUNCTION.z+HW]);
  stem.frames.push(-stem.length/2);

  // 2. The crossbar: from the vault's rim, through the junction, to the bend.
  const east=tunnel('modular_t_to_canyon').waypoints.map(point=>[point[0],point[2]]);
  const bar=run('vault_to_bend',[VAULT.x+VAULT.radius,JUNCTION.z],east[1]);
  bar.frames.push(-bar.length/2);
  // The stem walks in through one wall of the crossbar.
  const doorway={min:along(bar,[JUNCTION.x-HW,JUNCTION.z]),max:along(bar,[JUNCTION.x+HW,JUNCTION.z])};
  if(doorway.min>doorway.max)[doorway.min,doorway.max]=[doorway.max,doorway.min];
  (sideOf(bar,stem.from)<0?bar.left:bar.right).openings.push(doorway);

  // 3. On toward the canyon, stopping where the canyon's own floor begins.
  let previous=bar;
  for(let i=1;i<east.length-1;i++){
    let from=east[i],to=east[i+1],last=false;
    if(from[0]>=CANYON.minX)break;
    if(to[0]>CANYON.minX){
      const t=(CANYON.minX-from[0])/(to[0]-from[0]);
      to=[CANYON.minX,from[1]+(to[1]-from[1])*t];last=true;
    }
    const next=run('toward_canyon_'+i,from,to);
    // Mitre the two runs at their shared corner: the outer wall runs on, the
    // inner wall stops short, and neither floor crosses the other.
    let cut=0;
    for(const [side,name] of [[-1,'left'],[1,'right']]){
      const {a,b}=mitre(previous.forward,next.forward,side);
      previous[name].span[1]=previous.length/2+a;
      next[name].span[0]=-next.length/2+b;
      cut=Math.max(cut,Math.abs(a),Math.abs(b));
    }
    previous.floor[1]=previous.length/2-cut;
    next.floor[0]=-next.length/2+cut;
    if(last){next.frames.push(next.length/2);previous=next;break;}
    previous=next;
  }
  const meters=runs.reduce((sum,r)=>sum+r.length,0);
  return {runs,meters,floorY};
}

/** A run's own (across, along) point as a world [x, z]. Across: -left, +right. */
export function sumiHallPoint(run,across,s){
  return [run.middle[0]+run.forward[0]*s+run.forward[1]*across,run.middle[1]+run.forward[1]*s-run.forward[0]*across];
}
