/* eslint-disable */
// Arena: pillars, braziers, physics props (crates / barrels) for the force powers to play with.
// Three sources of geometry: the procedural explorer arena, an imported Raven BSP (duel) or an authored mission
// level (level/builder.js) with its own collision space, navigation grid, doors and lamps.
import { geo } from './gl.js';
import { m4, q as Q, clamp } from './math.js';
import { BSPCollision } from './rbsp.js';
import { LevelSpace } from './level/space.js';
import { NavGrid } from './level/nav.js';
import { buildTrainingGardenDetail } from './levels/trainingGarden.js';
import { buildTrainingHallFinish } from './levels/trainingHallFinish.js';
import { buildTrainingMetalTrialPatch } from './levels/trainingMetalTrialPatch.js';
import { createStrongholdPhotoAtlas } from './levels/sumiStrongholdPhotoAtlas.js';
import { loadStrongholdGLBWalls, renderStrongholdGLBWalls } from './levels/sumiStrongholdGLBRenderer.js';
import { loadSumiOwnerWalls, drawSumiOwnerWalls } from './levels/sumiOwnerWallGLBs.js';
import { buildKejimEntranceRemaster } from './missions/kejimEntranceRemaster.js';
import { makeKejimStoneAtlas } from './missions/kejimMaterialAtlas.js';
import { buildTrainingAnnexFinish } from './levels/trainingAnnexFinish.js';
import { buildTrainingCourtyardFinish } from './levels/trainingCourtyardFinish.js';
import { createWallMossCanvas } from './levels/trainingWallMoss.js';
import { buildTrainingAbyssFinish } from './levels/trainingAbyssFinish.js';
import { abyssFallOutlets } from './levels/trainingAbyssFalls.js';
import { createMountainMaterialCanvases, mountainTextureResolution } from './levels/trainingMountainMaterials.js';
import { streamGame2Mountain8kMaps } from './levels/trainingMountain8kLoader.js';
import { TrainingWaterSimulation, buildTrainingWaterSurface } from './levels/trainingWater.js';
import { createTrainingWaterMaterialCanvas } from './levels/trainingWaterMaterials.js';
import { buildTrainingTerrain, buildTrainingFoliage } from './levels/trainingGround.js';
import { SkyLift, SKY_LIFT, skyLiftWind, buildSkyLiftFinish } from './levels/trainingSkyLift.js';
import { buildBossWayTerrain, buildBossWayStoneDetail, buildBossWayFoliage } from './levels/bossWayGround.js';

