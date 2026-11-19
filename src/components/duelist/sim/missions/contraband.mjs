// Contraband: the first co-op story mission (1 to 4 players). Original story, written for this game.
//
// The crew breaks into a Halvane Logistics freight depot to learn what its "medical supplies" are, finds the
// three people running the shipments, and has to get the evidence out when the depot locks down. The records
// then name the buyer: someone the crew knows, the teacher who trained them, a Will user.
//
// The depot (metres; x east, z north): a loading dock across the south; a concourse in the middle with the
// broker's suite to its west and the workshop to its east; north of those the vault, the archive hall and
// the security office.
//
//    +-----------+-------------+-----------+  z = 28
//    |   VAULT   |   ARCHIVE   | SECURITY  |
//    +-----------+----- D4 ----+-----------+  z = 12
//    |   SUITE  D2  CONCOURSE  D6 WORKSHOP |
//    +-----------+----- D1 ----+-----------+  z = -8
//    |            LOADING DOCK      [lift] |
//    +-------------------------------------+  z = -24
//   x = -30     -12            12         30

const T = 0.3; // half a wall's thickness
const spans = (from, to, gaps) => {
  const out = [];
  let at = from;
  for (const [g0, g1] of [...gaps].sort((a, b) => a[0] - b[0])) { if (g0 > at) out.push([at, g0]); at = g1; }
  if (at < to) out.push([at, to]);
  return out;
};
const hWall = (z, x0, x1, gaps = []) => spans(x0, x1, gaps).map(([a, b]) => ({ x0: a, x1: b, z0: z - T, z1: z + T }));
const vWall = (x, z0, z1, gaps = []) => spans(z0, z1, gaps).map(([a, b]) => ({ x0: x - T, x1: x + T, z0: a, z1: b }));
// cover is a box; its style is only how the client draws it (a crate, a workbench, a desk, a data stack...)
const crate = (x, z, half = 0.7, style = 'crate') => ({ x0: x - half, x1: x + half, z0: z - half, z1: z + half, style });
const styled = (style) => (x, z) => crate(x, z, 0.7, style);
const bench = styled('bench');
const desk = styled('desk');
const shelf = styled('shelf');
const post = styled('console');
const pillar = (x, z) => crate(x, z, 0.8, 'pillar');

export const LIFT = Object.freeze({ x: 22, z: -20, radius: 4.5 });
const VAULT = Object.freeze({ x: -19, z: 20 });
const PLACES = Object.freeze({
  dask: { x: 22, z: 3, label: 'Quartermaster' }, perrin: { x: -22, z: 3, label: 'Broker' }, rooke: { x: 22, z: 21, label: 'Security chief' },
});

