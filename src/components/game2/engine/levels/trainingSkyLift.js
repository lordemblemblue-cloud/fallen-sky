// Game 2 Training Grounds — deterministic, local sky-lift state and authored finish.
// The lower dock is on the existing summit; the upper deck has separate real floor
// collision in trainingGarden.js. Neither this module nor its meshes changes spawns.
import { meshBuilder } from '../level/builder.js';

export const SKY_LIFT = Object.freeze({
  x: 280, z: -9, low: 0, high: 12, halfX: 2.45, halfZ: 2.45, speed: 2.4,
  topDeck: Object.freeze({x0: 287, x1: 316, z0: -22, z1: 4, y: 12}),
});

export class SkyLift {
  constructor() { this.y = SKY_LIFT.low; this.target = this.y; }
  contains(x, z, margin = 0) {
    return Math.abs(x - SKY_LIFT.x) <= SKY_LIFT.halfX - margin &&
      Math.abs(z - SKY_LIFT.z) <= SKY_LIFT.halfZ - margin;
  }
  supporting(pos, tolerance = 0.55) {
    return this.contains(pos[0], pos[2], 0.12) && Math.abs(pos[1] - this.y) <= tolerance;
  }
  floorAt(x, z, ceiling) {
    return this.contains(x, z) && this.y <= ceiling + 0.005 ? this.y : null;
  }
  toggle() {
    if (Math.abs(this.y - this.target) > 0.015) return false;
    this.target = this.y < (SKY_LIFT.high + SKY_LIFT.low) / 2 ? SKY_LIFT.high : SKY_LIFT.low;
    return true;
  }
  update(dt) {
    const delta = this.target - this.y;
    const step = Math.max(0, Math.min(0.1, dt)) * SKY_LIFT.speed;
    this.y += Math.sign(delta) * Math.min(Math.abs(delta), step);
    return this.y - (this.y - Math.sign(delta) * Math.min(Math.abs(delta), step));
  }
}

export function buildSkyLiftFinish() {
  const paved = meshBuilder(), masonry = meshBuilder(), metal = meshBuilder(),
    glazing = meshBuilder(), lights = meshBuilder(), banners = meshBuilder(), car = meshBuilder();
  const C = { stone:[0.39,0.37,0.31], mortar:[0.18,0.19,0.19], copper:[0.61,0.45,0.24],
    iron:[0.35,0.43,0.49], glow:[0.20,0.68,0.9] };
  const box=(mesh,a,b,color)=>mesh.box(a,b,color);
  const deck=SKY_LIFT.topDeck;
  // Staggered physical bricks/pavers instead of a smooth flat ground slab.
  // Relief floats only 2.5cm above the collision-backed upper-deck rectangle.
  for(let row=0,z=deck.z0+0.18;z<deck.z1-0.18;z+=1.24,row++){
    for(let x=deck.x0+0.18-(row%2)*0.65;x<deck.x1-0.18;x+=1.3){
      const x0=Math.max(x,deck.x0+0.14),x1=Math.min(x+1.24,deck.x1-0.14);
      if(x1-x0<0.3)continue;
      const variation=0.86+0.12*Math.sin(x*2.3+z*1.7)**2;
      box(paved,[x0,deck.y+0.003,z],[x1,deck.y+0.033,Math.min(z+1.16,deck.z1-0.12)],
        C.stone.map(v=>v*variation));
    }
  }
  // A 12m shaft with four visible anchor rails and true mechanical lift car.
  // No floor or collision is faked by decoration; the car is rendered in a
  // translated model matrix and its height is exposed to World.floorAt().
  for(const sx of [-1,1])for(const sz of [-1,1]){
    const x=SKY_LIFT.x+sx*2.73,z=SKY_LIFT.z+sz*2.73;
    box(masonry,[x-.33,-.45,z-.33],[x+.33,14.3,z+.33],C.mortar);
    box(metal,[x-.10,0,z-.10],[x+.10,14.5,z+.10],C.iron);
    for(let y=1;y<14;y+=2.2)
      box(metal,[x-.29,y,z-.29],[x+.29,y+.16,z+.29],C.copper);
  }
  for(const z of [deck.z0,deck.z1]){
    box(masonry,[deck.x0,deck.y-.62,z-.6],[deck.x1,deck.y+.36,z+.6],C.mortar);
    box(metal,[deck.x0,deck.y+.36,z-.28],[deck.x1,deck.y+.49,z+.28],C.copper);
  }
  for(let x=deck.x0+2;x<deck.x1-1;x+=4){
    for(const z of [deck.z0+.72,deck.z1-.72]){
      box(metal,[x-.08,deck.y+.08,z-.08],[x+.08,deck.y+1.2,z+.08],C.iron);
      box(lights,[x-.16,deck.y+1.04,z-.16],[x+.16,deck.y+1.26,z+.16],C.glow);
    }
  }
  for(const x of [292,304,313]){
    box(masonry,[x-.50,deck.y-.9,-20],[x+.50,deck.y+1.4,-19],C.stone);
    box(glazing,[x-.36,deck.y+0.38,-19.13],[x+.36,deck.y+1.23,-19.07],[0.33,0.55,0.67]);
    box(banners,[x-.55,deck.y+4.4,2.65],[x+.55,deck.y+7.4,2.76],[0.16,0.19,0.3]);
  }
  // Platform geometry is authored relative to world origin horizontally
  // and zero vertically, so it follows only a Y translation at runtime.
  box(car,[SKY_LIFT.x-2.35,-.40,SKY_LIFT.z-2.35],[SKY_LIFT.x+2.35,-.04,SKY_LIFT.z+2.35],C.iron);
  for(let x=SKY_LIFT.x-2.28;x<SKY_LIFT.x+2.2;x+=0.62)
    box(car,[x,0.005,SKY_LIFT.z-2.27],[x+.56,0.055,SKY_LIFT.z+2.27],C.stone);
  for(const z of [-2.38,2.38]){
    for(const x of [-2.2,2.2])
      box(car,[SKY_LIFT.x+x,.04,SKY_LIFT.z+z-.09],
        [SKY_LIFT.x+x+.12,1.05,SKY_LIFT.z+z+.09],C.copper);
    box(car,[SKY_LIFT.x-2.2,1.0,SKY_LIFT.z+z-.07],
      [SKY_LIFT.x+2.32,1.12,SKY_LIFT.z+z+.07],C.iron);
  }
  return Object.fromEntries(Object.entries({paved,masonry,metal,glazing,lights,banners,car})
    .map(([name,mesh])=>[name,mesh.build()]));
}

// Wind vectors are in world units/s and change smoothly, not random each frame.
// They can drive banner sway and lightweight client-only ambient particles.
export function skyLiftWind(t, x = SKY_LIFT.x, z = SKY_LIFT.z) {
  const gust=Math.sin(t*.62+x*.017+z*.029)*.32+Math.sin(t*.23+z*.041)*.19;
  return [1.7+gust,0.07*Math.sin(t*1.13+x*.021),.85+gust*.6];
}
