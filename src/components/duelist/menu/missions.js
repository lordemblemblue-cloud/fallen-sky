// What the Story page says about each mission: its headline (tagline), what the crew is sent to do (line) and the
// stages of its timeline (parts). The missions themselves live in sim/missions/*.mjs.
export const STORY_MISSIONS = Object.freeze([
  {
    id: 'contraband', number: 1, title: 'Contraband', tagline: 'The cargo is not what it seems.',
    line: 'Break into a smugglers\' freight depot and find who is behind it.',
    parts: [
      ['Infiltration', 'Get into the Halvane Logistics freight depot and open the crates its manifest calls medical supplies.'],
      ['The Ledger', 'Three people sign every transfer: the quartermaster, the broker and the security chief. Find them and take their ledger cores.'],
      ['The Evidence', 'The depot locks down. Carry the cores to the cargo lift and hold it until it arrives.'],
      ['The Name', 'The buyer paid in Will-forged crystal. A recorded message plays in a voice you know.'],
    ],
  },
  {
    id: 'saltmarch', number: 2, title: 'Saltmarch', tagline: 'The ledger reached the wrong hands.',
    line: 'The ledger led the Houses to a refuge of the unbound. Get there before their wardens do.',
    parts: [
      ['The Lock', 'The refuge\'s defenders take you for wardens. Get inside; beaten, they stand down.'],
      ['The Keeper', 'Make the keeper stand down and hear who put the ledger in the Houses\' hands.'],
      ['The Bells', 'Ring the warning bells while the first wardens come through the yard.'],
      ['The Warrant', 'Hold the tunnel door beside your teacher, then face the captain who serves the warrant.'],
    ],
  },
]);
export const missionTitle = (id) => STORY_MISSIONS.find((m) => m.id === id)?.title || 'Contraband';
