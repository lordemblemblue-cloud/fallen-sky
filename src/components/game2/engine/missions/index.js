// Single-player mission registry. Add a mission: write missions/<name>.js (layout + groups + objectives) and list it here.
import { KEJIM_FRONTIER } from './kejimFrontier.js';

export const MISSIONS = Object.freeze({ kejim: KEJIM_FRONTIER });
export const MISSION_ORDER = ['kejim'];
