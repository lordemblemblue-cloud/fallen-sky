// Game 2 Boss Way · Rancor visual slot.
// An original Raven Ghoul2 .glm is NOT part of the currently connected Jedi
// Academy model folders. If its owner supplies and converts the mesh to
// /game2/bossway/rancor.glb, that actual asset takes precedence. The visible
// creature below is clearly a temporary Game 2 stylised proxy, not a claimed
// extraction of Raven's copyrighted original model.
import { geo } from '../gl.js';
import { m4, q } from '../math.js';

const bodyColor = [0.31,0.30,0.25,1], hideColor=[0.23,0.24,0.21,1],
  ridges=[0.40,0.38,0.31,1], bone=[0.76,0.71,0.55,1], black=[0.10,0.11,0.1,1],
  angry=[0.80,0.12,0.08,1];

function sphereMesh(R, color, quality=11) {
  return R.uploadStatic(geo().sphere(0,0,0,1,color,quality).build());
}
function transform(parent, position, scale, angle=0, axis=[1,0,0]) {
  return m4.mul(parent,m4.trs(position,q.axisAngle(axis,angle),scale));
}
export class RancorVisual {
  constructor(R, supplied = null) {
    this.R=R;this.source=supplied?'owner-converted-glb':'stylised-proxy';
    this.ownerMesh=supplied?R.uploadStatic(supplied.mesh):null;
    this.ownerScale=supplied?.scale || 1;
    this.torso=sphereMesh(R,bodyColor,13);
    this.hide=sphereMesh(R,hideColor,10);
    this.ridge=sphereMesh(R,ridges,9);
    this.bone=sphereMesh(R,bone,7);
    this.eyes=sphereMesh(R,angry,7);
    this.black=sphereMesh(R,black,7);
    this.phase=0;
  }
  draw(boss, action=null, now=0) {
    const R=this.R;
    const model=m4.fromYaw(boss.yaw,[boss.pos[0],boss.pos[1],boss.pos[2]]);
    const draw=(mesh,pos,scale,angle=0,axis=[1,0,0])=>
      R.drawMesh(mesh,transform(model,pos,scale,angle,axis),{spec:0.12});
    if(this.ownerMesh) {
      const t=now*2.2, idle=Math.sin(t)*0.02, attack=action?.state==='windup'?0.06:0;
      R.drawMesh(this.ownerMesh,transform(model,[0,0.03+idle,0],[this.ownerScale,this.ownerScale*(1+attack),this.ownerScale]),{spec:0.2});
      return;
    }
    const t=now*2.5, breathe=1+Math.sin(t)*0.023;
    const windup=action?.state==='windup', kind=action?.attack?.id;
    const lunge=windup && kind==='grab' ? -0.45 : windup ? -0.2:0;
    const roar=windup && kind==='roar' ? 0.65 : 0.05+Math.max(0,Math.sin(t*0.6))*0.05;
    const arms=windup ? kind==='slam' ? -0.85 : kind==='sweep' ? 0.45 : -0.35:Math.sin(t)*0.07;
    draw(this.torso,[0,2.8,0],[1.75,2.0*breathe,1.35],lunge);
    draw(this.ridge,[0,3.2,1.13],[1.2,1.2,.48],lunge);
    draw(this.hide,[-0.78,1.05,-.15],[.85,1.17,.87],Math.sin(t)*.055);
    draw(this.hide,[.78,1.05,-.15],[.85,1.17,.87],-Math.sin(t)*.055);
    draw(this.hide,[-.84,.39,.38],[.83,.31,1.03]);
    draw(this.hide,[.84,.39,.38],[.83,.31,1.03]);
    // Tail counters its shoulder movement; three tapered segments.
    draw(this.torso,[0,1.65,-1.45],[.84,.70,1.43],.30);
    draw(this.hide,[0,1.06,-2.62],[.60,.56,1.10],.28);
    draw(this.hide,[0,.82,-3.5],[.33,.31,.80],.30);
    // Neck + hinged jaws with tusks; proportions deliberately unlike a humanoid.
    draw(this.torso,[0,4.33,.62],[1.25,1.15,1.23],lunge*.4);
    draw(this.hide,[0,3.96,1.54],[1.02,.39,.91],roar*.35);
    draw(this.black,[0,4.17,1.92],[.75,.24,.49]);
    draw(this.black,[-.52,4.7,1.4],[.20,.20,.19]);
    draw(this.black,[.52,4.7,1.4],[.20,.20,.19]);
    draw(this.eyes,[-.60,4.81,1.50],[.12,.13,.13]);
    draw(this.eyes,[.60,4.81,1.50],[.12,.13,.13]);
    for(const side of [-1,1]) {
      // Back-swept brow horns, projecting lower tusks and blunt bone digits.
      draw(this.bone,[side*.98,5.12,1.02],[.21,.53,.25],side*.42,[0,0,1]);
      draw(this.bone,[side*.65,3.92,2.03],[.21,.44,.20],side*.26,[0,0,1]);
      draw(this.torso,[side*2.02,3.52,.07],[.86,.85,.90],side*arms,[0,0,1]);
      draw(this.hide,[side*2.47,2.67,.50],[.76,1.22,.68],side*arms*.75,[0,0,1]);
      draw(this.ridge,[side*2.55,1.78,.95],[.68,.55,.74],side*arms*.55,[0,0,1]);
      for(let finger=-1;finger<=1;finger++)
        draw(this.bone,[side*(2.4+finger*.18),1.40,1.41],[.13,.38,.16],-.25-finger*.08);
    }
    // Upper back scutes, only a handful of meshes rather than a massive skin.
    for(let i=0;i<4;i++)draw(this.ridge,[0,3.55-i*.44,-1.22],[.52-i*.07,.3,.31],-.45);
  }
}
