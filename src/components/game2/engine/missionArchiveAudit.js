// Original Jedi Academy mission compatibility audit.
// The RBSP includes entity definitions and textured surfaces; the original
// ICARUS .ibi scripts, Ghoul2 actors, mover/trigger state machines and event
// handlers are not implemented by the current Game 2 browser engine.
// Do not infer "complete" from a successfully rendered map.
const byPrefix=(list,prefix)=>list.filter(e=>String(e.classname||'').toLowerCase().startsWith(prefix)).length;
export function auditArchiveMission(map) {
  const entities=Array.isArray(map?.entities)?map.entities:[];
  const scripts=new Set();
  for(const entity of entities) for(const [key,value] of Object.entries(entity)) {
    if(/script|(?:^|_)behavior|cinematic/i.test(key)&&typeof value==='string'&&value.trim())
      scripts.add(value.trim());
  }
  const shaders=Array.isArray(map?.texturedMeshes)?map.texturedMeshes.map(m=>m.shader):[];
  const originalSinglePlayerStarts=entities.filter(e=>e.classname==='info_player_start').length;
  const blockers=[
    'Original ICARUS scripted mission event runtime has not been integrated',
    'Original NPC definitions, AI routines, animations and voiced sequences are not complete',
    'Original movers, elevators, doors, switches, checkpoints and objectives are not operational',
    'Full shader/material/lightmap/audio dependency parity is not verified',
    'Cinematics and mission-to-mission progression are not supported',
  ];
  if(!map?.tris?.length)blockers.unshift('Original BSP has no valid renderable geometry');
  if(!originalSinglePlayerStarts)blockers.unshift('Original BSP has no authored single-player starting position');
  return Object.freeze({
    mode:'geometry-only',
    name:map?.name||'Unknown original mission',
    originalSurfaceCount:Number(map?.originalSurfaceCount)||0,
    polygons:map?.tris?.length||0,
    entityCount:entities.length,
    npcSpawners:byPrefix(entities,'npc_'),
    triggerEntities:byPrefix(entities,'trigger_'),
    moverEntities:byPrefix(entities,'func_'),
    scriptRefs:[...scripts].sort(),
    materialCount:new Set(shaders).size,
    authoredPlayerStarts:originalSinglePlayerStarts,
    missionPlayable:false,
    blockers,
  });
}
