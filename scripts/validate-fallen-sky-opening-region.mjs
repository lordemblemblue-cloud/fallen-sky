// Offline unsurveyed topology validation; no runtime activation.
export function validateOpeningRegionDraft(d){
  const errors=[];
  const fail=s=>errors.push(s);
  if(!d||typeof d!=="object"||Array.isArray(d))return {ok:false,errors:["Invalid manifest"]};
  if(d.schemaVersion!==1||d.regionId!=="WOLFVEIL_OPENING_DRAFT"||d.reality!=="PRESERVED"||d.enabled!==false||d.status!=="UNSURVEYED_DRAFT")fail("Must remain disabled unsurveyed preserved draft");
  const required=["M01_SPAWN","M01_ROOT_BEND","M01_RIVER_BEND","M01_BOULDER","M01_MERCHANT","M01_SKY_WINDOW","M01_FORK","M01_HOMEWARD_LOOP","M01_STREAMSIDE_LOOP","M01_UPPER_VISTA","M01_STREAM_PATH","M01_CLEARING_EDGE","M01_MOON_AZIMUTH","M01_FRAGMENT_TRAJECTORY","M02_APPROACH","M02_PERIMETER_N","M02_PERIMETER_S","M02_FRAGMENT_VIEW","M02_WOLF_VIEW","M02_PROTECT_SAFE","M02_OUTER_LOOKOUT","M02_RETREAT","M02_GODDESS","M02_FRAGMENT","M02_WOLF","M02_SHADOW","M02_BARRIER_ARC","M02_CLUE_SOIL","M02_CLUE_TWIG","M02_CLEAR_SKY","M03_ARENA_START"];
  if(!Array.isArray(d.nodes)||!Array.isArray(d.edges))return {ok:false,errors:[...errors,"Invalid graph"]};
  const byId=new Map(), graph=new Map(), edgeKeys=new Set();
  for(const n of d.nodes){
    if(!n||!required.includes(n.id)||byId.has(n.id)||!["walk","landmark","sky","actor","hazard","effect","clue","handoff"].includes(n.kind)||n.transform!==null){fail("Invalid or duplicate unsurveyed anchor");continue;}
    byId.set(n.id,n);graph.set(n.id,new Set());
  }
  for(const id of required)if(!byId.has(id))fail("Missing "+id);
  for(const e of d.edges){
    if(!e||e.from===e.to||byId.get(e.from)?.kind!=="walk"||byId.get(e.to)?.kind!=="walk"||e.bidirectional!==true||e.mode!=="WALK"||e.status!=="PROPOSED_UNSURVEYED"){fail("Invalid walk edge");continue;}
    const key=[e.from,e.to].sort().join("|");
    if(edgeKeys.has(key))fail("Duplicate edge");
    edgeKeys.add(key);graph.get(e.from).add(e.to);graph.get(e.to).add(e.from);
  }
  const reachable=(from,to,blocked=[])=>{
    const deny=new Set(blocked), seen=new Set(), queue=[from];
    while(queue.length){const v=queue.shift();if(deny.has(v)||seen.has(v)||!graph.has(v))continue;if(v===to)return true;seen.add(v);for(const x of graph.get(v))queue.push(x);}
    return false;
  };
  const edge=(a,b)=>graph.get(a)?.has(b);
  for(const [a,b] of [["M01_SPAWN","M01_ROOT_BEND"],["M01_RIVER_BEND","M01_MERCHANT"],["M01_MERCHANT","M01_SKY_WINDOW"],["M01_SKY_WINDOW","M01_FORK"],["M01_FORK","M01_HOMEWARD_LOOP"],["M01_FORK","M01_UPPER_VISTA"],["M01_FORK","M01_STREAM_PATH"],["M01_UPPER_VISTA","M01_CLEARING_EDGE"],["M01_STREAM_PATH","M01_CLEARING_EDGE"],["M01_CLEARING_EDGE","M02_APPROACH"],["M02_APPROACH","M02_PERIMETER_N"],["M02_APPROACH","M02_PERIMETER_S"],["M02_PERIMETER_N","M02_FRAGMENT_VIEW"],["M02_PERIMETER_S","M02_WOLF_VIEW"],["M02_RETREAT","M01_CLEARING_EDGE"]])if(!edge(a,b))fail("Missing source route "+a+" -> "+b);
  for(const n of byId.values())if(n.kind==="walk"&&!reachable("M01_SPAWN",n.id))fail("Unreachable "+n.id);
  if(reachable("M01_SPAWN","M01_CLEARING_EDGE",["M01_MERCHANT"])||reachable("M01_SPAWN","M01_CLEARING_EDGE",["M01_SKY_WINDOW"]))fail("Bypasses required cue anchors");
  if(!reachable("M01_FORK","M01_CLEARING_EDGE",["M01_UPPER_VISTA"])||!reachable("M01_FORK","M01_CLEARING_EDGE",["M01_STREAM_PATH"]))fail("Missing independent ridge routes");
  for(const id of ["M02_PROTECT_SAFE","M02_OUTER_LOOKOUT","M02_WOLF_VIEW","M02_FRAGMENT_VIEW"])if(!reachable(id,"M02_RETREAT"))fail("Missing retreat from "+id);
  const sameSet=(a,b)=>Array.isArray(a)&&a.length===b.length&&new Set(a).size===b.length&&b.every(x=>a.includes(x));
  if(d.arenaHandoff?.to!=="M03_ARENA_START"||!sameSet(d.arenaHandoff?.from,["M02_PROTECT_SAFE","M02_OUTER_LOOKOUT"])||!sameSet(d.arenaHandoff?.requires,["M02_COMPLETE","M03_SAFE_ARENA_LOADED","PLAYER_CONTROL_AVAILABLE"]))fail("Unsafe arena handoff");
  const expected=[["M01",[],["merchant_warning","fragment_cue","voluntary_clearing_arrival"]],["M02",["M01"],["clearing_approach","protective_warning","barrier_observation","wolf_observation_and_warning","voluntary_readiness"]]];
  if(!Array.isArray(d.objectiveDefinitions)||d.objectiveDefinitions.length!==2)fail("Invalid quest scope");
  else for(const [id,requires,objectives] of expected){const matches=d.objectiveDefinitions.filter(x=>x?.id===id);const q=matches[0];if(matches.length!==1||q.enabled!==false||q.reality!=="PRESERVED"||!sameSet(q.requires,requires)||!sameSet(q.objectives,objectives))fail("Invalid disabled objective definition "+id);}
  for(const key of ["noCombatM01M02","noForcedCamera","noTimer","noPairedFocus","noOlderReveal","noAutoEquip","platformUnchanged"])if(d.restrictions?.[key]!==true)fail("Missing restriction "+key);
  for(const [key,values] of Object.entries({merchant_warning:["interaction","proximity"],fragment_cue:["visual","audio","accessible_cue","residual_glow_and_journal"],voluntary_clearing_arrival:["threshold","overlook_confirmation"],barrier_observation:["soil","shard","twig"],wolf_observation_and_warning:["observe_at_distance_and_warn","crouch_and_warn","call_woman"],voluntary_readiness:["protect_safe","outer_lookout"]}))if(!sameSet(d.eventAlternatives?.[key],values))fail("Missing objective alternative "+key);
  return {ok:errors.length===0,errors,coverage:{anchors:byId.size,proposedWalkEdges:edgeKeys.size,walkAnchors:[...byId.values()].filter(n=>n.kind==="walk").length}};
}
