// Training Grounds / circular-abyss water only. The fixed-height water is below
// killY; this module changes presentation, never collision or gameplay state.
// A damped 2-D wave equation transfers energy between neighboring cells.
// Neumann edges and masked stone foundations reflect waves while open channels
// around pillars allow diffraction/splitting without scripted fake branching.
import { TRAINING_ABYSS } from './trainingGarden.js';
import { mountainShoreRadius } from './trainingAbyssMountains.js';
import { sampleTrainingPondDepthMeters, encodeTrainingWaterOpticalDepth,
  TRAINING_POND_OPTICAL_DEPTH_M } from './trainingWaterOptics.js';

export const TRAINING_WATER_BOUNDS = Object.freeze({
  // Simulation domain covers the complete irregular foothill shoreline,
  // including the larger western approach. Visible geometry is radial, not
  // an exposed rectangular 156x150m sheet.
  x0: -110, x1: 280, z0: -155, z1: 229,
  y: TRAINING_ABYSS.waterY + 0.02,
});
const WIND_SHORE_ANGLES = [-0.52, 0.02, 0.49];
function shoreSource(angle, inset = 10) {
  const r = mountainShoreRadius(angle) - inset;
  return [TRAINING_ABYSS.cx + Math.cos(angle) * r,
    TRAINING_ABYSS.cz + Math.sin(angle) * r];
}

function supportCenters() {
  const a = TRAINING_ABYSS;
  const supports = [[a.cx, a.cz, 7]];
  for (let i = 0; i < 8; i++) {
    const t = i * Math.PI / 4;
    supports.push([a.cx + Math.cos(t) * 34,
      a.cz + Math.sin(t) * 34, 1.65]);
  }
  for (const t of [-3 * Math.PI / 4, -Math.PI / 4,
    Math.PI / 4, 3 * Math.PI / 4]) {
    supports.push([a.cx + Math.cos(t) * a.pillarOffset,
      a.cz + Math.sin(t) * a.pillarOffset, a.pillarRadius]);
  }
  for (const x of [59, 73, 86]) supports.push([x, 37, 1.18]);
  return supports;
}

export function makeTrainingWaterObstacleMask(width, height, bounds = TRAINING_WATER_BOUNDS) {
  const mask = new Uint8Array(width * height);
  const centers = supportCenters();
  const cellRadius = Math.max(
    (bounds.x1-bounds.x0)/(width-1),(bounds.z1-bounds.z0)/(height-1))*.65;
  // Thin bridge feet must occupy at least one water-grid cell to reflect
  // waves; they are not being enlarged in the collision/rendered scene.
  // Precompute the SAME shoreline as the rendered mountain foot. Blocking
  // cells beyond the rock-water junction gives physical Neumann reflection
  // and forces waves to wrap around support shafts rather than crossing rock.
  const N = 512;
  const shore = Float32Array.from({length:N+1},(_,i)=>
    mountainShoreRadius(i/N*Math.PI*2));
  for (let z = 0; z < height; z++) for (let x = 0; x < width; x++) {
    const wx = bounds.x0 + (bounds.x1 - bounds.x0) * x / (width - 1);
    const wz = bounds.z0 + (bounds.z1 - bounds.z0) * z / (height - 1);
    const a = (Math.atan2(wz-TRAINING_ABYSS.cz,wx-TRAINING_ABYSS.cx)
      +2*Math.PI)%(2*Math.PI);
    const u=a/(2*Math.PI)*N, j=Math.floor(u);
    const bank=shore[j]*(1-(u-j))+shore[j+1]*(u-j);
    if(Math.hypot(wx-TRAINING_ABYSS.cx,wz-TRAINING_ABYSS.cz)
        >= bank-.5) {
      mask[z * width + x] = 1;
      continue;
    }
    for (const [cx, cz, radius] of centers) {
      if ((wx - cx) ** 2 + (wz - cz) ** 2 < (radius+cellRadius) ** 2) {
        mask[z * width + x] = 1;
        break;
      }
    }
  }
  return mask;
}

