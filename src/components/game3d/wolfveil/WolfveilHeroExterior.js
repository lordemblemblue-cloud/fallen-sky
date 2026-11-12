// Exterior art pass for the first Wolfveil home only. Keep the original
// settlement, floor plans and other residence façades untouched.
import * as THREE from 'three';
import {buildHeroNaturalApproach} from './WolfveilNaturalApproach.js';

// A deterministic local PBR color map keeps satin-oak details legible even when
// the camera approaches closely. No external texture request or asset license.
export function makeSatinOakMaterial(){
  const w=128,h=256,pixels=new Uint8Array(w*h*4);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const bend=Math.sin(y*.022)*2.1+Math.sin(y*.061)*.62;
    const lines=Math.sin(x*.38+bend)*.44+
      Math.sin(x*1.13+bend*1.8)*.19+
      Math.sin(x*.067+Math.sin(y*.017)*1.7)*.26;
    const pore=Math.sin(x*2.8+y*.031)*Math.sin(x*.29-y*.11)*.045;
    const tone=1+lines*.13+pore;
    const i=(y*w+x)*4;
    pixels[i]=Math.min(255,Math.round(177*tone));
    pixels[i+1]=Math.min(255,Math.round(119*tone));
    pixels[i+2]=Math.min(255,Math.round(69*tone));
    pixels[i+3]=255;
  }
  const texture=new THREE.DataTexture(pixels,w,h,THREE.RGBAFormat);
  texture.colorSpace=THREE.SRGBColorSpace;
  texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
  texture.anisotropy=4;
  texture.needsUpdate=true;
  const material=new THREE.MeshStandardMaterial({
    color:0xffffff,map:texture,roughness:.38,metalness:0,
  });
  material.name='Wolfveil_Satin_Oak_Grain';
  return material;
}

