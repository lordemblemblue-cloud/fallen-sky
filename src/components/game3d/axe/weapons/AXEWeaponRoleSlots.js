// Character-scoped three-weapon loadout. All three assigned weapons can remain
// equipped, while just one is drawn and contributes live combat stats.
import { characterScopedStorage, subscribeCharacterChange } from '../../characterStorage';
import {
  getAXEInventoryItemsByCategory, getActiveEquippedAXEWeapon,
  switchAXEInventoryWeapon, equipAXEInventoryItem, subscribeAXEEquipmentInventory,
} from '../equipment/AXEEquipmentInventoryStore';
import { inferAXEWeaponRole } from './AXEWeaponIdentity';
import { getPlayerHUD } from '../../playerHUDStore';
import { AXE_HUD_WEAPON_ROLES, isAXEHUDWeaponRole } from './AXEWeaponRoleSlots.mjs';

const storage=characterScopedStorage('axe_hud_weapon_roles_v1');
const empty=()=>({offensive:null,defensive:null,ranged:null});
const listeners=new Set();
const read=()=>{
  try{
    const stored=JSON.parse(storage.get()||'{}');
    return Object.fromEntries(AXE_HUD_WEAPON_ROLES.map(({role})=>[
      role,typeof stored[role]==='string'?stored[role]:null,
    ]));
  }catch{return empty();}
};
let assignments=read();
const emit=()=>{const state=getAXEHUDWeaponRoles();listeners.forEach(fn=>fn(state));};
subscribeCharacterChange(()=>{assignments=read();emit();});
subscribeAXEEquipmentInventory(()=>emit());

export function getAXEHUDWeaponRoles(){
  return {...assignments};
}
export function subscribeAXEHUDWeaponRoles(fn){
  listeners.add(fn);fn(getAXEHUDWeaponRoles());return ()=>listeners.delete(fn);
}
export function getOwnedWeaponsForAXERole(role){
  if(!isAXEHUDWeaponRole(role))return [];
  // Any genuinely owned weapon may be assigned to any one of the three
  // visible socket templates. Role identity is a helpful DEFAULT, not a ban.
  return getAXEInventoryItemsByCategory('weapon')
    .filter(item=>item?.slot==='weapon' && !!item.instanceId);
}
// Resolve equipped instances to three distinct visual slots. Explicit player
// assignments win, followed by the weapon's natural role, then a free socket.
// An unowned or unequipped item can never appear as equipped in the viewer.
function resolveEquippedWeaponRoles(){
  const equipped=getAXEInventoryItemsByCategory('weapon')
    .filter(item=>item.slot==='weapon' && item.equipped && item.instanceId);
  const used=new Set(),resolved={};
  for(const {role} of AXE_HUD_WEAPON_ROLES){
    const pinned=equipped.find(item=>item.instanceId===assignments[role] && !used.has(item.instanceId));
    if(pinned){resolved[role]=pinned;used.add(pinned.instanceId);}
  }
  const activeId=getActiveEquippedAXEWeapon()?.instanceId;
  for(const {role} of AXE_HUD_WEAPON_ROLES){
    if(resolved[role])continue;
    const available=equipped.filter(item=>!used.has(item.instanceId));
    const selected=available.find(item=>item.instanceId===activeId && inferAXEWeaponRole(item)===role)
      ||available.find(item=>inferAXEWeaponRole(item)===role)||available[0];
    if(selected){resolved[role]=selected;used.add(selected.instanceId);}
  }
  return resolved;
}
export function getAXERoleWeapon(role){
  return isAXEHUDWeaponRole(role)?(resolveEquippedWeaponRoles()[role]||null):null;
}
export function assignAXEHUDWeaponRole(role,instanceId,context={}){
  if(!isAXEHUDWeaponRole(role))return {ok:false,reason:'INVALID_ROLE'};
  if(instanceId!==null && !getOwnedWeaponsForAXERole(role).some(item=>item.instanceId===instanceId))
    return {ok:false,reason:'WEAPON_NOT_OWNED_OR_WRONG_ROLE'};
  // Equip the chosen owned weapon in this exact slot before displaying it.
  // Selecting a new weapon replaces only the old weapon in this role.
  if(instanceId!==null){
    const previous=getAXERoleWeapon(role);
    const equipped=equipAXEInventoryItem(instanceId,{
      ...context,
      level: context.level ?? getPlayerHUD().level ?? 1,
      replaceWeaponInstanceId: previous?.instanceId===instanceId?null:previous?.instanceId,
      activate:false,
    });
    if(!equipped.ok)return equipped;
  }
  const next={...assignments,[role]:instanceId};
  // Moving a weapon to another slot clears its previous visual assignment;
  // the saved inventory retains only one instance of that weapon.
  if(instanceId!==null)for(const other of AXE_HUD_WEAPON_ROLES){
    if(other.role!==role && next[other.role]===instanceId)next[other.role]=null;
  }
  if(!storage.setChecked(JSON.stringify(next)))return {ok:false,reason:'SAVE_FAILED'};
  assignments=next;emit();
  return {ok:true,role,instanceId};
}
export function drawAXEHUDWeaponRole(role,context={}){
  if(!isAXEHUDWeaponRole(role))return {ok:false,reason:'INVALID_ROLE'};
  const item=getAXERoleWeapon(role);
  if(!item)return {ok:false,reason:'EMPTY_ROLE',role};
  // Always go through checked inventory transaction. This updates combat
  // identity, animation equipment context, weapon mastery and active skills.
  return {...switchAXEInventoryWeapon(item.instanceId,context),role};
}
