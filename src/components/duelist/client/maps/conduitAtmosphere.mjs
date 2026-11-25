// Map-owned, decorative animation only. The host supplies elapsed seconds and
// existing Three.js materials. No independent loop, physics or network state.
export const ATMOSPHERE_BUDGETS=Object.freeze({
  low:Object.freeze({fans:8,pulses:8,steam:0,hz:12}),
  medium:Object.freeze({fans:8,pulses:12,steam:16,hz:20}),
  high:Object.freeze({fans:8,pulses:16,steam:32,hz:30})
});
const TAU=Math.PI*2;
const wrap=x=>((x%1)+1)%1;
export function conduitAtmosphereBudget(quality){return ATMOSPHERE_BUDGETS[quality]??ATMOSPHERE_BUDGETS.medium;}
export function createConduitAtmospherePlan(cfg){
  const fans=[];
  for(const b of cfg.buildings){
    const s=Math.sin(b.angle),c=Math.cos(b.angle);
    for(const [tier,x,y,z] of [['upper',6.6,cfg.yT1Bldg+7.85,5.23],['basement',6.8,cfg.yT0+3.7,6.43]]){
      fans.push({id:b.id+'-'+tier,tier,x:38*s+x*c+z*s,y,z:38*c-x*s+z*c,angle:b.angle,phase:fans.length*.137});
    }
  }
  return {fans,emitters:Array.from({length:4},(_,i)=>{
    const a=i*TAU/4+Math.PI/4;
    return {x:Math.sin(a)*5.9,y:16.8,z:Math.cos(a)*5.9,angle:a};
  })};
}
export function fanAngle(f,t){return TAU*wrap(f.phase+t*.48);}
export function pulseSample(i,count,t){
  const lane=i%3,ordinal=Math.floor(i/3),n=Math.ceil((count-lane)/3);
  const a=TAU*wrap(ordinal/n+t*(lane===1?-.072:lane===0?.04:.052));
  const r=[42.5,4.2,5.85][lane],y=[17.5,16.7,20.7][lane];
  return {x:Math.sin(a)*r,y,z:Math.cos(a)*r,angle:a};
}
export function steamSample(i,emitters,t){
  const e=emitters[i%emitters.length],phase=wrap(i*.61803398875+t*.24);
  const drift=.38*Math.sin(phase*TAU+i);
  return {x:e.x+Math.cos(e.angle)*drift,y:e.y+phase*2.1,z:e.z-Math.sin(e.angle)*drift,scale:(.05+.24*Math.sin(Math.PI*phase))*Math.sin(Math.PI*phase)};
}
export function createConduitAtmosphere(root,upper,basement,THREE,MAT,cfg,{quality='medium',enabled=true}={}){
  const budget=conduitAtmosphereBudget(quality),plan=createConduitAtmospherePlan(cfg);
  const dummy=new THREE.Object3D();
  const ownedGeometries=new Set(),ownedMaterials=new Set(),meshes=[],groups=[],fanBatches=[];
  function group(parent,name){
    const g=new THREE.Group();g.name=name;parent.add(g);groups.push(g);return g;
  }
  const up=group(upper,'Conduit Upper Fan Effects'),down=group(basement,'Conduit Basement Fan Effects'),over=group(root,'Conduit Overhead Effects');
  function batch(parent,name,geometry,material,count){
    ownedGeometries.add(geometry);
    const m=new THREE.InstancedMesh(geometry,material,count);m.name=name;
    m.castShadow=false;m.receiveShadow=false;parent.add(m);meshes.push(m);return m;
  }
  const ringGeo=new THREE.TorusGeometry(.52,.045,5,16),bladeGeo=new THREE.BoxGeometry(1,1,1);
  for(const [tier,parent] of [['upper',up],['basement',down]]){
    const fans=plan.fans.filter(f=>f.tier===tier);
    const housings=batch(parent,'Conduit Fan Housings '+tier,ringGeo,MAT.brushedSteel,fans.length);
    const blades=batch(parent,'Conduit Fan Blades '+tier,bladeGeo,MAT.gunmetal,fans.length*4);
    // Fixed conservative bounds: rotating blade tips stay inside each housing.
    blades.frustumCulled=false;
    fans.forEach((f,i)=>{
      dummy.position.set(f.x,f.y,f.z);dummy.rotation.set(0,f.angle,0);dummy.scale.set(1,1,1);dummy.updateMatrix();housings.setMatrixAt(i,dummy.matrix);
    });
    housings.instanceMatrix.needsUpdate=true;housings.computeBoundingSphere();
    fanBatches.push({fans,blades});
  }
  const pulses=batch(over,'Conduit Moving Conduit Indicators',new THREE.BoxGeometry(1,1,1),MAT.cyanGlow,budget.pulses);
  pulses.frustumCulled=false;
  let steam=null;
  if(budget.steam){
    const mat=new THREE.MeshBasicMaterial({color:0xc8e2e8,transparent:true,opacity:.10,depthWrite:false});
    ownedMaterials.add(mat);
    steam=batch(over,'Conduit Subtle Overhead Steam',new THREE.IcosahedronGeometry(1,0),mat,budget.steam);
    steam.frustumCulled=false;
  }
  let active=!!enabled,disposed=false,lastTick=null;
  groups.forEach(g=>{g.visible=active;});
  function draw(t){
    for(const {fans,blades} of fanBatches){
      fans.forEach((f,i)=>{
        for(let k=0;k<4;k++){
          const a=fanAngle(f,t)+k*Math.PI/2,localX=Math.cos(a)*.25,localY=Math.sin(a)*.25;
          dummy.position.set(f.x+Math.cos(f.angle)*localX-Math.sin(f.angle)*.018,f.y+localY,f.z-Math.sin(f.angle)*localX-Math.cos(f.angle)*.018);
          dummy.rotation.set(0,f.angle,a,'YXZ');dummy.scale.set(.38,.105,.028);dummy.updateMatrix();
          blades.setMatrixAt(i*4+k,dummy.matrix);
        }
      });
      blades.instanceMatrix.needsUpdate=true;
    }
    for(let i=0;i<budget.pulses;i++){
      const p=pulseSample(i,budget.pulses,t);
      dummy.position.set(p.x,p.y,p.z);dummy.rotation.set(0,p.angle,0);dummy.scale.set(.25,.17,.17);dummy.updateMatrix();pulses.setMatrixAt(i,dummy.matrix);
    }
    pulses.instanceMatrix.needsUpdate=true;
    if(steam){
      for(let i=0;i<budget.steam;i++){
        const p=steamSample(i,plan.emitters,t);
        dummy.position.set(p.x,p.y,p.z);dummy.rotation.set(0,0,0);dummy.scale.setScalar(Math.max(.001,p.scale));dummy.updateMatrix();steam.setMatrixAt(i,dummy.matrix);
      }
      steam.instanceMatrix.needsUpdate=true;
    }
  }
  draw(0);
  return {budget,plan,groups,meshes,
    get enabled(){return active&&!disposed;},
    setEnabled(value){if(disposed)return;active=!!value;groups.forEach(g=>{g.visible=active;});lastTick=null;},
    update(elapsed){if(disposed||!active||!Number.isFinite(elapsed)||elapsed<0)return false;
      const tick=Math.floor(elapsed*budget.hz);if(tick===lastTick)return false;lastTick=tick;draw(tick/budget.hz);return true;
    },
    dispose(){if(disposed)return;disposed=true;groups.forEach(g=>g.removeFromParent());meshes.forEach(m=>m.dispose?.());ownedGeometries.forEach(g=>g.dispose());ownedMaterials.forEach(m=>m.dispose());}
  };
}
