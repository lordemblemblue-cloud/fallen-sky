import * as THREE from 'three';
import { addCompactTownPreview } from './WolfveilCompactTownPreview';
import { resolveCompactTownPreviewCollision } from './WolfveilCompactTownDesign.mjs';
import { addWolfveilMeadowPreview } from './WolfveilMeadowPreview';

/**
 * Development-only visual TERRAIN BLOCKOUT from the WS01 30-scene coordinate
 * index (draft PR #948). It is NOT surveyed terrain, game collision, or the
 * approved 30-scene map. Never import into GameWorld3D / WolfveilScene.
 *
 * The old Wolfveil world builder is deliberately NOT called in this module.
 * Scene anchors are copied from WS01's canonical local X/Z, in metres;
 * the existing Game 3D +70m market camera offset is applied only to the
 * preview group, not to every site.
 */
export const WOLFVEIL_PREVIEW_SITES = Object.freeze([
  {id:'01',name:'Southwest overview',x:0,z:-70,kind:'overview'},
  {id:'02',name:'Master plan overview',x:0,z:-70,kind:'overview'},
  {id:'03',name:'Southern approach',x:0,z:-225,kind:'gate'},
  {id:'04',name:'North terrace',x:4,z:135,kind:'temple'},
  {id:'05',name:'Western academy',x:-165,z:88,kind:'academy'},
  {id:'06',name:'Eastern river',x:115,z:30,kind:'waterfall'},
  {id:'07',name:'Bridge and river',x:100,z:-98,kind:'bridge'},
  {id:'08',name:'South Gate',x:0,z:-225,kind:'gate'},
  {id:'09',name:'Spirit fountain',x:0,z:-69,kind:'fountain'},
  {id:'10',name:'Market street',x:25,z:-55,kind:'market'},
  {id:'11',name:'Sun and Moon temple',x:4,z:220,kind:'temple'},
  {id:'12',name:'Royal citadel',x:33,z:177,kind:'citadel'},
  {id:'13',name:'Warrior academy',x:-165,z:88,kind:'academy'},
  {id:'14',name:'Cedar terraces',x:-140,z:-105,kind:'housing'},
  {id:'15',name:'Spirit grove',x:-75,z:160,kind:'grove'},
  {id:'16',name:'Eastern falls',x:132,z:166,kind:'waterfall'},
  {id:'17',name:'Southwest farmland',x:-205,z:-190,kind:'farmland'},
  {id:'18',name:'Waterfall caverns',x:163,z:155,kind:'cave'},
  {id:'19',name:'Cliff bridge pass',x:130,z:205,kind:'bridge'},
  {id:'20',name:'Wilderness gate',x:-230,z:-35,kind:'gate'},
  {id:'21',name:'Western cedar forest',x:-320,z:65,kind:'forest'},
  {id:'22',name:'Wolfstone highlands',x:-325,z:235,kind:'ridge'},
  {id:'23',name:'Bamboo valley',x:-360,z:-40,kind:'bamboo'},
  {id:'24',name:'Alpine meadow',x:-45,z:370,kind:'meadow'},
  {id:'25',name:'Southern farm road',x:-255,z:-278,kind:'farmland'},
  {id:'26',name:'Eastern wetlands',x:123,z:75,kind:'wetland'},
  {id:'27',name:'Discovery cave mouth',x:-224,z:74,kind:'cave'},
  {id:'28',name:'Western root cavern',x:-324,z:140,kind:'cave'},
  {id:'29',name:'Twin Peaks ridge',x:2,z:470,kind:'ridge'},
  {id:'30',name:'Mountain hot springs',x:-105,z:330,kind:'spring'},
]);

const hill = (x,z,cx,cz,r,amplitude) => {
  const a=(x-cx)/r, b=(z-cz)/r;
  return amplitude*Math.exp(-1.8*(a*a+b*b));
};

