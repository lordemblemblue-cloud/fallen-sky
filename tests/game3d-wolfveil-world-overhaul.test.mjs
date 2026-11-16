import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createWolfveilVillage } from '../src/components/game3d/wolfveil/WolfveilScene.js';
import { WOLFVEIL_EXPLORABLE_CAVES, WOLFVEIL_CAVE_HUB, WOLFVEIL_CAVE_CORRIDORS } from '../src/components/game3d/wolfveil/WolfveilCaveLayout.mjs';
import { WOLFVEIL_IMPORTED_TOWN, WOLFVEIL_IMPORTED_TOWN_FLOOR_Y, insideWolfveilImportedTown } from '../src/components/game3d/wolfveil/WolfveilImportedTownLayout.mjs';
import { critiqueAndEnhanceWolfveilTown, buildWolfveilTownCanopyDressing } from '../src/components/game3d/wolfveil/WolfveilImportedTownCritique.mjs';
import { plantTownLawnGrassBlades } from '../src/components/game3d/wolfveil/WolfveilIndividualGrassBlades.js';

test('Wolfveil overhaul builds 4 interconnected caves, individual grass blades, sculpted mountains, textured dirt trails & detailed bridges', () => {
  // Stub browser loader globals so legacy remote CDN asset loaders stay inert in Node
  const prevDoc = globalThis.document;
  const prevPE = globalThis.ProgressEvent;
  const origLoad = THREE.FileLoader.prototype.load;
  globalThis.document = { createElementNS: () => ({ addEventListener() {}, removeEventListener() {} }) };
  globalThis.ProgressEvent ??= class ProgressEvent extends Event {};
  THREE.FileLoader.prototype.load = function () {};
  let village;
  try {
    const scene = new THREE.Scene();
    village = createWolfveilVillage(scene, {
      originAtMarket: true,
      silverWater: true,
      hideMarketStalls: true,
      importedTownAtMarket: true,
      spawnGroundTile: true,
      groundCover: { radius: 68, cellSize: 16, attemptsPerCell: 120, squareHalfExtent: 48 },
      houseModelLoader: { load() {} },
    });
  } finally {
    THREE.FileLoader.prototype.load = origLoad;
    if (prevDoc === undefined) delete globalThis.document; else globalThis.document = prevDoc;
    if (prevPE === undefined) delete globalThis.ProgressEvent; else globalThis.ProgressEvent = prevPE;
  }

  // 1. Terrain keeps every surface triangle. Caves are a second layer under it,
  // not holes punched through the one heightfield.
  assert.equal(village.geometry.attributes.position.count, 311 * 311);
  assert.equal(village.geometry.index.count, 310 * 310 * 6, 'surface heightfield stays intact over the caves');

  // 2. Four unique caves + central subterranean hub + 5 interconnecting tunnels
  assert.equal(WOLFVEIL_EXPLORABLE_CAVES.length, 4);
  assert.equal(WOLFVEIL_CAVE_CORRIDORS.filter(c => c.kind === 'tunnel').length, 5);
  assert.ok(village.caveSystem, 'cave system mounted on Game 3D Wolfveil');
  assert.ok(village.caveSystem.lightAnchorCount >= 20, 'caves and tunnels have interior lighting');
  assert.ok(village.walkableSurfaces.includes(village.caveSystem.floorMesh), 'cave stone floors registered for foot raycasts');

  // Player underground inside each cave chamber resolves cave floor, never sky mountain top.
  // Outdoor feet stay on the hillside until E actually enters.
  const first = WOLFVEIL_EXPLORABLE_CAVES[0];
  assert.equal(village.playerPalaceGroundY({
    x: first.chamber.x, y: first.chamber.y + 1.2, z: first.chamber.z + 70,
  }), null);
  village.caveSystem.interact({
    x: first.threshold[0], y: first.threshold[1], z: first.threshold[2] + 70,
  });
  for (const cave of WOLFVEIL_EXPLORABLE_CAVES) {
    const worldX = cave.chamber.x;
    const worldZ = cave.chamber.z + 70;
    const floorY = village.playerPalaceGroundY({ x: worldX, y: cave.chamber.y + 1.2, z: worldZ });
    assert.ok(Number.isFinite(floorY), `walkable underground floor in ${cave.name}`);
    assert.ok(Math.abs(floorY - cave.chamber.y) < 0.5);
  }
  const hubFloor = village.playerPalaceGroundY({ x: WOLFVEIL_CAVE_HUB.x, y: WOLFVEIL_CAVE_HUB.y + 1, z: WOLFVEIL_CAVE_HUB.z + 70 });
  assert.ok(Number.isFinite(hubFloor), 'subterranean rotunda hub floor is walkable');

  // Cave walls contain underground movement. Step south, where no tunnel leaves the rotunda.
  const pos = { x: WOLFVEIL_CAVE_HUB.x, y: WOLFVEIL_CAVE_HUB.y + 0.5, z: WOLFVEIL_CAVE_HUB.z - WOLFVEIL_CAVE_HUB.radius - 3 + 70 };
  const prev = { x: WOLFVEIL_CAVE_HUB.x, y: WOLFVEIL_CAVE_HUB.y + 0.5, z: WOLFVEIL_CAVE_HUB.z - WOLFVEIL_CAVE_HUB.radius + 2 + 70 };
  assert.equal(village.resolveBuildingCollision(pos, 0.62, prev, { player: true }), true);

  // 3. Individual 3D swaying grass blades field
  assert.ok(village.individualGrass.bladeInstances > 5000, 'thousands of individual 3D grass blades planted');
  assert.ok(village.individualGrass.chunks >= 10, 'spatially chunked for frustum culling');

  // 4. Dirt paths have Sumi-e albedo + bump map and never intrude across town center streets
  const pathMesh = village.world.meshes.find(m => m.name === 'SWV_PhysicalTraversablePathNetwork');
  assert.ok(pathMesh?.material?.map && pathMesh?.material?.bumpMap, 'dirt trails carry Sumi-e texture and bump relief');
  const pathPos = pathMesh.geometry.attributes.position;
  for (let i = 0; i < pathPos.count; i++) {
    const px = pathPos.getX(i), pz = pathPos.getZ(i);
    assert.equal(insideWolfveilImportedTown(px, pz, -6), false, 'no valley dirt path pokes through assembled town interior');
  }

  // 5. Bridges have 3D textured planks & twisted hemp rope rails
  const timberDeck = village.world.meshes.find(m => m.name === 'SWV_Bridge_SeatedWoodPlanks_residential_footbridge');
  const ropeRails = village.world.meshes.find(m => m.name === 'SWV_Bridge_ContinuousGradeMatchedRails_outer_trail_bridge');
  assert.ok(timberDeck?.material?.map && timberDeck?.material?.bumpMap, 'bridge planks textured with cedar grain & bump');
  assert.ok(ropeRails?.material?.map && ropeRails?.material?.bumpMap, 'bridge ropes textured with twisted hemp braid & bump');

  // 6. Sculpted mountains & immersive Sumi-e river shader
  const westPeak = village.world.meshes.find(m => m.name === 'SWV_TwinWolfEarPeak_West');
  assert.ok(westPeak.geometry.attributes.position.count >= 64 * 16, 'high-resolution sculpted Sumi-e mountain crags');
  assert.equal(village.river.water.material.name, 'Game3D_Wolfveil_SumiE_ImmersiveRiverWater');

  // Tick frame update & clean disposal
  village.update(0.016, { weather: 'rain', windDir: 'SW', windMph: 14 }, { x: -216, y: 20, z: 146 });
  village.dispose();
});

