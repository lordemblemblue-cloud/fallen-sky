import * as THREE from 'three';
import { AXE_STATION_CONFIG, AXE_STATION_GROUPS, findAXEStationPlacement, resolveAXEStationCollision, stationDistance } from './AXEServiceStationConfig.js';
import { getAXEServiceStationClientState, mountAXEServiceStationRuntime, tickAXEServiceStationLifecycle, requestAXEStationInteraction } from './AXEServiceStationStore.js';

// Authored lightweight completed stations. All meshes join the existing world
// scene; geometry is allocated on first summon and shared until world teardown.
function createStationAssets() {
  const geometries = {
    box: new THREE.BoxGeometry(1, 1, 1),
    cylinder: new THREE.CylinderGeometry(1, 1, 1, 12),
    sphere: new THREE.SphereGeometry(1, 14, 10),
    cone: new THREE.ConeGeometry(1, 1, 4),
    torus: new THREE.TorusGeometry(1, .045, 6, 24),
  };
  const materials = {
    stone: new THREE.MeshStandardMaterial({ color: 0x53616c, roughness: .91 }),
    edge: new THREE.MeshStandardMaterial({ color: 0xa4a7a2, metalness: .45, roughness: .55 }),
    iron: new THREE.MeshStandardMaterial({ color: 0x272e33, metalness: .78, roughness: .4 }),
    wood: new THREE.MeshStandardMaterial({ color: 0x654a37, roughness: .86 }),
    cloth: new THREE.MeshStandardMaterial({ color: 0x263a50, roughness: .9, side: THREE.DoubleSide }),
    spirit: new THREE.MeshStandardMaterial({ color: 0xa8d6e9, emissive: 0x507e92, emissiveIntensity: .65, metalness: .3, roughness: .35 }),
    fire: new THREE.MeshStandardMaterial({ color: 0xffa647, emissive: 0xff4c0f, emissiveIntensity: 1.5 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x91c6bc, metalness: .3, roughness: .2 }),
  };
  return { geometries, materials, dispose() { Object.values(geometries).forEach(g => g.dispose()); Object.values(materials).forEach(m => m.dispose()); } };
}

function makeBuilder(assets, parent) {
  return (type, material, x, y, z, sx, sy, sz, rotation = null) => {
    const mesh = new THREE.Mesh(assets.geometries[type], assets.materials[material]);
    mesh.position.set(x, y, z); mesh.scale.set(sx, sy, sz);
    if (rotation) mesh.rotation.set(...rotation);
    mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
  };
}