const LEVEL = {
  bounds: { x0: -30, x1: 30, z0: -24, z1: 28 },
  // each room's lamp (only the client uses these)
  lights: [
    { x: -18, z: -16, color: 0x8fc4ff }, { x: 0, z: -16, color: 0x8fc4ff }, { x: 19, z: -17, color: 0xffd9a0 },
    { x: 0, z: 2, color: 0x7fe0d8 }, { x: -21, z: 2, color: 0xc9a3ff }, { x: 21, z: 2, color: 0xffa860 },
    { x: -19, z: 20, color: 0x9a7bff }, { x: 2, z: 20, color: 0x6fb0ff }, { x: 21, z: 20, color: 0xff8a7a },
  ],
  walls: [
    ...hWall(-24, -30, 30), ...hWall(28, -30, 30), ...vWall(-30, -24, 28), ...vWall(30, -24, 28),
    ...hWall(-8, -30, 30, [[-1.5, 1.5]]), ...hWall(12, -30, 30, [[-1.5, 1.5]]),
    ...vWall(-12, -8, 12, [[0.5, 3.5]]), ...vWall(12, -8, 12, [[0.5, 3.5]]),
    ...vWall(-8, 12, 28, [[18.5, 21.5]]), ...vWall(12, 12, 28, [[18.5, 21.5]]),
  ],
  doors: [
    { id: 'dock', x0: -1.5, x1: 1.5, z0: -8 - T, z1: -8 + T, open: false },
    { id: 'archive', x0: -1.5, x1: 1.5, z0: 12 - T, z1: 12 + T, open: true },
    { id: 'suite', x0: -12 - T, x1: -12 + T, z0: 0.5, z1: 3.5, open: true },
    { id: 'workshop', x0: 12 - T, x1: 12 + T, z0: 0.5, z1: 3.5, open: true },
    { id: 'security', x0: 12 - T, x1: 12 + T, z0: 18.5, z1: 21.5, open: true },
    { id: 'vault', x0: -8 - T, x1: -8 + T, z0: 18.5, z1: 21.5, open: false },
  ],
  cover: [
    // loading dock (the three marked crates first)
    crate(-20, -18), crate(-8, -12), crate(16, -13), crate(-14, -20), crate(6, -19), crate(12, -18), crate(-5, -19.5), crate(24, -12), crate(-24, -11),
    // concourse
    crate(-6, 6), crate(6, -3), crate(-5, -4), crate(5, 7),
    // workshop benches, the broker's furniture, the archive's shelves, the security office
    bench(18, 6), bench(24, -2), bench(20, -5), desk(-18, 6), desk(-24, -3), desk(-20, 9),
    shelf(-3, 24), shelf(6, 16), shelf(8, 25), post(18, 24), post(25, 17),
    // the vault's four pillars
    pillar(-14, 24), pillar(-24, 24), pillar(-14, 16), pillar(-24, 16),
  ],
  nav: {
    nodes: {
      dock: { x: 0, z: -16 }, dockW: { x: -18, z: -15 }, dockE: { x: 18, z: -16 }, lift: { x: 21, z: -19 }, d1S: { x: 0, z: -9.6 }, d1N: { x: 0, z: -6.4 },
      conc: { x: 0, z: 2 }, d2E: { x: -10.4, z: 2 }, d2W: { x: -13.6, z: 2 }, suite: { x: -21, z: 2 },
      d6W: { x: 10.4, z: 2 }, d6E: { x: 13.6, z: 2 }, shop: { x: 21, z: 2 },
      d4S: { x: 0, z: 10.4 }, d4N: { x: 0, z: 13.6 }, archive: { x: 2, z: 20 },
      d3W: { x: 10.4, z: 20 }, d3E: { x: 13.6, z: 20 }, security: { x: 21, z: 20 },
      d5E: { x: -6.4, z: 20 }, d5W: { x: -9.6, z: 20 }, vault: { x: -19, z: 20 },
    },
    edges: [
      ['dock', 'dockW'], ['dock', 'dockE'], ['dockE', 'lift'], ['dock', 'd1S'], ['d1S', 'd1N', 'dock'], ['d1N', 'conc'],
      ['conc', 'd2E'], ['d2E', 'd2W', 'suite'], ['d2W', 'suite'], ['conc', 'd6W'], ['d6W', 'd6E', 'workshop'], ['d6E', 'shop'],
      ['conc', 'd4S'], ['d4S', 'd4N', 'archive'], ['d4N', 'archive'], ['archive', 'd3W'], ['d3W', 'd3E', 'security'], ['d3E', 'security'],
      ['archive', 'd5E'], ['d5E', 'd5W', 'vault'], ['d5W', 'vault'],
    ],
  },
};

