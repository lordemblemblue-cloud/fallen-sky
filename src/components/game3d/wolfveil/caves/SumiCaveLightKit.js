// The owner's sumi-e cave kit, made light enough to play in.
//
// The owner's builder code (SumiCorridorKit.js) is used as it is. Three things
// are changed from outside, without editing it:
//   1. Brick walls are painted panels (SumiWallPaint.mjs) instead of one solid
//      shape per brick, joint and seam. That is 99% of the kit's weight.
//   2. Round shapes get fewer sides, and bevels are left off.
//   3. A built piece is baked: every still mesh of one material becomes one
//      mesh, so a piece is a handful of draw calls. Whatever the owner's file
//      animates (water, rings, waterfalls, floating relics, the secret door)
//      is left alone and listed, so the game can keep it moving.
//
// Three.js is handed in, as in the town port; nothing here imports it.
import {createSumiCorridorKit} from './SumiCorridorKit.js';
import {SUMI_WALL_PERIOD,paintSumiWall,sumiWallPictureSize,sumiWallPanels} from './SumiWallPaint.mjs';
import {mergeSumiTriangles} from './SumiCaveBake.mjs';

/** The most sides a round shape may have. */
export const SUMI_LEAN_LIMITS=Object.freeze({cylinderSides:10,sphereAround:10,sphereDown:7,torusTube:6,
  torusAround:32,rockDetail:1,ringSides:24,circleSides:24,planeCuts:12});
// The painted panel stands this far in front of the wall line, just proud of
// the stone behind it (the owner's bricks reach about as far).
const PANEL_INSET=.145,CORE_BACK=.27,CORE_FRONT=.14;

/** Three.js with lighter round shapes, no bevels and no clear-coat shader. */
export function leanSumiThree(THREE,limits=SUMI_LEAN_LIMITS){
  const cap=(value,most,fallback)=>Math.max(3,Math.min(most,Math.floor(value??fallback)));
  return {...THREE,
    CylinderGeometry:class extends THREE.CylinderGeometry{
      constructor(top,bottom,height,sides,rings,...rest){super(top,bottom,height,cap(sides,limits.cylinderSides,32),1,...rest);}},
    ConeGeometry:class extends THREE.ConeGeometry{
      constructor(radius,height,sides,rings,...rest){super(radius,height,cap(sides,limits.cylinderSides,32),1,...rest);}},
    SphereGeometry:class extends THREE.SphereGeometry{
      constructor(radius,around,down,...rest){super(radius,cap(around,limits.sphereAround,32),cap(down,limits.sphereDown,16),...rest);}},
    TorusGeometry:class extends THREE.TorusGeometry{
      constructor(radius,tube,tubeSides,around,...rest){
        super(radius,tube,cap(tubeSides,limits.torusTube,12),cap(around,limits.torusAround,48),...rest);}},
    DodecahedronGeometry:class extends THREE.DodecahedronGeometry{
      constructor(radius,detail=0){super(radius,Math.min(detail,limits.rockDetail));}},
    OctahedronGeometry:class extends THREE.OctahedronGeometry{
      constructor(radius,detail=0){super(radius,Math.min(detail,limits.rockDetail));}},
    RingGeometry:class extends THREE.RingGeometry{
      constructor(inner,outer,sides,rings,...rest){super(inner,outer,cap(sides,limits.ringSides,32),1,...rest);}},
    CircleGeometry:class extends THREE.CircleGeometry{
      constructor(radius,sides,...rest){super(radius,cap(sides,limits.circleSides,32),...rest);}},
    PlaneGeometry:class extends THREE.PlaneGeometry{
      constructor(width,height,across=1,down=1){
        super(width,height,Math.max(1,Math.min(limits.planeCuts,Math.floor(across))),Math.max(1,Math.min(limits.planeCuts,Math.floor(down))));}},
    ExtrudeGeometry:class extends THREE.ExtrudeGeometry{
      constructor(shape,options={}){super(shape,{...options,bevelEnabled:false,curveSegments:Math.min(options.curveSegments??12,6)});}},
    // The clear-coat finish costs a second lighting pass on every floor tile.
    MeshPhysicalMaterial:class extends THREE.MeshStandardMaterial{
      constructor(options={}){
        // eslint-disable-next-line no-unused-vars
        const {clearcoat,clearcoatRoughness,transmission,thickness,ior,reflectivity,sheen,...plain}=options;
        super(plain);}},
  };
}

/**
 * The owner's kit with light walls and lean shapes.
 * @returns the kit (see SumiCorridorKit.js), plus `kit.light`:
 *   {walls: how many walls were painted, wallMeters, pictures: Map of the wall
 *   pictures made, wallMaterial(rows, wallHeight)}
 */
