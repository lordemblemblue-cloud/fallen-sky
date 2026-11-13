/**
 * Game 3D Wolfveil: the world materials themselves carry Sumi-e pigment.
 * No geometry, collision, heightfield, character model, extra mesh or
 * detached glowing VFX is created. Game 1's renderer stays unchanged.
 */
const FAMILY_STRENGTH=Object.freeze({
  bark:.78,foliage:.52,grass:.69,stone:.37,
  terrain:.25,architecture:.19,material:.16,
});
const SUPPORTED=m=>Boolean(m?.isMeshStandardMaterial||
  m?.isMeshPhysicalMaterial||m?.isMeshLambertMaterial||m?.isMeshPhongMaterial);
const EXCLUDE=/water|river|foam|spray|falls|mist|sky|cloud|portal|vfx|particle|aura|glow|fire|light|glass/i;
const GRASS=/grass|blade|meadow_grass|turf|reed/i;
const BARK=/trunk|branch|bark|bamboo.*stem|timber.*root/i;
const LEAVES=/canopy|leaf|leaves|bough|shrub|fern|pine|cedar|maple|sakura|blossom|elm|bamboo|flower|needle|understory/i;
const STONE=/rock|stone|boulder|basalt|granite|moss|cliff|quarry|pebble/i;
const GROUND=/terrain|ground|earth|(?<!b)ridge|mountain|horizon|skirt|hillside|bank|soil/i;
const BUILT=/road|path|bridge|floor|wall|roof|stair|palace|temple|house|building|pillar|wood|door|rail|terrace|arch/i;

export function wolfveilLivingInkFamily(mesh){
  if(!mesh?.isMesh&&!mesh?.isInstancedMesh)return null;
  const material=mesh.material;
  if(!material)return null;
  const label=String(mesh.name||'')+' '+(Array.isArray(material)
    ?material.map(m=>m?.name||'').join(' '):material.name||'');
  // The named RiverFlow grass and understory are PLANTS, not the water sheet.
  // Classify them before excluding the actual river/foam shaders.
  if(GRASS.test(label))return 'grass';
  if(BARK.test(label))return 'bark';
  if(LEAVES.test(label))return 'foliage';
  if(EXCLUDE.test(label))return null;
  if(STONE.test(label))return 'stone';
  if(GROUND.test(label))return 'terrain';
  if(BUILT.test(label))return 'architecture';
  return 'material';
}

const VERTEX_COMMON=`
varying vec3 vLivingSumiWorld;
varying vec3 vLivingSumiWorldNormal;
varying float vLivingSumiTip;`;
const PROJECT=`
#ifdef USE_INSTANCING
  vec4 livingInkWorld=modelMatrix*instanceMatrix*vec4(transformed,1.0);
  vLivingSumiWorldNormal=normalize(mat3(modelMatrix)*mat3(instanceMatrix)*objectNormal);
#else
  vec4 livingInkWorld=modelMatrix*vec4(transformed,1.0);
  vLivingSumiWorldNormal=normalize(mat3(modelMatrix)*objectNormal);
#endif
vLivingSumiWorld=livingInkWorld.xyz;
vLivingSumiTip=position.y;
#include <project_vertex>`;
const FRAGMENT_COMMON=`
varying vec3 vLivingSumiWorld;
varying vec3 vLivingSumiWorldNormal;
varying float vLivingSumiTip;
uniform float uLivingSumiClock,uLivingSumiLevel;
uniform vec2 uLivingSumiWind;
float livingInkHash(vec2 p){
  return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);
}
float livingInkStroke(vec3 p){
  vec2 wind=normalize(uLivingSumiWind+vec2(.001));
  float drift=uLivingSumiClock*.045;
  float grain=sin(p.y*4.2+p.x*2.1+sin(p.z*.65+p.y*.83)*2.6
                  +dot(p.xz,wind)*.8-drift);
  float finer=sin(p.y*11.9+p.z*3.8+sin(p.x*2.8)*1.5-drift*.46);
  float dry=sin(p.x*2.45+p.z*3.7+sin(p.y*1.55)*1.4);
  float stroke=smoothstep(.49,.90,.5+.5*grain);
  stroke*=.57+.43*smoothstep(.2,.8,.5+.5*finer);
  return clamp(stroke*(.70+.30*(.5+.5*dry)),0.,1.);
}
float livingInkDryBrush(vec3 p){
  float noise=livingInkHash(floor((p.xz*vec2(1.14,1.63)+p.y*.31)*2.));
  return smoothstep(.50,.93,noise);
}`;
const makeFragment=kind=>{
  const strength=(FAMILY_STRENGTH[kind]??FAMILY_STRENGTH.material).toFixed(2);
  const bark=kind==='bark';
  const organic=bark||kind==='foliage'||kind==='grass';
  let code=`#include <color_fragment>
{
  vec3 basePigment=diffuseColor.rgb;
  float pressure=livingInkStroke(vLivingSumiWorld);
  float granulation=livingInkDryBrush(vLivingSumiWorld);
  float painted=smoothstep(.18,.87,pressure*(.84+.16*granulation));
  // These darker/diluted tones are made from the material's OWN albedo.
  vec3 darkInk=basePigment*(.66+.16*granulation);
  vec3 dilutedInk=min(vec3(1.),basePigment*(1.09+.17*painted));
  vec3 materialInk=mix(darkInk,dilutedInk,painted);
`;
  if(bark)code+=`
  // A branch becomes ivory/coral brushwork WITHIN its bark, never an aura.
  float heartwood=pow(painted,4.0)*(.4+.6*granulation);
  materialInk=mix(materialInk,mix(basePigment*1.23,vec3(.89,.67,.62),.24),
                  heartwood*.42);
`;
  if(organic)code+=`
  // Incomplete painted tips read as tiny missing ink fibres.
  float tip=smoothstep(.23,.89,vLivingSumiTip);
  materialInk=mix(materialInk,basePigment*(.72+.28*painted),
                  tip*.12*granulation);
`;
  code+=`
  // Grazing Sumi-e brush contour wash along silhouettes & folded rock edges
  vec3 viewVec=normalize(cameraPosition-vLivingSumiWorld);
  float rimContour=pow(1.0-clamp(abs(dot(normalize(vLivingSumiWorldNormal),viewVec)),0.0,1.0),3.2);
  materialInk=mix(materialInk,basePigment*0.52,rimContour*0.34*(0.55+0.45*granulation));
  diffuseColor.rgb=mix(basePigment,materialInk,
        clamp(uLivingSumiLevel*${strength}*(.56+.44*pressure),0.,.88));
}`;
  return code;
};

