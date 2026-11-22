// The story data the pledge world reads, behind one door. Pure: no Three.js,
// no DOM. The script itself (script/band1.mjs, script/cast.mjs) belongs to the
// lead session and is only read here.
import { definePledge } from '../../pledges/pledgeModel.mjs';
import { BAND1_LINES, BAND1_PLEDGES, BAND1_POINTS, BAND1_STAGING } from '../script/band1.mjs';
import { THREE_ROADS_EMPIRES, threeRoadsPerson } from '../script/cast.mjs';

// The name this set of pledges is registered under (pledgeRegistry.mjs).
export const THREE_ROADS_PLEDGE_SOURCE = 'three-roads-band1';

let defined = null;

// The pledges of the opening, validated once. The same frozen objects are
// handed out every time, so a remount never makes a second copy of a pledge.
export function threeRoadsPledges() {
  if (!defined) defined = Object.freeze(BAND1_PLEDGES.map(raw => definePledge(raw)));
  return defined;
}

export function threeRoadsPledge(pledgeId) {
  return threeRoadsPledges().find(pledge => pledge.id === pledgeId) || null;
}

export const pledgeStaging = pledgeId => BAND1_STAGING[pledgeId] || null;
export const pledgePointLocal = name => BAND1_POINTS[name] || null;

// A line ready to show: who says it (id and name) and the words. A line id the
// script does not have comes back as a visible placeholder, never as silence.
export function pledgeLine(lineId) {
  const entry = BAND1_LINES[lineId];
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
export function empireOfFaction(factionId) {
  if (!factionId) return 'none';
  for (const empire of Object.values(THREE_ROADS_EMPIRES)) {
    if (empire.factionId && empire.factionId === factionId) return empire.id;
  }
  return 'none';
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
