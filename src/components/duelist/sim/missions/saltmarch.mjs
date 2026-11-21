// Saltmarch: the second co-op story mission (1 to 4 players), after Contraband. Original story, written for
// this game.
//
// The ledger cores the crew carried out of the depot went to the Houses' court; within a day the Houses filed
// a warrant on the place the last shipment of guns went: Saltmarch, an old salt works where unbound Will users
// (people the Houses never registered) hide. Their wardens, Will users sworn to the Houses, are on the way.
// The crew gets there first. The defenders take them for wardens and fire; beaten, they stand down. The keeper
// tells them who handed the Houses the ledger, and asks them to ring the warning bells. Then the crew holds
// the tunnel door beside Arden while the refuge empties, and faces the Warden-Captain: another of Arden's
// students, who chose the Houses.
//
// The refuge (metres; x east, z north): the outer yard across the south behind its lock; the commons in the
// middle, the dormitories west of it and the infirmary east; the chapel along the north, the tunnel mouth in
// its north-east corner.
//
//    +---------------------------------+-----------+  z = 30
//    |             CHAPEL             D5  TUNNEL   |
//    +----------------- D4 ------------+-----------+  z = 14
//    |  DORMS     D2   COMMONS    D3   INFIRMARY   |
//    +----------------- D1 -------------------------+  z = -6
//    |                  YARD (the lock's console)   |
//    +---------------------------------------------+  z = -24
//   x = -30          -10        10   12           30
import { hWall, vWall, hDoor, vDoor, cover } from './rooms.mjs';

const S = Math.PI; // facing south, towards the yard's gate
const W = -Math.PI / 2;
const E = Math.PI / 2;
const crate = cover('crate');
const bench = cover('bench');
const desk = cover('desk');
const shelf = cover('shelf');
const pillar = cover('pillar', 0.8);

// where the crew holds while the refuge empties, beside the tunnel door
const HOLD = Object.freeze({ x: 8.5, z: 21.5 });
const HOLD_SECONDS = 40;

const LEVEL = {
  bounds: { x0: -30, x1: 30, z0: -24, z1: 30 },
  lights: [
    { x: -16, z: -16, color: 0x9fb8d8 }, { x: 16, z: -16, color: 0x9fb8d8 }, // the yard under the salt flats' night
    { x: 0, z: 4, color: 0xffc078 }, { x: -20, z: 4, color: 0xffb070 }, { x: 20, z: 4, color: 0xd8ecff },
    { x: -18, z: 22, color: 0xffa040 }, { x: 0, z: 22, color: 0xffa040 }, { x: 21, z: 22, color: 0xffd090 },
  ],
  walls: [
    ...hWall(-24, -30, 30), ...hWall(30, -30, 30), ...vWall(-30, -24, 30), ...vWall(30, -24, 30),
    ...hWall(-6, -30, 30, [[-1.5, 1.5]]), // the lock
    ...vWall(-10, -6, 14, [[2, 5]]), ...vWall(10, -6, 14, [[2, 5]]), // dormitories | commons | infirmary
    ...hWall(14, -30, 30, [[-1.5, 1.5]]), // the chapel's door
    ...vWall(12, 14, 30, [[20, 23]]), // the tunnel's door
  ],
  doors: [
    hDoor('lock', -6, -1.5, 1.5), vDoor('dorms', -10, 2, 5, true), vDoor('infirmary', 10, 2, 5, true),
    hDoor('chapel', 14, -1.5, 1.5), vDoor('tunnel', 12, 20, 23),
  ],
  cover: [
    // the yard: salt carts and barricades
    crate(-15, -13), crate(-6, -12), crate(7, -12.5), crate(15, -14), crate(-22, -18), crate(22, -19), crate(-9, -19), crate(10, -20),
    // the commons' long tables, the dormitories' bunks, the infirmary's cots
    desk(-5, 1), desk(5, 1), desk(-5, 9), desk(5, 9),
    bench(-24, -2), bench(-16, -2), bench(-24, 9), bench(-16, 9),
    bench(16, -2), bench(24, -2), bench(16, 9), bench(24, 9),
    // the chapel's pillars and the refuge's record stacks, the tunnel's supplies
    pillar(-22, 18.5), pillar(-22, 25.5), pillar(-12, 18.5), pillar(-12, 25.5), shelf(3, 27.5), shelf(7, 27.5),
    crate(24, 18), crate(26, 26),
  ],
  nav: {
    nodes: {
      yard: { x: 0, z: -14 }, yardW: { x: -18, z: -15 }, yardE: { x: 18, z: -16 }, lockS: { x: 0, z: -7.6 }, lockN: { x: 0, z: -4.4 },
      commons: { x: 0, z: 4 }, dormsE: { x: -8.4, z: 3.5 }, dormsW: { x: -11.6, z: 3.5 }, dorms: { x: -20, z: 3.5 },
      infW: { x: 8.4, z: 3.5 }, infE: { x: 11.6, z: 3.5 }, infirmary: { x: 20, z: 3.5 },
      chapS: { x: 0, z: 12.4 }, chapN: { x: 0, z: 15.6 }, chapel: { x: -4, z: 22 }, chapW: { x: -17, z: 22 },
      tunW: { x: 10.4, z: 21.5 }, tunE: { x: 13.6, z: 21.5 }, tunnel: { x: 20, z: 22 },
    },
    edges: [
      ['yard', 'yardW'], ['yard', 'yardE'], ['yard', 'lockS'], ['lockS', 'lockN', 'lock'], ['lockN', 'commons'],
      ['commons', 'dormsE'], ['dormsE', 'dormsW', 'dorms'], ['dormsW', 'dorms'],
      ['commons', 'infW'], ['infW', 'infE', 'infirmary'], ['infE', 'infirmary'],
      ['commons', 'chapS'], ['chapS', 'chapN', 'chapel'], ['chapN', 'chapel'], ['chapel', 'chapW'], ['chapel', 'tunW'],
      ['tunW', 'tunE', 'tunnel'], ['tunE', 'tunnel'],
    ],
  },
};

