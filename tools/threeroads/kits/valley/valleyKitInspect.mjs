// The valley kit's checks: the shared kit inspector (../common/kitInspect.mjs) for 'valley'.
import { inspectKit } from '../common/kitInspect.mjs';

export { SIZE_TOLERANCE, parseGlb, imageSize } from '../common/kitInspect.mjs';
export const LIT_MATERIAL = 'valley_lit';
export const GLOW_MATERIAL = 'valley_glow';
export const inspectValleyKit = bytes => inspectKit(bytes, 'valley');