test('Assembled town critique smooths normals, removes flat shading, trims deep tile skirts, textures surfaces & plants park grass blades', () => {
  const townGroup = new THREE.Group();
  const townRoot = new THREE.Group();
  townRoot.position.set(0, WOLFVEIL_IMPORTED_TOWN_FLOOR_Y, 0);
  townGroup.add(townRoot);

  // Simulate unsmoothed, UV-less, flatShaded Blender town meshes + deep -5.4m tile skirt
  const tileGeo = new THREE.BoxGeometry(12, 6, 12);
  tileGeo.translate(0, -3, 0); // bottom at -6m below floor!
  tileGeo.deleteAttribute('normal');
  tileGeo.deleteAttribute('uv');
  const tileMesh = new THREE.Mesh(tileGeo, new THREE.MeshStandardMaterial({ name: 'Tile_0_0_mat', flatShading: true }));
  tileMesh.name = 'Tile_0_0';
  townRoot.add(tileMesh);

  const wallGeo = new THREE.CylinderGeometry(2, 2, 4, 16);
  wallGeo.deleteAttribute('normal');
  wallGeo.deleteAttribute('uv');
  const wallMesh = new THREE.Mesh(wallGeo, new THREE.MeshStandardMaterial({ name: 'cream_mat', flatShading: true }));
  wallMesh.name = 'cream';
  townRoot.add(wallMesh);

  const lawnGeo = new THREE.PlaneGeometry(10, 10);
  lawnGeo.rotateX(-Math.PI / 2);
  const lawnMesh = new THREE.Mesh(lawnGeo, new THREE.MeshStandardMaterial({ name: 'grass_mat', flatShading: true }));
  lawnMesh.name = 'grass';
  townRoot.add(lawnMesh);

  const critique = critiqueAndEnhanceWolfveilTown(townRoot, WOLFVEIL_IMPORTED_TOWN_FLOOR_Y);
  const canopy = buildWolfveilTownCanopyDressing(townGroup);
  const lawnBlades = plantTownLawnGrassBlades(townRoot, townGroup, { maxBlades: 400 });

  assert.equal(tileMesh.material.flatShading, false);
  assert.equal(wallMesh.material.flatShading, false);
  assert.ok(tileMesh.geometry.attributes.normal && tileMesh.geometry.attributes.uv);
  assert.ok(wallMesh.geometry.attributes.normal && wallMesh.geometry.attributes.uv);
  assert.ok(tileMesh.material.map && tileMesh.material.bumpMap, 'tiles receive dressed flagstone texture & bump');
  assert.ok(wallMesh.material.map && wallMesh.material.bumpMap, 'walls receive Sumi-e washi plaster texture & bump');

  // Verify deep -6m skirt was trimmed cleanly above -0.6m
  const minTileWorldY = tileMesh.geometry.boundingBox.min.y + townRoot.position.y;
  assert.ok(minTileWorldY >= WOLFVEIL_IMPORTED_TOWN_FLOOR_Y - 0.6, 'deep concrete skirt trimmed cleanly');
  assert.equal(lawnBlades?.count, 400, 'individual grass blades planted on town park lawns');

  canopy.update(0.016);
  lawnBlades.update(0.016);
  lawnBlades.dispose();
  canopy.dispose();
  critique.dispose();
});