const S = Math.PI; // facing south, towards the dock
const GROUPS = {
  dock: [
    { type: 'gunner', x: -14, z: -12, yaw: -Math.PI / 2 }, { type: 'gunner', x: 8, z: -14.5, yaw: Math.PI / 2 }, { type: 'gunner', x: 1, z: -10.5, yaw: 0 },
    { type: 'gunner', x: 19, z: -16, yaw: S, minPlayers: 2 }, { type: 'enforcer', x: -6, z: -15, yaw: S, minPlayers: 3 },
  ],
  concourse: [
    { type: 'gunner', x: -4, z: 5, yaw: S }, { type: 'gunner', x: 4, z: -1, yaw: S }, { type: 'enforcer', x: 0, z: 8, yaw: S },
    { type: 'marksman', x: -8, z: -2, yaw: S, minPlayers: 2 }, { type: 'enforcer', x: 8, z: 5, yaw: S, minPlayers: 3 },
  ],
  workshop: [
    { type: 'boss', x: 22, z: 4, yaw: -Math.PI / 2, name: 'Quartermaster Dask', tag: 'dask' },
    { type: 'gunner', x: 17, z: -3, yaw: -Math.PI / 2 }, { type: 'gunner', x: 25, z: 8, yaw: -Math.PI / 2 }, { type: 'marksman', x: 26, z: -5, yaw: -Math.PI / 2, minPlayers: 2 },
  ],
  suite: [
    { type: 'boss', x: -22, z: 3, yaw: Math.PI / 2, name: 'Perrin, the broker', tag: 'perrin' },
    { type: 'enforcer', x: -16, z: -1, yaw: Math.PI / 2 }, { type: 'gunner', x: -25, z: 8, yaw: Math.PI / 2 }, { type: 'enforcer', x: -18, z: 9, yaw: Math.PI / 2, minPlayers: 3 },
  ],
  security: [
    { type: 'captain', x: 22, z: 21, yaw: -Math.PI / 2, name: 'Chief Rooke', tag: 'rooke' },
    { type: 'gunner', x: 17, z: 16, yaw: -Math.PI / 2 }, { type: 'marksman', x: 26, z: 25, yaw: -Math.PI / 2 },
  ],
  archive: [{ type: 'gunner', x: 5, z: 24, yaw: S }, { type: 'gunner', x: -4, z: 16, yaw: S }],
  lockdownA: [
    { type: 'marksman', x: -22, z: -14, yaw: 0, alert: true }, { type: 'gunner', x: -10, z: -21, yaw: 0, alert: true },
    { type: 'gunner', x: 10, z: -11, yaw: 0, alert: true }, { type: 'enforcer', x: 0, z: -14, yaw: 0, alert: true },
    { type: 'gunner', x: 20, z: -12, yaw: 0, alert: true, minPlayers: 2 }, { type: 'enforcer', x: -16, z: -18, yaw: 0, alert: true, minPlayers: 3 },
  ],
  lockdownB: [
    { type: 'enforcer', x: 0, z: -4, yaw: S, alert: true }, { type: 'gunner', x: -3, z: -2, yaw: S, alert: true }, { type: 'marksman', x: 3, z: -2, yaw: S, alert: true },
    { type: 'enforcer', x: 0, z: -1, yaw: S, alert: true, minPlayers: 2 },
  ],
  vault: [{ type: 'willUser', x: -20, z: 22, yaw: Math.PI / 2, name: 'Arden Vale', tag: 'arden' }],
};

const crateLines = [
  ['Ione', 'Packing foam. No medicine. Keep going.'],
  ['Ione', 'Serial plates filed off. Somebody wanted these never to be traced.'],
  ['Ione', 'Sidearms. Crystal-forged, and the rounds are cut to tear at a Veil. Nobody builds that to hunt ordinary people. These were made for us.'],
];
const openCrate = (m, h) => { const [who, line] = crateLines[Math.min(crateLines.length, m.counters.crates || 1) - 1]; h.say(who, line); };
const takeCore = (m, h) => {
  const n = m.counters.cores || 0;
  if (n === 1) h.say('Ione', 'One core. Two more signatures on every transfer.');
  else if (n === 2) h.say('Ione', 'Two. One more and we know all of it.');
};

const INTERACTABLES = [
  { id: 'crateA', kind: 'crate', x: -20, z: -18, label: 'Open the marked crate', seconds: 1.6, counter: 'crates', onDone: openCrate },
  { id: 'crateB', kind: 'crate', x: -8, z: -12, label: 'Open the marked crate', seconds: 1.6, counter: 'crates', onDone: openCrate },
  { id: 'crateC', kind: 'crate', x: 16, z: -13, label: 'Open the marked crate', seconds: 1.6, counter: 'crates', onDone: openCrate },
  { id: 'dockTerminal', kind: 'terminal', x: 3.4, z: -8.9, facing: Math.PI, label: 'Unlock the inner door', seconds: 2, counter: 'terminals' },
  { id: 'coreDask', kind: 'core', x: 26.5, z: 2, label: 'Take the ledger core', seconds: 1.5, counter: 'cores', onDone: takeCore },
  { id: 'corePerrin', kind: 'core', x: -26.5, z: 2, label: 'Take the ledger core', seconds: 1.5, counter: 'cores', onDone: takeCore },
  { id: 'coreRooke', kind: 'core', x: 26.5, z: 20, label: 'Take the ledger core', seconds: 1.5, counter: 'cores', onDone: takeCore },
];