/** Pure illustrative terrain; Y values are NEVER treated as measured height. */
export function workstreamPreviewHeight(x,z) {
  const riverX=123+21*Math.sin((z+60)/105);
  const dx=Math.abs(x-riverX);
  let y=13+4.3*Math.sin(x*.014)*Math.cos(z*.012)+
    2.5*Math.sin(z*.034+x*.01)+1.2*Math.sin(x*.063-z*.039);
  y+=hill(x,z,-320,235,145,74)+hill(x,z,-45,370,150,57)+
    hill(x,z,2,470,130,95)+hill(x,z,-105,330,110,31)+
    hill(x,z,4,220,108,26)+hill(x,z,-324,140,105,24);
  // A deliberately broad, continuous eastern basin to stage the river.
  y-=hill(x,z,127,60,195,8);
  const riverBlend=THREE.MathUtils.smoothstep(dx,9,29);
  return THREE.MathUtils.lerp(2.4+0.3*Math.sin(z*.02),y,riverBlend);
}

const box = (group, material, x,y,z, w,h,d) => {
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material);
  mesh.position.set(x,y,z);
  mesh.castShadow=true;
  mesh.receiveShadow=true;
  group.add(mesh);
  return mesh;
};

function addStagedSite(group,site,mats) {
  if(site.kind==='overview'||site.kind==='housing'||site.kind==='market')return; // restrict actual houses to town cutoff
  const y=workstreamPreviewHeight(site.x,site.z);
  const parent=new THREE.Group();
  parent.name='WV_WIP_SITE_'+site.id+'_'+site.kind;
  parent.userData={sceneId:site.id,source:'WS01 draft coordinates',visualPlaceholder:true,
    surveyedY:false,collisionAuthority:false};
  parent.position.set(site.x,y,site.z);
  group.add(parent);
  const m=site.kind;
  if(['market','housing','academy','temple','citadel'].includes(m)){
    const w=m==='citadel'?24:m==='academy'?21:14;
    const h=m==='citadel'?19:m==='temple'?15:9;
    box(parent,mats.stone,0,0.55,0,w+7,1.1,w+7);
    box(parent,mats.plaster,0,1.1+h/2,0,w,h,w*.74);
    const roof=box(parent,mats.roof,0,h+2.7,0,w+4,2.6,w*.74+4);
    roof.rotation.z=.06;
    if(m==='citadel'||m==='temple'){
      box(parent,mats.gold,0,h+6,0,2.4,8,2.4);
      const peak=new THREE.Mesh(new THREE.ConeGeometry(5,7,4),mats.roof);
      peak.position.y=h+11;peak.rotation.y=Math.PI/4;parent.add(peak);
    }
    if(m==='market'||m==='housing'){
      for(const side of [-1,1]){
        box(parent,mats.wood,side*21,4.3,5,11,8,13);
        box(parent,mats.roof,side*21,9.7,5,13,3,15);
      }
    }
  } else if(m==='gate'){
    // The actual artist-authored Scene08 South Gate is installed separately.
    // Other unbuilt gates have only a small schematic ground ring.
    if(site.id!=='08'&&site.id!=='03'){
      box(parent,mats.stone,0,.6,0,18,1.2,8);
      for(const side of [-1,1])box(parent,mats.wood,side*7,5,0,1.8,10,1.8);
      box(parent,mats.roof,0,10,0,19,2,3);
    }
  } else if(m==='fountain'){
    const basin=new THREE.Mesh(new THREE.CylinderGeometry(8,9,1.3,24),mats.stone);
    basin.position.y=.7;parent.add(basin);
    const pool=new THREE.Mesh(new THREE.CylinderGeometry(7.1,7.1,.35,24),mats.water);
    pool.position.y=1.6;parent.add(pool);
    box(parent,mats.gold,0,4.5,0,1.7,6,1.7);
  } else if(m==='cave'){
    const rock=new THREE.Mesh(new THREE.SphereGeometry(9,14,10),mats.rock);
    rock.scale.set(2.5,1.5,1.1);rock.position.y=8;parent.add(rock);
    const opening=new THREE.Mesh(new THREE.SphereGeometry(6,14,10),mats.cave);
    opening.scale.set(1.12,1.6,.24);opening.position.set(0,7,-9.6);
    parent.add(opening);
  } else if(m==='bridge'){
    box(parent,mats.wood,0,7,0,31,1.5,6);
    for(const side of [-1,1]){
      box(parent,mats.gold,0,10,side*3.2,31,.5,.5);
      for(let x=-14;x<=14;x+=7)box(parent,mats.wood,x,9,side*3.2,.65,4,.65);
    }
  } else if(m==='farmland'){
    for(let n=0;n<6;n++){
      const patch=box(parent,n%2?mats.farm:mats.grass,(n%3-1)*13,.1,
        (Math.floor(n/3)-.5)*16,11,.25,12);
      patch.castShadow=false;
    }
    box(parent,mats.wood,0,4,0,12,8,10);
    box(parent,mats.roof,0,9,0,15,2,12);
  } else if(m==='spring'){
    const rim=new THREE.Mesh(new THREE.TorusGeometry(15,2.2,10,36),mats.stone);
    rim.rotation.x=-Math.PI/2;rim.position.y=2;parent.add(rim);
    const pool=new THREE.Mesh(new THREE.CircleGeometry(14.3,42),mats.water);
    pool.rotation.x=-Math.PI/2;pool.position.y=2.2;parent.add(pool);
    box(parent,mats.wood,-19,5,0,13,10,13);
    box(parent,mats.roof,-19,11,0,17,2,17);
  } else if(m==='waterfall'){
    const fall=new THREE.Mesh(new THREE.PlaneGeometry(10,24),mats.waterfall);
    fall.position.set(0,15,0);parent.add(fall);
    const cliff=new THREE.Mesh(new THREE.IcosahedronGeometry(12,1),mats.rock);
    cliff.scale.set(2.3,1.7,1);cliff.position.set(10,7,5);parent.add(cliff);
  } else if(m==='ridge'){
    const peak=new THREE.Mesh(new THREE.ConeGeometry(18,38,7),mats.rock);
    peak.position.y=20;parent.add(peak);
    const snowy=new THREE.Mesh(new THREE.ConeGeometry(6,11,7),mats.snow);
    snowy.position.y=40;parent.add(snowy);
  } else if(m==='grove'||m==='meadow'||m==='forest'||m==='bamboo'||m==='wetland'){
    // Vegetation zones are rendered by one shared GPU-instanced forest below.
    const marker=new THREE.Mesh(new THREE.IcosahedronGeometry(4,1),mats.moss);
    marker.position.y=2;parent.add(marker);
  }
}

