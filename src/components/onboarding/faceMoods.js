// Facial moods for the fused characters. A character is not frozen in one
// face: gameplay (or the creator) picks a mood, and the FX_ expression shape
// keys (tools/avatar-fuse/shapes.py) blend toward it smoothly, with natural
// blinking and small idle movements on top. Combat reads fierce, a hit reads
// pain, and so on. Face capture (Universal Face Mocap / ARKit 52 through
// src/lib/mocap) can drive the same FX_ keys directly instead.
//
// Moods are combinations of the building-block keys, like ARKit blendshapes:
// fierce = brows down + squint + sneer + pressed lips.
export const FACE_MOODS = {
  neutral: {},
  happy: { FX_Smile_L: 0.75, FX_Smile_R: 0.75, FX_Squint_L: 0.25, FX_Squint_R: 0.25, FX_BrowUp_L: 0.15, FX_BrowUp_R: 0.15 },
  fierce: { FX_BrowDown: 0.85, FX_Squint_L: 0.55, FX_Squint_R: 0.55, FX_Sneer_L: 0.35, FX_Sneer_R: 0.35, FX_MouthPress: 0.6, FX_Frown_L: 0.2, FX_Frown_R: 0.2 },
  focused: { FX_BrowDown: 0.45, FX_Squint_L: 0.3, FX_Squint_R: 0.3, FX_MouthPress: 0.35 },
  angry: { FX_BrowDown: 1, FX_Squint_L: 0.4, FX_Squint_R: 0.4, FX_Sneer_L: 0.6, FX_Sneer_R: 0.6, FX_Frown_L: 0.5, FX_Frown_R: 0.5, FX_MouthStretch: 0.3 },
  pain: { FX_BrowInnerUp: 0.9, FX_BrowDown: 0.35, FX_Squint_L: 0.8, FX_Squint_R: 0.8, FX_MouthStretch: 0.7, FX_Frown_L: 0.35, FX_Frown_R: 0.35, FX_JawOpen: 0.15 },
  sad: { FX_BrowInnerUp: 0.8, FX_Frown_L: 0.6, FX_Frown_R: 0.6, FX_LookDown: 0.25, FX_MouthPress: 0.2 },
  surprised: { FX_BrowUp_L: 1, FX_BrowUp_R: 1, FX_EyeWide_L: 0.9, FX_EyeWide_R: 0.9, FX_JawOpen: 0.4, FX_MouthFunnel: 0.25 },
  shout: { FX_BrowDown: 0.8, FX_Squint_L: 0.5, FX_Squint_R: 0.5, FX_JawOpen: 0.75, FX_MouthStretch: 0.5, FX_Sneer_L: 0.3, FX_Sneer_R: 0.3 },
};
const ALL_KEYS = [...new Set(Object.values(FACE_MOODS).flatMap((m) => Object.keys(m)).concat(['FX_Blink_L', 'FX_Blink_R']))];

export class FaceMoodController {
  constructor(root) {
    this.meshes = [];
    root.traverse((n) => {
      if (n.isMesh && n.morphTargetDictionary && n.morphTargetInfluences && ALL_KEYS.some((k) => k in n.morphTargetDictionary))
        this.meshes.push(n);
    });
    this.weights = Object.fromEntries(ALL_KEYS.map((k) => [k, 0]));
    this.mood = 'neutral';
    this.intensity = 1;
    this.blinkIn = 2 + Math.random() * 3;
    this.blinkT = -1;
    this.time = 0;
    this.overrides = null; // live capture frame {FX_...: 0..1}
  }

  get supported() { return this.meshes.length > 0; }

  setMood(name, intensity = 1) {
    if (FACE_MOODS[name]) { this.mood = name; this.intensity = Math.max(0, Math.min(1, intensity)); }
  }

  /** A brief flash of another mood (e.g. pain on a hit), then back. */
  flash(name, seconds = 0.6, intensity = 1) {
    if (!FACE_MOODS[name]) return;
    this.flashMood = name; this.flashLeft = seconds; this.flashIntensity = intensity;
  }

  update(dt) {
    if (!this.meshes.length) return;
    this.time += dt;
    let mood = FACE_MOODS[this.mood], k = this.intensity;
    if (this.flashLeft > 0) { this.flashLeft -= dt; mood = FACE_MOODS[this.flashMood]; k = this.flashIntensity; }
    // blink every 2-6 s (faster when fierce), 0.16 s close-open
    this.blinkIn -= dt;
    if (this.blinkIn <= 0 && this.blinkT < 0) { this.blinkT = 0; this.blinkIn = (this.mood === 'fierce' ? 1.6 : 2.2) + Math.random() * 3.5; }
    let blink = 0;
    if (this.blinkT >= 0) { this.blinkT += dt; const u = this.blinkT / 0.16; blink = u < 0.5 ? u * 2 : Math.max(0, 2 - u * 2); if (u >= 1) this.blinkT = -1; }
    const rate = 1 - Math.exp(-dt * 9); // ~110 ms to settle
    for (const key of ALL_KEYS) {
      let target = (mood[key] || 0) * k;
      // small living movement so a held mood never looks frozen
      if (target > 0) target *= 0.92 + 0.08 * Math.sin(this.time * 1.7 + key.length);
      if (key === 'FX_Blink_L' || key === 'FX_Blink_R') target = Math.max(target, blink);
      if (this.overrides && key in this.overrides) target = this.overrides[key];
      this.weights[key] += (target - this.weights[key]) * (key.startsWith('FX_Blink') ? 1 : rate);
    }
    for (const mesh of this.meshes) {
      const dict = mesh.morphTargetDictionary;
      for (const key of ALL_KEYS) {
        const i = dict[key];
        if (i !== undefined) mesh.morphTargetInfluences[i] = this.weights[key];
      }
    }
  }
}

export function faceMoodsFor(root) {
  if (!root) return null;
  if (root.userData.faceMood === undefined) {
    const c = new FaceMoodController(root);
    root.userData.faceMood = c.supported ? c : false; // bodies without FX_ keys: checked once
  }
  return root.userData.faceMood || null;
}
