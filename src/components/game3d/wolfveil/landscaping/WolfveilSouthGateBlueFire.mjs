// Game 3D-only, unmounted south-gate blue-fire route candidate.
// All coordinates are canonical LOCAL Wolfveil metres. Parent world.group
// applies its existing +70m Z shift ONCE; never shift these points here.
// Decorative instances never change the BVH, terrain height or game authority.
export const WOLFVEIL_SOUTH_GATE_FIRE_DESIGN=Object.freeze({
  gate:Object.freeze({x:0,z:-225}),
  path:Object.freeze({startZ:-231,endZ:-358,grassHalfWidth:3.35,flameEdgeX:5.2}),
  clearing:Object.freeze({x:0,z:-391,radius:33,combatClearRadius:17}),
  revealSeconds:9,
  role:'visuals_only_not_server_spawn_authority',
});

const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
function random(seed){let s=seed>>>0;return()=>{s=(s+0x6D2B79F5)>>>0;let t=s;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};}
function approved(x,z,squares){return squares.some(s=>s&&
  Number.isFinite(s.minX)&&Number.isFinite(s.minZ)&&
  s.maxX-s.minX===5&&s.maxZ-s.minZ===5&&
  x>=s.minX&&x<s.maxX&&z>=s.minZ&&z<s.maxZ);}

/** Return candidate decorative roots only inside explicitly approved exact 5m cells.
 * heightAt(x,z) must sample the canonical visible, physical terrain mesh;
 * clearAt(x,z,kind) must check live routes, trees, structures, river,
 * collision, slope and any square-owner exclusion. No fallback assumptions.
 */
export function planWolfveilSouthGateBlueFire({
  approvedSquares=[],heightAt,clearAt,seed=0x28bc11,
}={}){
  if(!Array.isArray(approvedSquares)||typeof heightAt!=='function'||typeof clearAt!=='function')
    throw Error('Blue-fire route requires approved 5m cells and real height/clearance providers');
  const d=WOLFVEIL_SOUTH_GATE_FIRE_DESIGN,rand=random(seed),flames=[],grass=[];
  const sample=(x,z,kind,travel)=>{
    if(!approved(x,z,approvedSquares)||!clearAt(x,z,kind))return;
    const y=heightAt(x,z);
    if(!Number.isFinite(y))return;
    const spec={x,y,z,travel:clamp(travel,0,1),size:0.72+rand()*0.58,phase:rand()*6.28318};
    (kind==='flame'?flames:grass).push(spec);
  };
  // Two close-set flame bands on each shoulder form a continuous flowing edge.
  // The 6.7m central grass corridor remains free of flames and new colliders.
  const span=d.path.startZ-d.path.endZ;
  for(let z=d.path.startZ;z>=d.path.endZ;z-=1.3){
    const t=(d.path.startZ-z)/span;
    for(const side of [-1,1])for(const band of [0,0.65]){
      const x=side*(d.path.flameEdgeX+band+0.12*Math.sin(z*.08+side));
      sample(x,z+0.1*(rand()-.5),'flame',t*.83);
    }
    // Low, straight grass blades with a shader-driven wind tip. Do not
    // draw a second floor or touch original path/terrain materials.
    for(let x=-3.0;x<=3.0;x+=0.52){
      sample(x+(rand()-.5)*.25,z+(rand()-.5)*.45,'grass',t);
    }
  }
  // Arena flame boundary: open north entry links to the flame-lined walk.
  // Keep the central 17m encounter apron unobstructed by added scenery.
  const c=d.clearing;
  for(let i=0;i<210;i++){
    const a=-Math.PI+(i/209)*Math.PI*2;
    if(Math.abs(a)<.15)continue; // deliberate entrance, never a fire wall
    const x=c.x+Math.sin(a)*(c.radius+.25*Math.sin(i*.3));
    const z=c.z+Math.cos(a)*(c.radius+.25*Math.sin(i*.3));
    sample(x,z,'flame',.84+.16*(Math.abs(a)/Math.PI));
  }
  // Gentle meadow movement around the clearing; keep the middle low/clear.
  for(let i=0;i<950;i++){
    const a=rand()*Math.PI*2,r=c.combatClearRadius+1+Math.sqrt(rand())*(c.radius-c.combatClearRadius-3);
    sample(c.x+Math.cos(a)*r,c.z+Math.sin(a)*r,'grass',1);
  }
  return Object.freeze({flames,grass,encounterAnchor:Object.freeze({
    x:c.x,z:c.z,radius:c.combatClearRadius,authority:'server_required_not_installed',
  }),worldZOffsetApplied:false});
}

