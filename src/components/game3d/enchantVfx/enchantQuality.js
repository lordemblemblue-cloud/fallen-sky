// Renderer quality profile for enchantment visuals (handoff "RendererQuality"): phones and other
// coarse-pointer devices get the mobile profile (half the weapon sparks, one aura layer, no glass
// layer); inlay readability is the same on both. QA can force a profile:
//   window.game3dEnchantVfx.setQuality('mobile')
let forced = null;
let detected = null;

function detect() {
  try {
    const coarse = globalThis.matchMedia?.('(pointer: coarse)')?.matches;
    const narrow = (globalThis.innerWidth || 1920) < 760;
    return coarse && narrow ? 'mobile' : 'desktop';
  } catch {
    return 'desktop';
  }
}

export function getEnchantQuality() {
  if (forced) return forced;
  if (!detected) detected = detect();
  return detected;
}

export function setEnchantQuality(quality) {
  forced = quality === 'mobile' || quality === 'desktop' ? quality : null;
  return getEnchantQuality();
}