export function createLightSumiCorridorKit({THREE,document,limits=SUMI_LEAN_LIMITS}={}){
  if(!THREE)throw new Error('createLightSumiCorridorKit: Three.js is required');
  const lean=leanSumiThree(THREE,limits);
  const kit=createSumiCorridorKit({THREE:lean,document});
  const light={walls:0,wallMeters:0,pictures:new Map(),wallMaterial};
  kit.light=light;

  function wallMaterial(rows,wallHeight){
    const key=rows+':'+wallHeight;
    if(!light.pictures.has(key)){
      const picture=paintSumiWall({...sumiWallPictureSize(wallHeight),rows,wallHeight,seed:909+rows});
      const map=new THREE.DataTexture(picture.data,picture.width,picture.height);
      map.colorSpace=THREE.SRGBColorSpace;
      map.wrapS=THREE.RepeatWrapping;map.wrapT=THREE.ClampToEdgeWrapping;
      map.magFilter=THREE.LinearFilter;map.minFilter=THREE.LinearMipmapLinearFilter;
      map.generateMipmaps=true;map.anisotropy=4;map.needsUpdate=true;
      const material=new THREE.MeshStandardMaterial({map,roughness:.86,metalness:.04});
      material.name='Sumi_PaintedBrickWall_'+rows+'rows_'+wallHeight+'m';
      light.pictures.set(key,{material,map,width:picture.width,height:picture.height});
    }
    return light.pictures.get(key).material;
  }

  // The owner's wall, part for part, with one painted panel where the bricks,
  // joints and seams were: stone behind, the lintel over a doorway, the crown.
  kit.populateArchitecturalBrickWall=function(targetGroup,config){
    const {axis='z',fixedCoord=0,normalDir=1,spanMin=-12,spanMax=12,wallHeight=3.9,rows=9,
      openings=[],includeCrown=true}=config;
    const along=axis==='z';
    const place=(mesh,across,y,s)=>{
      if(along)mesh.position.set(fixedCoord+normalDir*across,y,s);else mesh.position.set(s,y,fixedCoord+normalDir*across);
      targetGroup.add(mesh);return mesh;
    };
    const box=(thick,height,length)=>along?new lean.BoxGeometry(thick,height,length):new lean.BoxGeometry(length,height,thick);
    const panels=sumiWallPanels({spanMin,spanMax,wallHeight,openings});
    const thick=CORE_BACK+CORE_FRONT,centre=(CORE_FRONT-CORE_BACK)/2;
    const position=[],normal=[],uv=[];
    for(const panel of panels){
      // Stone behind the picture; its ends are the doorway jambs.
      const height=panel.y1-panel.y0-(panel.y0?.0:.14);
      place(new lean.Mesh(box(thick,height,panel.s1-panel.s0),this.brickMaterials[1]),centre,
        panel.y0+(panel.y0?0:.08)+height/2,(panel.s0+panel.s1)/2);
      const corner=(s,y)=>along?[fixedCoord+normalDir*PANEL_INSET,y,s]:[s,y,fixedCoord+normalDir*PANEL_INSET];
      const a=corner(panel.s0,panel.y0),b=corner(panel.s1,panel.y0),c=corner(panel.s1,panel.y1),d=corner(panel.s0,panel.y1);
      // Wound so the picture faces into the room, whichever way the wall runs.
      const facesIn=along?normalDir<0:normalDir>0;
      const quad=facesIn?[a,b,c,a,c,d]:[a,c,b,a,d,c];
      const marks=facesIn?[[panel.s0,panel.y0],[panel.s1,panel.y0],[panel.s1,panel.y1],[panel.s0,panel.y0],[panel.s1,panel.y1],[panel.s0,panel.y1]]
        :[[panel.s0,panel.y0],[panel.s1,panel.y1],[panel.s1,panel.y0],[panel.s0,panel.y0],[panel.s0,panel.y1],[panel.s1,panel.y1]];
      quad.forEach((p,i)=>{
        position.push(p[0],p[1],p[2]);
        if(along)normal.push(normalDir,0,0);else normal.push(0,0,normalDir);
        uv.push(marks[i][0]/SUMI_WALL_PERIOD,marks[i][1]/wallHeight);
      });
    }
    if(position.length){
      const geometry=new lean.BufferGeometry();
      geometry.setAttribute('position',new lean.Float32BufferAttribute(position,3));
      geometry.setAttribute('normal',new lean.Float32BufferAttribute(normal,3));
      geometry.setAttribute('uv',new lean.Float32BufferAttribute(uv,2));
      const mesh=new lean.Mesh(geometry,wallMaterial(rows,wallHeight));
      mesh.name='Sumi_PaintedWall';
      targetGroup.add(mesh);
    }
    if(includeCrown){
      const base=wallHeight-.28,middle=(spanMin+spanMax)/2,length=spanMax-spanMin;
      const tier=(thickness,height,up,inward,material)=>place(new lean.Mesh(box(thickness,height,length),material),inward,base+up,middle);
      tier(.44,.12,0,.08,this.brickMaterials[1]);
      tier(.48,.06,.09,.10,this.goldMaterial);
      tier(.56,.15,.19,.14,this.brickMaterials[0]);
      tier(.58,.04,.28,.15,this.silverMaterial);
    }
    light.walls++;light.wallMeters+=spanMax-spanMin;
  };
  return kit;
}