function addRegionLabels(group,sites) {
  // The labels explicitly distinguish reference sites from constructed models.
  // Canvas is created only in this browser-only lazy-loaded preview, never SSR.
  if(typeof document==='undefined')return;
  for(const site of sites.filter(s=>s.kind!=='overview')){
    const canvas=document.createElement('canvas');
    canvas.width=512;canvas.height=100;
    const ctx=canvas.getContext('2d');
    if(!ctx)continue;
    ctx.fillStyle='rgba(9,23,31,.85)';
    ctx.fillRect(0,0,512,100);
    ctx.strokeStyle='#e3c283';ctx.lineWidth=4;ctx.strokeRect(2,2,508,96);
    ctx.font='bold 32px Georgia,serif';
    ctx.fillStyle='#fff0cc';
    ctx.textAlign='center';
    ctx.fillText(site.id+'  '+site.name,256,57,490);
    ctx.font='18px Arial,sans-serif';ctx.fillStyle='#a6dce5';
    ctx.fillText('WIP REFERENCE LOCATION',256,83);
    const texture=new THREE.CanvasTexture(canvas);
    texture.colorSpace=THREE.SRGBColorSpace;
    const material=new THREE.SpriteMaterial({map:texture,transparent:true,depthWrite:false});
    const sprite=new THREE.Sprite(material);
    sprite.name='WV_WIP_SITE_LABEL_'+site.id;
    sprite.position.set(site.x,workstreamPreviewHeight(site.x,site.z)+24,site.z);
    sprite.scale.set(31,6.1,1);
    group.add(sprite);
  }
}

