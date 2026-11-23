// Fixed-camera pictures of Game 3D for before/after comparisons (docs/GAME3D_LOW_POLY_20261122.md). Developer tool,
// dev server only, imported by hand from the page. Needs the classic renderer (`&renderer=webgl`): a WebGPU canvas
// reads back blank. Afterwards remove localStorage `fallen_sky_renderer_v1` (the renderer choice is remembered).
//
//   const c = await import('/src/components/game3d/performance/Game3DViewCapture.mjs');
//   const shot = await c.captureView(window, { id: 'town.plaza.N', x: 0, z: -70, heading: 'N' });  // local metres
//
// The player model is hidden for the picture; the eye is 1.7 m above the ground (or `eye` metres); `pitch` tilts the
// camera down in radians. The canvas is drawn at a fixed 960x540 at pixel ratio 1 and restored afterwards.
import { PERF_HEADINGS, PERF_WORLD_Z_OFFSET } from './Game3DPerfViewpoints.mjs';
import { sleep } from './Game3DAreaLoadTiming.mjs';

export async function captureView(host, { id, x, z, heading = 'N', eye = 1.7, pitch = -0.08, width = 960, height = 540, settleMs = 4000, quality = 0.86 }) {
  const renderer = host.__gw3dRenderer; const scene = host.__gw3dScene; const camera = host.__gw3dCamera;
  if (!renderer || !scene || !camera) throw new Error('world not running');
  if (renderer.isWebGPURenderer) throw new Error('captures need &renderer=webgl (a WebGPU canvas reads back blank)');
  const wx = x; const wz = z + PERF_WORLD_Z_OFFSET;
  const player = host.__gw3dWeaponDebug?.model ?? null;
  const ground = host.__axeTileInspectionSampleGroundY?.(wx, wz);
  const gy = Number.isFinite(ground) ? ground : 0;
  if (player) { player.position.set(wx, gy + 0.05, wz); player.updateMatrixWorld?.(true); }
  await sleep(settleMs); // streaming and LOD around the new spot
  const [dx, dz] = PERF_HEADINGS[heading] || PERF_HEADINGS.N;
  const cam = camera.clone();
  cam.position.set(wx, gy + eye, wz);
  cam.lookAt(wx + dx * 10, gy + eye + Math.tan(pitch) * 10, wz + dz * 10);
  cam.aspect = width / height; cam.updateProjectionMatrix(); cam.updateMatrixWorld(true);
  const size = renderer.getSize(new (camera.position.constructor)());
  const ratio = renderer.getPixelRatio();
  const wasVisible = player?.visible;
  try {
    if (player) player.visible = false;
    renderer.setPixelRatio(1); renderer.setSize(width, height, false);
    renderer.render(scene, cam);
    const dataUrl = renderer.domElement.toDataURL('image/jpeg', quality);
    return { id, x, z, heading, eye, pitch, groundY: gy, dataUrl };
  } finally {
    if (player) player.visible = wasVisible;
    renderer.setPixelRatio(ratio); renderer.setSize(size.x, size.y, false);
  }
}
