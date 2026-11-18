// Faction pets through the game's own companion path: the companion definition (companionData.jsx),
// GameWorld3D's setupCompanion (Faction 3 facing frame + normalisation), prepareMountAnimationClips
// (mountAnimations.mjs) and the Faction 3 secondary rig after the mixer (factionThreeMountRig.mjs).
// The pet travels towards +Z, the direction CompanionAISystem's atan2(v.x, v.z) yaw assumes; the world
// root stays at yaw 0 so the sheet shows exactly what the game's facing rule produces.
//   ?companion=faction_tiger&clips=idle,walk,run&phases=0,0.25,0.5,0.75&view=side|travel|front&tag=before
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { COMPANION_DEFINITIONS } from '../../../src/components/game3d/companionData.jsx';
import { prepareMountAnimationClips } from '../../../src/components/game3d/character/mountAnimations.mjs';
import { createFactionThreeFacingFrame } from '../../../src/components/game3d/character/factionThreeMountFacing.mjs';
import { createFactionThreeMountRig } from '../../../src/components/game3d/character/factionThreeMountRig.mjs';

const params = new URLSearchParams(location.search);
const report = document.getElementById('report');
const log = [];
const out = (s) => { log.push(s); report.textContent = log.join('\n'); };

async function main() {
  const id = params.get('companion') || 'faction_tiger';
  const def = COMPANION_DEFINITIONS.find((c) => c.id === id);
  if (!def) throw new Error(`no companion ${id}`);
  const clipNames = (params.get('clips') || 'idle,walk,run').split(',');
  const phases = (params.get('phases') || '0,0.25,0.5,0.75').split(',').map(Number);
  const view = params.get('view') || 'side';
  const cw = 300; const ch = 260;
  const canvas = document.getElementById('c');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(cw * phases.length, ch * clipNames.length);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setScissorTest(true);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x34373d);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x3a3530, 1.7));
  const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(2, 4, 3); scene.add(key);
  scene.add(new THREE.GridHelper(8, 16, 0x777777, 0x555555));
  scene.add(new THREE.ArrowHelper(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0.02, -0.2), 1.8, 0xff4040, 0.25, 0.12));

  const gltf = await new GLTFLoader().loadAsync(def.modelUrl);
  const model = gltf.scene;
  // GameWorld3D setupCompanion: the Faction 3 facing frame wraps the model (a no-op group for other
  // pets), then the largest dimension is scaled to 1.7 m x definition scale
  const { worldRoot: root } = createFactionThreeFacingFrame(model, def);
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  root.scale.setScalar((1.7 / Math.max(size.x, size.y, size.z)) * (def.scale || 1));
  scene.add(root);
  model.traverse((n) => { if (n.isSkinnedMesh) n.frustumCulled = false; });
  const rig = createFactionThreeMountRig(model, def); // after placement, before animation
  const clips = await prepareMountAnimationClips(model, gltf.animations || [], def);
  root.updateMatrixWorld(true);
  const ground = new THREE.Box3().setFromObject(root);
  root.position.y -= ground.min.y;
  out(`facing frame yaw ${(((root.userData.mountVisualYawCorrection) || 0) * 180 / Math.PI).toFixed(1)} deg; secondary rig ${rig.active ? 'active' : 'off'}`);
  out(`${def.name} (${id}): ${clips.map((c) => `${c.name} ${c.duration.toFixed(2)}s/${c.tracks.length} tracks`).join(', ')}`);
  // which way does the body point inside the root? (pelvis -> chest, world XZ)
  const bone = (re) => { let b = null; root.traverse((n) => { if (!b && n.isBone && re.test(n.name)) b = n; }); return b; };
  const pelvis = bone(/^pelvis$|pelvis_01$/i); const chest = bone(/^chest$|chest_010$/i);
  if (pelvis && chest) {
    const f = chest.getWorldPosition(new THREE.Vector3()).sub(pelvis.getWorldPosition(new THREE.Vector3()));
    f.y = 0; f.normalize();
    out(`body forward (world XZ) at rest: ${f.x.toFixed(2)}, ${f.z.toFixed(2)}  (the game moves pets along +Z)`);
  }
  const mixer = new THREE.AnimationMixer(model); // GameWorld3D: new THREE.AnimationMixer(companionModel)
  const camera = new THREE.PerspectiveCamera(30, cw / ch, 0.05, 60);
  const target = new THREE.Vector3(0, 0.7, 0);
  if (view === 'travel') camera.position.set(3.4, 1.8, 4.6);
  else if (view === 'front') camera.position.set(0.2, 1.1, 5.6);
  else camera.position.set(5.6, 1.1, 0.3);
  camera.lookAt(target);
  const labels = document.getElementById('labels');
  labels.style.gridTemplateColumns = `repeat(${phases.length}, ${cw}px)`;
  labels.style.gridAutoRows = `${ch}px`;
  clipNames.forEach((name, row) => {
    const clip = clips.find((c) => c.name === name);
    phases.forEach((phase, col) => {
      mixer.stopAllAction();
      if (clip) { mixer.clipAction(clip).reset().play(); mixer.setTime(clip.duration * phase); }
      rig.update(1 / 60); // the Faction 3 secondary rig runs after the mixer, as in the game loop
      root.updateMatrixWorld(true);
      const x = col * cw; const y = (clipNames.length - 1 - row) * ch;
      renderer.setViewport(x, y, cw, ch); renderer.setScissor(x, y, cw, ch);
      renderer.render(scene, camera);
      const label = document.createElement('div');
      label.textContent = `${name} @${phase}${clip ? '' : ' (missing)'}`;
      labels.appendChild(label);
    });
  });
  const shot = document.createElement('canvas');
  shot.width = canvas.width; shot.height = canvas.height;
  const g = shot.getContext('2d');
  g.drawImage(canvas, 0, 0);
  g.font = '13px system-ui, sans-serif'; g.fillStyle = '#f4efe2'; g.shadowColor = '#000'; g.shadowBlur = 3;
  [...labels.children].forEach((el, i) => g.fillText(el.textContent, (i % phases.length) * cw + 6, Math.floor(i / phases.length) * ch + 16));
  const file = `pet-${id}-${view}${params.get('tag') ? `-${params.get('tag')}` : ''}.png`;
  out(`saved ${await fetch(`/__shot?name=${file}`, { method: 'POST', body: shot.toDataURL('image/png') }).then((r) => r.text())}`);
  document.title = `pet ${id} done`;
}

main().catch((e) => { out(`error: ${e.stack || e}`); console.error(e); });
