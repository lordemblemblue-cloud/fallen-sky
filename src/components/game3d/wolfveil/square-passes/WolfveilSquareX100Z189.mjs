// AXE-LAND-WS06. ONE canonical Wolfveil Play editor tile (5m), source-only.
// World Z = authored/local Z + 70 exactly once; never bake it into objects twice.
// Shared runtime, terrain, collider, water, global shaders and trees remain untouched.
export const WOLFVEIL_SQUARE_X100_Z189 = Object.freeze({
  id: 'X100-Z189', lane: 'LAND-WS06',
  local: Object.freeze({minX:-50,maxX:-45,minZ:395,maxZ:400}),
  world: Object.freeze({minX:-50,maxX:-45,minZ:465,maxZ:470}),
  zOffset:70, sizeMeters:5,
});

const GRASS = Object.freeze({
  kind:'upright-grass', geometry:'individual-tapered-3d-blades',
  colors:Object.freeze([0x465d32,0x57783d,0x70854a,0x425e38]),
  roughness:.91, metalness:0, emissive:0,
  maxHeight:.22, minHeight:.09,
});
const STONE = Object.freeze({
  kind:'weathered-stone', geometry:'irregular-low-profile-weathered-3d-stone',
  colors:Object.freeze([0x666761,0x77796d,0x8a897d]),
  roughness:.96, metalness:0, emissive:0,
  maxHeight:.16, minHeight:.035,
});
const MOSS = Object.freeze({
  kind:'moss-fern', geometry:'layered-physical-leaf-and-moss',
  colors:Object.freeze([0x3d7953,0x57783d,0x70854a]),
  roughness:.94, metalness:0, emissive:0,
  maxHeight:.24, minHeight:.09,
});
const kinds = Object.freeze({'upright-grass':GRASS,'weathered-stone':STONE,'moss-fern':MOSS});
export const WOLFVEIL_X100_Z189_ART = Object.freeze({
  id:'wolfveil-existing-pbr-sumie-v1',
  source:'docs/game3d/WOLFVEIL_STRUCTURAL_REALISM_STANDARD.md',
  materialDirection:'docs/game3d/WOLFVEIL_LIVING_SUMI_E_MATERIAL_DIRECTION_20261108.md',
  grass:GRASS, stone:STONE, moss:MOSS,
  noBillboardCrosses:true, noFloatingAuras:true,
  wind:'fixed-root-deform-tips', newTreeTrunks:0,
  treePolicy:'reuse-server-matched-anchors-and-existing-blue-cyan-owner-tree-pbr',
  preserveExistingTreeUVAndTexture:true,
  // The current owner FBX is a *candidate*, not proof of correct physical art.
  treeRegistry:'WOLFVEIL_UPLOADED_LANDSCAPE_ASSETS.tree',
});

const finite=Number.isFinite;
const sq=WOLFVEIL_SQUARE_X100_Z189;
const inside=(x,z,r)=>finite(x)&&finite(z)&&finite(r)&&r>=0&&
  x-r>=sq.local.minX&&x+r<sq.local.maxX&&
  z-r>=sq.local.minZ&&z+r<sq.local.maxZ;
function seeded(seed) {
  let s=seed>>>0;
  return ()=>{
    s=(s+0x6D2B79F5)>>>0;
    let t=Math.imul(s^(s>>>15),s|1);
    t^=t+Math.imul(t^(t>>>7),t|61);
    return ((t^(t>>>14))>>>0)/4294967296;
  };
}
function materialFor(kind) {return kinds[kind]??null;}

// Pure source-level assertion only; it CANNOT certify GLB, real GPU rendering,
// authentic terrain samples, server collision, weather or a multiplayer client.
export function auditWolfveilSquareX100Z189(plan) {
  const problems=[];
  if(!plan||!Array.isArray(plan.placements))
    return Object.freeze({passed:false,checked:0,problems:Object.freeze(['missing-plan'])});
  const ids=new Set();
  for(const p of plan.placements) {
    const style=materialFor(p?.kind);
    if(!style){problems.push('unapproved-kind:'+(p?.id??'unknown'));continue;}
    if(ids.has(p.id))problems.push('duplicate-id:'+p.id);
    ids.add(p.id);
    if(!inside(p.x,p.z,p.radius)||!finite(p.y)||p.baseY!==p.y||
       p.worldX!==p.x||p.worldZ!==p.z+sq.zOffset||
       !finite(p.slope)||p.slope<0||p.slope>.48)
      problems.push('bounds-or-surface:'+p.id);
    if(!finite(p.height)||p.height<style.minHeight||p.height>style.maxHeight||
       p.geometry!==style.geometry||!style.colors.includes(p.color)||
       p.roughness!==style.roughness||p.metalness!==0||p.emissive!==0||
       p.billboardCross!==false||p.detachedAura!==false||
       p.rootFixed!==true||p.visualOnly!==true||p.collidable!==false||
       p.assetStyleId!==WOLFVEIL_X100_Z189_ART.id)
      problems.push('art-material-or-physics:'+p.id);
  }
  return Object.freeze({passed:problems.length===0,checked:plan.placements.length,
    problems:Object.freeze(problems),scope:'source-only-not-play-certified'});
}

/**
 * Prepare bounded, low-profile *existing-style* ground-cover in ONE tile.
 * heightAt must sample the *displayed terrain triangles*, not only an analytic
 * height formula. All callbacks use LOCAL coordinates. treeAnchors must be the
 * authoritative existing trunks in the same local frame; never plant new ones.
 * Evidence flags are intentionally explicit: callers cannot casually bypass
 * absent scene/surface/forest data with default empty values.
 */
