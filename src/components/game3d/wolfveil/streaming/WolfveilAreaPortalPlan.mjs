// Where the five Wolfveil areas connect. Portals are not invented positions:
// each one is a point where an existing road, frontier trail or bridge
// already crosses an area border. Local X/Z metres; Game 3D adds +70 m Z.
// Pure data: no Three.js, no new floors, colliders or travel rules.
import {
  WOLFVEIL_ROUTES,WOLFVEIL_BRIDGES,WOLFVEIL_RIVER,wolfveilDistanceToRiver,
} from '../WolfveilLayout.js';
import {WOLFVEIL_FRONTIER_TRAILS} from '../WolfveilLandscapeDesign.mjs';
import {planWolfveilBridgeDeck,projectWolfveilBridgePoint} from '../WolfveilBridgeProfile.mjs';
import {createWolfveilTerrainSurfaceSampler} from '../WolfveilTerrainSurfaceSampler.mjs';
import {planWolfveilAreaPortals,wolfveilAreaInfo} from './WolfveilFiveAreaPlan.mjs';

const bridgePaths=WOLFVEIL_BRIDGES.map(bridge=>({
  id:bridge.id,label:bridge.label,kind:'bridge',width:bridge.width,
  points:[bridge.from,bridge.to],
}));
const roadPaths=[...WOLFVEIL_ROUTES,...WOLFVEIL_FRONTIER_TRAILS].map(route=>({
  id:route.id,label:route.name||route.label||null,kind:'trail',
  width:route.width,points:route.points,
}));

// A road sketch that runs down the river channel (the riverside loop below
// the waterfall) is not a place to stand a gateway. Only bridges may cross
// the water; other crossings must be on dry ground clear of the channel.
const inRiverChannel=portal=>portal.kind!=='bridge'&&
  wolfveilDistanceToRiver(portal.x,portal.z)<WOLFVEIL_RIVER.width/2+2;

export const WOLFVEIL_AREA_PORTALS=Object.freeze(
  planWolfveilAreaPortals([...bridgePaths,...roadPaths])
    .filter(portal=>!inRiverChannel(portal)));

// Height of the walking surface under each portal. Bridges use the same deck
// profile the town builds its planks from; everything else sits on the
// visible terrain mesh (the same sampler the town and planting use).
let cachedHeights=null;
export function wolfveilAreaPortalHeights(){
  if(cachedHeights)return cachedHeights;
  const surface=createWolfveilTerrainSurfaceSampler({span:1100,segments:310});
  const heights=new Map();
  for(const portal of WOLFVEIL_AREA_PORTALS){
    let y=surface(portal.x,portal.z);
    if(portal.kind==='bridge'){
      const bridge=WOLFVEIL_BRIDGES.find(entry=>entry.id===portal.pathId);
      if(bridge){
        const deck=planWolfveilBridgeDeck(bridge,surface);
        y=deck.heightAt(projectWolfveilBridgePoint(bridge,portal.x,portal.z).t,0);
      }
    }
    heights.set(portal.id,y);
  }
  cachedHeights=heights;
  return heights;
}
// What the on-screen notice says when the player arrives somewhere new.
export function describeWolfveilAreaArrival(areaId,portal=null){
  const area=wolfveilAreaInfo(areaId);
  if(!area)return null;
  return {
    area:area.id,side:area.side,title:area.label,detail:area.description,
    via:portal?.pathLabel||null,
  };
}

// Shape and placement of each visible gateway: a slim arch of light that
// spans the path it stands on, facing along the direction of travel.
// `yaw` turns an arch built in the X/Y plane so its opening looks down the
// path; `radius` is half the opening. Decorative only: never a collider.
export const WOLFVEIL_AREA_PORTAL_STYLE=Object.freeze({
  tubeMeters:.11,sinkMeters:.15,showWithinMeters:220,
  archColor:0xa6f0dc,veilColor:0x7fd9c4,veilOpacity:.1,
});
export function planWolfveilAreaPortalVisuals(){
  const heights=wolfveilAreaPortalHeights();
  return Object.freeze(WOLFVEIL_AREA_PORTALS.map(portal=>Object.freeze({
    id:portal.id,a:portal.a,b:portal.b,kind:portal.kind,label:portal.label,
    x:portal.x,z:portal.z,
    y:heights.get(portal.id)-WOLFVEIL_AREA_PORTAL_STYLE.sinkMeters,
    yaw:Math.atan2(portal.dirX,portal.dirZ),
    radius:portal.kind==='bridge'
      ?Math.max(2.1,portal.width/2+.9)
      :Math.min(3.6,Math.max(2.6,portal.width/2+1.4)),
  })));
}