/** Build a staged, opt-in THREE visual. No scene attachment or gameplay spawn.
 * The caller must attach `group` to the existing Wolfveil `world.group`, NOT
 * the unshifted scene root, and drive `update` with real wind and elapsed time.
 */
export function stageWolfveilSouthGateBlueFire(THREE,plan,{game3D=false}={}){
  if(!game3D||!THREE?.InstancedMesh||!Array.isArray(plan?.flames)||!Array.isArray(plan?.grass))
    throw Error('Staging only supports a validated Game 3D blue-fire plan');
  const group=new THREE.Group();group.name='WS14_SouthGateBlueFire_Unmounted';
  let disposed=false;
  const resources=[];
  const build=(items,{fire=false,core=false}={})=>{
    if(!items.length)return null;
    const height=fire?1.35:.32;
    const geo=new THREE.ConeGeometry(fire?(core?.17:.38):.025,height,fire?5:3,fire?3:1,true);
    const travel=new Float32Array(items.map(p=>p.travel));
    geo.setAttribute('aTravel',new THREE.InstancedBufferAttribute(travel,1));
    const mat=new THREE.ShaderMaterial({
      uniforms:{uTime:{value:0},uWind:{value:.35},uReveal:{value:0}},
      vertexShader:`attribute float aTravel;uniform float uTime,uWind,uReveal;
        varying float vH,vTravel,vPulse;
        void main(){vec3 p=position;float h=clamp(position.y/${height.toFixed(2)}+.5,0.,1.);
          float ph=instanceMatrix[3].x*.17+instanceMatrix[3].z*.13;
          p.x+=h*h*(.12*uWind+${fire?'.11':'.045'}*sin(uTime*${fire?'5.4':'1.8'}+ph));
          p.z+=h*h*.05*cos(uTime*2.6+ph);
          vH=h;vTravel=aTravel;vPulse=.77+.23*sin(uTime*5.1+ph);
          gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(p,1.);}`,
      fragmentShader:fire?`
        uniform float uReveal;varying float vH,vTravel,vPulse;
        void main(){float reveal=1.-smoothstep(uReveal-.035,uReveal+.015,vTravel);
          float a=reveal*vPulse*(1.-smoothstep(.62,1.,vH))*(.67+.33*smoothstep(0.,.4,vH));
          vec3 col=mix(vec3(.015,.22,.99),vec3(${core?'.64,.96,1.':'.11,.66,1.'}),vH);
          gl_FragColor=vec4(col,a*${core?'.7':'.32'});}`:`
        varying float vH,vTravel,vPulse;
        void main(){vec3 col=mix(vec3(.14,.27,.09),vec3(.38,.63,.23),vH);
          gl_FragColor=vec4(col,1.);}`,
      transparent:fire,depthWrite:!fire,
      blending:fire?THREE.AdditiveBlending:THREE.NormalBlending,
      side:THREE.DoubleSide,
    });
    const mesh=new THREE.InstancedMesh(geo,mat,items.length);
    mesh.name=fire?(core?'BlueFireCore':'BlueFireEdge'):'WindBlownShortGrass';
    mesh.castShadow=false;mesh.receiveShadow=false;mesh.frustumCulled=false;
    mesh.raycast=()=>{}; // decorative visual never intercepts targeting
    const obj=new THREE.Object3D();
    for(let i=0;i<items.length;i++){
      const p=items[i],s=fire?p.size:p.size*.7;
      obj.position.set(p.x,p.y+height*s*.5+.045,p.z);
      obj.scale.set(s,s,s);obj.rotation.y=p.phase;obj.updateMatrix();
      mesh.setMatrixAt(i,obj.matrix);
    }
    mesh.instanceMatrix.needsUpdate=true;group.add(mesh);
    resources.push({geo,mat});return mesh;
  };
  const outer=build(plan.flames,{fire:true});
  const inner=build(plan.flames,{fire:true,core:true});
  const grass=build(plan.grass);
  return {
    group,counts:{flames:plan.flames.length,grass:plan.grass.length,draws:[outer,inner,grass].filter(Boolean).length},
    update({elapsed=0,wind=.35,reveal=0}={}){
      if(disposed)return;
      for(const r of resources){r.mat.uniforms.uTime.value=Math.max(0,elapsed);
        r.mat.uniforms.uWind.value=clamp(wind,-1,1);
        r.mat.uniforms.uReveal.value=clamp(reveal,0,1);}
    },
    dispose(){if(disposed)return;disposed=true;group.removeFromParent();
      for(const {geo,mat} of resources){geo.dispose();mat.dispose();}},
  };
}
