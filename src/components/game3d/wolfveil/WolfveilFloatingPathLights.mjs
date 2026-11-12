// Game 3D-only quiet entrance-light placement. All positions are Wolfveil
// LOCAL coordinates; WolfveilScene applies the existing +70m Z translation
// exactly once. No posts, footings, obstacle records or new dynamic lights.
import {
  WOLFVEIL_ROUTES,WOLFVEIL_SITES,wolfveilHeight,wolfveilRouteClearance,
} from './WolfveilLayout.js';

export const WOLFVEIL_ENTRY_FLOATING_LIGHT_COUNT=2;
export const WOLFVEIL_ENTRY_LIGHT_MIN_PATH_CLEARANCE=2.2;

export function planWolfveilFloatingEntryLights({heightAt=wolfveilHeight}={}){
  if(typeof heightAt!=='function')throw new TypeError('A valid terrain sampler is required');
  const primary=WOLFVEIL_ROUTES.find(route=>route.id==='public_gate_market_sanctuary');
  if(!primary)throw new Error('Wolfveil public entry route is missing');
  // Just south of the market spawn, beside the FIRST visible town approach.
  // Position from the ROAD EDGE rather than a fixed offset so a widening road
  // will not move these glowing heads onto the walking surface.
  const z=WOLFVEIL_SITES.market.z-38;
  const xOffset=primary.width/2+3.15;
  return [-1,1].map(side=>{
    const x=side*xOffset,clearance=wolfveilRouteClearance(x,z);
    if(clearance<WOLFVEIL_ENTRY_LIGHT_MIN_PATH_CLEARANCE)
      throw new Error('Floating entry light would overlap an authored path');
    const ground=heightAt(x,z);
    if(!Number.isFinite(ground))throw new Error('Floating entry light is off terrain');
    // The body floats about 0.6m ABOVE the grass. Nothing below it touches
    // the road, and the small cap is attached directly to the lantern head.
    return Object.freeze({x,y:ground+.83,z,side,clearance,visualOnly:true,nonCollider:true});
  });
}