export function buildAXEStationGeometry(assets, station) {
  const group = new THREE.Group(); group.name = `AXE_Service_${station.groupId}_${station.id}`;
  group.position.set(station.position.x, station.position.y, station.position.z);
  const add = makeBuilder(assets, group);
  // One metre of stone reaches below the lowest accepted footprint sample,
  // supporting the level workshop on natural sloped ground.
  add('box', 'stone', 0, -.46, 0, 4.8, 1, 4.2);
  add('box', 'edge', 0, .04, 0, 4.9, .12, 4.3);
  let glow = null, light = null;
  const table = (x, z, width = 1.5) => {
    add('box', 'wood', x, 1.05, z, width, .14, .8);
    for (const sign of [-1, 1]) add('box', 'wood', x + sign * (width / 2 - .13), .52, z, .16, 1, .65);
  };
  if (station.groupId === 'blacksmith') {
    add('box', 'stone', -1.45, .6, .9, 1.3, 1.15, 1.25);
    add('box', 'iron', -1.45, 1.45, 1.2, 1.4, .65, .7);
    add('box', 'stone', -1.45, 2.2, 1.2, .65, 1.2, .65);
    glow = add('sphere', 'fire', -1.45, 1.1, .45, .42, .23, .35);
    light = new THREE.PointLight(0xffa35c, 2.2, 8, 2); light.position.set(-1.45, 1.35, .15); group.add(light);
    add('box', 'stone', 0, .43, -.45, .78, .7, .7);
    add('box', 'iron', 0, .88, -.45, 1.15, .3, .45);
    add('cone', 'iron', .7, .9, -.45, .36, .6, .24, [0, 0, -Math.PI / 2]);
    table(1.35, .8, 1.55); table(1.4, -1.1, 1.3);
    add('sphere', 'spirit', 1.4, 1.22, -1.1, .14, .14, .14);
    for (const x of [-.65, .65]) add('box', 'wood', x, 1.18, 1.55, .12, 2.1, .12);
    add('box', 'wood', 0, 1.65, 1.55, 1.45, .13, .14);
    for (const x of [-.45, 0, .45]) { add('box', 'edge', x, 1.38, 1.5, .06, 1.1, .08, [0, 0, -.15]); add('box', 'wood', x, .77, 1.5, .12, .3, .1); }
  } else if (station.groupId === 'shrine') {
    add('cylinder', 'stone', 0, .4, 0, 1.1, .7, 1.1);
    add('cylinder', 'edge', 0, .85, 0, 1.35, .16, 1.35);
    glow = add('sphere', 'spirit', 0, 1.8, 0, .43, .43, .43);
    add('torus', 'spirit', 0, 1.8, 0, .85, .85, .85, [Math.PI / 2, .3, 0]);
    for (const x of [-1.7, 1.7]) { add('box', 'stone', x, .8, 1.1, .5, 1.5, .5); add('sphere', 'spirit', x, 1.65, 1.1, .16, .16, .16); }
  } else if (station.groupId === 'appearance') {
    for (const x of [-1.8, 1.8]) for (const z of [-1.4, 1.4]) add('box', 'wood', x, 1.5, z, .15, 2.9, .15);
    add('cone', 'cloth', 0, 3.05, 0, 3.1, .8, 2.5, [0, Math.PI / 4, 0]);
    add('box', 'edge', 0, 1.5, 1.5, 1.7, 2.6, .16);
    add('box', 'spirit', 0, 1.5, 1.39, 1.45, 2.3, .035);
    add('cylinder', 'stone', 0, .23, -.4, .85, .3, .85);
    table(-1.45, .65, .65);
  } else if (station.groupId === 'stable') {
    for (const x of [-1.8, 1.8]) for (const z of [-1.25, 1.25]) add('box', 'wood', x, .85, z, .17, 1.5, .17);
    for (const x of [-1.8, 1.8]) for (const y of [.55, 1]) add('box', 'wood', x, y, 0, .12, .12, 2.7);
    add('box', 'wood', 0, .5, 1.55, 2.8, .2, .65);
    add('cone', 'cloth', 0, 2.1, 1, 2.2, .6, 1.3, [0, Math.PI / 4, 0]);
    add('cylinder', 'wood', 1.3, .52, -.9, .3, .9, .3);
    add('torus', 'edge', 1.3, 1.1, -.9, .22, .22, .22);
  } else {
    table(0, .4, 3.5);
    for (const x of [-1.1, -.45, .3, 1.1]) {
      add('sphere', 'glass', x, 1.28, .4, .18, .23, .18);
      add('cylinder', 'edge', x, 1.54, .4, .065, .15, .065);
    }
    glow = add('sphere', 'spirit', .3, 1.35, .4, .12, .13, .12);
    add('box', 'wood', 0, 1.7, 1.4, 3.6, .13, .45);
    for (const x of [-1.7, 1.7]) add('box', 'wood', x, .9, 1.4, .12, 1.7, .4);
  }
  group.traverse(node => { if (node.isMesh) node.userData.axeStationId = station.id; });
  return { group, glow, glowScale: glow?.scale.clone(), light };
}