// Approximate world-space distance from each wet cell to the nearest actual
// shoreline, gallery support or bridge pier. A two-pass, 8-neighbour Euclidean
// chamfer field gives the GPU irregular contact foam without a 4K/8K texture
// download or per-frame CPU triangulation. Only this visual field uses R8;
// the real fluid simulation remains unchanged (R32F).
export const WATER_CONTACT_RANGE = 24;
export function buildTrainingWaterContactMap(mask,width,height,dx,dz,maxDistance=WATER_CONTACT_RANGE){
  if(mask.length!==width*height||width<2||height<2||
      !(dx>0&&dz>0&&maxDistance>0))throw Error('Invalid water contact field dimensions');
  const d=new Float32Array(mask.length);
  d.fill(maxDistance);
  for(let i=0;i<d.length;i++)if(mask[i])d[i]=0;
  const diagonal=Math.hypot(dx,dz);
  for(let z=0;z<height;z++)for(let x=0;x<width;x++){
    const i=z*width+x;
    if(x>0)d[i]=Math.min(d[i],d[i-1]+dx);
    if(z>0){
      d[i]=Math.min(d[i],d[i-width]+dz);
      if(x>0)d[i]=Math.min(d[i],d[i-width-1]+diagonal);
      if(x+1<width)d[i]=Math.min(d[i],d[i-width+1]+diagonal);
    }
  }
  for(let z=height-1;z>=0;z--)for(let x=width-1;x>=0;x--){
    const i=z*width+x;
    if(x+1<width)d[i]=Math.min(d[i],d[i+1]+dx);
    if(z+1<height){
      d[i]=Math.min(d[i],d[i+width]+dz);
      if(x>0)d[i]=Math.min(d[i],d[i+width-1]+diagonal);
      if(x+1<width)d[i]=Math.min(d[i],d[i+width+1]+diagonal);
    }
  }
  const out=new Uint8Array(d.length);
  for(let i=0;i<d.length;i++)out[i]=Math.round(255*Math.min(1,d[i]/maxDistance));
  return out;
}