const GROUPS = {
  // the refuge's defenders: unbound, armed with Arden's sidearms; they take anyone at the lock for wardens
  yard: [
    { type: 'refugee', x: -14, z: -10, yaw: W }, { type: 'refugee', x: 7, z: -9.5, yaw: E }, { type: 'refugee', x: 15, z: -11.6, yaw: S },
    { type: 'refugee', x: -6, z: -8.6, yaw: 0, minPlayers: 2 }, { type: 'refugee', x: 20, z: -16, yaw: W, minPlayers: 3 },
  ],
  commons: [
    { type: 'keeper', x: 0, z: 7, yaw: S, name: 'Keeper Hask', tag: 'hask' },
    { type: 'refugee', x: -7, z: 5, yaw: S }, { type: 'refugee', x: 7, z: 5, yaw: S },
    { type: 'refugee', x: -3, z: 11, yaw: S, minPlayers: 2 }, { type: 'refugee', x: 3, z: 11, yaw: S, minPlayers: 3 },
  ],
  // the Houses' wardens come through the yard
  scouts: [
    { type: 'warden', x: -2, z: -18, yaw: 0, alert: true }, { type: 'warden', x: 3, z: -19, yaw: 0, alert: true, minPlayers: 2 },
    { type: 'warden', x: 0, z: -21, yaw: 0, alert: true, minPlayers: 4 },
  ],
  scoutsB: [{ type: 'marksman', x: -4, z: -16, yaw: 0, alert: true }, { type: 'warden', x: 4, z: -16, yaw: 0, alert: true, minPlayers: 3 }],
  holdA: [
    { type: 'warden', x: -3, z: 9, yaw: 0, alert: true }, { type: 'marksman', x: 4, z: 8, yaw: 0, alert: true },
    { type: 'warden', x: 3, z: 10.5, yaw: 0, alert: true, minPlayers: 2 }, { type: 'marksman', x: -6, z: 6, yaw: 0, alert: true, minPlayers: 3 },
  ],
  holdB: [
    { type: 'warden', x: 0, z: 6, yaw: 0, alert: true }, { type: 'marksman', x: -5, z: 4, yaw: 0, alert: true, minPlayers: 2 },
    { type: 'warden', x: 5, z: 4, yaw: 0, alert: true, minPlayers: 3 },
  ],
  captain: [
    { type: 'wardenCaptain', x: 0, z: 17, yaw: 0, name: 'Warden-Captain Crane', tag: 'crane', alert: true },
    { type: 'warden', x: -3, z: 16, yaw: 0, alert: true, minPlayers: 2 },
  ],
};

// on the crew's side: the teacher, holding the tunnel door
const ALLIES = {
  arden: { type: 'willUser', name: 'Arden Vale', tag: 'arden', x: 15, z: 21.5, yaw: W, post: { x: 9.5, z: 21.5 } },
};

