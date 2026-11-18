import { buildGame2TutorialLessons } from '../engine/tutorialCatalog.js';

// Pixel coordinates in the owner's approved 1672 × 941 image. The image and
// hit targets share ONE scaled coordinate system; never independently crop them.
export const ART_SIZE = { width: 1672, height: 941 };
export const SKILL_HOTSPOTS = [
  { id: 'root', x: 610, y: 778, r: 55 },
  { id: 'lower-left', x: 163, y: 743, r: 39 },
  { id: 'left-base', x: 242, y: 681, r: 37 },
  { id: 'inner-left-base', x: 476, y: 681, r: 37 },
  { id: 'center-base', x: 615, y: 643, r: 37 },
  { id: 'inner-right-base', x: 750, y: 682, r: 36 },
  { id: 'right-base', x: 1004, y: 717, r: 37 },
  { id: 'left-middle', x: 240, y: 568, r: 38 },
  { id: 'inner-left', x: 423, y: 566, r: 37 },
  { id: 'center', x: 614, y: 541, r: 46 },
  { id: 'inner-right', x: 799, y: 567, r: 36 },
  { id: 'guard', x: 985, y: 579, r: 40 },
  { id: 'deflect', x: 342, y: 440, r: 48 },
  { id: 'spiral', x: 617, y: 413, r: 42 },
  { id: 'orbital', x: 896, y: 448, r: 48 },
  { id: 'right-tip', x: 1010, y: 448, r: 35 },
  { id: 'upper-right', x: 821, y: 338, r: 38 },
  { id: 'upper-left', x: 426, y: 327, r: 37 },
  { id: 'crown', x: 616, y: 267, r: 52 },
];
export const SKILL_PATHS = [
  { id: 'lightsaber', label: 'Lightsaber' },
  { id: 'force', label: 'Force' },
  { id: 'specials', label: 'Specials' },
];
export const SABER_STANCES = [
  { id: 'single', label: 'Single' },
  { id: 'staff', label: 'Double-bladed' },
  { id: 'dual', label: 'Dual wield' },
];

// Every visible node refers to a shipped mechanic / existing Academy lesson.
// The illustration's lines are art, not invented purchase prerequisites.
const PATH_LESSONS = {
  lightsaber: ['draw', 'jump', 'style', 'taunt', 'attack', 'kick', 'experimental-chain',
    'auto-dodge', 'throw-lightning', 'throw', 'experimental-bind', 'counter',
    'attack', 'experimental-speed-saber', 'kata', 'levitate-push', 'pull-push', 'push-speed', 'kata'],
  force: ['jump', 'power-see', 'power-mind', 'power-heal', 'power-pull', 'power-protect', 'power-absorb',
    'power-speed', 'power-drain', 'power-push', 'power-rage', 'power-levitate',
    'charge-push', 'power-grip', 'power-lightning', 'power-teamheal', 'power-teamforce', 'levitate-push', 'storm'],
  specials: ['auto-dodge', 'taunt', 'jump', 'throw', 'charge-push', 'experimental-bind', 'experimental-chain',
    'push-speed', 'throw-lightning', 'pull-push', 'experimental-grip-push', 'counter',
    'levitate-push', 'experimental-speed-saber', 'repulse', 'dominance', 'kick', 'kata', 'storm'],
};
const SABER_LESSONS = new Set(['draw','attack','style','throw','kata','kick','counter',
  'experimental-bind','experimental-chain','experimental-speed-saber','throw-lightning']);
const COMBO_POWERS = {
  'charge-push':['push'], 'push-speed':['push','speed'], 'pull-push':['pull','push'],
  'levitate-push':['levitate','push'], 'throw-lightning':['lightning'], storm:['lightning'],
  'experimental-grip-push':['grip','push'], 'experimental-speed-saber':['speed'],
};

export function readCompletedTraining(storage) {
  try {
    const saved = JSON.parse((storage ?? globalThis.localStorage)?.getItem('atomxe.game2.tutorial.completed.v1') || '[]');
    return new Set(Array.isArray(saved) ? saved.filter(id => typeof id === 'string') : []);
  } catch { return new Set(); }
}