// what each of the three says when the crew walks in, and when they fall
const THREE = [
  { tag: 'dask', core: 'coreDask', group: 'workshop', seen: ['Dask', 'Veil-born, in my workshop. Good. I have wanted to see what these do to one of you.'],
    fallen: ['Dask', 'I build what I am paid to build. Ask Perrin who pays.'] },
  { tag: 'perrin', core: 'corePerrin', group: 'suite', seen: ['Perrin', 'Whatever your people offered, the buyer offered more. In crystal.'],
    fallen: ['Perrin', 'The buyer never showed a face. And never needed the guns for themselves. Think about that.'] },
  { tag: 'rooke', core: 'coreRooke', group: 'security', seen: ['Rooke', 'Seal it. Nobody walks out of here with a core.'],
    fallen: ['Rooke', 'Take it. You will not reach the lift.'] },
];
const HOLD_SECONDS = 30;

const STAGES = [
  {
    id: 'crates', title: 'Find out what they are shipping', groups: ['dock'],
    text: (m) => `Open the marked crates (${Math.min(3, m.counters.crates || 0)}/3)`,
    enter: (m, h) => {
      h.spawn('dock');
      h.enable('crateA', 'crateB', 'crateC');
      h.say('Ione', 'Halvane\'s manifest says medical supplies. Nobody posts gunmen over bandages. Open the marked crates.');
    },
    retry: (m, h) => h.respawn('dock'),
    markers: (m) => ['crateA', 'crateB', 'crateC'].filter((id) => !m.flags[`done:${id}`]).map((id) => ({ ...m.interactables.get(id), label: 'Marked crate' })),
    done: (m) => (m.counters.crates || 0) >= 3,
  },
  {
    id: 'door', title: 'Find who is behind it', groups: ['dock'],
    text: 'Unlock the dock\'s inner door',
    enter: (m, h) => {
      h.enable('dockTerminal');
      h.say('Ione', 'Three signatures on every transfer: the quartermaster who builds them, the broker who sells them, the chief who keeps it quiet. They are inside.');
    },
    retry: (m, h) => h.respawn('dock'),
    markers: (m) => [{ ...m.interactables.get('dockTerminal'), label: 'Door control' }],
    done: (m) => !!m.flags['done:dockTerminal'],
    leave: (m, h) => h.open('dock'),
  },
  {
    id: 'three', title: 'Find who is behind it', groups: ['concourse', 'workshop', 'suite', 'security', 'archive'],
    text: (m) => {
      const left = THREE.filter((t) => !m.flags[`fallen:${t.tag}`]).length;
      const cores = Math.min(3, m.counters.cores || 0);
      return left ? `Find the quartermaster, the broker and the security chief. Ledger cores: ${cores}/3` : `Take their ledger cores (${cores}/3)`;
    },
    enter: (m, h) => {
      h.checkpoint({ x: 0, z: -5.4, yaw: 0 });
      for (const g of ['concourse', 'workshop', 'suite', 'security', 'archive']) h.spawn(g);
    },
    // the crew fell: every room it had not cleared fills again
    retry: (m, h) => { for (const g of ['concourse', 'archive', 'workshop', 'suite', 'security']) h.respawn(g); },
    update: (m, h) => {
      for (const t of THREE) {
        const who = h.tagged(t.tag);
        if (who?.alerted && !m.flags[`said:${t.tag}`]) { h.flag(`said:${t.tag}`); h.say(...t.seen); }
        if (m.flags[`fallen:${t.tag}`] && !m.flags[`core:${t.tag}`]) { h.flag(`core:${t.tag}`); h.say(...t.fallen); h.enable(t.core); }
      }
    },
    markers: (m) => THREE.map((t) => (!m.flags[`fallen:${t.tag}`] ? PLACES[t.tag]
      : !m.flags[`done:${t.core}`] ? { ...m.interactables.get(t.core), label: 'Ledger core' } : null)).filter(Boolean),
    done: (m) => (m.counters.cores || 0) >= 3,
  },
  {
    id: 'lift', title: 'Get the evidence out', groups: ['lockdownA'], alarm: true,
    text: 'Carry the ledger cores to the cargo lift',
    enter: (m, h) => {
      h.say('Ione', 'That is all three. Forget the depot: get the cores to the cargo lift. I am bringing it down.');
      h.say('Rooke', 'All posts: lock it down. They are carrying the cores.', 3.4);
      h.alarm();
      h.spawn('lockdownA');
    },
    retry: (m, h) => h.respawn('lockdownA'),
    markers: () => [{ ...LIFT, label: 'Cargo lift' }],
    done: (m, h) => h.crewNear(LIFT, LIFT.radius) >= 1,
  },
  {
    id: 'hold', title: 'Get the evidence out', groups: ['lockdownA', 'lockdownB'], alarm: true,
    text: 'Hold the lift while it powers up',
    enter: (m, h) => {
      h.checkpoint({ x: LIFT.x - 2, z: LIFT.z + 1, yaw: 0 });
      h.flag('hold', 0);
      h.flag('wave', false);
      h.flag('decrypt', false);
      h.say('Ione', 'Lift is coming. Half a minute. Do not let them pull you off it.');
    },
    retry: (m, h) => { h.flag('hold', 0); h.flag('wave', false); h.respawn('lockdownA'); },
    update: (m, h, dt) => {
      if (h.crewNear(LIFT, LIFT.radius) >= 1) h.flag('hold', (m.flags.hold || 0) + dt);
      if (!m.flags.wave && m.flags.hold >= 9) { h.flag('wave'); h.spawn('lockdownB'); }
      if (!m.flags.decrypt && m.flags.hold >= 16) {
        h.flag('decrypt');
        h.say('Ione', 'Perrin\'s records are open. The buyer paid in Will-forged crystal. Only one of us could make that.');
      }
    },
    timer: (m) => HOLD_SECONDS - (m.flags.hold || 0),
    markers: () => [{ ...LIFT, label: 'Hold here' }],
    done: (m) => (m.flags.hold || 0) >= HOLD_SECONDS,
  },
  {
    id: 'name', title: 'There is someone above them', groups: ['vault'],
    text: 'Go to the archive vault',
    enter: (m, h) => {
      h.say('Ione', 'There is a recording on the last core. You should hear it.');
      h.say('Arden (recording)', 'If you are hearing this, you came for the cores yourself. I taught you to finish what you start. The vault. I will not run.', 7);
      h.say('Ione', '...That is Arden. That is your teacher\'s voice.');
      h.open('vault');
      h.checkpoint({ x: 1, z: 17, yaw: -Math.PI / 2 });
      h.spawn('vault');
    },
    retry: (m, h) => h.spawn('vault'),
    markers: () => [{ x: -9, z: 20, label: 'Vault' }],
    done: (m, h) => h.crewNear(VAULT, 9.5) >= 1,
  },
  {
    id: 'arden', title: 'Arden Vale', groups: ['vault'],
    text: (m) => (m.flags.ardenYielded ? 'Hear Arden out' : 'Face your teacher'),
    enter: (m, h) => {
      m.comms.length = Math.min(m.comms.length, 1); // the crew is here: whatever was still queued gives way
      h.say('Arden', 'The Houses hunt us with a word and a warrant. I gave the hunted something to shoot back with.');
      h.alarm();
    },
    retry: (m, h) => { h.spawn('vault'); h.flag('ardenHalf', false); },
    update: (m, h) => {
      const arden = h.tagged('arden');
      const f = arden && m.world.fighters.get(arden.id);
      if (!f || m.flags.ardenYielded) return;
      const hp = f.vitals.hp / f.vitals.max.hp;
      if (hp <= 0.55 && !m.flags.ardenHalf) { h.flag('ardenHalf'); h.say('Arden', 'You still drop your guard after the third cut. I never could fix that.'); }
      if (hp <= 0.2 || f.vitals.dead) {
        // never an execution: Arden yields
        h.flag('ardenYielded');
        arden.yielded = true;
        f.vitals.dead = false;
        f.vitals.hp = Math.max(f.vitals.hp, 1);
        f.action = null;
        f.guard = null;
        f.protectedUntil = Infinity;
        m.comms.length = 0;
        h.say('Arden', 'Enough. You have grown past me.');
        h.say('Arden', 'Take the cores. Decide for yourself who should hold them. I did.');
        h.say('Ione', 'The lift is here. Whatever you decide about Arden, decide it outside.');
      }
    },
    markers: (m, h) => { const a = h.tagged('arden'); const b = a && m.world.bodies.get(a.id); return b && !m.flags.ardenYielded ? [{ x: b.x, z: b.z, label: 'Arden Vale', follow: true }] : []; },
    done: (m) => !!m.flags.ardenYielded && m.comms.length === 0,
  },
];

export const CONTRABAND = Object.freeze({
  id: 'contraband',
  title: 'Contraband',
  start: { x: 0, z: -21.5, yaw: 0 },
  level: LEVEL,
  groups: GROUPS,
  interactables: INTERACTABLES,
  stages: STAGES,
  lift: LIFT,
  ending: 'The evidence is out. Arden Vale was gone from the vault when the wardens arrived.',
});
