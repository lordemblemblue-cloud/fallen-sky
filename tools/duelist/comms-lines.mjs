// Every comms line of the story missions, for recording them: public/audio/duelist/voices/lines.json lists
// each line once ({ id, mission, speaker, text }; id: client/voices.mjs lineId, the name its recording takes).
// The lines are collected by playing each mission through with the autopilot (crews of one to four, a few
// seeds), so whatever a stage says along the way is found. A recording dropped into the folder plays instead of
// the browser's voice once voices.json lists it: { "lines": { "<id>": "<id>.mp3" } }.
//   node tools/duelist/comms-lines.mjs
/* global process, console */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMission, stepMission, MISSION_ORDER } from '../../src/components/duelist/sim/mission.mjs';
import { createAutopilot, thinkAutopilot } from '../../src/components/duelist/sim/autopilot.mjs';
import { lineId } from '../../src/components/duelist/client/voices.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const out = join(root, 'public', 'audio', 'duelist', 'voices', 'lines.json');
const DT = 1 / 60;
const lines = new Map();
for (const mission of MISSION_ORDER) {
  for (const crew of [1, 2, 4]) {
    for (const seed of [1, 2, 3]) {
      const ids = ['a', 'b', 'c', 'd'].slice(0, crew);
      const m = createMission({ id: mission, players: ids.map((id) => ({ id, name: id })), seed });
      const pilots = ids.map((id, i) => createAutopilot(id, { seed: seed * 10 + i }));
      for (let i = 0; i < 60 * 60 * 20 && m.phase !== 'complete'; i++) {
        const { events } = stepMission(m, DT, Object.fromEntries(pilots.map((p) => [p.id, thinkAutopilot(m, p)])));
        for (const e of events) {
          if (e.type !== 'comms') continue;
          const id = lineId(e.speaker, e.text);
          if (!lines.has(id)) lines.set(id, { id, mission, speaker: e.speaker, text: e.text });
        }
      }
    }
  }
}
const list = [...lines.values()];
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify({ lines: list }, null, 2)}\n`);
const speakers = [...new Set(list.map((l) => l.speaker))];
console.log(`${list.length} lines from ${speakers.length} speakers (${speakers.join(', ')}) -> ${out}`);
process.exitCode = 0;
