// Writes the readable script of every band of The War of Three Roads from the
// data files, so the owner can read each pledge and every spoken line.
//   node scripts/print-three-roads-script.mjs
// Output: docs/game3d/three-empires/script/BAND<n>_SCRIPT.md, one per band.
import { mkdirSync, writeFileSync } from 'node:fs';
import process from 'node:process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { definePledge } from '../src/components/game3d/pledges/pledgeModel.mjs';
import { threeRoadsPerson, threeRoadsEmpireOfFaction, THREE_ROADS_EMPIRES }
  from '../src/components/game3d/threeroads/script/cast.mjs';
import { THREE_ROADS_BANDS } from '../src/components/game3d/threeroads/script/index.mjs';

// The story printed is whatever is registered with the story tools. None is registered in src
// since the War of Three Roads was retired (2026-11-27). To print a story, name a module that
// registers it:  node scripts/print-three-roads-script.mjs --content <module>
// (the tests' sample story is tests/fixtures/three-roads-sample/install.mjs). If that module
// exports pledgePlace(id), place names are printed too.
const contentAt = process.argv.indexOf('--content');
const content = contentAt > 0 && process.argv[contentAt + 1]
  ? await import(pathToFileURL(resolve(process.argv[contentAt + 1])).href) : {};
const pledgePlace = typeof content.pledgePlace === 'function' ? content.pledgePlace : () => null;

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(here, '../docs/game3d/three-empires/script');
const nameOf = id => threeRoadsPerson(id)?.name || id;

function writeBand(band) {
  const spoken = id => {
    const entry = band.lines[id];
    return entry ? `- **${nameOf(entry.speaker)}:** ${entry.text}` : `- [missing line ${id}]`;
  };
  // Lines a cue list speaks, in order, with a note where the line depends on the player.
  const cueLines = (cues = []) => {
    const out = [];
    for (const cue of cues) {
      if (cue.say) out.push(spoken(cue.say));
      if (cue.sayByEmpire) {
        const seen = new Set();
        for (const [empire, id] of Object.entries(cue.sayByEmpire)) {
          if (empire === 'none' || seen.has(id)) continue;
          seen.add(id);
          out.push(spoken(id) + ` *(to a player of ${THREE_ROADS_EMPIRES[empire].name})*`);
        }
      }
      if (cue.sound) out.push(`- *[${cue.sound.replace(/_/g, ' ')}]*`);
    }
    return out;
  };
  const watchLines = (watch = {}) => {
    const out = [];
    if (watch.sayAt) for (const value of Object.values(watch.sayAt))
      for (const id of Array.isArray(value) ? value : [value]) out.push(spoken(id));
    if (watch.sayEach) for (const id of watch.sayEach) out.push(spoken(id));
    return out;
  };

  const parts = [];
  let lineCount = 0;
  let characters = 0;
  for (const entry of Object.values(band.lines)) { lineCount += 1; characters += entry.text.length; }
  parts.push(`# The War of Three Roads, ${band.id.replace('band', 'band ')}: ${band.title}`);
  parts.push('');
  parts.push(`Every pledge of this band with every line that is spoken, in order. Made from \`src/components/game3d/threeroads/script/${band.id}.mjs\` by \`node scripts/print-three-roads-script.mjs\`: change the data file, not this page.`);
  parts.push('');
  parts.push(`${band.pledges.length} pledges, ${lineCount} spoken lines, ${characters.toLocaleString('en-US')} characters to record.`);
  parts.push('');

  for (const raw of band.pledges) {
    const pledge = definePledge(raw);
    const staging = band.staging[pledge.id];
    const empire = threeRoadsEmpireOfFaction(pledge.factionId);
    const kind = pledge.pledge.line === 'main' ? `Main story, chapter ${pledge.pledge.chapter}`
      : empire !== 'none' ? `${THREE_ROADS_EMPIRES[empire].name}'s story, chapter ${pledge.pledge.chapter}`
        : 'Valley story';
    parts.push(`## ${pledge.title}`);
    parts.push('');
    parts.push(`${kind}. Asked by ${nameOf(pledge.npcId)}.`);
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
      const optional = step.optional ? ' *(optional)*' : '';
      parts.push(`**Step ${index + 1}. ${step.text}**${place ? ` *(${place.name})*` : ''}${optional}`);
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

  const outFile = resolve(outDir, `${band.id.toUpperCase()}_SCRIPT.md`);
  writeFileSync(outFile, parts.join('\n'));
  globalThis.console.log(`${band.id}: ${band.pledges.length} pledges, ${lineCount} lines, ${characters} characters -> ${outFile}`);
  return { lineCount, characters };
}

mkdirSync(outDir, { recursive: true });
let lines = 0;
let characters = 0;
for (const band of THREE_ROADS_BANDS) {
  const totals = writeBand(band);
  lines += totals.lineCount;
  characters += totals.characters;
}
globalThis.console.log(`all bands: ${lines} lines, ${characters} characters`);