export function planWolfveilSquareX100Z189({
  heightAt,clearOf,routeClearance,riverDistance,treeAnchors,
  visibleTriangleSurface=false,authoritativeTreeAnchors=false,
  seed=0x100189,maxSlope=.48,
}={}) {
  if(![heightAt,clearOf,routeClearance,riverDistance].every(f=>typeof f==='function')||
     !Array.isArray(treeAnchors)||
     !treeAnchors.every(t=>t&&finite(t.x)&&finite(t.z)&&finite(t.radius)&&t.radius>=0)||
     visibleTriangleSurface!==true||authoritativeTreeAnchors!==true||
     !Number.isInteger(seed)||!finite(maxSlope)||maxSlope<=0||maxSlope>.48)
    throw new TypeError('X100-Z189 requires validated visible terrain and existing trunk-clearance inputs');

  const rng=seeded(seed),placements=[],rejected={surface:0,slope:0,clearance:0,tree:0,boundary:0};
  const accents=Object.freeze([
    {kind:'weathered-stone',x:-49.18,z:398.83,radius:.24,height:.13,color:0},
    {kind:'weathered-stone',x:-45.87,z:396.15,radius:.19,height:.10,color:1},
    {kind:'moss-fern',x:-48.67,z:399.04,radius:.17,height:.18,color:0},
    {kind:'moss-fern',x:-46.51,z:397.25,radius:.16,height:.14,color:1},
  ]);
  function sample(x,z) {try {const v=heightAt(x,z);return finite(v)?v:null;}catch{return null;}}
  // Canonical wolfveilRouteClearance returns +Infinity for no nearby route.
  // Treat that *one documented sentinel* as safe; all bad/unknown measurements
  // (NaN, -Infinity, non-number), and unbounded river distances fail closed.
  function clearance(f,allowNoNearbyRoute,...args) {
    try {
      const v=f(...args);
      return finite(v)||(allowNoNearbyRoute&&v===Infinity)?v:null;
    } catch {return null;}
  }
  function attempt(kind,x,z,radius,height,colorIndex,yaw) {
    if(!inside(x,z,radius)){rejected.boundary++;return;}
    const y=sample(x,z),e=.125;
    // Terrain normal estimated in the same source frame as visible triangles.
    const xm=sample(x-e,z),xp=sample(x+e,z),zm=sample(x,z-e),zp=sample(x,z+e);
    if([y,xm,xp,zm,zp].some(v=>v===null)){rejected.surface++;return;}
    const slope=Math.hypot((xp-xm)/(2*e),(zp-zm)/(2*e));
    if(!finite(slope)||slope>maxSlope){rejected.slope++;return;}
    let clear=false;
    try {clear=clearOf({x,z},radius+.16)===true;}catch{clear=false;}
    const route=clearance(routeClearance,true,x,z);
    const river=clearance(riverDistance,false,x,z);
    // Existing route-clearance is measured OUTSIDE the route edge.
    // River guard retains broad spare bank clearance for water/shore variation.
    if(!clear||route===null||river===null||route<radius+1.35||river<19.5+radius){
      rejected.clearance++;return;
    }
    if(treeAnchors.some(t=>Math.hypot(x-t.x,z-t.z)<radius+t.radius+.50)){
      rejected.tree++;return;
    }
    const mat=materialFor(kind);
    if(!mat||height<mat.minHeight||height>mat.maxHeight)return;
    const shade=colorIndex%mat.colors.length;
    placements.push(Object.freeze({id:sq.id+'-'+kind+'-'+(placements.length+1),
      kind,x,y,z,worldX:x,worldZ:z+sq.zOffset,baseY:y,slope,
      radius,height,yaw,geometry:mat.geometry,color:mat.colors[shade],
      roughness:mat.roughness,metalness:0,emissive:0,
      billboardCross:false,detachedAura:false,rootFixed:true,
      visualOnly:true,collidable:false,assetStyleId:WOLFVEIL_X100_Z189_ART.id,
    }));
  }
  // 15x15 staggered short-root groupings instead of crossed billboard cards.
  // Existing Game3D instancing/wind geometry is the intended render path;
  // zero new material instances, trunk colliders, or new imported asset URLs.
  for(let row=0;row<15;row++)for(let col=0;col<15;col++){
    if(rng()<.08)continue;
    const x=sq.local.minX+.40+col*.29+(rng()-.5)*.07;
    const z=sq.local.minZ+.40+row*.29+(rng()-.5)*.07;
    if(accents.some(d=>Math.hypot(x-d.x,z-d.z)<d.radius+.17))continue;
    const height=.10+rng()*.11;
    const yaw=(rng()-.5)*.25 + Math.sin(x*.13+z*.18)*.15;
    attempt('upright-grass',x,z,.065,height,Math.floor(rng()*GRASS.colors.length),yaw);
  }
  for(const a of accents)attempt(a.kind,a.x,a.z,a.radius,a.height,a.color,(rng()-.5)*.8);
  const plan=Object.freeze({id:sq.id,square:sq,seed,
    placements:Object.freeze(placements),rejected:Object.freeze(rejected),
    geometrySource:'existing-game3d-3d-blade-instancing',
    changesTerrain:false,changesServerCollision:false,newTreeTrunks:0,
    rendererMounted:false,realPlayEvidence:false,
  });
  return Object.freeze({...plan,sourceAudit:auditWolfveilSquareX100Z189(plan)});
}