export class TrainingWaterSimulation {
  constructor({ width = 192, height = 192, bounds = TRAINING_WATER_BOUNDS,
    speed = 19, damping = 0.994 } = {}) {
    if (width < 16 || height < 16) throw Error('Water grid requires at least 16 cells per axis');
    this.width = width; this.height = height; this.bounds = bounds;
    this.dx = (bounds.x1 - bounds.x0) / (width - 1);
    this.dz = (bounds.z1 - bounds.z0) / (height - 1);
    this.stepDt = 1 / 30;
    this.ax = (speed * this.stepDt / this.dx) ** 2;
    this.az = (speed * this.stepDt / this.dz) ** 2;
    // Explicit 2-D wave solver is stable only under this CFL constraint.
    if (this.ax + this.az >= 1) throw Error('Unstable water wave speed / cell size');
    this.damping = damping;
    this.curr = new Float32Array(width * height);
    this.prev = new Float32Array(width * height);
    this.next = new Float32Array(width * height);
    this.obstacles = makeTrainingWaterObstacleMask(width, height, bounds);
    this.contactMap=buildTrainingWaterContactMap(this.obstacles,width,height,this.dx,this.dz);
    this.accumulator = 0; this.elapsed = 0; this.stepCount = 0;
    // Waves are present immediately, without user interaction or waterfall contact.
    const [ex, ez] = shoreSource(.08, 16);
    const [wx, wz] = shoreSource(Math.PI, 23);
    this.disturb(ex, ez, 11.5, .40);
    this.disturb(wx, wz, 9.0, -.23);
  }
  get heights() { return this.curr; }
  blocked(x, z) {
    const ix = Math.round((x - this.bounds.x0) / this.dx);
    const iz = Math.round((z - this.bounds.z0) / this.dz);
    return ix < 0 || iz < 0 || ix >= this.width || iz >= this.height ||
      this.obstacles[iz * this.width + ix] !== 0;
  }
  disturb(x, z, radius = 4, strength = 0.14) {
    const minX = Math.max(0, Math.floor((x - radius - this.bounds.x0) / this.dx));
    const maxX = Math.min(this.width - 1, Math.ceil((x + radius - this.bounds.x0) / this.dx));
    const minZ = Math.max(0, Math.floor((z - radius - this.bounds.z0) / this.dz));
    const maxZ = Math.min(this.height - 1, Math.ceil((z + radius - this.bounds.z0) / this.dz));
    const affected = [];
    let sum = 0;
    for (let iz = minZ; iz <= maxZ; iz++) for (let ix = minX; ix <= maxX; ix++) {
      const wx = this.bounds.x0 + ix * this.dx;
      const wz = this.bounds.z0 + iz * this.dz;
      const d = Math.hypot(wx - x, wz - z) / radius;
      const i = iz * this.width + ix;
      if (d >= 1 || this.obstacles[i]) continue;
      const weight = 0.5 + 0.5 * Math.cos(Math.PI * d);
      affected.push([i, weight]); sum += weight;
    }
    // Water is not created by each waterfall impact: pair the rising crest
    // with a surrounding shallow trough. Mask clipping stays zero-mean too.
    if (affected.length < 2) return;
    const mean = sum / affected.length;
    for (const [i, weight] of affected)
      this.curr[i] += strength * (weight - mean) * 1.5;
  }
  tick() {
    const { width: w, height: h, curr, prev, next, obstacles, ax, az } = this;
    for (let z = 0; z < h; z++) for (let x = 0; x < w; x++) {
      const i = z * w + x;
      if (obstacles[i]) { next[i] = 0; continue; }
      const c = curr[i];
      // A solid neighbor or outside-edge cell returns the central height;
      // a zero normal gradient reflects the incoming front, while it can
      // still propagate around the opposite sides of a pillar.
      const sample = j => j < 0 || j >= w * h || obstacles[j] ? c : curr[j];
      const left = x === 0 ? c : sample(i - 1);
      const right = x === w - 1 ? c : sample(i + 1);
      const down = z === 0 ? c : sample(i - w);
      const up = z === h - 1 ? c : sample(i + w);
      const acceleration = ax * (left + right - 2 * c) +
        az * (down + up - 2 * c);
      next[i] = c + this.damping * (c - prev[i]) + acceleration;
    }
    this.prev = curr; this.curr = next; this.next = prev;
    this.elapsed += this.stepDt;
    this.stepCount++;
    // Separate moving waterfall and gentle wind forcing sustain visible
    // waves without painting a scrolling sine pattern over the water.
    if (this.stepCount % 14 === 0) {
      // Larger, overlapping wave packets travel from actual shoreline inlets
      // through the full pond. Peaks push adjacent troughs via the solver.
      for (let i = 0; i < WIND_SHORE_ANGLES.length; i++) {
        const [x,z]=shoreSource(WIND_SHORE_ANGLES[i],9.5);
        this.disturb(x,z,9.5,
          .19+.065*Math.sin(this.elapsed*1.43+i*2.1));
      }
    }
    if (this.stepCount % 48 === 0) {
      const [x,z]=shoreSource(Math.PI+.16*Math.sin(this.elapsed*.31),19);
      this.disturb(x,z,13,.15);
    }
  }
  update(dt) {
    this.accumulator += Math.min(Math.max(dt || 0, 0), 0.1);
    let stepped = 0;
    while (this.accumulator >= this.stepDt && stepped < 3) {
      this.tick();
      this.accumulator -= this.stepDt;
      stepped++;
    }
    // Dropped background frames cannot cause an unbounded catch-up stall.
    if (stepped === 3) this.accumulator = Math.min(this.accumulator, this.stepDt);
    return stepped > 0;
  }
  sample(x, z) {
    const u = Math.max(0, Math.min(this.width - 1, (x - this.bounds.x0) / this.dx));
    const v = Math.max(0, Math.min(this.height - 1, (z - this.bounds.z0) / this.dz));
    const ix = Math.floor(u), iz = Math.floor(v);
    const tx = u - ix, tz = v - iz, x2 = Math.min(this.width - 1, ix + 1);
    const z2 = Math.min(this.height - 1, iz + 1);
    const a = this.curr[iz * this.width + ix], b = this.curr[iz * this.width + x2];
    const c = this.curr[z2 * this.width + ix], d = this.curr[z2 * this.width + x2];
    return (a * (1 - tx) + b * tx) * (1 - tz) +
      (c * (1 - tx) + d * tx) * tz;
  }
}

