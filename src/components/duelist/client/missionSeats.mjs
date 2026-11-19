// How a mission's people become seats the game view can dress: the crew with their own fighters and crystal
// swords, the depot's people in a kit by their job (client/guardKit.mjs). Shared by the mission played in the
// browser (missionSource.mjs) and the one played on the match server (net/client.mjs).
import { ENEMY_TYPES } from '../sim/enemies.mjs';
import { KITS } from './guardKit.mjs';

const GUARD_BODIES = ['male', 'female'];
// the three ringleaders
const BODY_OF = Object.freeze({ dask: 'male', perrin: 'female', rooke: 'male' });
export const CREW_COLOR = 0x7dffb0; // a crewmate's blade
const TEACHER_COLOR = 0xc4a3ff;

/** The teacher is whichever of the owner's two fighters the player is not. */
export const teacherBodyFor = (playerBody) => (playerBody === 'maskedWarrior' ? 'huntress' : 'maskedWarrior');

/** enemy: { id, name, typeId, named, tag, body? (the server's choice for the teacher) } */
export function enemySeat(enemy, { teacherBody = 'huntress' } = {}) {
  const type = ENEMY_TYPES[enemy.typeId] || ENEMY_TYPES.gunner;
  const willUser = type.kind === 'duelist';
  const kit = willUser ? null : KITS[enemy.tag] || KITS[enemy.typeId] || KITS.gunner;
  const n = Number(String(enemy.id).replace(/\D/g, '')) || 0; // the guards alternate builds, by their number
  const body = willUser ? enemy.body || teacherBody : BODY_OF[enemy.tag] || GUARD_BODIES[n % GUARD_BODIES.length];
  return { id: enemy.id, name: enemy.name, team: 'depot', kind: 'enemy', body, weapon: type.weapon, named: !!enemy.named, tag: enemy.tag || null,
    willUser, kit, color: kit ? kit.glow : TEACHER_COLOR };
}

/** seat: { id, name, body }; meId: the player's own id (their blade keeps its own colour). */
export const crewSeat = (seat, meId) => ({ id: seat.id, name: seat.name, team: 'crew', kind: 'player', body: seat.body, weapon: 'sword',
  color: seat.id === meId ? null : CREW_COLOR });
