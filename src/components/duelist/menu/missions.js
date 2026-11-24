// What the Story page says about each mission: its headline (tagline), what the crew is sent to do (line) and the
// stages of its timeline (parts). The missions themselves live in sim/missions/*.mjs.
export const STORY_MISSIONS = Object.freeze([
  {
    id: 'contraband', number: 1, title: 'Contraband', tagline: 'Two patients. One freight seal.',
    line: 'Trace the blue drug from the clinic to a Halvane shipment.',
    parts: [
      ['Infiltration', 'Get into the Halvane Logistics freight depot and open the crates its manifest calls medical supplies.'],
      ['The Ledger', 'Three people sign every transfer: the quartermaster, the broker and the security chief. Find them and take their ledger cores.'],
      ['The Evidence', 'The depot locks down. Carry the cores to the cargo lift and hold it until it arrives.'],
      ['The Name', 'Follow the Legion payments and confront the teacher who signed for the crates.'],
    ],
  },
  {
    id: 'saltmarch', number: 2, title: 'Saltmarch', tagline: 'Someone kept the receipts.',
    line: 'Reach the Saltmarch witnesses before Captain Crane uses her warrant to silence them.',
    parts: [
      ['The Lock', 'The refuge\'s defenders take you for wardens. Get inside; beaten, they stand down.'],
      ['The Keeper', 'Earn the keeper’s trust and find the witness who counted Crane’s shipments.'],
      ['The Bells', 'Ring the warning bells while the first wardens come through the yard.'],
      ['The Warrant', 'Protect the evacuation, then face the drug lord behind the Legion’s gun supply.'],
    ],
  },
]);
export const missionTitle = (id) => STORY_MISSIONS.find((m) => m.id === id)?.title || 'Contraband';