// The irregular radial pond touches the SAME mountain waterline used by
// the obstacle mask, so there are no abrupt rectangle seams or detached
// blue planes. Water extends below the mountain's emergent rock foot.
// Geometry is visual only: no collision triangles or platform changes.
export function trainingWaterMeshResolution(quality='medium'){
  // The medium default stays 256x56 so legacy screenshots, terrain seam
  // tests and lower-cost browsers retain their established water topology.
  if(quality==='8k'||quality==='4k'||quality==='ultra')
    return {sectors:512,rings:96};
  if(quality==='high'||quality==='sharp')
    return {sectors:384,rings:72};
  if(quality==='very_low'||quality==='low'||quality==='performance')
    return {sectors:192,rings:40};
  return {sectors:256,rings:56};
}
export function buildTrainingWaterSurface(quality='medium') {
  const {sectors,rings}=trainingWaterMeshResolution(quality),stride=sectors+1;
  const pos=new Float32Array((rings+1)*stride*3);
  const nrm=new Float32Array(pos.length);
  const col=new Uint8Array((rings+1)*stride*4);
  const idx=new Uint32Array(rings*sectors*6);
  const shore=Float32Array.from({length:sectors+1},(_,i)=>
    mountainShoreRadius(i/sectors*Math.PI*2)+2.5);
  for(let j=0;j<=rings;j++){
    const t=j/rings;
    for(let i=0;i<=sectors;i++){
      const a=i/sectors*Math.PI*2;
      const r=t*shore[i],index=j*stride+i,k=index*3;
      pos[k]=TRAINING_ABYSS.cx+Math.cos(a)*r;
      pos[k+1]=TRAINING_WATER_BOUNDS.y;
      pos[k+2]=TRAINING_ABYSS.cz+Math.sin(a)*r;
      nrm[k+1]=1;
      // Red: exact curved-bank proximity for foamy rock contact.
      // Green: Beer-Lambert optical depth from the EXISTING submerged bed,
      // rather than fabricated uniform transparency or a flat depth ring.
      // Blue and alpha remain neutral; this never changes pond collision.
      const bankDistance=Math.max(0,shore[i]-2.5-r);
      const bedDepth=sampleTrainingPondDepthMeters({
        angle:a,radius:r,shoreRadius:shore[i]-2.5,
        surfaceY:TRAINING_WATER_BOUNDS.y,waterY:TRAINING_ABYSS.waterY,
      });
      col[index*4]=Math.round(255*Math.max(0,1-bankDistance/14));
      col[index*4+1]=encodeTrainingWaterOpticalDepth(
        bedDepth,TRAINING_POND_OPTICAL_DEPTH_M);
      col[index*4+2]=255;col[index*4+3]=255;
    }
  }
  for(let j=0,k=0;j<rings;j++)for(let i=0;i<sectors;i++){
    const a=j*stride+i,b=a+1,c=b+stride,d=a+stride;
    idx[k++]=a;idx[k++]=b;idx[k++]=c;
    idx[k++]=a;idx[k++]=c;idx[k++]=d;
  }
  return {pos,nrm,col,idx};
}
