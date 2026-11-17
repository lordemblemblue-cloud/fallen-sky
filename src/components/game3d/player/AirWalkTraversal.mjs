/**
 * Character Halo/Wing flight. GameWorld3D owns grounded terrain, horizontal
 * collision and the canonical CombatResourceLedger. This module owns only
 * the airborne vertical state and finite free-glide duration.
 *
 * Flow: jump -> glide -> Space air kick (boost); hold Space to sky-run,
 * release to glide; double-tap kick for one final forward dash -> glide.
 * Free wing time is consumed only in 'glide'. After expiration, glide
 * stamina is charged per frame. Falling never snaps to the floor.
 */
import {HALO_FLIGHT_RULES,getHaloFlightProfile,paidGlideSeconds} from './haloWingFlightRules.mjs';

export const AIR_WALK_RULES=Object.freeze({
  minDeployHeight:.22,
  glideFallSpeed:2.25,
  glideGravity:8,
  gravity:18,
  terminalFallSpeed:26,
  boostVerticalSpeed:5,
  boostCooldownSeconds:.65,
  glideStaminaPerSecond:6.5,
  boostStaminaCost:24,
  riderHeight:1.7,
  ceilingClearance:.1,
  horizontalGlideMultiplier:1.24,
});
export const AIR_WALK_MODES=Object.freeze(['idle','glide','boost','walk','dash','fall']);
const finite=Number.isFinite;
const saneDelta=delta=>finite(delta)?Math.max(0,Math.min(.08,delta)):0;
const isFlying=mode=>mode==='glide'||mode==='boost'||mode==='walk'||mode==='dash'||mode==='fall';

export function createAirWalkState(){
  return {mode:'idle',y:null,velocityY:0,boostCooldown:0,boosts:0,
    freeGlideTotal:0,freeGlideRemaining:0,haloPercent:null,
    kickHeld:false,kickHoldSeconds:0,walkSeconds:0,dashRemaining:0};
}

/** Halo is optional to preserve older native callers, but the game supplies
 * it on every real player deployment. With halo specified, <10% cannot glide
 * and the first free seconds do not require stamina. */
export function deployAirWalkGlide(previous,{worldY,floorY,stamina,haloPercent}={}){
  if(previous?.mode!=='idle')return {ok:false,reason:'already_airborne',state:previous};
  if(!finite(worldY)||!finite(floorY)||worldY-floorY<AIR_WALK_RULES.minDeployHeight)
    return {ok:false,reason:'must_be_airborne',state:previous};
  const useHalo=finite(haloPercent);
  const profile=useHalo?getHaloFlightProfile({level:haloPercent/100*HALO_FLIGHT_RULES.maxHaloLevel}):null;
  if(useHalo&&!profile.unlocked)return {ok:false,reason:'wings_not_awakened',state:previous};
  if(!useHalo&&(!finite(stamina)||stamina<=0))
    return {ok:false,reason:'not_enough_stamina',state:previous};
  return {ok:true,state:{...createAirWalkState(),mode:'glide',y:worldY,
    haloPercent:profile?.haloPercent??null,
    freeGlideTotal:profile?.freeGlideSeconds??0,
    freeGlideRemaining:profile?.freeGlideSeconds??0}};
}

export function beginAirWalkBoost(previous,{stamina}={}){
  if(previous?.mode!=='glide')return {ok:false,reason:'not_gliding',state:previous};
  if(previous.boostCooldown>0)return {ok:false,reason:'cooldown',state:previous};
  if(!finite(stamina)||stamina+1e-8<AIR_WALK_RULES.boostStaminaCost)
    return {ok:false,reason:'not_enough_stamina',state:previous};
  return {ok:true,state:{...previous,mode:'boost',kickHeld:false,kickHoldSeconds:0,
    velocityY:AIR_WALK_RULES.boostVerticalSpeed,
    boostCooldown:AIR_WALK_RULES.boostCooldownSeconds,
    boosts:previous.boosts+1}};
}

export function setAirWalkKickHeld(previous,held){
  if(!previous||!isFlying(previous.mode))return previous;
  const holding=!!held;
  // Releasing after the first rising kick returns to glide immediately from
  // continuous sky-running. Releasing during the initial kick lets it finish.
  if(!holding&&previous.mode==='walk')
    return {...previous,mode:'glide',kickHeld:false,kickHoldSeconds:0,
      velocityY:Math.min(0,previous.velocityY)};
  return {...previous,kickHeld:holding,
    kickHoldSeconds:holding?previous.kickHoldSeconds:0};
}

export function beginAirWalkRun(previous){
  if(previous?.mode!=='boost'||!previous.kickHeld||
      previous.kickHoldSeconds<HALO_FLIGHT_RULES.airRunHoldThresholdSeconds)
    return {ok:false,reason:'not_ready',state:previous};
  return {ok:true,state:{...previous,mode:'walk',
    walkSeconds:0,velocityY:HALO_FLIGHT_RULES.airRunVerticalSpeed}};
}

