// ATOM X EVE — Game 3D capital city concept-board layout (iteration 01).
// Local world coordinates: +Z north, +X east, 1 unit = 1 meter.
// Original concept: terraced Greek/Roman/American/Sumi-e capital.
// Isolated from Wolfveil, live player collisions, saves, Game 1 and Game 2.
// Every footprint is provisional graybox data, NOT a claim of gameplay readiness.
export const CAPITAL_CITY_DISTRICTS = Object.freeze([
  {id:'summit',name:'Summit District',role:'main_story',style:'capitol_temple',x:0,z:305,y:102,radius:78},
  {id:'imperial',name:'Imperial District',role:'quest_npc',style:'roman_core',x:0,z:164,y:74,radius:98},
  {id:'civic',name:'Civic District',role:'crafting_services',style:'american_civic',x:-121,z:16,y:46,radius:91},
  {id:'cultural',name:'Cultural District',role:'academy',style:'greek_academy',x:125,z:27,y:48,radius:91},
  {id:'residential',name:'Residential District',role:'player_housing_visual_only',style:'mixed_housing',x:-142,z:-155,y:24,radius:101},
  {id:'harbor',name:'Harbor District',role:'market_trade',style:'trade_entry',x:112,z:-246,y:8,radius:110},
].map(d=>Object.freeze(d)));

// Top-down connections from the reference board. Connections that change
// elevation are architectural bridge/ramp graybox, not validated traversal.
export const CAPITAL_CITY_ROUTES = Object.freeze([
  {id:'harbor_civic',from:'harbor',to:'civic',width:9,kind:'primary'},
  {id:'civic_imperial',from:'civic',to:'imperial',width:10,kind:'primary'},
  {id:'imperial_summit',from:'imperial',to:'summit',width:12,kind:'ceremonial'},
  {id:'civic_cultural',from:'civic',to:'cultural',width:7,kind:'bridge'},
  {id:'residential_civic',from:'residential',to:'civic',width:6,kind:'residential'},
  {id:'harbor_residential',from:'harbor',to:'residential',width:7,kind:'bridge'},
  {id:'cultural_imperial',from:'cultural',to:'imperial',width:7,kind:'academy'},
].map(r=>Object.freeze(r)));

// Reusable architectural types; later authored GLB assets can replace these
// markers without changing district / route contracts.
export const CAPITAL_CITY_MODULAR_KIT = Object.freeze([
  'terrace_platform','retaining_wall','column','colonnade','arch',
  'pediment','dome','bridge_deck','stair','aqueduct','banner',
  'balustrade','planter','tree','waterfall','fountain',
]);

export const CAPITAL_CITY_BUILDINGS = Object.freeze([
  {id:'capitol',district:'summit',label:'Capitol / Temple',dx:0,dz:12,w:34,d:29,h:29,kind:'dome'},
  {id:'summit_colonnade',district:'summit',label:'Summit Colonnade',dx:0,dz:-36,w:46,d:11,h:13,kind:'colonnade'},
  {id:'imperial_hall',district:'imperial',label:'Imperial Hall',dx:0,dz:19,w:42,d:28,h:20,kind:'pediment'},
  {id:'imperial_forum',district:'imperial',label:'Roman Forum',dx:-47,dz:-28,w:24,d:18,h:13,kind:'colonnade'},
  {id:'civic_hall',district:'civic',label:'Civic Hall',dx:-12,dz:17,w:35,d:27,h:18,kind:'pediment'},
  {id:'crafting',district:'civic',label:'Crafting Quarter',dx:39,dz:-24,w:22,d:18,h:11,kind:'workshop'},
  {id:'academy',district:'cultural',label:'Academy',dx:0,dz:20,w:36,d:26,h:18,kind:'colonnade'},
  {id:'archive',district:'cultural',label:'Library / Archive',dx:-37,dz:-22,w:22,d:20,h:13,kind:'pediment'},
  {id:'residence_west',district:'residential',label:'West Residence',dx:-36,dz:17,w:22,d:18,h:11,kind:'residence'},
  {id:'residence_east',district:'residential',label:'East Residence',dx:32,dz:15,w:21,d:19,h:11,kind:'residence'},
  {id:'housing_plots',district:'residential',label:'Visual Housing Plots',dx:0,dz:-38,w:52,d:24,h:1,kind:'plots'},
  {id:'trade_hall',district:'harbor',label:'Harbor Trade Hall',dx:0,dz:14,w:45,d:30,h:17,kind:'pediment'},
  {id:'entry_gate',district:'harbor',label:'Harbor Entry Gate',dx:0,dz:-57,w:34,d:14,h:14,kind:'arch'},
].map(b=>Object.freeze(b)));