// Extra analytic water detail can be reduced on low-power render tiers.
function qualityDetailStrength(quality) {
  return quality==='very_low'||quality==='performance'?.42:1;
}
export const ARENA_R = 23.5;
export class World {
  constructor(R, map = null, level = null) {
    this.R = R; this.pillars = []; this.bodies = []; this.time = 0; this.braziers = []; this.lamps = [];
    this.disposed=false; this.mountain8kController=null; this.mountainTextureEpoch=0;
    this.map = map;
    // falling below killY (out of the map, off a bridge, into a chasm) is fatal: 8 m under the lowest floor of the map
    const lowest = tris => { let y = Infinity; for (const t of tris || []) y = Math.min(y, t.a[1], t.b[1], t.c[1]); return y; };
    this.killY = level ? (level.killY ?? lowest(level.tris) - 8) : map ? lowest(map.tris) - 8 : -20;
    if (level) { this.initLevel(R, level); return; }
    if (map) {
      this.mapCollision = new BSPCollision(map);
      this.spawns = map.singlePlayer ? this.mapCollision.chooseSoloSpawn() : this.mapCollision.chooseSpawns();
      this.mapMeshes = map.texturedMeshes.map(({shader,mesh}) => ({
        shader, mesh: R.uploadStatic(mesh),
        tex: map.textureBitmaps?.has(shader) && R.uploadTexture ? R.uploadTexture(map.textureBitmaps.get(shader)) : null,
      }));
      for (const bitmap of map.textureBitmaps?.values() || []) bitmap.close?.();
      return; // The actual imported level replaces the procedural circle completely.
    }
    const stone = [0.30, 0.28, 0.33, 1], dark = [0.16, 0.15, 0.19, 1], metal = [0.35, 0.37, 0.42, 1];
    const g = geo();
    for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2 + 0.15, x = Math.cos(a) * 21, z = Math.sin(a) * 21; this.pillars.push({ x, z, r: 0.95 });
      g.box(x, 0.25, z, 2.6, 0.5, 2.6, dark).cyl(x, 0.5, z, 0.95, 7.5, stone, 24).box(x, 8.15, z, 2.3, 0.35, 2.3, dark).box(x, 8.5, z, 1.9, 0.3, 1.9, stone); }
    // low rim wall
    for (let i = 0; i < 48; i++) { const a = i / 48 * Math.PI * 2, x = Math.cos(a) * 24.6, z = Math.sin(a) * 24.6; g.box(x, 0.35, z, 1.6, 0.7, 1.0, [0.2, 0.19, 0.24, 1]); }
    // central dais ring
    g.cyl(0, 0, 0, 5.6, 0.12, [0.16, 0.18, 0.24, 1], 40).cyl(0, 0.12, 0, 5.2, 0.04, [0.22, 0.30, 0.42, 1], 40);
    // braziers
    for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2 + Math.PI / 4, x = Math.cos(a) * 13, z = Math.sin(a) * 13; this.braziers.push([x, 1.45, z]); this.pillars.push({ x, z, r: 0.45 });
      g.cyl(x, 0, z, 0.35, 1.1, metal, 14).cyl(x, 1.1, z, 0.6, 0.25, [0.25, 0.25, 0.3, 1], 14); }
    this.staticMesh = R.uploadStatic(g.build());
    this.ground = R.uploadStatic(geo().plane(0, 0, 0, 160, 160, [0.2, 0.2, 0.25, 1]).build());
    this.uploadPropMeshes(R);
    const spots = [[4, 3, 'crate'], [-3.5, 4.5, 'crate'], [6, -3, 'barrel'], [-6, -2.5, 'barrel'], [2, -6.5, 'crate'], [-1.5, 8, 'barrel'], [8.5, 5, 'crate'], [-9, 4, 'crate']];
    spots.forEach(([x, z, k], i) => this.bodies.push(this.makeBody(k, x, z, i)));
  }
  uploadPropMeshes(R) {
    const crate = geo(); const w = [0.50, 0.36, 0.22, 1], w2 = [0.32, 0.22, 0.13, 1];
    crate.box(0, 0.5, 0, 1, 1, 1, w).box(0, 0.5, 0, 1.03, 0.1, 1.03, w2).box(0, 0.12, 0, 1.03, 0.1, 1.03, w2).box(0, 0.88, 0, 1.03, 0.1, 1.03, w2);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) crate.box(sx * 0.46, 0.5, sz * 0.46, 0.1, 1.03, 0.1, w2);
    this.crateMesh = R.uploadStatic(crate.build());
    const barrel = geo(); barrel.cyl(0, 0, 0, 0.42, 1.0, [0.22, 0.34, 0.42, 1], 20).cyl(0, 0.15, 0, 0.445, 0.07, [0.45, 0.47, 0.5, 1], 20).cyl(0, 0.78, 0, 0.445, 0.07, [0.45, 0.47, 0.5, 1], 20);
    this.barrelMesh = R.uploadStatic(barrel.build());
  }
  // ---------- authored mission level
  initLevel(R, level) {
    if (level.name === 'training_garden' || level.name === 'boss_way_rancor_pit') {
      // One shared textured terrain/stone/foliage render pipeline for both
      // authored worlds; only their deterministic geometry layouts differ.
      const bossWay = level.name === 'boss_way_rancor_pit';
      const detail = bossWay ? buildBossWayStoneDetail() : buildTrainingGardenDetail();
      const terrain = bossWay ? buildBossWayTerrain() : buildTrainingTerrain();
      level = { ...level, tris: [...level.tris, ...terrain.tris] };
      this.trainingDetail = { stone:R.uploadStatic(detail.stone), soil:R.uploadStatic(terrain.mesh) };
      // Render-only hall remaster. Deliberately excluded from collision/nav meshes.
      if (!bossWay) {
        this.trainingHallFinish = Object.fromEntries(
          Object.entries(buildTrainingHallFinish()).map(([name, mesh]) => [name, R.uploadStatic(mesh)]));
        // Single owner-reviewed material test: east hall wall and adjacent floor.
        // Render-only and specific to the original Training Ground map.
        this.trainingMetalTrialPatch = Object.fromEntries(
          Object.entries(buildTrainingMetalTrialPatch()).map(([name, mesh]) => [name, R.uploadStatic(mesh)]));
        // Screenshot-focused Handbook annex art pass: original rooms, lesson
        // interactions, doors, player spawns, online physics remain untouched.
        this.trainingAnnexFinish = Object.fromEntries(
          Object.entries(buildTrainingAnnexFinish()).map(([name, mesh]) => [name, R.uploadStatic(mesh)]));
        // Same authored training layout, with additional independent rendered
        // courtyard art. Never add these meshes to collision/nav/spawn data.
        this.trainingCourtyardFinish = Object.fromEntries(
          Object.entries(buildTrainingCourtyardFinish()).map(([name, mesh]) => [name, R.uploadStatic(mesh)]));
        // A local 2D moss image mapped onto shallow 3D wall patches. Keep
        // foliage out of the draw pass if Canvas/texture upload is unavailable
        // rather than showing the old opaque triangular green artifacts.
        this.trainingMossTexture = null;
        if (typeof document !== 'undefined' && typeof R.uploadTexture === 'function') {
          try {
            const canvas = createWallMossCanvas();
            if (canvas) this.trainingMossTexture = R.uploadTexture(canvas);
          } catch (error) {
            console.warn('Decorative Game 2 wall moss unavailable', error);
          }
        }
        // Only the large circular arena at x=140,z=37, never the earlier canopy.
        this.trainingAbyssFinish = Object.fromEntries(
          Object.entries(buildTrainingAbyssFinish(R.renderQuality || 'medium')).map(([name, mesh]) => [name, R.uploadStatic(mesh)]));
        this.trainingLift = new SkyLift();
        this.trainingLiftFinish = Object.fromEntries(
          Object.entries(buildSkyLiftFinish()).map(([name, mesh]) => [name, R.uploadStatic(mesh)]));
        this.abyssMountainMaps=null;
        this.mountainTextureQuality=null;
        this.loadMountainTextures(R);
        this.abyssFallOutlets = abyssFallOutlets();
      }
      this.trainingFoliage = [];
      this.trainingTextures = {};
      this.trainingFoliageBuilder = bossWay ? buildBossWayFoliage : buildTrainingFoliage;
      this.trainingAssetsReady = typeof window === 'undefined' || typeof Image === 'undefined' ? Promise.resolve() : this.loadTrainingVegetation(R);
    }
    this.level = level; this.space = new LevelSpace(level); this.nav = new NavGrid(this.space, level.navBounds, 1, level.navProbe ?? undefined);
    if (this.trainingDetail && level.ffaSpawns && level.teamHomes) {
      const ground = p => [p[0], this.space.floorAt(p[0], p[2], p[1] + 0.8) ?? p[1], p[2]];
      level.ffaSpawns = level.ffaSpawns.map(ground);
      level.teamHomes = Object.fromEntries(Object.entries(level.teamHomes).map(([team, p]) => [team, ground(p)]));
    }
    // The mountain-following pond is deliberately a *render-only* surface,
    // including on GPUs that cannot upload the floating-point wave texture.
    // Never fall back to the old visibly clipped rectangular water decal.
    if (level.name === 'training_garden') {
      // One 256px tileable micro-normal/foam/roughness atlas, repeated in world
      // space by the shader. Missing Canvas/GPU upload only disables this
      // detail pass; real wave physics and the curved shoreline remain.
      this.trainingWaterDetail=null;
      if(typeof document!=='undefined' && typeof R.uploadTexture==='function'){
        try{
          const waterCanvas=createTrainingWaterMaterialCanvas();
          if(waterCanvas)this.trainingWaterDetail=R.uploadTexture(waterCanvas);
        }catch(error){
          console.warn('Training Grounds detailed water texture unavailable',error);
        }
      }
      // Performance-scaled water mesh retains the original curved shoreline
      // and the first-pass tiled material at every graphics setting.
      const quality=R.renderQuality||'medium';
      const mesh=R.uploadStatic(buildTrainingWaterSurface(quality));
      this.trainingPondSurface=mesh;
      if (typeof R.createWaterHeightTexture === 'function') {
        try {
          const resolution=['8k','4k','ultra'].includes(quality)?256:
            quality==='very_low'||quality==='performance'?128:192;
          const sim=new TrainingWaterSimulation({width:resolution,height:resolution});
          this.trainingPondContact=null;
          if(typeof R.createWaterContactTexture==='function'){
            try{
              const contactTexture=R.createWaterContactTexture(sim);
              this.trainingPondContact=contactTexture
                ? {texture:contactTexture,bounds:sim.bounds}:null;
            }catch(error){
              console.warn('Training Grounds foam/contact material unavailable',error);
            }
          }
          const texture=R.createWaterHeightTexture(sim);
          this.trainingWater={sim,mesh,texture};
        } catch (error) {
          console.warn('Training Grounds wave simulation unavailable; static shoreline fallback',error);
        }
      }
    }
    // CORRECT MAP: only Sumi-e Military Stronghold, selected chamber walls.
    // This load is separate from existing hallway GLBs; neither can suppress
    // the other's original visible fallback surface.
    if(level.name==='sumi_stronghold' && level.ownerWallInstances?.length &&
       typeof window!=='undefined' && typeof fetch==='function'){
      this.sumiOwnerWallPromise=loadSumiOwnerWalls(R,level.ownerWallInstances)
        .then(kit=>{
          if(this.disposed){
            for(const tex of kit?.textures||[])R.gl?.deleteTexture?.(tex);
            return;
          }
          this.sumiOwnerWalls=kit;
        })
        .catch(err=>{
          if(!this.disposed)console.warn('Sumi room owner GLBs unavailable; original metal room walls remain',err);
        });
    }
    // The user's genuine GLB replaces the visible hallway wall shells.
    // Original structural colliders stay, but their surfaces are hidden
    // when the GLB has loaded. Download once; never load one
    // GLB per module. No effect on Training Grounds or multiplayer geometry.
    if(level.name==='sumi_stronghold' && level.wallPanelInstances?.length &&
       typeof window!=='undefined' && typeof fetch==='function'){
      this.strongholdGlbLoad=loadStrongholdGLBWalls(R,level.wallPanelInstances)
        .then(panels=>{
          if(this.disposed){
            for(const tex of panels?.textures||[])R.gl?.deleteTexture?.(tex);
            return;
          }
          this.strongholdGlbPanels=panels;
        })
        .catch(err=>{
          if(!this.disposed)console.warn('Modular stronghold GLB unavailable; original wall shells remain',err);
        });
    }
    const strongholdStatic = level.name === 'sumi_stronghold' ? { spatialCellSize: 20 } : {};
    this.levelMeshes = {
      base: R.uploadStatic(level.render.base, strongholdStatic),
      glows: level.render.glows.map(g => ({ emis: g.glow.map(k => k * 0.75), mesh: R.uploadStatic(g.mesh, strongholdStatic) })),
      surfaces: (level.render.surfaces || []).map(s => ({ material: s.material,
        mesh: R.uploadStatic(s.mesh, s.material === 'glass' || s.material === 'water' ? {} : strongholdStatic) })),
    };
    // Actual image-like material: a painted, position-projected 2D atlas
    // exclusively for ONE upper Stronghold wall panel and adjacent floor.
    // Preserve the shader-only fallback on headless/unsupported devices.
    if(level.name==='sumi_stronghold' && typeof document!=='undefined' &&
       typeof R.uploadTexture==='function'){
      try{
        const max=R.gl?.getParameter?.(R.gl.MAX_TEXTURE_SIZE) ?? 2048;
        const memory=typeof navigator==='undefined'?0:Number(navigator.deviceMemory)||0;
        const atlas=createStrongholdPhotoAtlas({
          quality:R.renderQuality||'medium',maxTextureSize:max,deviceMemoryGb:memory,
        });
        if(atlas){
          this.sumiPanelAtlasTexture=R.uploadTexture(atlas,{anisotropy:8});
          this.sumiPanelAtlasPixels=atlas.width;
          atlas.width=atlas.height=0;
        }
      }catch(error){
        console.warn('Stronghold one-panel image atlas unavailable; using shader fallback',error);
      }
    }
    this.doorMeshes = level.doorMeshes.map(d => ({ id: d.id, origin: d.origin, mesh: R.uploadStatic(d.mesh) }));
    this.bridgeMeshes = (level.bridgeMeshes || []).map(b => ({ id: b.id, mesh: R.uploadStatic(b.mesh) }));
    // Kejim opening: render-only mesh upload; the authored mission, doors,
    // navigation, PvP systems and floor collision remain authoritative.
    if(level.name==='kejim_post')
      this.kejimEntrance=Object.fromEntries(
        Object.entries(buildKejimEntranceRemaster())
          .map(([name,mesh])=>[name,R.uploadStatic(mesh)]));
    this.lamps = level.lamps.map(l => l.p);
    this.uploadPropMeshes(R);
    level.props.forEach((p, i) => { const b = this.makeBody(p.kind, p.x, p.z, i); b.pos[1] = b.home[1] = this.floorAt(p.x, p.z, 3) ?? 0; this.bodies.push(b); });
    if (level.env) Object.assign(R.env, level.env);
    // Kejim now uses an existing photograph-derived stone material already
    // shipped in the repo. Sample it triplanar in the world shader so tall
    // cliffs, small rock chips and slanted bridge stones share the same scale.
    // Assets are optional: an absent/failed image retains the material-specific
    // procedural fallback rather than crashing the entire mission.
    if (['kejim_post','kejim_frontier'].includes(level.name) && typeof Image !== 'undefined') {
      const photoStone = new Image();
      photoStone.onload = () => {
        try {
          this.kejimRockTexture = R.uploadTexture(photoStone);
          if(typeof document!=='undefined'){
            const max=R.gl?.getParameter?.(R.gl.MAX_TEXTURE_SIZE) ?? 2048;
            const atlas=makeKejimStoneAtlas(photoStone,{maxTextureSize:max});
            this.kejimEntranceRockTexture=R.uploadTexture(atlas);
            atlas.width=atlas.height=0;
          }
        }catch(err){
          console.warn('Kejim stone atlas unavailable: using bundled photo stone',err);
        }
      };
      photoStone.onerror = () => console.warn('Kejim stone photo unavailable: using built-in rock detail');
      photoStone.src = new URL('../../../../public/game2/materials/training-stone.jpg', import.meta.url).href;
    }
    if (this.trainingDetail && R.bakeTrainingShadows) R.bakeTrainingShadows(
      [this.levelMeshes.base,this.trainingDetail.stone,
        ...(this.trainingHallFinish ? [this.trainingHallFinish.stone, this.trainingHallFinish.metal] : []),
        ...(this.trainingMetalTrialPatch ? [this.trainingMetalTrialPatch.wall,
          this.trainingMetalTrialPatch.floor,this.trainingMetalTrialPatch.frame] : []),
        ...(this.trainingAnnexFinish ? [this.trainingAnnexFinish.stone, this.trainingAnnexFinish.steel] : []),
        ...(this.trainingCourtyardFinish
          ? [this.trainingCourtyardFinish.stone, this.trainingCourtyardFinish.metal,
            this.trainingCourtyardFinish.emblem, this.trainingCourtyardFinish.reliefStone,
            this.trainingCourtyardFinish.drains, this.trainingCourtyardFinish.drainSteel]
          : [])],
      level.name === 'boss_way_rancor_pit' ? { target: [0,0,5], radius: 93 } : undefined,
    );
    // Dedicated 2048² static sunlight shadow pass for the beginning of
    // Kejim. It captures real mountains, steel frames and gate relief.
    if(this.kejimEntrance && R.bakeTrainingShadows){
      const k=this.kejimEntrance;
      R.bakeTrainingShadows([
        this.levelMeshes.base,k.cliff,k.talus,k.gateStone,k.gateSteel,
        k.gateBronze,
      ],{target:[0,4,-38],radius:68});
    }
    if(this.trainingAbyssFinish && R.bakeTrainingShadows){
      const abyss=this.trainingAbyssFinish;
      R.bakeTrainingShadows([
        this.levelMeshes.base,abyss.stone,abyss.metal,abyss.pavers,
        abyss.gold,
      ],{target:[140,0,37],radius:86,slot:'abyss'});
    }
  }
  loadMountainTextures(R){
    // Never attempt a canvas upload in Node/headless tests. Preserve the
    // existing procedural shader fallback on unsupported devices.
    const quality=R.renderQuality || 'medium';
    if(quality===this.mountainTextureQuality)return;
    this.mountainTextureQuality=quality;
    const textureEpoch=this.mountainTextureEpoch=(this.mountainTextureEpoch||0)+1;
    this.mountain8kController?.abort();
    this.mountain8kController=null;
    if(this.disposed)return;
    if(typeof document==='undefined'||typeof R.uploadTexture!=='function')return;
    const gpuLimit=R.gl?.getParameter?.(R.gl.MAX_TEXTURE_SIZE) ?? 2048;
    const size=mountainTextureResolution(quality,gpuLimit);
    const uploaded={};
    try{
      const images=createMountainMaterialCanvases(size);
      if(!images)return;
      for(const kind of ['rock','moss','dirt']){
        uploaded[kind]=R.uploadTexture(images[kind],{anisotropy:quality==='very_low'?1:8});
        // Release the CPU-side staging bitmap as soon as it reaches WebGL.
        images[kind].width=0; images[kind].height=0;
      }
      const old=this.abyssMountainMaps;
      this.abyssMountainMaps=uploaded;
      for(const texture of Object.values(old||{})) R.gl?.deleteTexture?.(texture);
      // Existing procedural maps remain visible while opt-in 8K maps stream.
      // Cancel pending requests on graphics-quality change or world teardown.
      this.mountain8kController=new AbortController();
      this.mountain8kReady=streamGame2Mountain8kMaps(R,{
        quality,
        signal:this.mountain8kController.signal,
        onMap:(kind,texture)=>{
          if(this.disposed||this.mountainTextureEpoch!==textureEpoch){
            R.gl?.deleteTexture?.(texture);
            return;
          }
          const prior=this.abyssMountainMaps?.[kind];
          if(this.abyssMountainMaps)this.abyssMountainMaps[kind]=texture;
          if(prior && prior!==texture)R.gl?.deleteTexture?.(prior);
        },
        onStatus:state=>{if(this.mountainTextureEpoch===textureEpoch)this.mountain8kStatus=state;},
      });
    }catch(error){
      for(const texture of Object.values(uploaded)) R.gl?.deleteTexture?.(texture);
      console.warn('Game 2 high-detail mountain texture generation unavailable',error);
    }
  }
  async loadTrainingVegetation(R) {
    const assets = {
      stone: this.trainingHallFinish
        ? new URL('../../../../public/game2/materials/training-sandstone-v2.png', import.meta.url)
        : new URL('../../../../public/game2/materials/training-stone.jpg', import.meta.url),
      dirt: new URL('../../../../public/game2/materials/training-vegetation/dirt.jpg', import.meta.url),
      'grass-1.png': new URL('../../../../public/game2/materials/training-vegetation/grass-1.png', import.meta.url),
      'grass-2.png': new URL('../../../../public/game2/materials/training-vegetation/grass-2.png', import.meta.url),
      'grass-3.png': new URL('../../../../public/game2/materials/training-vegetation/grass-3.png', import.meta.url),
      'grass-4.png': new URL('../../../../public/game2/materials/training-vegetation/grass-4.png', import.meta.url),
      'fern-1.png': new URL('../../../../public/game2/materials/training-vegetation/fern-1.png', import.meta.url),
      'fern-2.png': new URL('../../../../public/game2/materials/training-vegetation/fern-2.png', import.meta.url),
      'tuft-green.png': new URL('../../../../public/game2/materials/training-vegetation/tuft-green.png', import.meta.url),
      'tuft-dry.png': new URL('../../../../public/game2/materials/training-vegetation/tuft-dry.png', import.meta.url),
    };
    try {
      const [models] = await Promise.all([
        fetch(new URL('../../../../public/game2/materials/training-vegetation/models.json', import.meta.url)).then(response => {
          if (!response.ok) throw Error('Training foliage model HTTP ' + response.status);
          return response.json();
        }),
        ...Object.entries(assets).map(([name, url]) => new Promise((resolve, reject) => {
          const image = new Image();
          image.onload = () => {
            if(this.disposed){resolve();return;}
            try {
              this.trainingTextures[name] = R.uploadTexture(image,{anisotropy:R.renderQuality==='very_low'?1:8});
              // Stone is independent of foliage: a missing fern must never leave walls untextured.
              if(name==='stone')this.trainingTexture=this.trainingTextures.stone;
              resolve();
            }
            catch(error){reject(error);}
          };
          image.onerror = () => reject(Error('Training material unavailable: ' + name));
          image.src = url.href;
        })),
      ]);
      if(this.disposed)return;
      const foliage = this.trainingFoliageBuilder(models);
      this.trainingFoliage = foliage.meshes.map(({ texture, mesh }) => ({ texture, mesh: R.uploadStatic(mesh) }));
      this.trainingTexture = this.trainingTextures.stone;
    } catch (error) {
      if(this.disposed)return;
      this.trainingAssetError = error;
      console.warn('Training vegetation could not load:', error);
    }
  }
  dispose(){
    if(this.disposed)return;
    this.disposed=true;
    this.mountainTextureEpoch++;
    this.mountain8kController?.abort();
    this.mountain8kController=null;
    // The caller releases its WebGL context only AFTER this method; do
    // not let a late 8K image decode upload into a dead scene.
    const gl=this.R?.gl;
    for(const texture of [
      ...Object.values(this.abyssMountainMaps||{}),
      ...Object.values(this.trainingTextures||{}),
      this.trainingMossTexture,this.trainingWaterDetail,
      this.trainingPondContact?.texture,this.trainingWater?.texture,
      this.kejimRockTexture,this.kejimEntranceRockTexture,
      this.sumiPanelAtlasTexture,
      ...(this.strongholdGlbPanels?.textures||[]),
      ...(this.sumiOwnerWalls?.textures||[]),
    ])if(texture)gl?.deleteTexture?.(texture);
    this.abyssMountainMaps=null;
    this.trainingTextures={};
  }
  resetProps() { for (const w of this.bodies) { w.pos = w.home.slice(); w.vel = [0, 0, 0]; w.w = [0, 0, 0]; w.grounded = true; w.lifted = 0; w.rot = [0, Math.random() * 6, 0]; w.hp = 100; } }
  lineOfSight(a, b) { return this.space ? this.space.lineOfSight(a, b) : true; }
  // does a blaster bolt moving a -> b leave the play space? (level geometry, or the old arena radius)
  boltBlocked(a, b) { return this.space ? this.space.raycast(a, b) !== null : Math.hypot(b[0], b[2]) > 24.2; }
  cameraClip(target, eye) { return this.space ? this.space.cameraClip(target, eye) : eye; }
  makeBody(kind, x, z, id) {
    const crate = kind === 'crate'; const h = 1.0;
    return { kind, id, home: [x, 0, z], pos: [x, 0, z], vel: [0, 0, 0], r: crate ? 0.62 : 0.45, h, rot: [0, Math.random() * 6, 0], w: [0, 0, 0], grounded: true, lifted: 0, flash: 0, hp: 100, mass: crate ? 1.3 : 1, center: 0.5, glow: 0 };
  }
  floorAt(x, z, ceiling = Infinity) {
    const fixed = this.space ? this.space.floorAt(x, z, ceiling) :
      this.mapCollision ? this.mapCollision.floorAt(x, z, ceiling) : 0;
    const lift = this.trainingLift?.floorAt(x, z, ceiling);
    return lift !== null && lift !== undefined && (fixed === null || lift > fixed) ? lift : fixed;
  }
  collide(pos, r) { // actual BSP wall triangles when a map is loaded; old arena otherwise
    if (this.space) return this.space.collide(pos, r);
    if (this.mapCollision) return this.mapCollision.collide(pos, r);
    for (const p of this.pillars) { const dx = pos[0] - p.x, dz = pos[2] - p.z, d = Math.hypot(dx, dz), m = p.r + r; if (d < m && d > 1e-4) { pos[0] = p.x + dx / d * m; pos[2] = p.z + dz / d * m; } }
    const d = Math.hypot(pos[0], pos[2]), m = ARENA_R - r; if (d > m) { pos[0] *= m / d; pos[2] *= m / d; }
  }
  impulse(b, v) { b.vel[0] += v[0] / b.mass; b.vel[1] += v[1] / b.mass; b.vel[2] += v[2] / b.mass; b.grounded = false; b.w = [(Math.random() - 0.5) * 8, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 8]; }
  update(dt) {
    this.time += dt;
    if (this.trainingLift) {
      // Carry the local grounded visitor by the same increment as the physical
      // platform. Only the local player may trigger this lift (Game.frameInput);
      // online clients keep their lift parked pending server replication.
      const rider = this.trainingVisitor;
      const aboard = rider && this.trainingLift.supporting(rider);
      const dy = this.trainingLift.update(dt);
      if (aboard && dy) rider[1] += dy;
      this.trainingLiftWind = skyLiftWind(this.time);
    }
    if (this.trainingWater && this.trainingWater.sim.update(dt) &&
        typeof this.R.updateWaterHeightTexture === 'function') {
      this.R.updateWaterHeightTexture(this.trainingWater.texture,
        this.trainingWater.sim);
    }
    if (this.trainingDetail) {
      const nearby = this.trainingVisitor && Math.abs(this.trainingVisitor[0]) < 5 && Math.abs(this.trainingVisitor[2] - 12.4) < 6;
      if (nearby) this.space.setDoor('garden_gate', true); // stays open: never closes on a fighter
      const annex = this.trainingVisitor && Math.abs(this.trainingVisitor[0] - 27.5) < 4 &&
        Math.abs(this.trainingVisitor[2] - 35) < 5;
      if (annex) this.space.setDoor('handbook_gate', true); // open on approach; never trap anyone
      const abyss = this.trainingVisitor && Math.abs(this.trainingVisitor[0] - 49.3) < 5 &&
        Math.abs(this.trainingVisitor[2] - 37) < 5;
      if (abyss && this.space.doors.has('abyss_gate'))
        this.space.setDoor('abyss_gate', true); // a permanent open connection once found
    }
    if (this.space) this.space.update(dt);
    if (this.mapCollision) return;
    for (const b of this.bodies) {
      b.flash = Math.max(0, b.flash - dt * 3); b.glow = Math.max(0, b.glow - dt * 2);
      if (b.lifted > 0) { b.vel[0] *= 0.9; b.vel[2] *= 0.9; b.vel[1] *= 0.9; b.rot[1] += dt * 1.6; b.rot[0] = Math.sin(this.time * 2 + b.id) * 0.25; b.rot[2] = Math.cos(this.time * 1.7 + b.id) * 0.25; b.pos[0] += b.vel[0] * dt; b.pos[1] += b.vel[1] * dt; b.pos[2] += b.vel[2] * dt; b.lifted -= dt; continue; }
      b.vel[1] -= 20 * dt; b.pos[0] += b.vel[0] * dt; b.pos[1] += b.vel[1] * dt; b.pos[2] += b.vel[2] * dt;
      const fl = this.space ? (this.space.floorAt(b.pos[0], b.pos[2], b.pos[1] + 0.6) ?? -Infinity) : 0; // nothing below: it falls
      if (b.pos[1] < this.killY) { b.pos = b.home.slice(); b.vel = [0, 0, 0]; b.grounded = true; b.lifted = 0; b.flash = 1; continue; } // lost in the chasm: back where it started
      if (b.pos[1] <= fl) { b.pos[1] = fl; if (b.vel[1] < -2) { b.vel[1] *= -0.28; b.vel[0] *= 0.82; b.vel[2] *= 0.82; this.onThud && this.onThud(b); } else { b.vel[1] = 0; b.grounded = true; } }
      if (b.grounded) { const f = Math.max(0, 1 - 5 * dt); b.vel[0] *= f; b.vel[2] *= f; for (let k = 0; k < 3; k++) { b.w[k] *= Math.max(0, 1 - 6 * dt); } b.rot[0] *= Math.max(0, 1 - 8 * dt); b.rot[2] *= Math.max(0, 1 - 8 * dt); }
      for (let k = 0; k < 3; k++) b.rot[k] += b.w[k] * dt;
      const before = [b.pos[0], b.pos[2]]; this.collide(b.pos, b.r); if (b.pos[0] !== before[0] || b.pos[2] !== before[1]) { b.vel[0] *= -0.35; b.vel[2] *= -0.35; }
    }
    for (let i = 0; i < this.bodies.length; i++) for (let j = i + 1; j < this.bodies.length; j++) {
      const a = this.bodies[i], c = this.bodies[j]; if (Math.abs(a.pos[1] - c.pos[1]) > 1) continue; const dx = c.pos[0] - a.pos[0], dz = c.pos[2] - a.pos[2], d = Math.hypot(dx, dz), m = a.r + c.r;
      if (d < m && d > 1e-4) { const nx = dx / d, nz = dz / d, push = (m - d) / 2; a.pos[0] -= nx * push; a.pos[2] -= nz * push; c.pos[0] += nx * push; c.pos[2] += nz * push; const rv = (c.vel[0] - a.vel[0]) * nx + (c.vel[2] - a.vel[2]) * nz; if (rv < 0) { const j2 = -rv * 0.6; a.vel[0] -= nx * j2; a.vel[2] -= nz * j2; c.vel[0] += nx * j2; c.vel[2] += nz * j2; } }
    }
  }
  draw() {
    const R = this.R;
    if (this.trainingAbyssFinish && R.renderQuality !== this.mountainTextureQuality)
      this.loadMountainTextures(R);
    if (this.levelMeshes) {
      const I = m4.ident(); R.drawMesh(this.levelMeshes.base, I, {
        spec: 0.12, detail: !!this.trainingDetail,
        tex: this.trainingHallFinish ? this.trainingTexture : undefined,
        courtyardLights: !!this.trainingCourtyardFinish,
      });
      for (const surface of this.levelMeshes.surfaces.filter(s => s.material !== 'glass' && s.material !== 'water')) {
        // Exactly ONE architectural finish at a time, not the old wall
        // covered by a second protruding wall mesh.
        if(surface.material==='sumiGLBWallFallback' && this.strongholdGlbPanels)continue;
        if(surface.material==='sumiOwnerWallFallback' && this.sumiOwnerWalls)continue;
        const kind={gratedSteel:1,rivetedSteel:2,strataRock:3,
          sumiWallSilver:6,sumiFloorGunmetal:7,sumiCeilingTitanium:8}[surface.material]||0;
        // Only Sumi Stronghold uses the new brushed alloy/clearcoat path.
        // Other Game 2 scenes and their material/lighting behavior stay intact.
        const strongholdAlloy=this.level?.name==='sumi_stronghold' && surface.material==='steelGloss';
        // Separate GPU batch for exactly the reference panel and tile;
        // never use this 5th material mode for neighboring stronghold walls.
        const photoPanel=this.level?.name==='sumi_stronghold' &&
          surface.material==='sumiTrialSteel';
        R.drawMesh(surface.mesh,I,{spec:kind===3?.07:photoPanel?.98:strongholdAlloy?.94:
            kind===6?.70:kind===7?.44:kind===8?.29:.72,
          steel:kind===1||kind===2||[6,7,8].includes(kind)||surface.material==='steelGloss'||photoPanel,
          surfaceKind:photoPanel?5:strongholdAlloy?4:kind,
          tex:photoPanel?this.sumiPanelAtlasTexture:kind===3?this.kejimRockTexture:null,
          // The new walkable ridge uses the same layered rock material as
          // surrounding cliffs; Kejim retains its own photo shader.
          mountainRock:kind===3 && !!this.trainingAbyssFinish,
          mountainMaps:kind===3 ? this.abyssMountainMaps : null});
      }
      // Use enlarged, uniformly scaled source-GLB structural bays as the
      // real visible hallway shell. No photo-derived billboard geometry.
      if(this.strongholdGlbPanels)renderStrongholdGLBWalls(R,this.strongholdGlbPanels);
      if(this.sumiOwnerWalls)drawSumiOwnerWalls(R,this.sumiOwnerWalls);
      if(this.kejimEntrance){
        const k=this.kejimEntrance;
        // Ground-cover geometry in separate material batches: photographic
        // mineral rock, grooved metal, fabric, growing moss and liquid.
        R.drawMesh(k.cliff,I,{spec:.10,
          tex:this.kejimEntranceRockTexture||this.kejimRockTexture,
          kejimCliff:true,kejimLights:true});
        R.drawMesh(k.talus,I,{spec:.07,
          tex:this.kejimEntranceRockTexture||this.kejimRockTexture,
          kejimCliff:true,kejimLights:true});
        R.drawMesh(k.wetLedges,I,{spec:.22,
          tex:this.kejimEntranceRockTexture||this.kejimRockTexture,
          kejimCliff:true,wetStone:true,kejimLights:true});
        R.drawMesh(k.gateStone,I,{spec:.13,kejimLights:true,
          tex:this.kejimRockTexture,kejimCliff:true});
        R.drawMesh(k.gateSteel,I,{spec:.87,steel:true,kejimLights:true});
        R.drawMesh(k.gateBronze,I,{spec:.88,steel:true,kejimLights:true});
        R.drawMesh(k.gateGold,I,{spec:.82,steel:true,kejimLights:true});
        R.drawMesh(k.banners,I,{spec:.07,doubleSided:true,kejimLights:true});
        R.drawMesh(k.moss,I,{spec:.035,doubleSided:true,kejimLights:true});
        R.drawMesh(k.light,I,{spec:.3,emis:[1.0,.12,.07],kejimLights:true});
        R.drawMesh(k.wetFloor,I,{spec:.94,wetStone:true,
          kejimWet:true,kejimLights:true});
      }
      if (this.trainingDetail) {
        R.drawMesh(this.trainingDetail.stone,I,{
          spec:0.04,detail:true,tex:this.trainingTexture,
          courtyardLights:!!this.trainingCourtyardFinish,
        });
        if (this.trainingHallFinish) {
          const hall = this.trainingHallFinish;
          R.drawMesh(hall.floor, I, { spec: 0.70, detail: true, tex: this.trainingTexture, polishedStone: true, hallLights: true });
          // Restore the complete original Training Grounds art pass.
          R.drawMesh(hall.stone, I, { spec: 0.17, detail: true, tex: this.trainingTexture, hallLights: true });
          R.drawMesh(hall.metal, I, { spec: 0.73, steel: true, hallLights: true });
          R.drawMesh(hall.banners, I, { spec: 0.16, doubleSided: true, hallLights: true });
          R.drawMesh(hall.emblem, I, { spec: 0.62, steel: true, hallLights: true });
        }
        if (this.trainingMetalTrialPatch) {
          const t = this.trainingMetalTrialPatch;
          // Only this wall and this floor have the new gloss/micro-metal pass.
          R.drawMesh(t.wall,I,{spec:.94,steel:true,referenceMetal:true,hallLights:true});
          R.drawMesh(t.frame,I,{spec:.88,steel:true,referenceMetal:true,hallLights:true});
          R.drawMesh(t.bolts,I,{spec:.93,steel:true,referenceMetal:true,hallLights:true});
          R.drawMesh(t.floor,I,{spec:.98,steel:true,referenceMetal:true,hallLights:true});
          // Explicit yellow in-world breadcrumbs from spawn to test zone.
          R.drawMesh(t.route,I,{spec:.18,emis:[.88,.48,.06]});
          R.drawMesh(t.lights,I,{spec:.4,emis:[1.15,.72,.17]});
        }
        if (this.trainingAnnexFinish) {
          const annex=this.trainingAnnexFinish;
          // Original annex checkerboard tiles receive view-angle clearcoat;
          // inset stone, machined counterwork and glass each get a separate
          // material draw so lighting and highlights aren't indiscriminate.
          R.drawMesh(annex.etched,I,{spec:.09,annexLights:true});
          R.drawMesh(annex.floor,I,{spec:.74,detail:true,tex:this.trainingTexture,polishedStone:true,annexLights:true});
          R.drawMesh(annex.stone,I,{spec:.13,detail:true,
            tex:this.trainingTexture,annexLights:true});
          R.drawMesh(annex.steel,I,{spec:.81,steel:true,annexLights:true});
          R.drawMesh(annex.brass,I,{spec:.77,steel:true,annexLights:true});
          R.drawMesh(annex.glass,I,{spec:.72,glass:true,annexLights:true});
        }
        if (this.trainingCourtyardFinish) {
          const garden=this.trainingCourtyardFinish;
          // Distinct material batches preserve real cast shadows, wet polish,
          // metallic highlight rolloff and visible geometry thickness.
          R.drawMesh(garden.stone,I,{spec:.12,detail:true,
            tex:this.trainingTexture,courtyardLights:true});
          // Genuine stone bond relief over existing wall colliders, with dark
          // recessed mortar, rendered weather drains and bronze path hardware.
          // All five layers are art-only and never enter level.tris/nav.
          R.drawMesh(garden.reliefStone,I,{spec:.18,detail:true,
            tex:this.trainingTexture,courtyardLights:true});
          R.drawMesh(garden.mortar,I,{spec:.015,courtyardLights:true});
          R.drawMesh(garden.drains,I,{spec:.14,detail:true,
            tex:this.trainingTexture,courtyardLights:true});
          R.drawMesh(garden.drainSteel,I,{spec:.78,steel:true,courtyardLights:true});
          R.drawMesh(garden.inlays,I,{spec:.88,steel:true,courtyardLights:true});
          R.drawMesh(garden.wetStone,I,{spec:.92,detail:true,
            tex:this.trainingTexture,wetStone:true,courtyardLights:true});
          R.drawMesh(garden.platformStone,I,{spec:.90,detail:true,
            tex:this.trainingTexture,polishedStone:true,wetStone:true,courtyardLights:true});
          R.drawMesh(garden.metal,I,{spec:.83,steel:true,courtyardLights:true});
          R.drawMesh(garden.gold,I,{spec:.90,steel:true,courtyardLights:true});
          R.drawMesh(garden.emblem,I,{spec:.85,steel:true,courtyardLights:true,doubleSided:true});
          R.drawMesh(garden.banners,I,{spec:.10,doubleSided:true,courtyardLights:true});
          if(this.trainingMossTexture)
            R.drawMesh(garden.greenery,I,{spec:.09,tex:this.trainingMossTexture,
              alphaCutoff:.34,moss:true,doubleSided:true,courtyardLights:true});
          R.drawMesh(garden.lights,I,{spec:.28,
            emis:[1.0,.49,.13],courtyardLights:true});
        }
        if(this.trainingAbyssFinish){
          const a=this.trainingAbyssFinish;
          // Draw raised stone courses and the central medallion over the
          // authoritative radius-52 disk, never into its collision data.
          R.drawMesh(a.pavers,I,{spec:.72,detail:true,tex:this.trainingTexture,
            wetStone:true,abyssLights:true});
          R.drawMesh(a.engraving,I,{spec:.13,abyssLights:true});
          R.drawMesh(a.stone,I,{spec:.18,detail:true,
            tex:this.trainingTexture,abyssLights:true});
          R.drawMesh(a.metal,I,{spec:.83,steel:true,abyssLights:true});
          R.drawMesh(a.gold,I,{spec:.90,steel:true,abyssLights:true,doubleSided:true});
          // Multi-layer textured mountain ranges surround the arena with
          // real eroded terrain silhouettes. They are rendered scenery, not
          // multiplayer collision or extra invisible floor triangles.
          for(const name of ['horizonMountains','distantMountains','mountains','foothills'])
            R.drawMesh(a[name],I,{
              spec:name==='foothills'?.075:.045,
              mountainMaps:this.abyssMountainMaps,mountainRock:true,
              // Selective pigment wash on shaded near and middle ridges.
              sumiInk:name==='foothills'||name==='mountains',
            });
          if(a.talusRock?.count)
            R.drawMesh(a.talusRock,I,{spec:.085,mountainRock:true,doubleSided:true,
              sumiInk:true,mountainMaps:this.abyssMountainMaps});
          // The flow channels are carved from this SAME mountain sampler.
          // Real, protruding ledges make waterfalls strike and divide.
          R.drawMesh(a.waterfallRock,I,{spec:.24,mountainRock:true,
            wetStone:true,mountainMaps:this.abyssMountainMaps});
          R.drawMesh(a.mountainMoss,I,{spec:.02,doubleSided:true});
          // Real submerged stone profile: opaque rock under the transparent
          // water so it looks like a pond enclosed by rising mountain walls.
          R.drawMesh(a.pondBed,I,{spec:.10,seaBed:true,
            mountainMaps:this.abyssMountainMaps});
          R.drawMesh(a.cloth,I,{spec:.08,doubleSided:true});
          R.drawMesh(a.greenery,I,{spec:.05,doubleSided:true});
          R.drawMesh(a.glow,I,{spec:0,emis:[1.02,.48,.11]});
        }
        if (this.trainingLiftFinish && !this.trainingLiftDrawDisabled) {
          try {
          const a = this.trainingLiftFinish;
          R.drawMesh(a.paved,I,{spec:.78,detail:true,tex:this.trainingTexture,
            wetStone:true,abyssLights:true});
          R.drawMesh(a.masonry,I,{spec:.19,detail:true,tex:this.trainingTexture,abyssLights:true});
          R.drawMesh(a.metal,I,{spec:.86,steel:true,abyssLights:true});
          R.drawMesh(a.glazing,I,{spec:.74,glass:true,alpha:.64,doubleSided:true});
          R.drawMesh(a.lights,I,{spec:.28,emis:[.10,.62,.94]});
          const wind = this.trainingLiftWind || [0,0,0], cloth = m4.ident();
          cloth[12] = Math.sin(this.time*1.7)*.08*wind[0];
          cloth[14] = Math.cos(this.time*1.1)*.08*wind[2];
          R.drawMesh(a.banners,cloth,{spec:.06,doubleSided:true,foliageMotion:true});
          const carTransform=m4.ident();
          carTransform[13]=this.trainingLift.y;
          R.drawMesh(a.car,carTransform,{spec:.76,polishedStone:true,wetStone:true,abyssLights:true});
          } catch (error) {
            // High-detail sky-lift shaders are optional. Do not strand all
            // players on a frozen first frame if this GPU rejects a pass.
            this.trainingLiftDrawDisabled = true;
            console.warn('Game 2 sky-lift decoration disabled after GPU error; gameplay continues', error);
          }
        }
        R.drawMesh(this.trainingDetail.soil,I,{spec:0,terrain:true,
          tex:this.trainingTextures.dirt,courtyardLights:!!this.trainingCourtyardFinish});
        for (const part of this.trainingFoliage) R.drawMesh(part.mesh,I,{
          spec:0,tex:this.trainingTextures[part.texture],alphaCutoff:0.3,doubleSided:true,
          courtyardLights:!!this.trainingCourtyardFinish,
          foliageMotion:R.renderQuality !== 'very_low',
        });
      }
      // Transparent Kejim rock-fed water is drawn after opaque terrain:
      // moving whitewater glints occur where rock shelves interrupt its fall.
      if(this.kejimEntrance){
        const k=this.kejimEntrance;
        R.drawMesh(k.water,I,{spec:.87,kejimFlow:true,alpha:.63,
          doubleSided:true,kejimLights:true});
        R.drawMesh(k.whitewater,I,{spec:.44,kejimFlow:true,alpha:.79,
          doubleSided:true,kejimLights:true});
        R.drawMesh(k.spray,I,{spec:.12,kejimFlow:true,alpha:.42,
          doubleSided:true,kejimLights:true});
      }
      // Draw glass after opaque geometry with depth tests but no depth writes;
      // preserved collision comes from level solids, never from alpha meshes.
      for (const surface of this.levelMeshes.surfaces.filter(s => s.material === 'glass'))
        R.drawMesh(surface.mesh, I, { spec: 0.95, glass: true, alpha: 0.62 });
      if (this.trainingWater) {
        const { mesh, texture, sim } = this.trainingWater;
        R.drawMesh(mesh, I, { spec: .91, water: true,
          abyssWater: true, alpha: .58, fallOutlets:this.abyssFallOutlets,
          waterDetail:this.trainingWaterDetail,
          waterDetailStrength:qualityDetailStrength(R.renderQuality),
          contact:this.trainingPondContact,
          wave: { texture, width: sim.width, height: sim.height, bounds: sim.bounds } });
      } else if (this.trainingPondSurface) {
        // Exact same curved shoreline remains even without R32F. Shader
        // procedural swells substitute for full fluid simulation.
        R.drawMesh(this.trainingPondSurface,I,{spec:.91,water:true,
          abyssWater:true,alpha:.58,fallOutlets:this.abyssFallOutlets,
          waterDetail:this.trainingWaterDetail,
          waterDetailStrength:qualityDetailStrength(R.renderQuality),
          contact:this.trainingPondContact});
      } else {
        // Non-training worlds keep their original authored water behavior.
        for(const surface of this.levelMeshes.surfaces.filter(s=>s.material==='water'))
          R.drawMesh(surface.mesh,I,{spec:.86,water:true,
            abyssWater:false,alpha:.92});
      }
      if(this.trainingAbyssFinish){
        const a=this.trainingAbyssFinish;
        // Cascades physically follow mountain height samples: rock-fed
        // runnels -> broken ledges -> shore outlet -> receiving sea foam.
        // Render AFTER the clear pond so water sheets layer correctly.
        // River runs against sampled bedrock: use separate depth-aware
        // clear water, not the uniformly bright waterfall/spray material.
        R.drawMesh(a.cascade,I,{spec:.78,riverFlow:true,
          waterDetail:this.trainingWaterDetail,
          fallType:0,alpha:.53,doubleSided:true});
        R.drawMesh(a.riverFoam,I,{spec:.28,waterfall:true,
          fallType:1,alpha:.87,doubleSided:true});
        R.drawMesh(a.waterfallSpray,I,{spec:.14,waterfall:true,
          fallType:2,alpha:.39,doubleSided:true});
        R.drawMesh(a.flame,I,{spec:0,emis:[1.15,.39,.09],
          torchFlame:true,alpha:.88,doubleSided:true});
      }
      for (const g of this.levelMeshes.glows) R.drawMesh(g.mesh, I, { spec: 0, emis: g.emis });
      if (this.trainingHallFinish)
        R.drawMesh(this.trainingHallFinish.flames, I, { spec: 0, emis: [0.8, 0.18, 0.02],
          torchFlame: true, alpha: 0.84, doubleSided: true });
      if (this.trainingAnnexFinish) {
        R.drawMesh(this.trainingAnnexFinish.warm,I,{
          spec:0,emis:[1.08,.51,.18],annexLights:true,
        });
        R.drawMesh(this.trainingAnnexFinish.cold,I,{
          spec:0,emis:[.11,.48,.65],annexLights:true,
        });
      }
      if (this.trainingCourtyardFinish)
        R.drawMesh(this.trainingCourtyardFinish.flames, I, {
          spec:0,emis:[1.18,.39,.065],torchFlame:true,alpha:.88,
          doubleSided:true,courtyardLights:true,
        });
      for (const d of this.doorMeshes) { const D = this.space.doors.get(d.id), h = D.max[1] - D.min[1], M = m4.ident(); M[12] = d.origin[0]; M[13] = d.origin[1] + D.lift * h * 0.96; M[14] = d.origin[2]; R.drawMesh(d.mesh, M, { spec: 0.35 }); }
      for (const b of this.bridgeMeshes) { // energy bridges: steady glow while on, flicker red-orange before they drop, gone while off
        const B = this.space.bridges.get(b.id); if (B.state === 'off' || (B.state === 'warn' && Math.sin(this.time * 47) < -0.2)) continue;
        const k = 0.85 + 0.15 * Math.sin(this.time * 9 + b.id.length); R.drawMesh(b.mesh, I, { spec: 0.4, emis: B.state === 'warn' ? [0.95, 0.4, 0.2] : [0.22 * k, 0.5 * k, 0.85 * k] });
      }
      this.drawBodies(R); return;
    }
    if (this.mapMeshes) {
      const identity = m4.ident();
      for (const part of this.mapMeshes) R.drawMesh(part.mesh, identity, { spec: 0.08, tex: part.tex });
      return;
    }
    R.drawMesh(this.ground, m4.ident(), { ground: true }); R.drawMesh(this.staticMesh, m4.ident(), { spec: 0.1 });
    this.drawBodies(R);
  }
  drawBodies(R) {
    for (const b of this.bodies) {
      const m = new Float32Array(16); const qy = Q.axisAngle([0, 1, 0], b.rot[1]), qx = Q.axisAngle([1, 0, 0], b.rot[0]), qz = Q.axisAngle([0, 0, 1], b.rot[2]);
      // rotate about the prop centre: translate(pos+centre) * rot * translate(-centre)
      const rq = Q.mul(Q.mul(qy, qx), qz); const t = [b.pos[0], b.pos[1] + b.center, b.pos[2]]; m4.trs(t, rq, [1, 1, 1], m);
      const off = m4.ident(); off[13] = -b.center; const mm = m4.mul(m, off);
      R.drawMesh(b.kind === 'crate' ? this.crateMesh : this.barrelMesh, mm, { spec: 0.15, emis: [b.flash * 0.3 + b.glow * 0.3, b.flash * 0.45 + b.glow * 0.22, b.flash * 0.9 + b.glow * 0.6] });
    }
  }
}