export function createAXEServiceStationRuntime({ scene, camera, renderer, context, sampleGround, isBlocked, getPlayers = () => [], onChanged = () => {} }) {
  let assets = null, disposed = false, nearest = null, previewGroup = null, elapsed = 0, nextLifecycle = 0, effectUntil = 0, focusStationId = null;
  let stationRecords = [], renderedStations = [];
  const visuals = new Map(), ray = new THREE.Raycaster(), pointer = new THREE.Vector2();
  const focusPosition = new THREE.Vector3(), focusTarget = new THREE.Vector3(), serviceCameraPosition = new THREE.Vector3();
  const prompt = document.createElement('div');
  prompt.className = 'axe-world-service-prompt'; prompt.style.cssText = 'position:absolute;left:50%;bottom:22%;transform:translateX(-50%);pointer-events:none;padding:8px 13px;border:1px solid #879db070;background:#111b25dc;color:#e1edf6;border-radius:4px;font:12px Georgia,serif;z-index:70;display:none';
  renderer.domElement.parentElement?.appendChild(prompt);
  function clearPreview() { previewGroup?.parent?.remove(previewGroup); previewGroup = null; }
  function refreshVisibleStations() {
    const c = context(), { activeStationId } = getAXEServiceStationClientState();
    renderedStations = stationRecords.filter(s => s.groupId !== 'blacksmith' && s.region === c.region && stationDistance(s.position, c.player) <= AXE_STATION_CONFIG.visibilityRadius)
      .sort((a, b) => Number(b.id === activeStationId) - Number(a.id === activeStationId) || stationDistance(a.position, c.player) - stationDistance(b.position, c.player))
      .slice(0, AXE_STATION_CONFIG.renderCap);
    const ids = new Set(renderedStations.map(s => s.id));
    let changed = false;
    for (const [id, visual] of visuals) if (!ids.has(id)) { if (previewGroup?.parent === visual.group) clearPreview(); scene.remove(visual.group); visuals.delete(id); changed = true; }
    for (const station of renderedStations) {
      if (!visuals.has(station.id)) {
        assets ||= createStationAssets();
        const visual = buildAXEStationGeometry(assets, station); visuals.set(station.id, visual); scene.add(visual.group); changed = true;
      }
      visuals.get(station.id).group.position.set(station.position.x, station.position.y, station.position.z);
    }
    if (changed) onChanged();
  }
  const api = {
    context,
    sync(stations) {
      if (disposed) return;
      stationRecords = stations; refreshVisibleStations();
    },
    findPlacement(stations) { const c = context(); return findAXEStationPlacement({ player: c.player, yaw: c.yaw, sampleGround, isBlocked, stations, players: [c.player, ...getPlayers()] }); },
    setPreview(item) {
      clearPreview();
      const stationId = getAXEServiceStationClientState().activeStationId;
      const visual = visuals.get(stationId);
      if (!item || !visual || !assets) return;
      // An inspection representation of the selected owned instance, never a
      // new inventory item or a claim to load an unavailable original asset.
      previewGroup = new THREE.Group(); previewGroup.name = `Inspection_${item.instanceId || item.id}`;
      previewGroup.userData.itemInstanceId = item.instanceId || item.id;
      previewGroup.userData.inspectionRepresentation = true;
      const add = makeBuilder(assets, previewGroup);
      const type = String(item.slot || item.type || item.category || '').toLowerCase();
      if (/armor|chest|robe|body/.test(type)) { add('box', 'edge', 0, 0, 0, .5, .62, .22); add('box', 'iron', 0, -.04, 0, .53, .12, .24); }
      else if (/ring|amulet|necklace|accessory/.test(type)) add('torus', 'spirit', 0, 0, 0, .25, .25, .25);
      else { add('box', 'edge', 0, .22, 0, .09, .95, .045); add('box', 'iron', 0, -.3, 0, .35, .06, .08); add('box', 'wood', 0, -.47, 0, .08, .28, .08); }
      previewGroup.position.set(0, 1.55, -.45); previewGroup.rotation.z = -.35; visual.group.add(previewGroup);
    },
    setPreviewRotation(angle) { if (previewGroup) previewGroup.rotation.y = angle; },
    playTransaction(id) { if (visuals.has(id)) effectUntil = elapsed + .65; },
    resolveCollision(position, radius) { return visuals.size ? resolveAXEStationCollision(position, renderedStations, radius) : false; },
    focusCamera(delta) {
      if (!window.__axeServiceModeOpen) { focusStationId = null; return; }
      const { activeStationId } = getAXEServiceStationClientState(), station = renderedStations.find(s => s.id === activeStationId);
      if (!station) { focusStationId = null; return; }
      if (focusStationId !== station.id) { focusStationId = station.id; serviceCameraPosition.copy(camera.position); }
      const rect = renderer.domElement.getBoundingClientRect();
      const aspect = rect.width / (rect.height || 1) || camera.aspect || 1;
      const tanHalfFov = Math.tan(THREE.MathUtils.degToRad(camera.fov || 50) / 2);
      const distance = Math.max(8.5, 3.8 / (tanHalfFov * aspect), 2.4 / tanHalfFov);
      focusTarget.set(station.position.x, station.position.y + 1.1, station.position.z);
      // Look into the open -Z front, with the forge chimney behind the anvil.
      // Keep our own interpolant: the gameplay camera still updates each tick.
      focusPosition.set(station.position.x + distance * .38, station.position.y + distance * .43, station.position.z - distance * .86);
      serviceCameraPosition.lerp(focusPosition, Math.min(1, delta * 7));
      camera.position.copy(serviceCameraPosition); camera.lookAt(focusTarget);
    },
    update(delta) {
      if (disposed) return;
      elapsed += Math.min(.1, delta);
      if (stationRecords.length && elapsed >= nextLifecycle) {
        nextLifecycle = elapsed + .25; tickAXEServiceStationLifecycle(); refreshVisibleStations();
      }
      if (!visuals.size) { nearest = null; prompt.style.display = 'none'; return; }
      const c = context(), snapshot = getAXEServiceStationClientState();
      let closestLight = null, closestDistance = Infinity; nearest = null;
      for (const station of renderedStations) {
        const visual = visuals.get(station.id); if (!visual) continue;
        const distance = stationDistance(c.player, station.position);
        visual.group.visible = station.region === c.region && distance <= AXE_STATION_CONFIG.visibilityRadius;
        if (visual.light) { visual.light.visible = false; if (visual.group.visible && distance < closestDistance && distance < 22) { closestDistance = distance; closestLight = visual.light; } }
        if (visual.glow && visual.group.visible) visual.glow.scale.copy(visual.glowScale).multiplyScalar(1 + .045 * Math.sin(elapsed * 2));
        if (visual.group.visible && distance <= AXE_STATION_CONFIG.interactionRange && (!nearest || distance < nearest.distance)) nearest = { station, distance };
      }
      if (closestLight) { closestLight.visible = true; closestLight.intensity = elapsed < effectUntil ? 3 : 2.2; }
      const show = nearest && c.allowed && !window.__axeUiModalOpen && !window.__axeServiceModeOpen;
      prompt.style.display = show ? '' : 'none';
      if (show) {
        const text = `E · Use ${AXE_STATION_GROUPS[nearest.station.groupId].label} · ${snapshot.mode === 'shared' ? 'Shared' : 'Personal'}`;
        if (prompt.textContent !== text) prompt.textContent = text;
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true; unmount(); clearPreview();
      renderer.domElement.removeEventListener('pointerdown', onPointer, true); window.removeEventListener('keydown', onKey, true);
      for (const visual of visuals.values()) scene.remove(visual.group);
      visuals.clear(); assets?.dispose(); prompt.remove();
    },
  };
  function onKey(e) {
    if (!nearest || e.repeat || e.code !== 'KeyE' || e.target?.closest?.('input,textarea,select,[contenteditable=true]') || window.__axeUiModalOpen || window.__axeServiceModeOpen || !context().allowed) return;
    e.preventDefault(); e.stopImmediatePropagation(); requestAXEStationInteraction(nearest.station);
  }
  function onPointer(e) {
    if (e.button !== 0 || window.__axeUiModalOpen || window.__axeServiceModeOpen || !context().allowed) return;
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.set((e.clientX - rect.left) / rect.width * 2 - 1, -(e.clientY - rect.top) / rect.height * 2 + 1); ray.setFromCamera(pointer, camera);
    const hit = ray.intersectObjects([...visuals.values()].filter(v => v.group.visible).map(v => v.group), true)[0];
    const id = hit?.object.userData.axeStationId;
    const station = renderedStations.find(s => s.id === id);
    if (station && stationDistance(context().player, station.position) <= AXE_STATION_CONFIG.interactionRange) { e.preventDefault(); e.stopImmediatePropagation(); requestAXEStationInteraction(station); }
  }
  const unmount = mountAXEServiceStationRuntime(api);
  renderer.domElement.addEventListener('pointerdown', onPointer, true); window.addEventListener('keydown', onKey, true);
  return api;
}
