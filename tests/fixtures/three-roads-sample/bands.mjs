// The three bands of the War of Three Roads as they stood when the story was retired
// (2026-11-27). They are the sample story the story tools are tested on.
import {
  BAND1_POINTS, BAND1_LINES, BAND1_PLEDGES, BAND1_STAGING,
} from './band1.mjs';
import {
  BAND2_POINTS, BAND2_POINT_AREAS, BAND2_LINES, BAND2_PLEDGES, BAND2_STAGING,
} from './band2.mjs';
import {
  BAND3_POINTS, BAND3_POINT_AREAS, BAND3_POINT_REGIONS, BAND3_LINES, BAND3_PLEDGES, BAND3_STAGING,
} from './band3.mjs';

export const SAMPLE_BANDS = Object.freeze([
  Object.freeze({
    id: 'band1',
    built: true,
    title: 'The opening: the town and the Gate Fields',
    areas: Object.freeze(['town', 'south']),
    points: BAND1_POINTS,
    pointAreas: Object.freeze({ floor_: 'south', woodpile: 'south', salt_store: 'south', graves_: 'south' }),
    defaultPointArea: 'town',
    lines: BAND1_LINES,
    pledges: BAND1_PLEDGES,
    staging: BAND1_STAGING,
  }),
  Object.freeze({
    id: 'band2',
    built: false, // its camps are not built yet: written, checked, not offered in the game
    title: "Each empire's camp and its first two chapters",
    areas: Object.freeze(['west', 'east', 'north']),
    points: BAND2_POINTS,
    pointAreas: BAND2_POINT_AREAS,
    defaultPointArea: null,
    lines: BAND2_LINES,
    pledges: BAND2_PLEDGES,
    staging: BAND2_STAGING,
  }),
  Object.freeze({
    id: 'band3',
    built: false,
    // Its chapters go under the valley and use roles, which the pledge engine cannot run yet
    // (band3.mjs, header). Not offered even in the preview until this is taken away.
    staged: false,
    title: 'The first half of the main story: the grotto, the stones, the hollow and the cistern',
    areas: Object.freeze(['west', 'north']),
    regions: Object.freeze(['wolfveil-caves']),
    points: BAND3_POINTS,
    pointAreas: BAND3_POINT_AREAS,
    pointRegions: BAND3_POINT_REGIONS,
    defaultPointArea: null,
    lines: BAND3_LINES,
    pledges: BAND3_PLEDGES,
    staging: BAND3_STAGING,
  }),
]);
