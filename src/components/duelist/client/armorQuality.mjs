// Local visual preferences only. Never send these settings to the match server.
export const ARMOR_QUALITY = Object.freeze({ full: 'full', low: 'low', hidden: 'hidden' });
export const DEFAULT_ARMOR_QUALITY = 'hidden';
export const ARMOR_CHOICES = Object.freeze([
  ['hidden', 'Maximum performance'],
  ['low', 'Low detail'],
  ['full', 'Full quality'],
]);
export function normalizeArmorQuality(value) {
  return value === 'full' || value === 'low' || value === 'hidden' ? value : DEFAULT_ARMOR_QUALITY;
}
export function armorQualityFor(prefs, personal) {
  return normalizeArmorQuality(personal ? prefs?.armorQuality : prefs?.otherArmorQuality);
}
export function armorPolicy(value) {
  const quality = normalizeArmorQuality(value);
  return { quality, simplified: quality !== 'full', attachedArmor: quality !== 'hidden', armorShadows: quality === 'full' };
}
