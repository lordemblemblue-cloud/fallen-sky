// Underground floors told as unfinished sumi-e paintings.
// The valley's grass-and-fire ink is the same idea as the swaying blades:
// a dark stroke that bends, then a flame stroke through it.
//
// Sword-Art order: clear the floor's ink beasts, face that floor's boss,
// and only then does the next floor's painting wake up — with harder beasts.
// Nothing here grants loot, silver, or experience. The fight stays in the
// existing combat path; this module only says who is awake.

export const WOLFVEIL_CAVE_FLOORS = Object.freeze([
  Object.freeze({
    order: 1,
    caveId: 'jade_lantern_grotto',
    title: 'Floor of First Ink',
    mural: 'A wolf drawn in grass strokes. One ear is already on fire.',
    brush: 'grass',
    mobName: 'Ink Hare',
    mobLevel: 6,
    boss: Object.freeze({
      id: 'painted_stag',
      name: 'The Painted Stag',
      level: 10,
      line: 'The first stroke learns it can burn.',
    }),
  }),
  Object.freeze({
    order: 2,
    caveId: 'whispering_root_hollow',
    title: 'Floor of Root Fire',
    mural: 'Cedar roots curl like brush hairs around a buried flame.',
    brush: 'root',
    mobName: 'Root Ember',
    mobLevel: 12,
    boss: Object.freeze({
      id: 'root_pyre',
      name: 'The Root Pyre',
      level: 16,
      line: 'The tree was painted from the inside out.',
    }),
  }),
  Object.freeze({
    order: 3,
    caveId: 'sunken_inkstone_cistern',
    title: 'Floor of Drowned Ink',
    mural: 'A koi of black ink. White fire shows through the water.',
    brush: 'water',
    mobName: 'Ink Koi',
    mobLevel: 18,
    boss: Object.freeze({
      id: 'drowned_ink',
      name: 'The Drowned Ink',
      level: 24,
      line: 'What the brush could not finish, the pool kept.',
    }),
  }),
  Object.freeze({
    order: 4,
    caveId: 'echoing_crystal_vault',
    title: 'Floor of the Last Brush',
    mural: 'A crystal holds a flame that has not been allowed to move.',
    brush: 'crystal',
    mobName: 'Glass Moth',
    mobLevel: 28,
    boss: Object.freeze({
      id: 'last_stroke',
      name: 'The Last Stroke',
      level: 34,
      line: 'Finish the painting, or stay inside it.',
    }),
  }),
  Object.freeze({
    order: 5,
    caveId: 'subterranean_wolf_rotunda',
    hub: true,
    title: 'Sanctum of the Wolf Spirit',
    mural: 'Four paintings meet. The wolf in the middle is still blank.',
    brush: 'wolf',
    mobName: null,
    mobLevel: 36,
    boss: Object.freeze({
      id: 'unfinished_wolf',
      name: 'The Unfinished Wolf',
      level: 42,
      line: 'Every floor was a stroke. This is the signature.',
    }),
  }),
]);

const byCave = new Map(WOLFVEIL_CAVE_FLOORS.map(floor => [floor.caveId, floor]));
const byBoss = new Map(WOLFVEIL_CAVE_FLOORS.map(floor => [floor.boss.id, floor]));

export function caveFloorByCaveId(caveId) {
  return byCave.get(caveId) || null;
}

export function caveFloorByBossId(bossId) {
  return byBoss.get(bossId) || null;
}

/** Bosses whose defeat has woken this floor. Floor 1 needs nothing. */
export function caveFloorIsAwake(floor, defeatedBossIds) {
  if (!floor) return false;
  const beaten = defeatedBossIds instanceof Set
    ? defeatedBossIds
    : new Set(defeatedBossIds || []);
  if (floor.order <= 1) return true;
  const previous = WOLFVEIL_CAVE_FLOORS.find(item => item.order === floor.order - 1);
  return Boolean(previous && beaten.has(previous.boss.id));
}

export function awakeCaveFloors(defeatedBossIds) {
  return WOLFVEIL_CAVE_FLOORS.filter(floor => caveFloorIsAwake(floor, defeatedBossIds));
}

/**
 * Paints one hanging scroll. Grass strokes use the same bend as the valley
 * blades; fire is a second, hotter stroke through them. `awake` is false
 * while the floor is still an unfinished painting.
 */
export function paintSumiCaveMural(ctx, width, height, floor, awake) {
  if (!ctx || !floor) return;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = awake ? '#efe2c4' : '#cfc6b4';
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = '#2a2118';
  ctx.lineWidth = 8;
  ctx.strokeRect(10, 10, width - 20, height - 20);
  ctx.fillStyle = 'rgba(28, 32, 28, 0.08)';
  for (let i = 0; i < 7; i++) ctx.fillRect(0, 28 + i * 22, width, 8);

  const ink = awake ? 'rgba(18, 28, 16, 0.82)' : 'rgba(40, 40, 38, 0.45)';
  const fire = awake ? 'rgba(196, 78, 28, 0.9)' : 'rgba(120, 90, 70, 0.35)';
  ctx.lineCap = 'round';
  const blades = floor.brush === 'water' ? 8 : 16;
  for (let i = 0; i < blades; i++) {
    const x = 48 + (i * (width - 96)) / blades;
    const lean = Math.sin(i * 1.7 + floor.order) * 18;
    ctx.strokeStyle = ink;
    ctx.lineWidth = 2 + (i % 3);
    ctx.beginPath();
    ctx.moveTo(x, height - 36);
    ctx.quadraticCurveTo(x + lean, height * 0.55, x + lean * 0.4, 46 + (i % 4) * 8);
    ctx.stroke();
  }
  const flames = floor.brush === 'grass' ? 3 : floor.brush === 'crystal' ? 1 : 5;
  for (let i = 0; i < flames; i++) {
    const x = width * (0.35 + i * 0.1);
    ctx.strokeStyle = fire;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(x, height - 42);
    ctx.quadraticCurveTo(x + 16, height * 0.5, x - 6, 70 + i * 6);
    ctx.stroke();
  }
  ctx.fillStyle = '#6e1c14';
  ctx.fillRect(width - 58, 28, 28, 28);
  ctx.fillStyle = '#1a140f';
  ctx.font = 'bold 22px Georgia, serif';
  ctx.textAlign = 'left';
  ctx.fillText(floor.title, 28, height - 18);
}
