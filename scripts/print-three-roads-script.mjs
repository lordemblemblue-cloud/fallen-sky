// Writes the readable script of one band of The War of Three Roads from its
// data file, so the owner can read every pledge and every spoken line.
//   node scripts/print-three-roads-script.mjs
// Output: docs/game3d/three-empires/script/BAND1_SCRIPT.md
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { definePledge } from '../src/components/game3d/pledges/pledgeModel.mjs';
import { pledgePlace } from '../src/components/game3d/pledges/pledgePlaces.mjs';
import { threeRoadsPerson } from '../src/components/game3d/threeroads/script/cast.mjs';
import {
  BAND1_LINES, BAND1_PLEDGES, BAND1_STAGING,
} from '../src/components/game3d/threeroads/script/band1.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const outFile = resolve(here, '../docs/game3d/three-empires/script/BAND1_SCRIPT.md');

const nameOf = id => threeRoadsPerson(id)?.name || id;
const spoken = id => {
  const entry = BAND1_LINES[id];
  return entry ? `- **${nameOf(entry.speaker)}:** ${entry.text}` : `- [missing line ${id}]`;
};

// Lines a cue list speaks, in order, with a note where the line depends on the player.
function cueLines(cues = []) {
  const out = [];
  for (const cue of cues) {
    if (cue.say) out.push(spoken(cue.say));
    if (cue.sayByEmpire) {
      const seen = new Set();
      for (const [empire, id] of Object.entries(cue.sayByEmpire)) {
        if (empire === 'none' || seen.has(id)) continue;
        seen.add(id);
        out.push(spoken(id) + ` *(to a player of ${empire[0].toUpperCase() + empire.slice(1)})*`);
      }
    }
    if (cue.sound) out.push(`- *[${cue.sound.replace(/_/g, ' ')}]*`);
  }
  return out;
}

function watchLines(watch = {}) {
  const out = [];
  if (watch.sayAt) for (const value of Object.values(watch.sayAt))
    for (const id of Array.isArray(value) ? value : [value]) out.push(spoken(id));
  if (watch.sayEach) for (const id of watch.sayEach) out.push(spoken(id));
  return out;
}

const parts = [];
parts.push('# The War of Three Roads: the opening, as written');
parts.push('');
parts.push('Every pledge of the first band with every line that is spoken, in order. Made from `src/components/game3d/threeroads/script/band1.mjs` by `node scripts/print-three-roads-script.mjs`: change the data file, not this page.');
parts.push('');
let lineCount = 0;
let characters = 0;
for (const entry of Object.values(BAND1_LINES)) { lineCount += 1; characters += entry.text.length; }
parts.push(`${BAND1_PLEDGES.length} pledges, ${lineCount} spoken lines, ${characters.toLocaleString('en-US')} characters to record.`);
parts.push('');

for (const raw of BAND1_PLEDGES) {
  const pledge = definePledge(raw);
  const staging = BAND1_STAGING[pledge.id];
  const chapter = pledge.pledge.chapter ? `Main story, chapter ${pledge.pledge.chapter}` : 'Valley story';
  parts.push(`## ${pledge.title}`);
  parts.push('');
  parts.push(`${chapter}. Asked by ${nameOf(pledge.npcId)}.`);
  parts.push('');
  parts.push(`- **Sworn to:** ${pledge.pledge.swornTo}`);
  parts.push(`- **Why it is asked:** ${pledge.pledge.cause}`);
  parts.push(`- **What keeping it costs:** ${pledge.pledge.cost}`);
  parts.push('');
  parts.push('**When it is offered**');
  parts.push('');
  for (const id of staging.offer || []) parts.push(spoken(id));
  parts.push('');
  pledge.pledge.steps.forEach((step, index) => {
    const block = staging.steps[step.id] || {};
    const place = step.placeId ? pledgePlace(step.placeId) : null;
    parts.push(`**Step ${index + 1}. ${step.text}**${place ? ` *(${place.name})*` : ''}`);
    parts.push('');
    const lines = [
      ...cueLines(block.start), ...watchLines(block.watch),
      ...(block.along?.lines || []).map(spoken), ...cueLines(block.done),
    ];
    if (step.kind === 'choose') {
      const choice = pledge.pledge.choices[step.id];
      if (choice.prompt) lines.push(`- *${choice.prompt}*`);
      for (const option of choice.options) {
        const answer = staging.completeByChoice?.step === step.id ? staging.completeByChoice.lines[option.id] : null;
        lines.push(`- Choice: "${option.text}"`);
        if (answer) lines.push('  ' + spoken(answer));
      }
    }
    if (lines.length) { parts.push(...lines); parts.push(''); }
  });
  if ((staging.complete || []).length) {
    parts.push('**When it is finished**');
    parts.push('');
    for (const id of staging.complete) parts.push(spoken(id));
    parts.push('');
  }
}

mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, parts.join('\n'));
globalThis.console.log(`Wrote ${outFile}: ${BAND1_PLEDGES.length} pledges, ${lineCount} lines, ${characters} characters`);