function addVegetation(group,mats) {
  const zones=[
    [-320,65,120,54],[-360,-40,80,39],[-75,160,75,32],
    [-140,-105,60,40],[-325,235,35,53],[-45,370,65,70],
    [-224,74,45,28],[-105,330,35,30],[-255,-278,30,48],
  ];
  const trunks=[],crowns=[];
  for(let zone=0;zone<zones.length;zone++){
    const [cx,cz,n,r]=zones[zone];
    for(let i=0;i<n;i++){
      const a=(i*2.399963+zone*.9),rad=r*Math.sqrt((i+.5)/n);
      const x=cx+Math.cos(a)*rad,z=cz+Math.sin(a)*rad;
      if(Math.abs(x-(123+21*Math.sin((z+60)/105)))<23)continue;
      const y=workstreamPreviewHeight(x,z),s=.7+(i%9)/11;
      trunks.push({x,y,z,s});
      crowns.push({x,y:y+6.2*s,z,s});
    }
  }
  const trunk=new THREE.InstancedMesh(new THREE.CylinderGeometry(.4,.67,6,6),
    mats.wood,trunks.length);
  const crown=new THREE.InstancedMesh(new THREE.ConeGeometry(3.8,10,7),
    mats.pine,crowns.length);
  const dummy=new THREE.Object3D();
  trunks.forEach((t,i)=>{
    dummy.position.set(t.x,t.y+3*t.s,t.z);dummy.scale.setScalar(t.s);
    dummy.rotation.set(0,(i%10)*.63,0);dummy.updateMatrix();trunk.setMatrixAt(i,dummy.matrix);
  });
  crowns.forEach((t,i)=>{
    dummy.position.set(t.x,t.y,t.z);dummy.scale.setScalar(t.s);
    dummy.rotation.set(0,(i%12)*.53,0);dummy.updateMatrix();crown.setMatrixAt(i,dummy.matrix);
  });
  trunk.instanceMatrix.needsUpdate=true;
  crown.instanceMatrix.needsUpdate=true;
  trunk.computeBoundingSphere();crown.computeBoundingSphere();
  crown.castShadow=true;
  const fallbackTrees=new THREE.Group();
  fallbackTrees.name='WV_WIP_ProceduralTree_Fallback';
  fallbackTrees.userData={visualPlaceholder:true,replaceWhenOwnerAssetLoads:true};
  fallbackTrees.add(trunk,crown);
  group.add(fallbackTrees);
  return trunks.length;
}

function addRiver(group,mats) {
  const coordinates=[],indices=[];
  for(let i=0;i<=110;i++){
    const z=-385+i*8.1,x=123+21*Math.sin((z+60)/105);
    coordinates.push(x-9,3.1,z,x+9,3.1,z);
    if(i<110){const j=i*2;indices.push(j,j+1,j+2,j+1,j+3,j+2);}
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(coordinates,3));
  geometry.setIndex(indices);geometry.computeVertexNormals();
  const river=new THREE.Mesh(geometry,mats.water);
  river.name='WV_WIP_Eastern_River_VisualOnly';
  river.userData={visualPlaceholder:true,collisionAuthority:false};
  group.add(river);
}

