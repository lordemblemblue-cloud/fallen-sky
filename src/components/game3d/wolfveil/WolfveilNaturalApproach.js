// The featured Wolfveil residence receives one integrated natural approach.
// All geometry uses local valley coordinates so the existing market origin
// translation continues to work. Other houses are intentionally unchanged.
import * as THREE from 'three';
import {wolfveilHeight} from './WolfveilLayout.js';

const clamp=(v,a=0,b=1)=>Math.min(b,Math.max(a,v));
const mix=(a,b,t)=>a+(b-a)*t;
const smooth=(t)=>{t=clamp(t);return t*t*(3-2*t);};
const fract=(v)=>v-Math.floor(v);
const hash=(x,y)=>fract(Math.sin(x*127.1+y*311.7)*43758.5453);
function noise(x,y){
  const ix=Math.floor(x),iy=Math.floor(y),fx=smooth(x-ix),fy=smooth(y-iy);
  return mix(mix(hash(ix,iy),hash(ix+1,iy),fx),
    mix(hash(ix,iy+1),hash(ix+1,iy+1),fx),fy);
}
function detailTexture(kind){
  const w=256,h=256,rgba=new Uint8Array(w*h*4);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const f=noise(x*.08,y*.08),fine=noise(x*.55,y*.55),grain=noise(x*.018,y*.018);
    const vein=Math.pow(Math.max(0,Math.sin(x*.061+y*.046+grain*5)),18);
    const moss=kind==='moss';
    const mottled=(f-.5)*.55+(fine-.5)*.19+(grain-.5)*.28;
    const v=moss?clamp(.79+mottled+vein*.10,.42,1.16):
      clamp(.82+mottled-vein*.28,.44,1.15);
    const i=(y*w+x)*4;
    rgba[i]=Math.round((moss?94:136)*v);
    rgba[i+1]=Math.round((moss?125:126)*v);
    rgba[i+2]=Math.round((moss?71:110)*v);
    rgba[i+3]=255;
  }
  const t=new THREE.DataTexture(rgba,w,h,THREE.RGBAFormat);
  t.colorSpace=THREE.SRGBColorSpace;
  t.wrapS=t.wrapT=THREE.RepeatWrapping;
  t.minFilter=THREE.LinearMipmapLinearFilter;
  t.magFilter=THREE.LinearFilter;
  t.generateMipmaps=true;t.anisotropy=4;t.needsUpdate=true;
  return t;
}
export function makeNaturalMaterial(kind){
  const material=new THREE.MeshStandardMaterial({
    color:0xffffff,map:detailTexture(kind),
    roughness:kind==='moss'?.98:.89,
    side:THREE.DoubleSide,
  });
  material.name=kind==='moss'?'Wolfveil_Approach_CloseMoss':'Wolfveil_Approach_CloseStone';
  return material;
}
export function heroApproachAt(b,Y,z){
  const front=b.z-b.d/2;
  const start=front-37,end=front+1.1,crest=front-.45;
  const t=clamp((z-start)/(crest-start));
  // The path enters around the down-hill neighbor, then curves west into the
  // front door, without intersecting an adjacent house's footprint.
  const centerX=b.x+17*(1-smooth((t-.29)/.71));
  const startY=wolfveilHeight(b.x+17,start)+.06;
  const y=mix(startY,Y+.245,t)+.06*Math.sin(t*Math.PI*2)*t*(1-t);
  const width=2.20+.18*Math.sin(t*Math.PI);
  return {x:centerX,z,y,width,t,start,end};
}
function fromGrid(columns,rows,get,material,name,world){
  const points=[],uv=[],indices=[],vertexColors=[];
  for(let iz=0;iz<=rows;iz++)for(let ix=0;ix<=columns;ix++){
    const u=ix/columns,v=iz/rows,p=get(u,v);
    points.push(p.x,p.y,p.z);uv.push(p.u??u,p.v??v);
    if(p.color)vertexColors.push(...p.color);
  }
  for(let iz=0;iz<rows;iz++)for(let ix=0;ix<columns;ix++){
    const a=iz*(columns+1)+ix,b=a+columns+1;
    indices.push(a,b,a+1,b,b+1,a+1);
  }
  const geo=new THREE.BufferGeometry();
  geo.setAttribute('position',new THREE.Float32BufferAttribute(points,3));
  geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  if(vertexColors.length===points.length)
    geo.setAttribute('color',new THREE.Float32BufferAttribute(vertexColors,3));
  geo.setIndex(indices);geo.computeVertexNormals();
  const mesh=new THREE.Mesh(geo,material);
  mesh.name=name;mesh.receiveShadow=true;
  world.mesh(mesh);
  return mesh;
}
const rand=(n)=>hash(n*1.782+3.6,n*.431+9.21);
function addBoulders(world,b,Y){
  const mats=world.materials;
  const base=new THREE.IcosahedronGeometry(1,1);
  const pos=base.attributes.position;
  for(let i=0;i<pos.count;i++){
    const x=pos.getX(i),y=pos.getY(i),z=pos.getZ(i);
    const wobble=.86+.20*noise(x*2.5+7,y*3.3+z*1.6);
    pos.setXYZ(i,x*wobble,y*wobble,z*wobble);
  }
  base.computeVertexNormals();
  const stone=new THREE.InstancedMesh(base,mats.approachStone,48);
  const dummy=new THREE.Object3D();
  for(let i=0;i<48;i++){
    const t=(i+.45)/48;
    const az=mix(b.z-b.d/2-36,b.z-b.d/2-1,t);
    const p=heroApproachAt(b,Y,az);
    const side=i%2?1:-1,px=p.x+side*(p.width+(.58+rand(i+4)*2.4));
    const gy=wolfveilHeight(px,az),size=.3+.68*rand(i+8);
    dummy.position.set(px,gy+size*.42,az+(rand(i+24)-.5)*1.6);
    dummy.rotation.set(rand(i+26),rand(i+31)*Math.PI*2,rand(i+36));
    dummy.scale.set(size*(.8+rand(i)*.7),size*.48,size*(.8+rand(i+2)*.8));
    dummy.updateMatrix();stone.setMatrixAt(i,dummy.matrix);
  }
  stone.name='Wolfveil_Mossy_Weathered_Edge_Boulders';
  stone.instanceMatrix.needsUpdate=true;
  stone.castShadow=true;stone.receiveShadow=true;stone.frustumCulled=false;
  world.mesh(stone);
}
function makeGrass(world,b,Y){
  // Hundreds of tapered triangles with no square cards or box-shaped tufts.
  const positions=[],uv=[],colors=[];
  const add=(x,y,z,w,h,rot,c)=>{
    const dx=Math.cos(rot)*w,dz=Math.sin(rot)*w;
    const tipX=dx*.17,tipZ=dz*.17;
    const verts=[[x-dx,y,z-dz],[x+dx,y,z+dz],[x+tipX,y+h,z+tipZ]];
    for(let i=0;i<3;i++){positions.push(...verts[i]);uv.push(i===2?.5:i, i===2?1:0);colors.push(...c);}
  };
  for(let i=0;i<720;i++){
    const t=(i+.5)/720,z=mix(b.z-b.d/2-36,b.z-b.d/2-1,t);
    const p=heroApproachAt(b,Y,z),side=i%2?1:-1;
    const offset=.62+rand(i+61)*(p.width+3.0);
    const x=p.x+side*offset;
    if(Math.abs(x-b.x)<b.w*.5+1.1 && z>b.z-b.d/2-2)continue;
    const y=offset<p.width+0.35?p.y-.035:wolfveilHeight(x,z)+.02;
    add(x,y,z,.025+rand(i+65)*.040,.18+rand(i+71)*.26,
      rand(i+75)*Math.PI*2, i%3===0?[.29,.47,.18]:[.34,.52,.22]);
  }
  const geom=new THREE.BufferGeometry();
  geom.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geom.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  geom.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  geom.computeVertexNormals();
  const mat=new THREE.MeshStandardMaterial({vertexColors:true,
    roughness:.99,side:THREE.DoubleSide,depthWrite:true});
  world.ownedMaterials.push(mat);
  const m=new THREE.Mesh(geom,mat);
  m.name='Wolfveil_Fine_Natural_Path_Grass_720';
  m.receiveShadow=true;world.mesh(m);
}
function cherry(world,x,z,seed){
  const root=wolfveilHeight(x,z);
  const trunk=world.materials.darkCedar;
  const pink=world.materials.cherryBlossom;
  const group=new THREE.Group();
  group.name='Wolfveil_Blushing_Cherry_Tree_'+seed;
  const cylinder=(a,b,r0,r1,mat)=>{
    const start=new THREE.Vector3(...a),end=new THREE.Vector3(...b);
    const mid=start.clone().add(end).multiplyScalar(.5);
    const dir=end.clone().sub(start),mesh=new THREE.Mesh(
      new THREE.CylinderGeometry(r1,r0,dir.length(),7,1),mat);
    mesh.position.copy(mid);mesh.quaternion.setFromUnitVectors(
      new THREE.Vector3(0,1,0),dir.normalize());
    mesh.castShadow=true;group.add(mesh);
  };
  cylinder([0,0,0],[.2,4.7,0],.31,.13,trunk);
  for(let i=0;i<7;i++){
    const a=i*Math.PI*2/7+seed,spread=2.6+rand(i+seed)*1.1;
    const p=[Math.cos(a)*spread,4.1+rand(i+seed+4)*1.3,Math.sin(a)*spread];
    cylinder([.15,3.1,0],p,.13,.055,trunk);
    for(let k=0;k<3;k++){
      const leaf=new THREE.Mesh(
        new THREE.IcosahedronGeometry(1,k===0?1:0),pink);
      leaf.position.set(p[0]+(k-1)*.67,p[1]+(k%2)*.47,p[2]+(k-1)*.48);
      leaf.scale.set(1.48+rand(i+k)*.33,.94,1.2);
      group.add(leaf);
    }
  }
  group.position.set(x,root,z);
  world.mesh(group);
}
function creek(world,b){
  const front=b.z-b.d/2,streamZ=front-17.5;
  const bed=makeNaturalMaterial('stone');
  world.ownedMaterials.push(bed);
  // A slow, layered current passes beneath the earthen arch. This is a
  // lightweight shader animation, not a costly fluid simulation.
  const water=new THREE.ShaderMaterial({
    transparent:true,depthWrite:false,side:THREE.DoubleSide,
    uniforms:{uTime:{value:0}},
    vertexShader:`varying vec2 vUvWater;
      void main(){vUvWater=uv;
        gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
    fragmentShader:`precision highp float;
      uniform float uTime;varying vec2 vUvWater;
      void main(){
        float ripple=sin(vUvWater.x*33.0-uTime*2.7+sin(vUvWater.y*15.0)*1.8);
        float fine=sin(vUvWater.y*58.0+uTime*1.4+vUvWater.x*12.0);
        float glint=smoothstep(.74,.98,.5+.5*ripple)*.15+
          smoothstep(.85,.99,.5+.5*fine)*.08;
        vec3 deep=vec3(.09,.30,.33),foam=vec3(.49,.77,.74);
        vec3 tint=mix(deep,foam,.25+glint);
        gl_FragColor=vec4(tint,.82);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  world.ownedMaterials.push(water);
  world.heroStreamMaterial=water;
  const waterMesh=fromGrid(3,82,(u,v)=>{
    const x=b.x-23+46*v;
    const center=streamZ+.47*Math.sin((x-b.x)*.20);
    const width=1.35+.26*Math.sin(x*.21);
    const z=center+(u-.5)*width*2;
    return {x,y:wolfveilHeight(x,z)+.15,z,u:x*.25,v:z*.25};
  },water,'Wolfveil_Shallow_Visible_Creek_Under_Earth_Arch',world);
  waterMesh.userData.navigable=false;
  for(let i=0;i<68;i++){
    const x=b.x-22+i*(44/67),z0=streamZ+.47*Math.sin((x-b.x)*.20);
    for(const side of [-1,1]){
      if(i%3!==0)continue;
      const z=z0+side*(1.65+.4*rand(i+40));
      const y=wolfveilHeight(x,z);
      const r=.23+.28*rand(i+50);
      const geom=new THREE.IcosahedronGeometry(1,0);
      const mesh=new THREE.Mesh(geom,bed);
      mesh.position.set(x,y+r*.18,z);
      mesh.rotation.y=rand(i+55)*Math.PI;
      mesh.scale.set(r*1.5,r*.62,r);
      world.mesh(mesh);
    }
  }
  return {xStart:b.x-23,xEnd:b.x+23,z:streamZ,waterMesh};
}
export function buildHeroNaturalApproach(world,b,Y){
  if(b.id!=='existing_residence_1')return null;
  if(!world.materials.approachMoss){
    world.materials.approachMoss=makeNaturalMaterial('moss');
    world.materials.approachStone=makeNaturalMaterial('stone');
    world.materials.cherryBlossom=new THREE.MeshStandardMaterial({
      color:0xe69bac,roughness:.96,side:THREE.DoubleSide});
    world.ownedMaterials.push(world.materials.approachMoss,
      world.materials.approachStone,world.materials.cherryBlossom);
  }
  const {start,end}=heroApproachAt(b,Y,b.z);
  const top=fromGrid(12,122,(u,v)=>{
    const z=mix(start,end,v),p=heroApproachAt(b,Y,z);
    const x=p.x+(u-.5)*2*p.width;
    const n=(noise(x*2.7,z*2.8)-.5)*.026;
    return {x,y:p.y-.07*Math.pow(Math.abs(2*u-1),2)+n,z,
      u:x*.72,v:z*.72};
  },world.materials.approachMoss,'Wolfveil_Walkable_Natural_Earth_Bridge_Surface',world);
  // Its stone sides drop into the hillside. Beneath the crossing stream,
  // a curved underside forms an actual arch opening instead of a filled box.
  const streamZ=b.z-b.d/2-17.5;
  for(const side of [-1,1]){
    fromGrid(1,122,(u,v)=>{
      const z=mix(start,end,v),p=heroApproachAt(b,Y,z);
      const x=p.x+side*(p.width+.02);
      const natural=wolfveilHeight(x,z)-.25;
      const distance=Math.abs(z-streamZ)/3.65;
      const arch=distance<1?Math.sqrt(1-distance*distance):0;
      const bottom=mix(natural,p.y-.56,arch);
      const y=u===1?p.y-.085:Math.min(p.y-.09,bottom);
      return {x:x+side*(u?0:.14*Math.sin(z*1.7)),y,z,u:x*.39,v:y*.32};
    },world.materials.approachStone,
      'Wolfveil_Eroded_Stone_Arch_Side_'+side,world);
  }
  // The underside follows the arch profile across the whole bridge width.
  fromGrid(6,32,(u,v)=>{
    const z=mix(streamZ-3.65,streamZ+3.65,v),p=heroApproachAt(b,Y,z);
    const arch=Math.sqrt(Math.max(0,1-Math.pow((z-streamZ)/3.65,2)));
    return {x:p.x+(u-.5)*2*p.width,
      y:mix(wolfveilHeight(p.x,z)-.24,p.y-.57,arch),
      z,u:p.x*.25+u*2,v:z*.38};
  },world.materials.approachStone,'Wolfveil_Natural_Stone_Arch_Underside',world);
  // Indoor ground surface is separate from the outdoor bridge so the
  // raycast-based player controller has a physical floor past the doorway.
  const floor=fromGrid(8,8,(u,v)=>({
    x:b.x+(u-.5)*(b.w-.95),
    y:Y+.245,
    z:b.z+(v-.5)*(b.d-.95),
    u:u*3,v:v*3,
  }),world.materials.approachStone,
    'Wolfveil_Showcase_Residence_Walkable_Interior_Floor',world);
  const stream=creek(world,b);
  addBoulders(world,b,Y);
  makeGrass(world,b,Y);
  cherry(world,b.x-14.5,b.z-4.0,2);
  cherry(world,b.x+16,b.z-8.5,5);
  cherry(world,b.x-17,b.z-19,8);
  world.walkableSurfaces??=[];
  world.walkableSurfaces.push(top,floor);
  return {approachType:'curving_mossy_earth_arch',walkable:top,
    interiorFloor:floor,creek:stream,trees:3,fineGrassBlades:720};
}
