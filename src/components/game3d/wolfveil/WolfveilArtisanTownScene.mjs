// Emblem Blue Wolfveil artisan district — single-scene, enterable low-poly town.
// This replaces the old whole-building AABB collision and keeps the canonical
// Wolfveil terrain, floor sampling, patrol NPCs, quest handoff and player HUD.
import * as THREE from 'three';
import { createAXETownPlaza } from './AXETownPlaza.js';
import { makeWolfveilTownNavigation } from './WolfveilTownInteriorNavigation.mjs';
import {
  WOLFVEIL_IMPORTED_TOWN,
  WOLFVEIL_IMPORTED_TOWN_FLOOR_Y,
} from './WolfveilImportedTownLayout.mjs';
import { buildWolfveilTownLivingQuarter } from './WolfveilTownLivingQuarterScene.mjs';

export function installWolfveilArtisanTown(scene, { renderer = null, onStatus, onReady, quality = 'auto' } = {}) {
  if (!scene?.add) throw new Error('Artisan town requires an active Game 3D scene');
  const layout = WOLFVEIL_IMPORTED_TOWN;
  const root = new THREE.Group();
  root.name = 'Wolfveil_Artisan_Town_Replacement';
  root.userData.townId = 'wolfveil-artisan-town';
  scene.add(root);

  let active = true;
  let elapsed = 0;
  let livingQuarter = null;
  let town;
  try {
    town = createAXETownPlaza({
      THREE, renderer, quality, includeLighting: false,
      showOuterHomes: true, showInnerShops: true, worldScale: 1,
    });
    town.group.position.set(layout.x, WOLFVEIL_IMPORTED_TOWN_FLOOR_Y + .025, layout.z + 70);
    root.add(town.group);
  } catch (error) {
    scene.remove(root);
    onStatus?.({ state: 'error', reason: error?.message || String(error) });
    throw error;
  }

  // Child transforms are static and deliberately match the author's mesh
  // placements. Use real placed centers/yaws, not approximate catalog anchors.
  const asNavRoom = item => ({
    id: item.id, label: item.label || item.id,
    x: town.group.position.x + item.group.position.x,
    z: town.group.position.z + item.group.position.z,
    yaw: item.group.rotation.y,
    scale: item.group.scale.x * town.group.scale.x,
  });
  const nav = makeWolfveilTownNavigation({
    shops: town.rooms.shops.map(asNavRoom),
    homes: town.rooms.homes.map(asNavRoom),
    fountain: {x: town.group.position.x, z: town.group.position.z, radius: 6.55},
  });
  const groundY = (x, z) => (
    Number.isFinite(x) && Number.isFinite(z) &&
    Math.abs(x - town.group.position.x) <= layout.width / 2 &&
    Math.abs(z - town.group.position.z) <= layout.depth / 2
      ? WOLFVEIL_IMPORTED_TOWN_FLOOR_Y + (nav.roomAt({x,z}) ? .46 : .025)
      : null
  );
  const collision = {
    groundAt: groundY,
    isSolid: nav.isSolid,
  };
  livingQuarter = buildWolfveilTownLivingQuarter(root, {
    collision, architectureEnabled: false,
    onStatus(report) { root.userData.cloneTownLivingQuarter = report; },
  });
  root.userData.townReplacement = {
    version: 'walkable-artisan-town-v2',
    source: 'owner-supplied-japanese-egyptian-diorama',
    collision: 'oriented-wall-segments-with-open-doors',
    roomReport: nav.report,
    performance: town.performanceStats,
    oldBlenderTownLoaded: false,
  };
  queueMicrotask(() => {
    if (!active) return;
    onStatus?.({state:'ready', reason:'Artisan plaza walkable interiors loaded'});
    onReady?.();
  });
  let cutawayRoomId = null;
  return {
    root,
    get status() { return active ? 'ready' : 'disposed'; },
    get model() { return town.group; },
    get livingQuarterReport() { return livingQuarter?.report || null; },
    get performanceStats() { return town.performanceStats; },
    get interiorReport() { return nav.report; },
    groundY,
    isSolid(x,z) { return nav.isSolid(x,z) || Boolean(livingQuarter?.isSolid(x,z)); },
    nearestShop(position) { return nav.nearestShop(position); },
    getRoomAt(position) { return nav.roomAt(position); },
    selectShowroomModel(index) { return town.setShowroomModel(index); },
    nearestResident(position) { return livingQuarter?.nearestResident(position) || null; },
    interactResident(position) { return livingQuarter?.interact(position) || null; },
    resolveCollision(position,previous) {
      const wallHit = nav.resolveCollision(position,previous);
      const residentHit = livingQuarter?.resolveCollision(position,previous) || false;
      return wallHit || residentHit;
    },
    update(dt,playerPosition) {
      if (!active || !Number.isFinite(dt)) return;
      const step = Math.min(Math.max(dt,0),.1);
      elapsed += step;
      town.update(step,elapsed,playerPosition);
      livingQuarter?.update(step,playerPosition);
      const roomId = nav.roomAt(playerPosition)?.id || null;
      if (roomId !== cutawayRoomId) {
        cutawayRoomId = roomId;
        town.setRoofsVisible(!roomId);
        town.setIndoorCutaway(roomId);
      }
    },
    dispose() {
      if (!active) return;
      active = false;
      livingQuarter?.dispose();
      livingQuarter = null;
      town.dispose();
      scene.remove(root);
      root.clear();
    },
  };
}
