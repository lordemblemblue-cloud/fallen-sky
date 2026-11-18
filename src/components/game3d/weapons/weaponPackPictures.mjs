// The picture an inventory slot shows for a weapon that has no picture of its own: the weapon pack's own
// render of the model that weapon is drawn with in hand (tools/game3d-weapons/prepare_lowpoly_weapons.py
// writes them beside the models). Pure data: nothing here draws or imports the renderer.
export const WEAPON_PACK_PICTURES = Object.freeze({
  fantasy_sword: '/game3d/weapons/icons/fantasy_sword.png',
  curved_daggers: '/game3d/weapons/icons/curved_daggers.png',
  violet_bow: '/game3d/weapons/icons/violet_bow.png',
});
const FAMILY_PICTURE = Object.freeze({ sword: 'fantasy_sword', dual_blades: 'curved_daggers', bow: 'violet_bow' });

/** sword / dual_blades / bow for a weapon item, from its mastery family or, failing that, its type and name. */
export function weaponPictureFamily(item) {
  const family = item?.masteryWeaponId || item?.weaponFamily;
  if (FAMILY_PICTURE[family]) return family;
  const words = String([item?.type, item?.name].join(' ')).toLowerCase();
  if (/dagger|dual.?blade|twin.?blade|knife/.test(words)) return 'dual_blades';
  if (/\bbow\b|longbow|crossbow/.test(words)) return 'bow';
  if (/sword|katana|saber|blade/.test(words)) return 'sword';
  return null;
}

/** The pack picture for a weapon item that has none of its own, else null (the item keeps what it has). */
export function weaponPackPictureForItem(item) {
  if (!item || (item.slot !== 'weapon' && item.category !== 'weapon')) return null;
  if (item.iconUrl || item.imageUrl || item.image || item.thumbnailUrl) return null;
  const model = item.appearance?.weaponModelId || item.weaponModelId;
  if (model && WEAPON_PACK_PICTURES[model]) return WEAPON_PACK_PICTURES[model];
  const family = weaponPictureFamily(item);
  return family ? WEAPON_PACK_PICTURES[FAMILY_PICTURE[family]] : null;
}
