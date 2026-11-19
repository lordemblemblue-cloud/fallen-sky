// How a mission's people become seats the game view can dress: the crew with their own fighters and crystal
// swords, the depot's people (or the refuge's, or the Houses' wardens) in a kit by their job
// (client/guardKit.mjs), the teacher as the teacher, and the crew's allies. Shared by the mission played in the
// browser (missionSource.mjs) and the one played on the match server (net/client.mjs).
import { ENEMY_TYPES } from '../sim/enemies.mjs';
import { KITS } from './guardKit.mjs';

const GUARD_BODIES = ['male', 'female'];
// the people with a name and a build of their own
const BODY_OF = Object.freeze({ dask: 'male', perrin: 'female', rooke: 'male', hask: 'male', crane: 'female' });
export const CREW_COLOR = 0x7dffb0; // a crewmate's blade
const TEACHER_COLOR = 0xc4a3ff;

/** The teacher is whichever of the owner's two fighters the player is not. */
export const teacherBodyFor = (playerBody) => (playerBody === 'maskedWarrior' ? 'huntress' : 'maskedWarrior');
const isTeacher = (person) => person.tag === 'arden' || person.typeId === 'willUser';

/** enemy: { id, name, typeId, named, tag, body? (the server's choice for the teacher) } */
export function enemySeat(enemy, { teacherBody = 'huntress' } = {}) {
  const type = ENEMY_TYPES[enemy.typeId] || ENEMY_TYPES.gunner;
  const teacher = isTeacher(enemy);
  const kit = teacher ? null : KITS[enemy.tag] || KITS[enemy.typeId] || KITS.gunner;
  const n = Number(String(enemy.id).replace(/\D/g, '')) || 0; // builds alternate, by their number
  const body = teacher ? enemy.body || teacherBody : BODY_OF[enemy.tag] || GUARD_BODIES[n % GUARD_BODIES.length];
  return { id: enemy.id, name: enemy.name, team: 'depot', kind: 'enemy', body, weapon: type.weapon, named: !!enemy.named, tag: enemy.tag || null,
    willUser: teacher, kit, color: kit ? kit.glow : TEACHER_COLOR };
}

/** One on the crew's side the mission brought in (Arden, in Saltmarch): { id, name, typeId, tag, body? }. */
export function allySeat(ally, { teacherBody = 'huntress' } = {}) {
  const type = ENEMY_TYPES[ally.typeId] || ENEMY_TYPES.willUser;
  const teacher = isTeacher(ally);
  const kit = teacher ? null : KITS[ally.tag] || KITS[ally.typeId] || null;
  return { id: ally.id, name: ally.name, team: 'crew', kind: 'ally', body: teacher ? ally.body || teacherBody : BODY_OF[ally.tag] || 'male',
    weapon: type.weapon, named: true, tag: ally.tag || null, willUser: teacher, kit, color: kit ? kit.glow : TEACHER_COLOR };
}

/** seat: { id, name, body }; meId: the player's own id (their blade keeps its own colour). */
export const crewSeat = (seat, meId) => ({ id: seat.id, name: seat.name, team: 'crew', kind: 'player', body: seat.body, weapon: 'sword',
  color: seat.id === meId ? null : CREW_COLOR });
