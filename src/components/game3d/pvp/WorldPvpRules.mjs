// Shared deterministic PvP eligibility rules. Client renders hints; only the
// private server may authorize damage after independently resolving positions.
import {wolfveilAreaAtWorld} from '../wolfveil/streaming/WolfveilFiveAreaPlan.mjs';

export const WORLD_PVP_MODE=Object.freeze({PVE:'pve',PVP:'pvp'});
export const WORLD_PVP_ZONE=Object.freeze({SAFE:'safe',OPT_IN:'opt_in'});
export const WOLFVEIL_PVP_AREAS=Object.freeze(['south','west','east','north']);
const safe=(id,label)=>Object.freeze({id,kind:WORLD_PVP_ZONE.SAFE,label});
const optIn=(id,label)=>Object.freeze({id,kind:WORLD_PVP_ZONE.OPT_IN,label});
export function resolveWorldPvpZone({region,position,privateArea=false}={}){
  // Apartments, houses and personal instances must remain safe even where
  // their surrounding wilderness allows opt-in combat.
  if(privateArea)return safe('private-home','Private residence · PvE');
  if(region!=='wolfveil')return safe('instanced-adventure','Protected adventure · PvE');
  return wolfveilAreaZone(wolfveilAreaAtWorld(position));
}
function wolfveilAreaZone(area){
  if(!area)return safe('unknown-position','Protected · PvE');
  if(area==='town')return safe('wolfveil-town','Wolfveil Town · PvE');
  if(WOLFVEIL_PVP_AREAS.includes(area))
    return optIn('wolfveil-'+area,area[0].toUpperCase()+area.slice(1)+' Wilds · Optional PvP');
  return safe('unmapped-area','Protected · PvE');
}
/**
 * Client HUD only (the server keeps resolving trusted positions above): in
 * portal-scene play the player is in the Wolfveil area scene that is loaded,
 * `area`, until they go through a gate. Its status is shown, so standing at a
 * gate cannot flip it on every step across the border line.
 */
export function resolveWorldPvpSceneZone({region,area=null,position,privateArea=false}={}){
  const known=area==='town'||WOLFVEIL_PVP_AREAS.includes(area);
  if(privateArea||region!=='wolfveil'||!known)return resolveWorldPvpZone({region,position,privateArea});
  return wolfveilAreaZone(area);
}

export function canWorldPvpAttack({attacker,defender,attackerZone,defenderZone}={}){
  const no=(reason)=>Object.freeze({ok:false,reason});
  if(!attacker?.id||!defender?.id||attacker.id===defender.id)
    return no('invalid_pair');
  if(!attacker.instanceId||!defender.instanceId||
     attacker.instanceId!==defender.instanceId)
    return no('different_world_instance');
  if(!attackerZone||!defenderZone||
     attackerZone.kind!==WORLD_PVP_ZONE.OPT_IN||
     defenderZone.kind!==WORLD_PVP_ZONE.OPT_IN)
    return no('safe_zone');
  // Each streamed area has its own world; do not hit through an area portal.
  if(attackerZone.id!==defenderZone.id)return no('different_zone');
  if(attacker.mode!==WORLD_PVP_MODE.PVP)return no('attacker_pve');
  if(defender.mode!==WORLD_PVP_MODE.PVP)return no('defender_pve');
  if(attacker.alive===false||defender.alive===false)
    return no('not_alive');
  return Object.freeze({ok:true,reason:null,zoneId:attackerZone.id});
}