/**
 * Wrap an environment mesh's existing material shader without replacing its
 * wind/texture hooks. New streamed tiles reuse the shared already-decorated
 * material; asynchronously added GLBs are discovered at bounded intervals.
 */
export function createWolfveilLivingSumiEMaterials({roots=[],level=3}={}){
  const original=new Map(),treated=new WeakSet();
  const uniforms={
    clock:{value:0},level:{value:Math.max(0,Math.min(1,Number(level||0)/4))},
    wind:{value:{x:.6,y:.8}},
  };
  const rootList=(Array.isArray(roots)?roots:[roots]).filter(Boolean);
  let age=0,scannedAt=-99,disposed=false;
  function decorate(material,kind){
    if(!SUPPORTED(material)||material.transparent||material.depthWrite===false||
       treated.has(material))return false;
    const ownHook=Object.prototype.hasOwnProperty.call(material,'onBeforeCompile');
    const ownKey=Object.prototype.hasOwnProperty.call(material,'customProgramCacheKey');
    const priorHook=material.onBeforeCompile;
    const priorKey=material.customProgramCacheKey;
    const hook=function(shader,renderer){
      if(typeof priorHook==='function')priorHook.call(this,shader,renderer);
      if(!shader?.vertexShader?.includes('#include <project_vertex>')||
         !shader?.vertexShader?.includes('#include <common>')||
         !shader?.fragmentShader?.includes('#include <color_fragment>')||
         !shader?.fragmentShader?.includes('#include <common>'))return;
      shader.uniforms.uLivingSumiClock=uniforms.clock;
      shader.uniforms.uLivingSumiLevel=uniforms.level;
      shader.uniforms.uLivingSumiWind=uniforms.wind;
      shader.vertexShader=shader.vertexShader
        .replace('#include <common>','#include <common>'+VERTEX_COMMON)
        .replace('#include <project_vertex>',PROJECT);
      shader.fragmentShader=shader.fragmentShader
        .replace('#include <common>','#include <common>'+FRAGMENT_COMMON)
        .replace('#include <color_fragment>',makeFragment(kind));
    };
    const cacheKey=function(){
      const old=typeof priorKey==='function'?priorKey.call(this):'';
      return String(old)+'|wolfveil-living-sumie-v1-'+kind;
    };
    original.set(material,{ownHook,ownKey,priorHook,priorKey,hook,cacheKey,kind});
    treated.add(material);
    material.onBeforeCompile=hook;
    material.customProgramCacheKey=cacheKey;
    material.needsUpdate=true;
    return true;
  }
  function refresh(){
    if(disposed)return 0;
    let changed=0;
    for(const root of rootList)root?.traverse?.(mesh=>{
      const kind=wolfveilLivingInkFamily(mesh);
      if(!kind)return;
      for(const mat of Array.isArray(mesh.material)?mesh.material:[mesh.material])
        if(decorate(mat,kind))changed++;
    });
    return changed;
  }
  refresh();
  return {
    refresh,
    addRoot(root){
      if(root&&!rootList.includes(root)){rootList.push(root);refresh();}
    },
    setLevel(next){
      if(Number.isFinite(next))uniforms.level.value=Math.max(0,Math.min(1,next/4));
    },
    update(dt,weather={}){
      if(disposed)return;
      age+=Number.isFinite(dt)?Math.max(0,Math.min(dt,.1)):0;
      uniforms.clock.value=age;
      const bearing={N:0,NE:45,E:90,SE:135,S:180,SW:225,W:270,NW:315}[weather?.windDir]??225;
      uniforms.wind.value.x=-Math.sin(bearing*Math.PI/180);
      uniforms.wind.value.y=-Math.cos(bearing*Math.PI/180);
      if(age-scannedAt>=3.5){scannedAt=age;refresh();}
    },
    getStats(){
      const families={};
      for(const entry of original.values())families[entry.kind]=(families[entry.kind]||0)+1;
      return {materials:original.size,families,level:uniforms.level.value,roots:rootList.length};
    },
    dispose(){
      if(disposed)return;
      disposed=true;
      for(const [material,entry] of original){
        if(material.onBeforeCompile!==entry.hook)continue;
        if(entry.ownHook)material.onBeforeCompile=entry.priorHook;
        else delete material.onBeforeCompile;
        if(entry.ownKey)material.customProgramCacheKey=entry.priorKey;
        else delete material.customProgramCacheKey;
        material.needsUpdate=true;
      }
      original.clear();
    },
  };
}