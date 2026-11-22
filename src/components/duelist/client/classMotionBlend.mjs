/** Visual-only attack-to-guard/chain transitions for original Duelist Adventure class forms.
 * These blend times are NOT action durations, hit windows or movement authority.
 * The core/server still chooses attack frames, roots, costs and results.
 */
const style = (entry, chain, out, settle, guard) => Object.freeze({ entry, chain, out, settle, guard });

export const CLASS_MOTION_BLEND = Object.freeze({
  warrior: style(0.095, 0.07, 0.14, 0.20, 0.09),  // red heavy stance: deliberate grounded recovery
  healer: style(0.045, 0.035, 0.095, 0.14, 0.05), // blue swift stance: light, responsive reset
  duelist: style(0.055, 0.04, 0.10, 0.15, 0.055), // separate blades: quick alternating links
  assassin: style(0.065, 0.045, 0.12, 0.18, 0.06),// staff: continuous arc into the next strike
});
export const DEFAULT_MOTION_BLEND = style(0.07, 0.06, 0.12, 0.18, 0.06);

/** Unknown/legacy classes retain existing default blending. */
export function classMotionBlend(classId) {
  return typeof classId === 'string' && Object.hasOwn(CLASS_MOTION_BLEND, classId)
    ? CLASS_MOTION_BLEND[classId] : DEFAULT_MOTION_BLEND;
}
