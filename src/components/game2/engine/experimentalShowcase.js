// Part 6: in-engine AI combat presentation. Uses existing authored Fighter
// animation actions and does not attempt to export or fabricate a video file.
export const COMBAT_SHOWCASE_IDS = Object.freeze([
  'attack', 'style', 'throw', 'kata', 'kick', 'counter', 'experimental-bind',
  'experimental-chain', 'experimental-speed-saber', 'auto-dodge', 'push-speed',
  'pull-push', 'levitate-push', 'throw-lightning',
  'storm', 'charge-push', 'power-grip', 'power-push', 'power-speed',
]);
export const SHOWCASE_SHOT_SECONDS = 4.4;
export const SHOWCASE_CAMERA_LERP = 3.5;

export function selectCombatShowcase(lessons) {
  const byId = new Map(lessons.map(lesson => [lesson.id, lesson]));
  const selected = COMBAT_SHOWCASE_IDS.map(id => byId.get(id)).filter(Boolean);
  return selected.length ? selected.map(lesson => lesson.id) : lessons.slice(0, 1).map(l => l.id);
}

export function showcaseProgress(director, now) {
  if (!director?.showcase || !director.demoEnds || !Number.isFinite(now)) return null;
  const chapters = director.showcaseIds?.length || director.lessons?.().length || 1;
  const index = Math.max(0, (director.showcaseIndex || 0) % chapters);
  const duration = Math.max(0.01, director.demoEnds - director.demoStarted);
  const elapsed = Math.max(0, Math.min(duration, now - director.demoStarted));
  return {
    index, total: chapters, elapsed, duration,
    fraction: elapsed / duration,
    title: director.selected?.()?.title || 'AI combat demonstration',
  };
}

export function cameraShowcaseFrame(game, dt, singleLesson = false) {
  const director = game.tutorial, trainer = director?.trainer, target = director?.target;
  if ((!director?.showcase && !singleLesson) || director?.phase !== 'demo' || !trainer || !target) return false;
  const c = game.cam, now = game.t, t = Math.max(0, now - (director.demoStarted || now));
  const center = [
    (trainer.pos[0] + target.pos[0]) / 2,
    (trainer.pos[1] + target.pos[1]) / 2 + 1.25,
    (trainer.pos[2] + target.pos[2]) / 2,
  ];
  const spread = Math.hypot(trainer.pos[0] - target.pos[0], trainer.pos[2] - target.pos[2]);
  const shot = singleLesson ? 0 : (director.showcaseIndex || 0) % 3;
  const phase = t * (shot === 1 ? -0.10 : 0.10);
  const yaw = 0.65 + shot * 0.47 + phase;
  const pitch = 0.18 + 0.035 * Math.sin(t * 0.7);
  const dist = Math.max(4.4, Math.min(8.4, 4.6 + spread * 0.6));
  const eye = [
    center[0] - Math.sin(yaw) * Math.cos(pitch) * dist,
    center[1] + Math.sin(pitch) * dist,
    center[2] - Math.cos(yaw) * Math.cos(pitch) * dist,
  ];
  // Prefer authored arena walls to camera clipping. Shorten the boom rather
  // than allowing a cinematic camera to drift behind solid geometry.
  if (game.world?.collide) {
    const safe = eye.slice();
    game.world.collide(safe, 0.28);
    if (Math.hypot(safe[0] - eye[0], safe[2] - eye[2]) > 0.1) {
      for (let k = 0; k < 3; k++) eye[k] = center[k] + (eye[k] - center[k]) * 0.7;
    }
  }
  const blend = 1 - Math.exp(-SHOWCASE_CAMERA_LERP * Math.max(0, Math.min(dt, 0.1)));
  const lerp3 = (old, next) => next.map((v, i) =>
    (Number.isFinite(old?.[i]) ? old[i] : v) + (v - (Number.isFinite(old?.[i]) ? old[i] : v)) * blend);
  c.eye = lerp3(c.eye, eye);
  c.target = lerp3(c.target, center);
  c.pos = center.slice();
  c.fov = 55 * Math.PI / 180;
  game.sfx.listener = c.eye;
  return true;
}

// Ordinary 'Watch AI demonstrate' needs to frame the instructor too, not
// continue pointing the third-person camera at the idle learner. The cinematic
// showcase remains a separate chapter-based mode; both use the same collision
// aware, smoothly interpolated camera code.
export function cameraTutorialDemoFrame(game, dt) {
  if (game.tutorial?.showcase || game.tutorial?.phase !== 'demo') return false;
  return cameraShowcaseFrame(game, dt, true);
}