function buildTerrain(group,mats) {
  const geometry=new THREE.PlaneGeometry(1100,1200,144,156);
  geometry.rotateX(-Math.PI/2);
  const positions=geometry.attributes.position;
  const colors=new Float32Array(positions.count*3);
  const dry=new THREE.Color(0x7d956a);
  const high=new THREE.Color(0x9a9c8f);
  const pine=new THREE.Color(0x54745f);
  const rocky=new THREE.Color(0xa7aba2);
  const waterbank=new THREE.Color(0x60786d);
  for(let i=0;i<positions.count;i++){
    const x=positions.getX(i),z=positions.getZ(i),y=workstreamPreviewHeight(x,z);
    positions.setY(i,y);
    const slope=THREE.MathUtils.smoothstep(y,25,95);
    const grassColor=dry.clone().lerp(pine,.4+.26*Math.sin(x*.02-z*.013));
    grassColor.lerp(high,slope*.52);
    grassColor.lerp(rocky,THREE.MathUtils.smoothstep(y,72,165)*.78);
    const riverX=123+21*Math.sin((z+60)/105);
    grassColor.lerp(waterbank,1-THREE.MathUtils.smoothstep(Math.abs(x-riverX),12,30));
    colors[i*3]=grassColor.r;
    colors[i*3+1]=grassColor.g;
    colors[i*3+2]=grassColor.b;
  }
  positions.needsUpdate=true;
  geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));
  geometry.computeVertexNormals();
  const ground=new THREE.Mesh(geometry,mats.terrain);
  ground.receiveShadow=true;
  ground.name='WV_30_Scene_Workstream_Terrain_BLOCKOUT';
  ground.userData={source:'WS01 scene anchor coordinates; synthesized Y',
    surveyed:false,nonAuthoritative:true,collisionAuthority:false};
  group.add(ground);
  // Edge skirts conceal voids when camera looks along/below the terrain rim.
  // They do not shrink or replace the existing 1100 × 1200m terrain.
  const border=[];
  const addWall=(x0,z0,x1,z1,steps)=>{
    for(let i=0;i<steps;i++){
      const a=i/steps,b=(i+1)/steps;
      const ax=x0+(x1-x0)*a,az=z0+(z1-z0)*a;
      const bx=x0+(x1-x0)*b,bz=z0+(z1-z0)*b;
      const ay=workstreamPreviewHeight(ax,az),by=workstreamPreviewHeight(bx,bz);
      border.push(ax,ay,az,bx,by,bz,ax,ay-130,az,
        bx,by,bz,bx,by-130,bz,ax,ay-130,az);
    }
  };
  addWall(-550,-600,550,-600,72);
  addWall(-550,600,550,600,72);
  addWall(-550,-600,-550,600,80);
  addWall(550,-600,550,600,80);
  const geometrySkirt=new THREE.BufferGeometry();
  geometrySkirt.setAttribute('position',new THREE.Float32BufferAttribute(border,3));
  geometrySkirt.computeVertexNormals();
  const skirt=new THREE.Mesh(geometrySkirt,mats.cliff);
  skirt.name='WV_WIP_Terrain_Edge_Skirt_No_Visible_Voids';
  skirt.userData={visualOnly:true,nonAuthoritative:true};
  group.add(skirt);
}