const bellLines = [
  ['Hask', 'They hear it. The first of them are on the stairs.'],
  ['Hask', 'One more, and every soul in Saltmarch is moving.'],
  ['Hask', 'That is all of them. To the chapel: the tunnel door is behind the altar.'],
];
const ringBell = (m, h) => { const [who, line] = bellLines[Math.min(bellLines.length, m.counters.bells || 1) - 1]; h.say(who, line); };

const INTERACTABLES = [
  { id: 'lockConsole', kind: 'terminal', x: 3.4, z: -6.9, facing: Math.PI, label: 'Open the lock', seconds: 2.5, counter: 'terminals' },
  { id: 'bellDorms', kind: 'bell', x: -27.6, z: 3.5, label: 'Ring the warning bell', seconds: 1.8, counter: 'bells', onDone: ringBell },
  { id: 'bellCommons', kind: 'bell', x: -7.5, z: 12.4, label: 'Ring the warning bell', seconds: 1.8, counter: 'bells', onDone: ringBell },
  { id: 'bellInfirmary', kind: 'bell', x: 27.6, z: 3.5, label: 'Ring the warning bell', seconds: 1.8, counter: 'bells', onDone: ringBell },
];
const BELLS = ['bellDorms', 'bellCommons', 'bellInfirmary'];

// a named person's marker follows them until they stand down
const following = (m, h, tag, label) => {
  const e = h.tagged(tag);
  const b = e && m.world.bodies.get(e.id);
  return b && !e.yielded ? [{ x: b.x, z: b.z, label, follow: true }] : [];
};