export function beginAirWalkFinisher(previous,{stamina}={}){
  if(!previous||!['boost','walk'].includes(previous.mode))
    return {ok:false,reason:'not_kicking',state:previous};
  if(!finite(stamina)||stamina+1e-8<HALO_FLIGHT_RULES.finisherStaminaCost)
    return {ok:false,reason:'not_enough_stamina',state:previous};
  return {ok:true,state:{...previous,mode:'dash',kickHeld:false,kickHoldSeconds:0,
    dashRemaining:HALO_FLIGHT_RULES.finisherSeconds,
    velocityY:HALO_FLIGHT_RULES.finisherVerticalSpeed}};
}

export function releaseAirWalkGlide(previous){
  if(!previous||!isFlying(previous.mode)||previous.mode==='fall')return previous;
  return {...previous,mode:'fall',kickHeld:false,kickHoldSeconds:0,
    dashRemaining:0,velocityY:Math.min(0,previous.velocityY)};
}

export function advanceAirWalk(previous,delta,{
  floorY=null,ceilingY=null,canGlide=true,canAirWalk=true,
}={}){
  if(!previous||!isFlying(previous.mode))
    return {state:previous??createAirWalkState(),drainStamina:0,
      drainAirWalk:0,landed:false};
  const dt=saneDelta(delta);
  let mode=previous.mode;
  let velocityY=previous.velocityY;
  const cooldown=Math.max(0,previous.boostCooldown-dt);
  let drained=0;
  let airWalkDrain=0;
  let exhausted=false;
  let freeRemaining=previous.freeGlideRemaining??0;
  let holdSeconds=previous.kickHeld?(previous.kickHoldSeconds||0)+dt:0;
  let walkSeconds=previous.walkSeconds||0;
  let dashRemaining=previous.dashRemaining||0;

  if(mode==='boost'&&previous.kickHeld &&
     holdSeconds>=HALO_FLIGHT_RULES.airRunHoldThresholdSeconds){
    mode='walk';walkSeconds=0;
  }
  if(mode==='walk'){
    if(!previous.kickHeld||!canAirWalk){
      mode='glide';holdSeconds=0;velocityY=Math.min(0,velocityY);
    }else{
      airWalkDrain=dt*HALO_FLIGHT_RULES.airRunStaminaPerSecond;
      walkSeconds+=dt;
      // Multiple upward kicks while continuously moving through the air.
      // No independent Y ownership or unbounded velocity accumulation.
      velocityY=HALO_FLIGHT_RULES.airRunVerticalSpeed+
        .26*Math.sin(walkSeconds*13);
    }
  }
  if(mode==='dash'){
    dashRemaining=Math.max(0,dashRemaining-dt);
    velocityY=HALO_FLIGHT_RULES.finisherVerticalSpeed;
  }
  if(mode==='glide'){
    if(!canGlide){mode='fall';exhausted=true;}
    else{
      drained=paidGlideSeconds(previous,dt)*AIR_WALK_RULES.glideStaminaPerSecond;
      freeRemaining=Math.max(0,freeRemaining-dt);
    }
  }
  if(mode==='glide')
    velocityY=Math.max(-AIR_WALK_RULES.glideFallSpeed,
      Math.min(0,velocityY-AIR_WALK_RULES.glideGravity*dt));
  else if(mode==='fall'||mode==='boost')
    velocityY=Math.max(-AIR_WALK_RULES.terminalFallSpeed,
      velocityY-AIR_WALK_RULES.gravity*dt);
  let nextY=previous.y+velocityY*dt;
  if(finite(ceilingY)&&velocityY>0){
    const allowedY=ceilingY-AIR_WALK_RULES.riderHeight-AIR_WALK_RULES.ceilingClearance;
    if(nextY>allowedY){
      nextY=Math.max(previous.y,Math.min(nextY,allowedY));
      velocityY=0;
    }
  }
  if(mode==='boost'&&velocityY<=0)mode=canGlide?'glide':'fall';
  if(mode==='dash'&&dashRemaining<=0){
    mode=canGlide?'glide':'fall';
    velocityY=Math.min(0,velocityY);
  }

  if(finite(floorY)&&floorY<=previous.y+.2&&
      nextY<=floorY+1e-4&&velocityY<=0){
    return {state:createAirWalkState(),drainStamina:drained,
      drainAirWalk:airWalkDrain,landed:true,groundY:floorY,exhausted};
  }
  return {state:{...previous,mode,y:nextY,velocityY,boostCooldown:cooldown,
    freeGlideRemaining:freeRemaining,kickHoldSeconds:holdSeconds,
    walkSeconds,dashRemaining},drainStamina:drained,
    drainAirWalk:airWalkDrain,landed:false,exhausted};
}
export const isAirWalkInFlight=state=>isFlying(state?.mode);