export function createWolfveilWorkstreamTerrainPreview(scene,{originAtMarket=true}={}) {
  if(!scene?.add)throw new TypeError('A Three.js scene is required');
  const offsetZ=originAtMarket?70:0;
  const group=new THREE.Group();
  group.name='WV_WORKSTREAM_MAP_EDITING_PREVIEW_NOT_LIVE';
  group.userData={stage:'development_site_visualization',nonAuthoritative:true,
    source:'WS01 scene index draft; Scene08 model draft',allThirtyBuilt:false};
  group.position.z=offsetZ;
  scene.add(group);
  const mats={
    terrain:new THREE.MeshStandardMaterial({vertexColors:true,roughness:.96,side:THREE.DoubleSide}),
    cliff:new THREE.MeshStandardMaterial({color:0x68776f,roughness:1,side:THREE.DoubleSide}),
    stone:new THREE.MeshStandardMaterial({color:0x89969a,roughness:.9}),
    plaster:new THREE.MeshStandardMaterial({color:0xd7d1bc,roughness:.88}),
    roof:new THREE.MeshStandardMaterial({color:0x29475a,roughness:.79}),
    wood:new THREE.MeshStandardMaterial({color:0x654536,roughness:.9}),
    gold:new THREE.MeshStandardMaterial({color:0xc6a66f,metalness:.3,roughness:.45}),
    pine:new THREE.MeshStandardMaterial({color:0x345e52,roughness:.94}),
    moss:new THREE.MeshStandardMaterial({color:0x5e866e,roughness:1}),
    rock:new THREE.MeshStandardMaterial({color:0x778a8b,roughness:1}),
    snow:new THREE.MeshStandardMaterial({color:0xd4dfdb,roughness:.8}),
    farm:new THREE.MeshStandardMaterial({color:0x8c9661,roughness:1}),
    grass:new THREE.MeshStandardMaterial({color:0x638c51,roughness:1}),
    cave:new THREE.MeshBasicMaterial({color:0x111c25}),
    water:new THREE.MeshStandardMaterial({color:0x43a6b0,roughness:.27,
      metalness:.13,side:THREE.DoubleSide,transparent:true,opacity:.86}),
    waterfall:new THREE.MeshStandardMaterial({color:0x8dd3e2,roughness:.3,
      side:THREE.DoubleSide,transparent:true,opacity:.78}),
  };
  const world={
    group,ownedMaterials:Object.values(mats),mesh(object){group.add(object);return object;},
  };
  let disposed=false;
  try {
    buildTerrain(group,mats);
    addRiver(group,mats);
    for(const site of WOLFVEIL_PREVIEW_SITES)addStagedSite(group,site,mats);
    const compactTown=addCompactTownPreview(world,workstreamPreviewHeight);
    const trees=addVegetation(group,mats);
    const meadow=addWolfveilMeadowPreview(world,workstreamPreviewHeight);
    addRegionLabels(group,WOLFVEIL_PREVIEW_SITES);
    group.updateMatrixWorld(true);
    const height=(x,z)=>{
      const localZ=z-offsetZ;
      if(!Number.isFinite(x)||!Number.isFinite(localZ)||
         Math.abs(x)>520||Math.abs(localZ)>560)return null;
      const y=workstreamPreviewHeight(x,localZ);
      return Number.isFinite(y)?y:null;
    };
    const info={
      id:'wolfveil_workstream_reference_preview',stage:'visual_reference_layout_only',
      source:'WS01 30-scene source index; estimated terrain Y, not surveyed',
      referenceSites:WOLFVEIL_PREVIEW_SITES.length,
      builtScenesVerified:0,
      groundCover:{grassClumps:meadow.clumps,flowers:meadow.flowers,proceduralTrees:trees},
      town:{buildings:Array.from({length:compactTown.structures},(_,index)=>({id:'compact-'+index})),
        houses:compactTown.houses,gateExits:compactTown.exits,
        housingBoundary:compactTown.housingBoundary},
    };
    return {
      world,info,
      worldHeight:height,
      // This reviewer controls a camera, not a server-authoritative avatar.
      resolveBuildingCollision(next,radius=.65,previous=null){
        return resolveCompactTownPreviewCollision(next,previous,radius,offsetZ);
      },
      update(dt){meadow.update(dt);return {weather:'clear'};},
      dispose() {
        if(disposed)return;disposed=true;
        const geometries=new Set(),materials=new Set(),textures=new Set();
        group.traverse(obj=>{
          if(obj.geometry)geometries.add(obj.geometry);
          if(obj.material)for(const material of Array.isArray(obj.material)?obj.material:[obj.material]){
            if(material){materials.add(material);if(material.map)textures.add(material.map);}
          }
        });
        world.ownedMaterials.forEach(material=>materials.add(material));
        geometries.forEach(resource=>resource.dispose());
        textures.forEach(resource=>resource.dispose());
        materials.forEach(resource=>resource.dispose());
        group.parent?.remove(group);
      },
    };
  } catch(error) {
    // If construction fails, make sure the partially built scene does not
    // remain mounted. The caller surfaces an error instead of starting Play.
    group.parent?.remove(group);
    throw error;
  }
}
