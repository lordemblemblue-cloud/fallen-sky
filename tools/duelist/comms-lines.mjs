// Every comms line of the story missions, for recording them: public/audio/duelist/voices/lines.json lists
// each line once ({ id, mission, speaker, text }; id: client/voices.mjs lineId, the name its recording takes).
// Two ways in, so nothing is missed: each mission is played through with the autopilot (crews of one to four,
// a few seeds; this also finds lines put together while playing), counting the lines said as a mission starts;
// and every line written out in a mission's file (h.say('Speaker', '...') or a ['Speaker', '...'] pair in a
// table) is read from the source, so lines of a branch the autopilot never takes are listed too.
// Then record the new ones: tools/duelist/record-comms.mjs.
//   node tools/duelist/comms-lines.mjs
/* global process, console */
import { writeFileSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMission, stepMission, MISSION_ORDER } from '../../src/components/duelist/sim/mission.mjs';
import { createAutopilot, thinkAutopilot } from '../../src/components/duelist/sim/autopilot.mjs';
import { lineId } from '../../src/components/duelist/client/voices.mjs';
import { writtenLines } from './written-lines.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const out = join(root, 'public', 'audio', 'duelist', 'voices', 'lines.json');
const missionsDir = join(root, 'src', 'components', 'duelist', 'sim', 'missions');
const DT = 1 / 60;
const lines = new Map();
const add = (mission, speaker, text) => {
  const id = lineId(speaker, text);
  if (!lines.has(id)) lines.set(id, { id, mission, speaker, text });
};

// 1. played through
for (const mission of MISSION_ORDER) {
  for (const crew of [1, 2, 4]) {
    for (const seed of [1, 2, 3]) {
      const ids = ['a', 'b', 'c', 'd'].slice(0, crew);
      const m = createMission({ id: mission, players: ids.map((id) => ({ id, name: id })), seed });
      const heard = (events) => { for (const e of events) if (e.type === 'comms') add(mission, e.speaker, e.text); };
      heard(m.events); // said as the mission starts (the first step clears these)
      const pilots = ids.map((id, i) => createAutopilot(id, { seed: seed * 10 + i }));
      for (let i = 0; i < 60 * 60 * 20 && m.phase !== 'complete'; i++) {
        heard(stepMission(m, DT, Object.fromEntries(pilots.map((p) => [p.id, thinkAutopilot(m, p)]))).events);
      }
    }
  }
}
// 2. written out, in the order of the file, after what the autopilot heard of the same mission
const unheard = [];
for (const mission of MISSION_ORDER) {
  const file = readdirSync(missionsDir).find((f) => f === `${mission}.mjs`);
  if (!file) continue;
  for (const { speaker, text } of writtenLines(readFileSync(join(missionsDir, file), 'utf8'))) {
    if (!lines.has(lineId(speaker, text))) unheard.push(`${speaker}: ${text}`);
    add(mission, speaker, text);
  }
}

const list = MISSION_ORDER.flatMap((mission) => [...lines.values()].filter((l) => l.mission === mission));
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify({ lines: list }, null, 2)}\n`);
const speakers = [...new Set(list.map((l) => l.speaker))];
console.log(`${list.length} lines from ${speakers.length} speakers (${speakers.join(', ')}) -> ${out}`);
if (unheard.length) console.log(`${unheard.length} of them only from the missions' files (the autopilot never heard them):\n  ${unheard.join('\n  ')}`);
process.exitCode = 0;
