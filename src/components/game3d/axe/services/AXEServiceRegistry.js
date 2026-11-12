// AXE Prompt 038 — Unified Services registry.
// Every remote-access service is declared here so NPC access and the global
// Services menu use the same ids. Transactional services are flagged for
// authoritative execution; the browser runtime can fall back to the existing
// local adapters until the dedicated server path is available.

export const AXE_SERVICE_CATEGORIES = Object.freeze({
  EQUIPMENT: 'equipment',
  PROGRESSION: 'progression',
  APPEARANCE: 'appearance',
});

// Only these four existing equipment actions have a Character Vault server-
// rolled path. Other actions remain available through existing local/persisted
// handlers or a separately configured authoritative service bridge. This flag
// describes the built-in server-roll capability, not connection status.
const BUILTIN_SERVER_ROLLED = new Set(['reinforcement', 'over_enchant', 'refine', 'ultimate']);
const service = (entry) => Object.freeze({
  remoteAccessible: true,
  authoritative: BUILTIN_SERVER_ROLLED.has(entry.id),
  ...entry,
});

export const AXE_SERVICE_REGISTRY = Object.freeze([
  service({ id: 'reinforcement', label: 'Reinforcement', description: "Raises an item's reinforcement bonus. Shows protection and downgrade risk before confirming.", category: AXE_SERVICE_CATEGORIES.EQUIPMENT, kind: 'equipment_action' }),
  service({ id: 'enchant', label: 'Enchant', description: "Levels an item's individual enchantment slots using owned materials; not the same as Over-Enchant.", category: AXE_SERVICE_CATEGORIES.EQUIPMENT, kind: 'equipment_action' }),
  service({ id: 'over_enchant', label: 'Over-Enchant', description: "Applies a separate catalyst-based enhancement with its own level, costs and fracture rules.", category: AXE_SERVICE_CATEGORIES.EQUIPMENT, kind: 'equipment_action' }),
  service({ id: 'weapon_legacy', label: 'Weapon Legacy', description: 'Separate four-weapon level-up preparation or twelve-piece elite-set echo. Never advances Combine Stage.', category: AXE_SERVICE_CATEGORIES.EQUIPMENT, kind: 'equipment_action' }),
  service({ id: 'combine', label: 'Combine', description: "Combines compatible owned equipment. A separate donor item is consumed only on success.", category: AXE_SERVICE_CATEGORIES.EQUIPMENT, kind: 'equipment_action' }),
  service({ id: 'stage', label: 'Ascend', description: "Evolves an item's stage using Evolution Stones. No second equipment item is required.", category: AXE_SERVICE_CATEGORIES.EQUIPMENT, kind: 'equipment_action' }),
  service({ id: 'refine', label: 'Refine', description: "Improves refinement levels; high-level failure can downgrade or destroy unprotected equipment.", category: AXE_SERVICE_CATEGORIES.EQUIPMENT, kind: 'equipment_action' }),
  service({ id: 'runes', label: 'Ultimate', description: 'Equip one Ultimate rune tag per equipment item or combine matching runes for upgrades.', category: AXE_SERVICE_CATEGORIES.EQUIPMENT, kind: 'progression_panel' }),
  service({ id: 'ultimate', label: 'Ultimate', description: "Advanced Legendary/Heroic enhancement with ten levels and possible sealing on failure.", category: AXE_SERVICE_CATEGORIES.EQUIPMENT, kind: 'equipment_action' }),
  service({ id: 'sockets', label: 'Sockets / Gems', description: "Opens equipment sockets and inserts owned gems in the same service; gems grant focused bonuses.", category: AXE_SERVICE_CATEGORIES.EQUIPMENT, kind: 'equipment_action' }),
  service({ id: 'equipment_aura', label: 'Aura', description: "Rolls or rerolls secondary combat attributes on one item, preserving its current Aura tier.", category: AXE_SERVICE_CATEGORIES.EQUIPMENT, kind: 'equipment_action' }),

  service({ id: 'character', label: 'Character', description: 'Allocate Vitals, Strength, Dexterity and Spirit points and view live equipment and character stats.', category: AXE_SERVICE_CATEGORIES.PROGRESSION, kind: 'progression_panel' }),
  service({ id: 'skills_character', label: 'Character', description: 'Browse original character attack skills, buffs and passives, equip real skill slots, and switch owned loadout presets.', category: AXE_SERVICE_CATEGORIES.PROGRESSION, kind: 'progression_panel' }),
  service({ id: 'skills_companion', label: 'Companion', description: 'Browse registered companion combat and support abilities, equip the Z/X/V/B companion slots, and save companion skill presets.', category: AXE_SERVICE_CATEGORIES.PROGRESSION, kind: 'progression_panel' }),
  service({ id: 'quest_logbook', label: 'Quest Logbook', description: 'View actual character quests, track objectives, review stories and earned rewards in the Chronicles of AXE.', category: AXE_SERVICE_CATEGORIES.PROGRESSION, kind: 'progression_panel' }),

  service({ id: 'halo', label: 'Halo', description: "View and advance character Halo progression; separate from weapon enchantments.", category: AXE_SERVICE_CATEGORIES.PROGRESSION, kind: 'progression_panel' }),
  service({ id: 'title', label: 'Titles', description: "Unlock and equip character titles. Title stat specialization is distinct from gear upgrades.", category: AXE_SERVICE_CATEGORIES.PROGRESSION, kind: 'progression_panel' }),
  service({ id: 'wings', label: 'Wings', description: "View wing equipment and its progression. Cosmetic appearance is handled by the existing wing system.", category: AXE_SERVICE_CATEGORIES.PROGRESSION, kind: 'progression_panel' }),
  service({ id: 'cape', label: 'Capes', description: "View cape equipment and progression, including endgame cape requirements when unlocked.", category: AXE_SERVICE_CATEGORIES.PROGRESSION, kind: 'progression_panel' }),
  service({ id: 'core', label: 'Core', description: "Manage character Core progression, separate from equipment refinement.", category: AXE_SERVICE_CATEGORIES.PROGRESSION, kind: 'progression_panel' }),
  service({ id: 'elixir', label: 'Buddha Essence', description: "Grow Vitals, Strengthening, Dexterity and Spirituality from combat-earned experience; convert earned XP into permanent levels.", category: AXE_SERVICE_CATEGORIES.PROGRESSION, kind: 'progression_panel' }),
  service({ id: 'companion', label: 'Companion', description: "Manage owned companions in the reference glass UI, including their real equipment, soul fusion, mastery, imbuement and cosmetic availability.", category: AXE_SERVICE_CATEGORIES.PROGRESSION, kind: 'progression_panel' }),
  service({ id: 'pet', label: 'Pets', description: "Register and advance pets or companions. Companion soul infusion is accessed from the Companion hub.", category: AXE_SERVICE_CATEGORIES.PROGRESSION, kind: 'progression_panel' }),
  service({ id: 'mount', label: 'Mounts', description: "Manage mount registration and advancement separately from pet soul fusion.", category: AXE_SERVICE_CATEGORIES.PROGRESSION, kind: 'progression_panel' }),
  service({ id: 'ascension', label: 'Ascension', description: "Advance character Ascension using its own progression rules, not Blacksmith item stages.", category: AXE_SERVICE_CATEGORIES.PROGRESSION, kind: 'progression_panel' }),

  service({ id: 'vanity', label: 'Vanity', description: "Equip eligible vanity appearances through the existing customization system.", category: AXE_SERVICE_CATEGORIES.APPEARANCE, kind: 'progression_panel' }),
  service({ id: 'costume', label: 'Costumes', description: "Manage character costumes through existing appearance and bonus rules.", category: AXE_SERVICE_CATEGORIES.APPEARANCE, kind: 'progression_panel' }),
]);

export function getAXEService(serviceId) {
  return AXE_SERVICE_REGISTRY.find((entry) => entry.id === serviceId) || null;
}

export function getAXEServicesByCategory(category) {
  return AXE_SERVICE_REGISTRY.filter((entry) => entry.category === category);
}

export function normalizeAXEServiceRequest(serviceId) {
  // Missing requests retain the historic Blacksmith default. An explicitly
  // unknown service must NOT silently route to Reinforcement and potentially
  // present the wrong upgrade controls to an NPC interaction.
  if (serviceId == null || serviceId === '') return 'reinforcement';
  if (serviceId === 'blacksmith') return 'reinforcement';
  if (serviceId === 'titles') return 'title';
  if (serviceId === 'buddha_essence' || serviceId === 'elixirs') return 'elixir';
  return getAXEService(serviceId) ? serviceId : null;
}
