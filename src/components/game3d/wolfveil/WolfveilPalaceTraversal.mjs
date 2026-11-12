// Game 3D Wolfveil uses the SAME physical Luna home as the Dashboard.
// Translate into the 180-degree-rotated manor coordinates and reuse its
// authored stair, loft, balcony-support and 3D wall-collider logic.
// No new floor/roof raycast meshes: the shared terrain remains the only
// exterior collision authority and the house's existing doors stay operable.
import {canTraverseManorAxis,manorStepSupport} from '../../dashboard/lakesideManor/manorAtticSweptWalk.mjs';
import {nearFrontDoor} from '../../dashboard/lakesideManor/manorNavigation.mjs';
import {nearManorOwnerSlidingDoor} from '../../dashboard/lakesideManor/manorOwnerSlidingDoorLayout.mjs';
import {nearManorWestGuestSlidingDoor} from '../../dashboard/lakesideManor/manorWestGuestSlidingDoorLayout.mjs';
import {nearManorAtticDoor,resolveManorAtticNavigation} from '../../dashboard/lakesideManor/manorAtticBalconyLayout.mjs';

const finite=(...n)=>n.every(Number.isFinite);
const houseZone=(p)=>Math.abs(p.x)<=28.2&&p.z>=-20.0&&p.z<=23.4;
const empty=()=>({upperFloor:false,onStairs:false,atticFloor:false,onAtticStairs:false,feetY:0});

export function createWolfveilPalaceTraversal({luna,centerX=0,centerY,centerZ,canWalk}){
  if(!luna?.colliders||typeof canWalk!=='function'||!finite(centerX,centerY,centerZ))
    throw new TypeError('Wolfveil palace traversal needs authentic Luna colliders and world placement');
  let nav=empty(),atHome=false;
  const local=(p)=>({
    x:centerX-p.x,z:centerZ-p.z,y:p.y-centerY,
  });
  const valid=(p)=>p&&finite(p.x,p.y,p.z);
  const reset=()=>{nav=empty();atHome=false;};
  function resolveMovement(position,previous,radius=.62){
    if(!valid(position)||!valid(previous)||!Number.isFinite(radius)||radius<=0)return false;
    const from=local(previous),to=local(position);
    const began=houseZone(from),ends=houseZone(to);
    if(!began&&!ends){reset();return false;}
    // Upper floor and roof terraces have authored rail limits. Never let a
    // step from supported wood into unsupported exterior air be a fall.
    if(!ends){
      if(nav.upperFloor||nav.atticFloor||nav.onStairs||nav.onAtticStairs){
        position.x=previous.x;position.z=previous.z;
        return true;
      }
      reset();
      return false;
    }
    const feetY=from.y;
    const common={feetY,eyeY:feetY+1.75,colliders:luna.colliders,
      radius,canWalk,upperFloor:nav.upperFloor,onStairs:nav.onStairs,
      atticFloor:nav.atticFloor,onAtticStairs:nav.onAtticStairs};
    // The original Dashboard sweeps each axis at <=.45 player radii, closing
    // the low-FPS tunnelling holes through glass rails, walls and door leaves.
    const first=canTraverseManorAxis({
      ...common,fromX:from.x,fromZ:from.z,toX:to.x,toZ:from.z,
    });
    const second=first&&canTraverseManorAxis({
      ...common,fromX:to.x,fromZ:from.z,toX:to.x,toZ:to.z,
    });
    let next=second?manorStepSupport({
      fromZ:from.z,toX:to.x,toZ:to.z,feetY,
      upperFloor:nav.upperFloor,onStairs:nav.onStairs,
      atticFloor:nav.atticFloor,onAtticStairs:nav.onAtticStairs,
    }):null;
    // The Dashboard separately detects first contact with the attic's
    // lower run. Do that here too: the main-stair resolver alone cannot
    // promote an upper-gallery avatar onto the genuine dog-leg staircase.
    if(first&&second&&!nav.atticFloor&&!nav.onAtticStairs&&nav.upperFloor){
      const attic=resolveManorAtticNavigation({
        x:to.x,z:to.z,previousZ:from.z,feetY,
        atticFloor:false,onAtticStairs:false,
      });
      if(attic&&Number.isFinite(attic.height)){
        next={allowed:true,feetY:attic.height,
          upperFloor:false,onStairs:false,atticFloor:!!attic.atticFloor,
          onAtticStairs:!!attic.onAtticStairs};
      }
    }
    if(!first||!second||!next?.allowed||!Number.isFinite(next.feetY)){
      position.x=previous.x;position.z=previous.z;
      // Don't drop an already-supported upper-floor player on rejection.
      return true;
    }
    nav={
      upperFloor:next.upperFloor,onStairs:next.onStairs,
      atticFloor:next.atticFloor,onAtticStairs:next.onAtticStairs,
      feetY:next.feetY,
    };
    atHome=true;
    position.y=centerY+nav.feetY;
    return false;
  }
  function playerGroundY(position){
    if(!valid(position))return null;
    const p=local(position);
    if(!houseZone(p))return null;
    // When stationary on re-entry, resolve the ground floor once. Never
    // sample the mansion roof from an overhead 1500m terrain ray.
    if(!atHome){
      const next=manorStepSupport({fromZ:p.z,toX:p.x,toZ:p.z,
        feetY:p.y,upperFloor:false,onStairs:false});
      if(!next.allowed)return null;
      nav={...empty(),...next};
      atHome=true;
    }
    return centerY+nav.feetY;
  }
  function interact(position){
    if(!valid(position))return null;
    const p=local(position);
    if(!houseZone(p))return null;
    if(nearManorAtticDoor(p.x,p.y,p.z)){
      return {door:'attic',open:luna.setAtticDoorOpen(!luna.atticDoorOpen)};
    }
    if(nearManorWestGuestSlidingDoor(p.x,p.y,p.z)){
      return {door:'west-balcony',open:luna.setWestGuestSlidingOpen(!luna.westGuestSlidingOpen,p)};
    }
    if(nearManorOwnerSlidingDoor(p.x,p.y,p.z)){
      return {door:'owner-balcony',open:luna.setOwnerSlidingOpen(!luna.ownerSlidingOpen,p)};
    }
    if(p.y<5.6&&nearFrontDoor(p.x,p.z)){
      return {door:'front',open:luna.setFrontDoorOpen(!luna.frontDoorOpen)};
    }
    return null;
  }
  function update(dt){
    luna.updateFrontDoor?.(dt);
    luna.updateAtticDoor?.(dt);
    luna.updateOwnerSlidingDoors?.(dt);
    luna.updateWestGuestSlidingDoors?.(dt);
  }
  return {resolveMovement,playerGroundY,interact,update,reset,
    get navigation(){return {...nav,atHome};}};
}