export function buildHeroResidenceExterior(world,b,Y,approachWorld=world){
  if(b.id!=='existing_residence_1')return null;
  const {x,z,w,d}=b;
  if(!world.materials.satinOak){
    world.materials.satinOak=makeSatinOakMaterial();
    world.ownedMaterials.push(world.materials.satinOak);
  }
  const box=(mat,dx,dy,dz,bw,bh,bd)=>world.box(mat,x+dx,Y+dy,z+dz,bw,bh,bd);
  const frontZ=-d*.5;

  // Stone plinth with individually separated, bevel-suggesting edge courses.
  for(const side of [-1,1]){
    for(let k=0;k<Math.ceil(w/1.12);k++){
      const width=Math.min(1.06,w-k*1.12),px=-w*.5+k*1.12+width*.5;
      box((k%4===0)?'basalt':'granite',px,-.13,side*d*.5+side*.14,width,.26,.25);
    }
  }
  for(const side of [-1,1]){
    for(let k=0;k<Math.ceil(d/1.2);k++){
      const depth=Math.min(1.14,d-k*1.2),pz=-d*.5+k*1.2+depth*.5;
      box('granite',side*(w*.5+.14),-.12,pz,.26,.28,depth);
    }
  }

  // Full-height windowless wall edges become layered timber-and-plaster bays.
  // Trim is proud of the underlying geometry so it actually catches shadows.
  for(const side of [-1,1]){
    for(const dz of [-d*.5,d*.5]){
      for(let y=.24;y<3.05;y+=.29)
        box('satinOak',side*(w*.5-.20),y,dz,.38,.075,.30);
      box('darkCedar',side*(w*.5-.11),1.7,dz,.50,3.38,.45);
    }
    for(const dz of [-d*.36,-d*.14,d*.14,d*.36]){
      box('satinOak',side*(w*.5+.17),1.73,dz,.12,2.8,.18);
      for(const h of [.48,2.93])
        box('darkCedar',side*(w*.5+.18),h,dz,.15,.15,.28);
    }
  }
  for(const dz of [frontZ-.19,d*.5+.19]){
    for(const h of [.33,3.13])
      box('satinOak',0,h,dz,w-.65,.16,.15);
    // Deliberate short cross pieces; none seals the 2.5m central doorway.
    for(const side of [-1,1]){
      const panelWidth=(w-3.3)*.5;
      const cx=side*(1.65+panelWidth*.5);
      for(const h of [.71,2.57])
        box('satinOak',cx,h,dz,panelWidth,.12,.15);
      for(let k=0;k<Math.floor(panelWidth/.62);k++){
        const px=side*(1.80+.3+k*.62);
        box('cedar',px,1.65,dz,.06,1.62,.10);
      }
    }
  }

  // Front door: recessed sliding shoji leaves parked on BOTH sides of the
  // 2.5m opening. They read as doors, but never block the walking aperture.
  box('darkCedar',0,2.72,frontZ-.33,5.90,.23,.38);
  box('satinOak',0,.12,frontZ-.34,5.60,.18,.40);
  box('satinOak',0,2.51,frontZ-.41,5.65,.09,.16);
  for(const side of [-1,1]){
    const dx=side*2.0;
    box('darkCedar',dx,1.37,frontZ-.46,1.27,2.43,.105);
    box('plaster',dx,1.39,frontZ-.528,1.07,2.24,.046);
    for(const rail of [-.5,0,.5])
      box('satinOak',dx+rail,1.37,frontZ-.58,.065,2.26,.08);
    for(const h of [.65,1.15,1.65,2.15])
      box('satinOak',dx,h,frontZ-.60,1.17,.055,.09);
    box('darkCedar',dx-side*.34,1.38,frontZ-.68,.06,.38,.06);
    // Carved pilasters and tucked roof brackets.
    box('satinOak',side*3.02,1.53,frontZ-.45,.22,3.00,.32);
    box('darkCedar',side*3.02,2.88,frontZ-.65,.54,.20,.53);
    box('roofEdge',side*3.02,2.67,frontZ-.65,.70,.14,.47);
    box('lantern',side*3.25,2.10,frontZ-.76,.35,.57,.32);
    for(const dy of [.35,.50,.65])
      box('darkCedar',side*3.02,dy,frontZ-.63,.29,.045,.08);
  }
  // Oak entry decking and a precisely centered stone threshold.
  box('granite',0,-.06,frontZ-.51,3.33,.16,1.05);
  for(let n=0;n<9;n++)
    box('satinOak',-2.58+n*.645,.13,frontZ-1.25,.61,.12,2.14);
  for(const dx of [-3.24,3.24])
    box('darkCedar',dx,.15,frontZ-1.25,.10,.24,2.28);
  // Awning over the threshold, with stacked fascia and visible rafters.
  box('darkCedar',0,2.96,frontZ-1.43,6.7,.14,2.52);
  box('roofEdge',0,3.11,frontZ-1.43,6.96,.16,2.78);
  for(let k=0;k<9;k++)
    box('satinOak',-3.0+k*.75,2.87,frontZ-1.52,.11,.20,2.32);
  box('darkCedar',0,3.04,frontZ-2.83,7.02,.27,.27);
  for(const side of [-1,1]){
    box('darkCedar',side*3.36,2.92,frontZ-1.43,.19,.30,2.95);
    box('satinOak',side*3.32,2.32,frontZ-2.65,.14,1.17,.15);
    box('granite',side*3.32,1.78,frontZ-2.65,.33,.16,.33);
  }

  // An eroded earth crossing replaces the former square ponds and the
  // disconnected flight of steps. The same surface is used for foot raycasts.
  const approach=buildHeroNaturalApproach(approachWorld,b,Y);
  return {id:b.id,doorClearWidth:2.5,doorStyle:'parked_shoji',
    wallFinish:'layered_oak_plaster_stone',approachType:approach.approachType,
    ponds:0,creek:true,trees:approach.trees,fineGrassBlades:approach.fineGrassBlades};
}
