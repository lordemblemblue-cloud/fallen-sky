// Conduit lighting: fixed-size light pool, local focus and tier inspection.
// No renderer ownership, timers, shadows on point lights or gameplay collision.
import * as THREE from 'three';

export const CONDUIT_LIGHT_BUDGETS = Object.freeze({ low: 8, medium: 12, high: 16 });
const PROFILES = ['all','t0','t1','t2','crown'];

export function conduitLightPlan(cfg) {
  const points = [];
  const polar = (r,a,y) => [Math.sin(a)*r,y,Math.cos(a)*r];
  const add = (id,tier,position,color,intensity,range,overview=false) =>
    points.push({id,tier,position,color,intensity,range,overview});
  // Broad neutral illumination in each room; color identity comes from the fixtures.
  cfg.buildings.forEach(b => {
    const neutral = b.id==='medbay' ? 0xe5fff2 : b.id==='reactor' ? 0xe4efff : 0xffecd9;
    add(b.id+'-ground','t1',polar(36.5,b.angle,cfg.yT1Bldg+3.4),neutral,85,17,true);
    add(b.id+'-upper','t2',polar(34.0,b.angle,cfg.yT2+3.0),neutral,72,18,true);
    add(b.id+'-basement','t0',polar(37.0,b.angle,cfg.yT0+3.5),0xffe2bd,68,13);
    add(b.id+'-basement-link','t0',polar(30.0,b.angle,cfg.yT0+3.5),0xffd8ab,52,12);
  });
  cfg.cardinals.forEach((a,i) => {
    add('tunnel-'+i,'t0',polar(21,a,cfg.yT0+3.4),0xffddb6,72,16,true);
    add('inner-tunnel-'+i,'t0',polar(8,a,cfg.yT0+3.3),0xffe6cc,52,12);
    add('stair-'+i,'t1',polar(18,a,cfg.yT1Pit+3.4),0xfff0db,76,17,true);
    add('ring-'+i,'t2',polar(29.5,a,cfg.yT2+3.5),0xe1f1ff,72,18);
    add('perimeter-'+i,'t0',polar(cfg.t0PerimeterR,a+Math.PI/8,cfg.yT0+3.6),0xffd5a3,55,12);
  });
  add('undercroft-core','t0',[0,cfg.yT0+3.35,0],0xe9f5ff,60,15);
  add('courtyard-center','t1',[0,cfg.yT1Pit+3.6,0],0xf0f5ff,65,19);
  add('crown-rim','crown',[0,cfg.yCrown+3.8,0],0xe6f4ff,54,15);
  return points;
}

export function selectConduitLights(plan,budget,profile='all',focus=null) {
  if (!PROFILES.includes(profile)) return [];
  const eligible=plan.filter(p=>profile==='all'||p.tier===profile);
  if (focus && [focus.x,focus.y,focus.z].every(Number.isFinite)) {
    const score=p=>Math.hypot(p.position[0]-focus.x,(p.position[1]-focus.y)*2.2,p.position[2]-focus.z);
    return eligible.slice().sort((a,b)=>score(a)-score(b)||a.id.localeCompare(b.id)).slice(0,budget);
  }
  if(profile!=='all')return eligible.slice(0,budget);
  // Stable overview, no camera-dependent light switching unless explicitly requested.
  // Interleave opposite quadrants at low quality, preserving coverage of all three floors.
  const byTier=['t0','t1','t2'].map(tier=>eligible.filter(p=>p.tier===tier&&p.overview));
  const order=[0,2,1,3,4,6,5,7];
  const selected=[];
  for(const i of order)for(const group of byTier)if(group[i])selected.push(group[i]);
  for(const p of eligible)if(!selected.includes(p))selected.push(p);
  return selected.slice(0,budget);
}

export function createConduitLighting(root,cfg,{quality='medium',enabled=true}={}) {
  const budget=CONDUIT_LIGHT_BUDGETS[quality]??CONDUIT_LIGHT_BUDGETS.medium;
  const group=new THREE.Group();group.name='Conduit Lighting';root.add(group);
  const hemi=new THREE.HemisphereLight(0xe3efff,0x92949b,1.05);
  const fill=new THREE.AmbientLight(0xffffff,0.48);
  group.add(hemi,fill);
  const pool=Array.from({length:budget},(_,i)=>{
    const light=new THREE.PointLight(0xffffff,0,1,2);
    light.name='Conduit Light Slot '+i; light.castShadow=false;group.add(light);return light;
  });
  // Keep the source below the suspended reactor rather than inside its solid housing.
  const crown=new THREE.SpotLight(0xe2f3ff,260,24,Math.PI*.30,.55,2);
  crown.name='Conduit Crown Key';crown.position.set(0,13.2,0);crown.target.position.set(0,cfg.yCrown,0);
  crown.castShadow=quality==='high';crown.shadow.mapSize.set(512,512);
  group.add(crown,crown.target);
  const plan=conduitLightPlan(cfg);
  let profile='all', focus=null, signature='', selected=[];
  group.visible=enabled;
  function refresh(){
    const next=selectConduitLights(plan,budget,profile,focus);
    const key=next.map(p=>p.id).join('|');
    if(key!==signature){
      signature=key;selected=next;
      pool.forEach((l,i)=>{const p=selected[i];
        if(!p){l.intensity=0;return;}
        l.color.setHex(p.color);l.position.set(...p.position);l.intensity=p.intensity;l.distance=p.range;
      });
    }
    crown.intensity=profile==='all'||profile==='crown'||profile==='t2'?260:0;
  }
  refresh();
  return {
    budget,plan,
    get activeIds(){return selected.map(p=>p.id);},
    setProfile(p){if(!PROFILES.includes(p))return false;profile=p;refresh();return true;},
    setEnabled(value){group.visible=Boolean(value);},
    // Focus is a map-local position. The production host may opt in after visual tuning.
    // Overview is restored with null; no renderer or animation loop is created here.
    setFocus(position){focus=position&&[position.x,position.y,position.z].every(Number.isFinite)?
      {x:position.x,y:position.y,z:position.z}:null;refresh();}
  };
}
