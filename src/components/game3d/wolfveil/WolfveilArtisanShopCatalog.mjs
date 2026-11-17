// Small, explicit vendor inventory. The model showroom only previews existing
// procedural mounts; it never grants a companion or spends Silver.
export const ARTISAN_SHOPS = Object.freeze({
  blacksmith: {
    title: 'Wolfveil Blacksmith',
    icon: '⚒',
    subtitle: 'Common weapons and training equipment',
    items: [
      { id:'town_common_sword', name:'Apprentice Iron Sword', price:120, category:'weapon', slot:'weapon', type:'Weapon — Sword', masteryWeaponId:'sword', axeWeaponRole:'offensive', baseStats:{attack:4}, description:'A dependable beginner sword.' },
      { id:'town_common_dagger', name:'Steel Practice Dagger', price:90, category:'weapon', slot:'weapon', type:'Weapon — Dagger', masteryWeaponId:'dual_blades', axeWeaponRole:'offensive', baseStats:{attack:3}, description:'Lightweight blade for close combat.' },
      { id:'town_common_bow', name:'Simple Hunter Bow', price:135, category:'weapon', slot:'weapon', type:'Weapon — Bow', masteryWeaponId:'bow', weaponFamily:'bow', axeWeaponRole:'ranged', baseStats:{attack:3}, description:'Common starter bow for ranged combat.' },
    ],
  },
  potion: {
    title: 'Wolfveil Apothecary',
    icon: '✧',
    subtitle: 'Healing potions and restoratives',
    items: [
      { id:'town_minor_health_potion', name:'Minor Healing Potion', price:28, category:'consumable', heal:50, description:'Restore up to 50 HP.' },
      { id:'town_health_potion', name:'Healing Potion', price:70, category:'consumable', heal:150, description:'Restore up to 150 HP.' },
    ],
  },
  tailor: {
    title: 'Wolfveil Tailor',
    icon: '✂',
    subtitle: 'Common clothing for new travelers',
    items: [
      { id:'town_linen_tunic', name:'Linen Town Tunic', price:75, category:'chest', slot:'chest', type:'Chest — Cloth', baseStats:{defense:2,maxHP:8}, description:'Comfortable basic clothing.' },
      { id:'town_cloth_gloves', name:'Artisan Cloth Gloves', price:40, category:'gloves', slot:'gloves', type:'Gloves', baseStats:{defense:1}, description:'Light practical handwear.' },
      { id:'town_traveler_boots', name:'Traveler Sandals', price:55, category:'boots', slot:'boots', type:'Boots', baseStats:{defense:1}, description:'Comfortable travel footwear.' },
    ],
  },
  models: {
    title: 'Wolfveil Model Showroom',
    icon: '♞',
    subtitle: 'Inspect the creatures displayed inside this showroom',
    items: [
      { id:'town_model_solar', name:'Solar Strider', previewIndex:0, description:'Dune-colored steed with emerald barding.' },
      { id:'town_model_kirin', name:'Ivory Kirin', previewIndex:1, description:'Ivory ceremonial mount with golden antlers.' },
      { id:'town_model_night', name:'Night Stalker', previewIndex:2, description:'Obsidian mount wearing crimson armor.' },
    ],
  },
});
