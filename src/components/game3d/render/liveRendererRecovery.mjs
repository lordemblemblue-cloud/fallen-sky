/**
 * Temporary Fallen Sky live-world safety gate after the 2026-11-21 all-black-world report.
 *
 * The world graph can be fully populated (HUD, actors, geography, lights) while a
 * WebGPU renderer submits zero draws. Until that GPU pipeline has been verified
 * in the actual Windows live shell, do not select WebGPU automatically for this
 * PARTICULAR 3D world. Keep Duelist Adventure and the shared selection policy
 * unchanged. This does not remove WebGPU support: an explicit URL preview
 * (?renderer=webgpu or ?renderer=webgl2) still opts in for engineers.
 *
 * IMPORTANT: A previously saved renderer override is NOT an explicit opt-in
 * to a possibly black live world. The URL must carry the preview request.
 */
export const FALLEN_SKY_BLACK_SCENE_FALLBACK = 'fallen-sky-black-scene-safety';

export function resolveFallenSkyLiveRendererChoice(choice, { search = '' } = {}) {
  if (!choice || choice.kind === 'webgl') return choice;
  let requested = null;
  try { requested = new URLSearchParams(search).get('renderer'); }
  catch { /* cannot safely infer a developer opt-in */ }

  if ((requested === 'webgpu' || requested === 'webgl2') && choice.kind === requested) {
    return choice;
  }

  return { kind: 'webgl', reason: FALLEN_SKY_BLACK_SCENE_FALLBACK };
}
