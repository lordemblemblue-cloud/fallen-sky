// What the Story page says about each mission: its headline (tagline), what the crew is sent to do (line) and the
// stages of its timeline (parts). The missions themselves live in sim/missions/*.mjs.
export const STORY_MISSIONS = Object.freeze([
  {
    id: 'contraband', number: 1, title: 'Contraband', tagline: 'A delivery slip in a sick kid’s pocket.',
    line: 'Track a shipment of blueglass from a Free Ports clinic to the Halvane freight depot.',
    parts: [
      ['Infiltration', 'Get into the Halvane Logistics freight depot and open the crates its manifest calls medical supplies.'],
      ['The Ledger', 'Three people sign every transfer: the quartermaster, the broker and the security chief. Find them and take their ledger cores.'],
      ['The Evidence', 'The depot locks down. Carry the cores to the cargo lift and hold it until it arrives.'],
      ['The Name', 'Listen to a freight receipt. Someone you trust signed for the load.'],
    ],
  },
  {
    id: 'saltmarch', number: 2, title: 'Saltmarch', tagline: 'A garrison for a shipment of guns.',
    line: 'Find the missing drivers at Saltmarch and bring Halvane in alive.',
    parts: [
      ['The Lock', 'The refuge\'s defenders take you for wardens. Get inside; beaten, they stand down.'],
      ['The Keeper', 'Earn a hearing from the keeper whose daughter drove the last load.'],
      ['The Bells', 'Ring the warning bells while the first wardens come through the yard.'],
      ['The Arrest', 'Hold the tunnel door beside your teacher, then face the man who owns the garrison.'],
    ],
  },
]);
export const missionTitle = (id) => STORY_MISSIONS.find((m) => m.id === id)?.title || 'Contraband';