// Gold and silver are near-mirrors in the owner's file. Underground, with a
// few lamps and nothing to reflect, a mirror is black: let them hold colour.
function settleMaterial(material,settled){
  if(!material||settled.has(material))return;
  settled.add(material);
  if(material.bumpMap){material.bumpMap=null;}
  if(material.metalness>.5){material.metalness=.35;material.roughness=Math.max(material.roughness??0,.42);}
  material.needsUpdate=true;
}

/**
 * Bake a piece the kit has just built (not yet placed in the world).
 * Still meshes of one material are merged into one; lights are taken out and
 * listed; animated parts stay as they are.
 * @returns {{object, lights:Array<{x,y,z,color,intensity,distance}>, moving:object[],
 *   stats:{meshesBefore,trianglesBefore,drawCalls,triangles,movingMeshes,lights}}}
 */
export function bakeSumiPiece(kit,group,{THREE,name=group.name||'Sumi_Piece'}={}){
  group.updateMatrixWorld(true);
  const moving=new Set();
  for(const ring of kit.gyroRings||[])if(ring.group)moving.add(ring.group);
  for(const fall of kit.waterfallColumns||[])for(const part of [fall.upper,fall.lower,fall.mist])if(part)moving.add(part);
  for(const relic of kit.magicObjects||[])if(relic.mesh)moving.add(relic.mesh);
  for(const water of [kit.secretDoor,kit.cavernWater,kit.sanctuaryWater,...(kit.waterMeshes||[])])if(water)moving.add(water);
  const moves=object=>{for(let o=object;o;o=o.parent)if(moving.has(o))return true;return false;};

  const lights=[],still=new Map(),stats={meshesBefore:0,trianglesBefore:0,drawCalls:0,triangles:0,movingMeshes:0,lights:0};
  const trianglesOf=geometry=>(geometry.index?geometry.index.count:geometry.attributes.position.count)/3;
  group.traverse(object=>{
    if(object.isLight){
      lights.push({x:object.matrixWorld.elements[12],y:object.matrixWorld.elements[13],z:object.matrixWorld.elements[14],
        color:object.color?.getHex?.()??0xffffff,intensity:object.intensity,distance:object.distance});
      return;
    }
    if(!object.isMesh||!object.geometry?.attributes?.position)return;
    stats.meshesBefore++;stats.trianglesBefore+=trianglesOf(object.geometry);
    if(moves(object)){stats.movingMeshes++;stats.drawCalls++;stats.triangles+=trianglesOf(object.geometry);return;}
    // The clear resin poured over the floor is a second, see-through floor.
    if(object.material===kit.resinCoatMaterial)return;
    if(!still.has(object.material))still.set(object.material,[]);
    still.get(object.material).push(object);
  });
  // Take the lights and the merged meshes out of the piece.
  const remove=[];
  group.traverse(object=>{if(object.isLight||(object.isMesh&&!moves(object)))remove.push(object);});
  for(const object of remove)object.parent?.remove(object);

  const settled=new Set();
  let batch=0;
  for(const [material,meshes] of still){
    const merged=mergeSumiTriangles(meshes.map(mesh=>({
      position:mesh.geometry.attributes.position.array,normal:mesh.geometry.attributes.normal?.array,
      uv:mesh.geometry.attributes.uv?.array,index:mesh.geometry.index?.array,matrix:mesh.matrixWorld.elements})));
    for(const mesh of meshes)mesh.geometry.dispose?.();
    if(!merged.triangles)continue;
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.BufferAttribute(merged.position,3));
    geometry.setAttribute('normal',new THREE.BufferAttribute(merged.normal,3));
    geometry.setAttribute('uv',new THREE.BufferAttribute(merged.uv,2));
    geometry.computeBoundingBox();geometry.computeBoundingSphere();
    settleMaterial(material,settled);
    const mesh=new THREE.Mesh(geometry,material);
    mesh.name=name+'_'+(material.name||'Material')+'_'+(++batch);
    mesh.castShadow=false;mesh.receiveShadow=false;
    mesh.userData={sumiBaked:true,sources:meshes.length};
    group.add(mesh);
    stats.drawCalls++;stats.triangles+=merged.triangles;
  }
  group.traverse(object=>{
    if(object.isMesh&&moves(object)){settleMaterial(object.material,settled);object.castShadow=false;object.receiveShadow=false;}
  });
  stats.lights=lights.length;
  return {object:group,lights,moving:[...moving].filter(object=>{for(let o=object;o;o=o.parent)if(o===group)return true;return false;}),stats};
}
