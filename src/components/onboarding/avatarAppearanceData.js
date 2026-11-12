// Face and body defaults shared by the account avatar and every preview.
// Bodies carry their own shape keys; these values are the neutral fit used when
// a saved appearance has no explicit value.
export const FACE_SHAPES = ['oval', 'round', 'square', 'heart', 'long', 'diamond'];

export const FIT_DEFAULTS = Object.freeze({
  face_shape: 'oval',
  face_shape_strength: 1,
  height_scale: 1,
  body_proportions: Object.freeze({ width: 1, depth: 1 }),
});

export function normalizeFaceShape(value) {
  const shape = String(value || '').toLowerCase();
  return FACE_SHAPES.includes(shape) ? shape : FIT_DEFAULTS.face_shape;
}

export function normalizeBodyProportions(value = {}) {
  const clamp = (n, fallback) => (Number.isFinite(Number(n)) ? Math.min(1.12, Math.max(0.88, Number(n))) : fallback);
  return {
    width: clamp(value?.width, FIT_DEFAULTS.body_proportions.width),
    depth: clamp(value?.depth, FIT_DEFAULTS.body_proportions.depth),
  };
}