export function buildSkillTree(game, path = 'lightsaber', kit = 'staff', completed = readCompletedTraining()) {
  // Build the catalog with all kit/experimental entries, then gate it against
  // the REAL session. Browsing a stance must never change the player's kit.
  const catalogGame = {
    ...game, player: { ...game?.player, saberKit: kit },
    settings: { ...game?.settings, combatMode: 'directional360' },
    force: { list: undefined },
  };
  const lessons = new Map(buildGame2TutorialLessons(catalogGame).map(l => [l.id, l]));
  // Include kit-specific nodes even while browsing a different kit.
  for (const otherKit of ['single', 'staff']) {
    for (const lesson of buildGame2TutorialLessons({ ...catalogGame, player: { saberKit: otherKit } })) {
      if (!lessons.has(lesson.id)) lessons.set(lesson.id, lesson);
    }
  }
  const forceList = new Set(game?.force?.list || []);
  const forceReady = !!game?.force && game.force.max > 0 && forceList.size > 0;
  return SKILL_HOTSPOTS.map((spot, index) => {
    const lessonId = (PATH_LESSONS[path] || PATH_LESSONS.lightsaber)[index];
    const lesson = lessons.get(lessonId);
    let reason = '';
    if (!game?.player || !lesson) reason = 'This technique is unavailable in this session.';
    else if (path === 'force' && !forceReady) reason = 'This kit has no Force abilities.';
    else if (SABER_LESSONS.has(lessonId) && !game.player.hasSaber) reason = 'This technique requires a lightsaber.';
    else if (lesson.kit && lesson.kit !== kit) reason = `Browse the ${lesson.kit === 'staff' ? 'double-bladed' : 'single'} stance to inspect this technique.`;
    else if (path === 'lightsaber' && (!game.player.hasSaber || kit !== game.player.saberKit)) reason = 'Choose this saber kit in the loadout or Arena Academy first.';
    else if (lesson.powerId && (!forceList.has(lesson.powerId) || !forceReady || game.force.lv?.[lesson.powerId] === 0)) reason = 'This Force power is not granted by your current mission or kit.';
    else if (COMBO_POWERS[lessonId]?.some(id => !forceList.has(id) || game.force.lv?.[id] === 0)) reason = 'This combination needs Force powers that are unavailable in your current kit.';
    else if ((lesson.group === 'Combos' || lesson.group === 'Special abilities' || lesson.group === 'Automatic abilities') && !forceReady) reason = 'This kit has no Force abilities.';
    else if (lesson.experimentalOnly && (game.settings?.combatMode !== 'directional360' || game.online || game.boardingMode)) reason = 'Requires offline Experimental 360° combat.';
    else if (lessonId === 'kick' && !(game.player.saberKit === 'staff' && game.player.saber?.animLevel === 7 && game.player.actor?.skel?.anims?.BOTH_A7_KICK_F)) reason = 'Requires the double-bladed kit and the original Academy kick animations.';
    else if (['counter', 'repulse', 'dominance'].includes(lessonId) && (game.online || game.boardingMode)) reason = 'This technique is restricted in this multiplayer mode.';
    const title = path === 'lightsaber' ? ({ root: 'Saber foundation', orbital: 'Orbital sweep', crown: 'Whirlwind', deflect: 'Deflect', guard: 'Perfect guard' }[spot.id] || lesson?.title) : lesson?.title;
    return {
      ...spot, lessonId, title: title || 'Unavailable technique',
      description: path === 'lightsaber' && spot.id === 'deflect'
        ? 'An ignited lightsaber can deflect incoming blaster bolts. Face the threat and keep your blade ready.'
        : lesson?.steps?.join(' ') || reason,
      powerId: lesson?.powerId, available: !reason,
      learned: !reason, practiced: completed.has(lessonId), reason,
      // Existing Force ranks are authoritative; do not fabricate XP or points.
      rank: lesson?.powerId ? game?.force?.lv?.[lesson.powerId] ?? null : null,
    };
  });
}

export function skillTreeKey(event, { open, ready, blocked, binding = 'KeyK' }) {
  if (!ready || event.repeat || event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return null;
  const target = event.target;
  if (target?.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target?.tagName || '')) return null;
  if (open && (event.code === binding || event.code === 'Escape')) return 'close';
  if (!open && !blocked && event.code === binding && !target?.closest?.('[data-game2-interface]')) return 'open';
  return null;
}