const STAGES = [
  {
    id: 'lock', title: 'Get inside before the wardens', groups: ['yard'],
    text: 'Open the refuge\'s lock',
    enter: (m, h) => {
      h.spawn('yard');
      h.enable('lockConsole');
      h.say('Ione', 'The ledger\'s last shipment came here: Saltmarch, an old salt works. The Houses filed a warrant on it this morning.');
      h.say('Ione', 'Get inside before their wardens do. And go easy: whoever is in there will take you for wardens.');
    },
    retry: (m, h) => h.respawn('yard'),
    update: (m, h) => {
      if (!m.flags.shouted && h.alerted('yard')) { h.flag('shouted'); h.say('Defender', 'Wardens at the lock! Hold them!', 2.6); }
      if (!m.flags.firstYield && h.yieldedIn('yard') > 0) { h.flag('firstYield'); h.say('Ione', 'They stand down when they are beaten. Let them.'); }
    },
    markers: (m) => [{ ...m.interactables.get('lockConsole'), label: 'Lock control' }],
    done: (m) => !!m.flags['done:lockConsole'],
    leave: (m, h) => h.open('lock'),
  },
  {
    id: 'keeper', title: 'Find who leads them', groups: ['commons'],
    text: (m) => (m.flags.heard ? 'Hear the keeper out' : 'Make the keeper stand down'),
    enter: (m, h) => {
      h.checkpoint({ x: 0, z: -4.2, yaw: 0 });
      h.spawn('commons');
    },
    retry: (m, h) => h.respawn('commons'),
    update: (m, h) => {
      const hask = h.tagged('hask');
      if (hask?.alerted && !m.flags.haskSeen) { h.flag('haskSeen'); h.say('Hask', 'You will not take one of us. Not one.'); }
      if (hask?.yielded && !m.flags.heard) {
        h.flag('heard');
        h.yieldAll('commons');
        h.yieldAll('yard');
        m.comms.length = 0;
        h.say('Hask', 'Enough! ...You hold back. Wardens never hold back. Who sent you?');
        h.say('Ione', 'Tell him the truth. We are here because of the ledger.');
        h.say('Hask', 'Then you know Arden armed us. Do you know who put that ledger in the Houses\' hands?');
        h.say('Ione', '...I did. I filed it with the House court. I thought it would stop the guns, not bring the warrants.');
        h.say('Hask', 'Then help us leave. Ring the warning bells and the tunnel opens under the chapel. Hurry: wardens do not knock.');
      }
    },
    markers: (m, h) => following(m, h, 'hask', 'Keeper Hask'),
    done: (m) => !!m.flags.heard && m.comms.length === 0,
  },
  {
    id: 'bells', title: 'Warn the refuge', groups: ['scouts', 'scoutsB'],
    text: (m) => `Ring the warning bells (${Math.min(3, m.counters.bells || 0)}/3)`,
    enter: (m, h) => {
      h.enable(...BELLS);
      h.spawn('scouts');
      h.say('Ione', 'Warden signatures at the outer lock. They are already in the yard.');
    },
    retry: (m, h) => { h.respawn('scouts'); if (m.flags.scoutsB) h.respawn('scoutsB'); },
    update: (m, h) => {
      if (!m.flags.scoutsB && (m.counters.bells || 0) >= 2) { h.flag('scoutsB'); h.spawn('scoutsB'); h.say('Ione', 'More of them, and a marksman. Keep moving.'); }
    },
    markers: (m) => BELLS.filter((id) => !m.flags[`done:${id}`]).map((id) => ({ ...m.interactables.get(id), label: 'Warning bell' })),
    done: (m) => (m.counters.bells || 0) >= 3,
    // the refuge empties into the tunnel; the chapel opens
    leave: (m, h) => { h.evacuate(); h.open('chapel'); },
  },
  {
    id: 'hold', title: 'Hold the chapel', groups: ['holdA', 'holdB'], alarm: true,
    text: 'Hold the tunnel door while the refuge empties',
    enter: (m, h) => {
      h.checkpoint({ x: HOLD.x - 1.5, z: HOLD.z, yaw: -Math.PI * 0.75 });
      h.flag('hold', 0);
      h.open('tunnel');
      h.ally('arden');
      m.comms.length = Math.min(m.comms.length, 1);
      h.say('Arden', 'You came. I hoped you would, and hoped you would not.');
      h.say('Arden', 'A hundred people are on those stairs. Hold this door with me.');
      h.spawn('holdA');
    },
    retry: (m, h) => { h.flag('hold', 0); h.flag('waveB', false); h.respawn('holdA'); },
    update: (m, h, dt) => {
      if (h.crewNear(HOLD, 6) >= 1) h.flag('hold', (m.flags.hold || 0) + dt);
      if (!m.flags.waveB && m.flags.hold >= 14) { h.flag('waveB'); h.spawn('holdB'); h.say('Ione', 'A second squad through the commons. Wardens and a marksman.'); }
      if (!m.flags.lastOnes && m.flags.hold >= 30) { h.flag('lastOnes'); h.say('Hask', 'The last of us are in the tunnel. Thank you, whoever you are.'); }
    },
    timer: (m) => HOLD_SECONDS - (m.flags.hold || 0),
    markers: () => [{ ...HOLD, label: 'Hold here' }],
    done: (m) => (m.flags.hold || 0) >= HOLD_SECONDS,
  },
  {
    id: 'warrant', title: 'The warrant', groups: ['captain'],
    text: (m) => (m.flags.craneYielded ? 'Hear her out' : 'Face the Warden-Captain'),
    enter: (m, h) => {
      h.spawn('captain');
      h.allyPost('arden', { x: 3, z: 20 });
      m.comms.length = Math.min(m.comms.length, 1);
      h.say('Crane', 'Arden Vale. And company. I carry a warrant for the teacher, and a blank line beneath it.');
    },
    retry: (m, h) => { h.spawn('captain'); h.flag('craneHalf', false); },
    update: (m, h) => {
      const crane = h.tagged('crane');
      const f = crane && m.world.fighters.get(crane.id);
      if (!f || m.flags.craneYielded) return;
      if (f.vitals.hp / f.vitals.max.hp <= 0.55 && !m.flags.craneHalf) { h.flag('craneHalf'); h.say('Crane', 'Arden taught you well. Arden taught me too, once.'); }
      if (crane.yielded) {
        h.flag('craneYielded');
        h.yieldAll();
        m.comms.length = 0;
        h.say('Crane', 'Go, then. All of you.');
        h.say('Crane', 'The warrant named a teacher. By morning it will name the students.');
        h.say('Arden', 'The tunnel comes down behind us. Walk with me, or do not. Decide for yourselves. You always did.');
        h.say('Ione', 'There is a way out at the far end of the tunnel. Go with Arden. I will answer to the court.');
      }
    },
    markers: (m, h) => following(m, h, 'crane', 'Warden-Captain Crane'),
    done: (m) => !!m.flags.craneYielded && m.comms.length === 0,
  },
];

export const SALTMARCH = Object.freeze({
  id: 'saltmarch',
  title: 'Saltmarch',
  start: { x: 0, z: -21.5, yaw: 0 },
  theme: 'refuge', // how the client dresses the rooms: salt-stone walls, lamplight
  level: LEVEL,
  groups: GROUPS,
  allies: ALLIES,
  interactables: INTERACTABLES,
  stages: STAGES,
  lift: Object.freeze({ ...HOLD, radius: 6 }), // the ring on the floor where the crew holds
  ending: 'The tunnel came down behind the last of the unbound. When the Houses\' second company reached Saltmarch, it found an empty refuge and a new warrant with your names on it.',
});
