/**
 * Air Walk — backend-only airborne traversal (no glider mesh, VFX or HUD).
 * One vertical owner: the avatar's existing movement controller calls these
 * pure functions from updateMotion. X/Z still uses the world's collision path.
 */
export const AIR_WALK_RULES = Object.freeze({
  minDeployHeight: .22,       // must really be off the floor
  glideFallSpeed: 2.25,       // meters / second
  glideGravity: 8,           // descend smoothly toward terminal glide speed
  gravity: 18,               // regular fall / exhausted glide
  terminalFallSpeed: 26,
  boostVerticalSpeed: 5,     // stamina-powered Air Walk kick
  boostCooldownSeconds: .65,
  glideStaminaPerSecond: 6.5,
  boostStaminaCost: 24,
  riderHeight: 1.7,
  ceilingClearance: .1,
  horizontalGlideMultiplier: 1.24,
});

export const AIR_WALK_MODES = Object.freeze(['idle','glide','boost','fall']);
const finite = n => Number.isFinite(n);
const saneDelta = delta => finite(delta) ? Math.max(0,Math.min(.08,delta)) : 0;
const isFlying = mode => mode === 'glide' || mode === 'boost' || mode === 'fall';

export function createAirWalkState(){
  return { mode:'idle', y:null, velocityY:0, boostCooldown:0, boosts:0 };
}

/** A new jump or jump-to-glide begins only with a real positive floor gap. */
export function deployAirWalkGlide(previous,{ worldY, floorY, stamina }={}){
  if(previous?.mode !== 'idle')return {ok:false,reason:'already_airborne',state:previous};
  if(!finite(worldY) || !finite(floorY) || worldY-floorY < AIR_WALK_RULES.minDeployHeight)
    return {ok:false,reason:'must_be_airborne',state:previous};
  if(!finite(stamina) || stamina <= 0)
    return {ok:false,reason:'not_enough_stamina',state:previous};
  return {ok:true,state:{mode:'glide',y:worldY,velocityY:0,boostCooldown:0,boosts:0}};
}

/** Each press of Space while gliding can pay for another independent boost. */
export function beginAirWalkBoost(previous,{stamina}={}){
  if(previous?.mode !== 'glide')return {ok:false,reason:'not_gliding',state:previous};
  if(previous.boostCooldown > 0)return {ok:false,reason:'cooldown',state:previous};
  if(!finite(stamina) || stamina + 1e-8 < AIR_WALK_RULES.boostStaminaCost)
    return {ok:false,reason:'not_enough_stamina',state:previous};
  return {ok:true,state:{...previous,mode:'boost',
    velocityY:AIR_WALK_RULES.boostVerticalSpeed,
    boostCooldown:AIR_WALK_RULES.boostCooldownSeconds,
    boosts:previous.boosts+1}};
}

/** Toggle off the unseen glider: normal fall, never immediate floor snap. */
export function releaseAirWalkGlide(previous){
  if(previous?.mode!=='glide' && previous?.mode!=='boost')return previous;
  return {...previous,mode:'fall',velocityY:Math.min(0,previous.velocityY)};
}

/**
 * Pure frame integration. The caller must actually charge drainStamina from
 * CombatResourceLedger first/afterwards; if a charge fails, call this tick
 * with canGlide=false so stamina exhaustion immediately becomes a real fall.
 *
 * A sampled physical roof can cap the upward boost; a physically grounded
 * floor ends the state. The floor is a Y coordinate, not an offset from the
 * player — this avoids following the terrain down like a glued-to-ground kite.
 */
export function advanceAirWalk(previous,delta,{
  floorY=null,ceilingY=null,canGlide=true,
}={}){
  if(!previous || !isFlying(previous.mode))
    return {state:previous ?? createAirWalkState(),drainStamina:0,landed:false};
  const dt=saneDelta(delta);
  let mode=previous.mode;
  let velocityY=previous.velocityY;
  const cooldown=Math.max(0,previous.boostCooldown-dt);
  let drained=0;
  let exhausted=false;

  if(mode==='glide'){
    if(!canGlide){
      mode='fall';exhausted=true;
    }else{
      drained=dt*AIR_WALK_RULES.glideStaminaPerSecond;
    }
  }
  if(mode==='glide')velocityY=Math.max(-AIR_WALK_RULES.glideFallSpeed,
    Math.min(0,velocityY-AIR_WALK_RULES.glideGravity*dt));
  else velocityY=Math.max(-AIR_WALK_RULES.terminalFallSpeed,
    velocityY-AIR_WALK_RULES.gravity*dt);
  let nextY=previous.y+velocityY*dt;

  // Physical overhangs, upper floors and cave roofs are solid for boosts.
  if(finite(ceilingY) && velocityY>0){
    const allowedY=ceilingY-AIR_WALK_RULES.riderHeight-AIR_WALK_RULES.ceilingClearance;
    if(nextY>allowedY){
      nextY=Math.min(previous.y,allowedY);
      velocityY=0;
    }
  }
  if(mode==='boost' && velocityY<=0)mode=canGlide?'glide':'fall';
  // Never mistake a higher roof/gallery sampled above the avatar for a
  // supporting landing floor. Descending feet must CROSS a surface beneath
  // their previous position before we settle on it.
  if(finite(floorY) && floorY<=previous.y+.2 &&
     nextY<=floorY+1e-4 && velocityY<=0){
    return {state:createAirWalkState(),drainStamina:drained,
      landed:true,groundY:floorY,exhausted};
  }
  return {state:{...previous,mode,y:nextY,velocityY,boostCooldown:cooldown},
    drainStamina:drained,landed:false,exhausted};
}

export const isAirWalkInFlight=state=>isFlying(state?.mode);