const districtById = new Map(CAPITAL_CITY_DISTRICTS.map(d=>[d.id,d]));

export function getCapitalCityDistrict(id) {
  return districtById.get(id) || null;
}

export function findCapitalCityDistrict(x,z) {
  if(!Number.isFinite(x)||!Number.isFinite(z))return null;
  const matches=CAPITAL_CITY_DISTRICTS.filter(d=>Math.hypot(x-d.x,z-d.z)<=d.radius);
  // A higher terrace wins where circular district envelopes overlap.
  return matches.sort((a,b)=>b.y-a.y)[0] || null;
}

export function planCapitalCityBlockout() {
  const districts=CAPITAL_CITY_DISTRICTS.map(d=>({...d}));
  const roads=CAPITAL_CITY_ROUTES.map(r=>{
    const a=getCapitalCityDistrict(r.from),b=getCapitalCityDistrict(r.to);
    return {...r,fromPoint:[a.x,a.y+1.8,a.z],toPoint:[b.x,b.y+1.8,b.z],
      lengthMeters:Math.hypot(b.x-a.x,b.z-a.z)};
  });
  const buildings=CAPITAL_CITY_BUILDINGS.map(b=>{
    const district=getCapitalCityDistrict(b.district);
    return {...b,x:district.x+b.dx,y:district.y+1.8,z:district.z+b.dz};
  });
  return {id:'axe_capital_city_blockout_01',stage:'graybox_only',
    districts,roads,buildings,modularKit:[...CAPITAL_CITY_MODULAR_KIT],
    gameplayEnabled:false,collisionsEnabled:false,claimableHousing:false};
}

export function validateCapitalCityLayout() {
  const failures=[];
  const allIds=new Set();
  for(const d of CAPITAL_CITY_DISTRICTS) {
    if(allIds.has(d.id))failures.push('duplicate district: '+d.id);
    allIds.add(d.id);
    if(!Number.isFinite(d.x)||!Number.isFinite(d.z)||d.y<0||d.radius<=0)
      failures.push('invalid district dimensions: '+d.id);
  }
  const routeIds=new Set();
  for(const r of CAPITAL_CITY_ROUTES) {
    if(routeIds.has(r.id))failures.push('duplicate route: '+r.id);
    routeIds.add(r.id);
    if(!getCapitalCityDistrict(r.from)||!getCapitalCityDistrict(r.to)||r.from===r.to||r.width<=0)
      failures.push('invalid route: '+r.id);
  }
  const buildingIds=new Set();
  for(const b of CAPITAL_CITY_BUILDINGS) {
    if(buildingIds.has(b.id))failures.push('duplicate building: '+b.id);
    buildingIds.add(b.id);
    const d=getCapitalCityDistrict(b.district);
    if(!d||b.w<=0||b.d<=0||b.h<=0||Math.hypot(b.dx,b.dz)+Math.hypot(b.w,b.d)/2>d.radius+2)
      failures.push('building outside district: '+b.id);
  }
  const reached=new Set(['harbor']);
  let changed=true;
  while(changed) {
    changed=false;
    for(const r of CAPITAL_CITY_ROUTES) {
      if(reached.has(r.from)&&!reached.has(r.to)){reached.add(r.to);changed=true;}
      if(reached.has(r.to)&&!reached.has(r.from)){reached.add(r.from);changed=true;}
    }
  }
  for(const d of CAPITAL_CITY_DISTRICTS)if(!reached.has(d.id))failures.push('disconnected district: '+d.id);
  return {ok:failures.length===0,failures};
}
