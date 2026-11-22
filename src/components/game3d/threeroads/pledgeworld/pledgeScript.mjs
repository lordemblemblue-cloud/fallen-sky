// The story data the pledge world reads, behind one door. Pure: no Three.js,
// no DOM. The script itself (script/band1.mjs, script/cast.mjs) belongs to the
// lead session and is only read here.
import { definePledge } from '../../pledges/pledgeModel.mjs';
import {
  THREE_ROADS_BANDS, threeRoadsBuiltBands, threeRoadsLine, threeRoadsPoint,
} from '../script/index.mjs';
import { threeRoadsEmpireOfFaction, threeRoadsHomeOf, threeRoadsPerson } from '../script/cast.mjs';
import { threeRoadsPreviewEnabled } from '../threeRoadsFlag.mjs';

// The name the pledges are registered under (pledgeRegistry.mjs).
export const THREE_ROADS_PLEDGE_SOURCE = 'three-roads';

// Each band's pledges, validated once. The same frozen objects are handed out
// every time, so a remount never makes a second copy of a pledge.
const byBand = new Map();
export function threeRoadsBandPledges(bandId) {
  if (!byBand.has(bandId)) {
    const band = THREE_ROADS_BANDS.find(entry => entry.id === bandId);
    byBand.set(bandId, Object.freeze(band ? band.pledges.map(raw => definePledge(raw)) : []));
  }
  return byBand.get(bandId);
}

// The pledges the game offers: those of the bands whose places are built
// (script/index.mjs decides; band 1 today). Lines, points and staging are
// read from every band that has been written.
// With the builders' preview switch on, the bands still being built are offered too.
const definedBy = new Map();
export function threeRoadsPledges(preview = threeRoadsPreviewEnabled(globalThis.window)) {
  const key = !!preview;
  if (!definedBy.has(key)) definedBy.set(key, Object.freeze(threeRoadsBuiltBands({ preview: key }).flatMap(band => threeRoadsBandPledges(band.id))));
  return definedBy.get(key);
}

export function threeRoadsPledge(pledgeId) {
  return threeRoadsPledges().find(pledge => pledge.id === pledgeId) || null;
}

export function pledgeStaging(pledgeId) {
  for (const band of THREE_ROADS_BANDS) if (band.staging[pledgeId]) return band.staging[pledgeId];
  return null;
}
export const pledgePointLocal = name => threeRoadsPoint(name);

// A line ready to show: who says it (id and name) and the words. A line id the
// script does not have comes back as a visible placeholder, never as silence.
export function pledgeLine(lineId) {
  const entry = threeRoadsLine(lineId);
  if (!entry) return Object.freeze({ lineId, speaker: null, speakerName: '', text: '[line: ' + lineId + ']', missing: true });
  return Object.freeze({
    lineId,
    speaker: entry.speaker,
    speakerName: threeRoadsPerson(entry.speaker)?.name || entry.speaker,
    text: entry.text,
    missing: false,
  });
}

export const pledgePersonName = id => threeRoadsPerson(id)?.name || null;

// 'akitsu' | 'remoria' | 'tameri' for a character of that faction, otherwise
// 'none' (the mapping is the cast file's: AXE_Faction_1 is Akitsu, _2 Remoria,
// _3 Tameri).
export const empireOfFaction = factionId => (factionId ? threeRoadsEmpireOfFaction(factionId) : 'none');

// Where a person normally stands, in LOCAL metres: the place they have in
// `area` if the cast table gives them one there, otherwise their main home
// for the story so far. Null for someone only a pledge brings in.
export function pledgeHome(id, flags = {}, area = null) {
  const person = threeRoadsPerson(id);
  if (!person) return null;
  const home = threeRoadsHomeOf(person, flags);
  if (area && home?.area !== area) {
    const other = (person.alsoAt || []).find(entry => entry.area === area);
    if (other) return other;
  }
  return home;
}

// The lines of the offer and of the ending, for the dialogue box. The ending
// starts with the line the script gives for the choice that was made.
export function pledgeDialogueLines(pledge, questState = {}) {
  const staging = pledgeStaging(pledge?.id);
  const offer = (staging?.offer || []).map(pledgeLine);
  const complete = [];
  const byChoice = staging?.completeByChoice;
  if (byChoice?.step && byChoice.lines) {
    const chosen = questState?.choices?.[pledge.id + ':' + byChoice.step];
    if (chosen && byChoice.lines[chosen]) complete.push(pledgeLine(byChoice.lines[chosen]));
  }
  for (const lineId of staging?.complete || []) complete.push(pledgeLine(lineId));
  return { offer, complete };
}
