import { ContactAtmosphere } from './contactAtmosphere.js';
import { enemyNeedsContinuousMotion } from './enemyMotionContinuity.mjs';
/* eslint-disable */
// Game orchestration: arena, player + force, NPCs, camera, update loop, rendering, hooks used by fighter/force/combat.
import { m4, v3, clamp, lerp } from './math.js';
import { World } from './world.js';
import { updateDirectionalGuard } from './directionalGuard.js';
import { updateExperimentalDirection } from './experimentalDirectional.js';
import { recordComboSwing } from './experimentalCombo.js';
import { queueAdaptiveExchange, tickAdaptiveExchange } from './experimentalAdaptiveAI.js';
import { startAIExchange, noteExchangeSwing, tickExchangeDefense, tickExchangeRecovery } from './experimentalExchangeChain.js';
import { runExperimentalDuelCoordination, currentDuelSight } from './experimentalDuelCoordination.js';
import { noteTacticalCue, tickTacticalDuel } from './experimentalTacticalDuelAI.js';
import { trackCommittedSwing, settleSwingReceipt, noteGuardBreakRecovery, noteGetupRecovery, tickCombatRecovery } from './experimentalCombatRecovery.js';
import { applyInjuredFootwork } from './experimentalSaberInjury.js';
import { tickWoundedDefense } from './experimentalWoundedDefense.js';
import { noteSurgeSwing, planSaberSurgeResponse } from './experimentalSaberSurge.js';
import { markFlowLanding, planFlankRead, flankReadCommand } from './experimentalFlow.js';
import { cameraShowcaseFrame, cameraTutorialDemoFrame } from './experimentalShowcase.js';
import { createStamina, stepStamina, spendStamina, staminaBroken, STAMINA_SWING_COST, STAMINA_BLOCK_COST, STAMINA_CLASH_COST, STAMINA_AI_BACKOFF_THRESHOLD } from './experimentalStamina.js';
import { FX } from './fx.js';
import { TrainingMicrophysics, applyTrainingLighting } from './trainingMicrophysics.js';
import { Sfx } from './audio.js';
import { Input } from './input.js';
import { Fighter, WALL_SLAM_SPEED, GHOST_LIFE } from './fighter.js';
import { Force, SELECT_ORDER, SELECT_ALL, FORCE_QUICK_BINDINGS, THROW_COST, PULSE_PER_HP, PULSE_PER_KILL } from './force.js';
import { STYLE_NAMES } from './saber.js';
import { nextSaberKit, maySwitchSaber, SABER_SWAP_COOLDOWN } from './saberCycle.js';
import { SaberLoadoutMenu, SABER_LOADOUTS, saberLoadoutUnavailable } from './saberLoadoutMenu.js';
import { academyDualTargetPresence } from './academyDualAttacks.js';
import { resolveThrow, KNOCKDOWN_DIST } from './forcerules.js';
import { Combat, hostile, EVADE_AROUND_REACH } from './combat.js';
import { NetGame, applySide } from './netgame.js';
import { HUD, HELP_BOARDING, HELP_BOSS_WAY, HELP_DUEL, HELP_MISSION, HELP_ONLINE, HELP_SKIRMISH } from './hud.js';
import { BRAINS } from './brains/index.js';
import { ARCHETYPES } from './archetypes.js';
import { buildLevel } from './level/builder.js';
import { MissionDirector } from './mission/director.js';
import { MISSIONS } from './missions/index.js';
import { bolt, drawBolt } from './fx.js';
import { geo } from './gl.js';
import { Game2TeamMatch, TEAM_MODES } from './teamMatch.js';
import { AUTHORED_LEVELS } from './levels/index.js';
import { createTrainingGarden, usesTrainingGarden, TRAINING_HANDBOOK } from './levels/trainingGarden.js';
import { GAME2_ARENA_MAPS } from './arenaMaps.js';
import { chooseLockTarget, lockTargetAngles, lockTargetIsValid, lockTargetVisible, wrapTargetAngle, LOCK_OCCLUSION_GRACE } from './targetLock.js';
import { GAME2_MISSION_ARCHIVE } from './missionArchive.js';
import { createBossWayArena } from './levels/bossWayArena.js';
import { BossWay, BOSS_WAY_INTRO_SECONDS } from './bossWay/bossWay.js';
import { DragonBossWay } from './bossWay/dragonBossWay.js';
const optsDragonBoss = g => !!g.opts.dragonBoss && !g.bossPreview;
import { Score, SCORES } from './music.js';
import { ForceClash, canClash, CLASH_WINDOW } from './clash.js';
import { Game2CombatTrack, game2CombatActive } from './combatTrack.js';
import { Execution, findExecutable, cutTransforms, EXECUTION_NAMES } from './executions.js';
// Team arenas use the real Drive BSP selected by the player, or an authored arena (levels/) such as Skybridge Citadel.

const STEP = 1 / 60;
export const RESPAWN_SHIELD = 3; // seconds of immunity after coming back from a defeat (every mode)
export const CRACK_LIFE = 14;    // seconds a wall crack from a wall slam stays
export const KATA_CHORD = 0.1;   // s the right button waits for the left one before resolving a kick or saber throw
const rnd = (a, b) => a + Math.random() * (b - a);
const SPAWN = [0, 0, -9];
const clearCmd = c => { c.fwd = c.right = c.up = 0; c.walk = c.crouch = c.attack = c.alt = c.jump = c.jumpPressed = c.jumpReleased = c.crouchPressed = false; };
// the menu background has no player: nothing is read from (or swallowed on) the keyboard and mouse
class NullInput {
  constructor() { this.down = new Set(); this.pressedSet = new Set(); this.releasedSet = new Set(); this.btn = [false, false, false]; this.btnPressed = [false, false, false]; this.dx = this.dy = this.wheel = this.zoom = 0; this.locked = false; this.sens = 0.0022; this.onFirstGesture = null; }
  held() { return false; } pressed() { return false; } released() { return false; } endFrame() { } dispose() { }
}

export class Game {
  constructor(R, A, canvas, hudCanvas, opts = {}) {
    this.opts = opts; this.mode = opts.mode || 'explorer'; this.infinitePractice = false; this.duel = this.mode === 'duel'; this.tutorialMode = this.mode === 'tutorial'; this.online = this.mode === 'online'; this.teamMode = !!TEAM_MODES[this.mode]; this.boss = null; this.round = { state: 'intro', t: 0 }; this.arcs = []; this.disposed = false;
    this.bossWayMode = this.mode === 'boss_way';
    // Explicitly opted-in mechanics prototype: no authentic model claim and
    // no reward eligibility. Normal Boss Way requires owner's imported GLB.
    this.bossPreview = this.bossWayMode && opts.bossPreview === true;
    this.archiveMode = this.mode === 'archive'; // original owner-supplied single-player BSP exploration
    this.attract = this.mode === 'attract'; // the main menu's background: two AI fighters duel under a slow cinematic camera
    this.boardingMode = this.mode === 'boarding'; // Fleet Assault aboard a cruiser: the level comes in opts.layout, the match glue (fleetAssault/boarding) attaches itself as this.net
    this.openArena = this.online || this.teamMode || this.attract || this.tutorialMode || this.boardingMode || this.archiveMode || this.bossWayMode; // every fighter fights the fighters hostile to it (not just the player)
    this.missionDef = this.mode === 'mission' ? MISSIONS[opts.mission || 'kejim'] : null;
    if (this.mode === 'mission' && !this.missionDef) throw new Error('Unknown Game 2 mission: ' + opts.mission);
    this.forceMenu = this.duel || this.tutorialMode || this.online || this.teamMode || !!this.missionDef || this.boardingMode || this.archiveMode || this.bossWayMode; // wheel / F Force selector and the ten quick-cast powers
    this.R = R; this.A = A; this.skel = A.skel; this.saberData = A.saberData; this.attach = A.attach; this.canvas = canvas;
    this.t = 0; this.dtFrame = STEP; this.fps = 60; this.acc = 0; this.started = false; this.flashes = []; this.lightFlash = 0; this.lightFlashPos = [0, 2, 0]; this.shakeAmt = 0; this.frameNo = 0;
    this.bodyMesh = R.uploadSkinned(A.body); this.hiltMesh = R.uploadStatic(A.hilt); this.lodMesh = A.lod ? R.uploadSkinned(A.lod) : this.bodyMesh;
    const gun = geo(); gun.box(0, 0.03, 0, 0.05, 0.13, 0.06, [0.16, 0.16, 0.19, 1]).box(0, -0.12, 0, 0.045, 0.2, 0.05, [0.32, 0.33, 0.38, 1]).box(0, -0.235, 0, 0.03, 0.05, 0.03, [0.9, 0.25, 0.15, 1]); this.gunMesh = R.uploadStatic(gun.build());
    this.arenaDef = this.teamMode || this.duel || this.tutorialMode || this.online ? AUTHORED_LEVELS[opts.mapId] || null : null; // a large authored arena instead of a BSP
    const garden = usesTrainingGarden(opts);
    if (garden) this.arenaDef = { id: 'training', label: 'Lightsaber Training', layout: createTrainingGarden() };
    const level = this.missionDef ? buildLevel(this.missionDef.layout) : this.arenaDef ? buildLevel(this.arenaDef.layout) : this.boardingMode ? buildLevel(opts.layout) : this.bossWayMode ? buildLevel(createBossWayArena()) : null;
    this.scoreDef = null; // Game 2's recorded soundtrack is combat-only; no synthesized ambient loop during exploration.
    const arena = (this.duel || this.online || this.teamMode || this.attract || this.tutorialMode) && !this.arenaDef || this.archiveMode;
    if (arena && !A.duelMap) throw new Error('Game 2 selected map not loaded');
    this.world = new World(R, arena ? A.duelMap : null, level);
    if (garden) R.farClip = 850; // extra landscape rings must not hit the old 400m clipping plane
    this.trainingMicrophysics = garden ? new TrainingMicrophysics() : null;
    // Online clients and late joiners must share the same door collision, without a new network protocol.
    if (garden && this.online) {
      // All online clients agree on the same collision: neither training
      // connector can be opened independently by one local player.
      this.world.space.snapDoor('garden_gate', true);
      this.world.space.snapDoor('handbook_gate', true);
      this.world.space.snapDoor('abyss_gate', true);
    }
    if (garden) Object.defineProperty(this.world, 'trainingVisitor', { get: () => this.player?.pos });
    this.playerSpawn = arena ? this.world.spawns.player.slice() : level ? level.playerSpawn.slice() : SPAWN.slice();
    this.enemySpawn = arena ? (this.world.spawns.enemy || this.world.spawns.player).slice() : level?.teamHomes ? level.teamHomes.red.slice() : [0, 0, 8];
    if (this.duel && level?.duelSpawns) { this.playerSpawn = level.duelSpawns.player.slice(); this.enemySpawn = level.duelSpawns.enemy.slice(); this.playerSpawnYaw = level.playerYaw; } // an authored arena's duel ground
    this.fx = new FX(R); this.sfx = new Sfx(opts.sfxBase); this.input = this.attract ? new NullInput() : new Input(canvas); this.hud = new HUD(hudCanvas); this.npcs = [];
    // The new recorded MP3 owns combat music in every playable Game 2 mode.
    // No score is played while roaming and it never shares Game 3D's track.
    this.combatTrack = new Game2CombatTrack();
    let fallbackCombatUrl = '';
    try {
      const configured = JSON.parse(globalThis.localStorage?.getItem('combat_audio_map_v1') || '{}');
      fallbackCombatUrl = typeof configured?.bgm_boss === 'string' ? configured.bgm_boss : '';
    } catch { /* no browser storage available */ }
    this.combatTrack.setUrl(this.attract ? null : (opts.combatMusicUrl || fallbackCombatUrl));
    this.battleMusicUnlock = () => { this.startMapMusic(); this.combatTrack.unlock(); };
    if (!this.attract) this.startMapMusic();
    if (typeof window !== 'undefined' && !this.attract) {
      window.addEventListener('pointerdown', this.battleMusicUnlock, { once: true });
      window.addEventListener('keydown', this.battleMusicUnlock, { once: true });
    }
    this.input.onFirstGesture = () => { this.startAudio(); this.startMapMusic(); this.combatTrack.unlock(); };
    // the main menu's Settings (settings.js), read once when the match starts
    const S = this.settings = opts.settings || null;
    if (S) { this.input.bindings = S.bindings; this.input.sens = 0.0022 * S.sensitivity; this.invertY = !!S.invertY; this.baseFov = S.fov; this.sfx.volume = S.masterVolume; this.hud.showFps = !!S.showFps; }
    if (this.duel) {
      this.input.wheelThrottle = 90;
      const h = this.hud;
      h.helpList = HELP_DUEL; h.helpW = 820;
      h.title = 'LIGHTSABER TRAINING';
      h.subtitle = 'Reborn saber duel · ' + (this.arenaDef ? this.arenaDef.label : 'original Raven arena') + ' · F1 = controls';
      h.debug = false;
      // The full-screen controls sheet previously paused every simulation step
      // until a mouse click. In the dashboard/embedded browser it could appear
      // as completely disabled WASD movement. Start playable immediately and
      // leave the controls sheet available explicitly via F1.
      h.help = false;
      this.started = true;
      h.msg('WASD to move · F1 for controls');
    } else if (this.bossWayMode) {
      const h=this.hud;this.input.wheelThrottle=90;
      h.helpList=HELP_BOSS_WAY;h.helpW=820;h.title=opts.dragonBoss?'BOSS WAY · DRAGON EVENT':'BOSS WAY · RANCOR COMBAT TEST';
      h.subtitle=this.bossPreview
        ? 'COMBAT TEST · TEMPORARY CREATURE · NOT THE ORIGINAL RANCOR · NO REWARDS'
        : '10 health bars · 5,000 HP each · telegraphed attacks · no loot drops yet';
      h.debug=false;h.help=false;this.started=true;
      h.msg('Boss Way · defeat the Rancor · WASD move · middle mouse lock-on · F1 controls');
    } else if (this.archiveMode) {
      const h=this.hud; this.input.wheelThrottle=90;
      h.helpList=HELP_MISSION;h.helpW=820;
      h.title=GAME2_MISSION_ARCHIVE[opts.mapId]?.label.toUpperCase() || 'MISSION ARCHIVE';
      h.subtitle='Explore the mission area · F1 for controls';
      h.debug=false;h.help=false;this.started=true;
      h.msg('Explore the area · use Return to Jedi Duels when finished');
    } else if (this.tutorialMode) {
      const h = this.hud; this.input.wheelThrottle = 90;
      h.helpList = HELP_DUEL; h.helpW = 820;
      h.title = 'GUIDED ARENA TRAINING';
      h.subtitle = 'Watch the instructor · follow on-screen steps · then try it';
      h.debug = false; h.help = false; this.started = true;
      this.aiOff = true;
    } else if (this.online) {
      const h = this.hud; this.input.wheelThrottle = 90;
      h.helpList = HELP_ONLINE; h.helpW = 820; h.title = 'ONLINE · JEDI VS DARK JEDI'; h.subtitle = (this.arenaDef ? this.arenaDef.label : GAME2_ARENA_MAPS[opts.mapId]?.label || 'Lightsaber Training') + ' arena · F1 = controls';
      h.debug = false; h.help = false; this.started = true; h.msg('WASD to move · F1 for controls');
    } else if (this.teamMode) {
      const h = this.hud;
      this.input.wheelThrottle = 90;
      h.helpList = HELP_SKIRMISH; h.helpW = 820;
      h.title = TEAM_MODES[this.mode].label.toUpperCase();
      h.subtitle = 'Local AI battle · F1 = controls · ' + (this.arenaDef ? this.arenaDef.label : opts.mapId || 'training');
      h.debug = false; h.help = false; this.started = true;
    } else if (this.attract) {
      this.hud.help = false; this.hud.debug = false; this.started = true; this.sfx.muted = true; this.input.onFirstGesture = null;
    } else if (this.boardingMode) {
      const h = this.hud; this.input.wheelThrottle = 90;
      h.helpList = HELP_BOARDING; h.helpW = 820; h.title = opts.title || 'FLEET ASSAULT · ABOARD'; h.subtitle = (opts.subtitle || 'Cruiser interior') + ' · F1 = controls';
      h.debug = false; h.help = false; this.started = true;
    } else if (this.missionDef) {
      const h = this.hud;
      this.input.wheelThrottle = 90;
      h.helpList = HELP_MISSION; h.helpW = 820; h.title = this.missionDef.title.toUpperCase(); h.subtitle = this.missionDef.subtitle + ' · F1 = controls';
      h.debug = false; h.help = false; this.started = true;
    }
    const startYaw = level ? level.playerYaw : this.archiveMode ? (this.world.spawns.yaw || 0) * Math.PI / 180 : 0;
    this.player = new Fighter(this, { name: 'player', isPlayer: true, team: 'player', pos: this.playerSpawn, yaw: startYaw, hp: 100, bladeColor: [0.22, 0.52, 1] });
    const starterGender=opts.quickStartCharacter?.gender;
    this.player.label = starterGender==='male'||starterGender==='female' ? 'Jedi' : 'You';
    // The native Explorer rig remains the playable fallback. A female starter
    // uses the existing validated Artemis GLB overlay; both genders share the
    // same Fighter, collisions, saber, HP, Force and network authority.
    if(starterGender==='male'||starterGender==='female'){
      this.player.gender=starterGender;
      this.player.quickStartId=opts.quickStartCharacter.id||opts.quickStartCharacter.avatarId;
    }
    this.player.humId = 0; this.player.experimentalStamina = createStamina();
    this.force = new Force(this, this.player, { list: this.forceMenu ? SELECT_ORDER : SELECT_ALL }); this.player.force = this.force; this.combat = new Combat(this);
    this.player.setSaberKit(opts.saber || 'single'); // the lightsaber picked in the menu: single, dual or saberstaff
    this.world.onThud = b => { if (b.vel[1] < -4) this.sfxAt('hit1', b.pos, 0.5); };
    this.populate();
    if (this.online && !opts.deferOnlineJoin) this.net = new NetGame(this, opts.net || {}); // other players, rounds and the AI Reborn (host)
    if (this.missionDef) { // story mode: Kyle carries the Bryar pistol and his lightsaber (Q switches)
      this.pistol = { cool: 0, charge: 0 }; this.playerWeapon = 'bryar'; this.player.gun = true; this.player.weaponPose = 'TORSO_WEAPONREADY2';
    }
    this.lockedTarget = null; this.lockOccluded = 0; // client-side target lock, separate from automatic parry / dodge
    this.cam = { yaw: startYaw, pitch: 0.2, dist: 3.7, pos: [this.playerSpawn[0], this.playerSpawn[1] + 1.4, this.playerSpawn[2]], eye: [this.playerSpawn[0], this.playerSpawn[1] + 2, this.playerSpawn[2] - 4], target: [this.playerSpawn[0], this.playerSpawn[1] + 1.4, this.playerSpawn[2]], fov: 62 * Math.PI / 180 };
    this.firstSub = true;
    const I = this.input;
    // Presses read inside the fixed 60 Hz simulation (jump, roll, Force keys, a quick click) are latched until a step
    // consumes them: on fast displays many rendered frames run no step, and those presses used to be dropped.
    this.stepPresses = new Set(); this.stepReleases = new Set(); this.pendingMouse = [0, 0];
    this.inp = { pressed: c => this.stepPressed(c), held: c => I.held(c), released: c => I.released(c) };
    this.fireT = 0;
    this.saberLoadoutMenu = new SaberLoadoutMenu({ canvas,
      getState: () => ({ kit: this.player.saberKit, unavailable: saberLoadoutUnavailable(this.player, this.t, this.nextSaberSwitchAt || 0) }),
      onSelect: kit => this.chooseSaberLoadout(kit),
      onOpenChange: open => {
        this.clearSaberMenuInput();
        this.input.enabled = !open;
      },
    });
  }
  clearSaberMenuInput() {
    this.input.releaseAll?.(); this.stepPresses?.clear(); this.stepReleases?.clear();
    this.pendingMouse = [0, 0]; this.throwAt = null;
    clearCmd(this.player.cmd); this.player.directionalGuard = null;
  }
  chooseSaberLoadout(kit) {
    const p = this.player;
    if (!SABER_LOADOUTS.some(entry => entry.id === kit)) return false;
    if (p.saberKit === kit) return true;
    const unavailable = saberLoadoutUnavailable(p, this.t, this.nextSaberSwitchAt || 0);
    if (unavailable) { this.hud.msg(unavailable); return false; }
    if (p.saberKit === 'single') this.singleSaberStyle = p.saber.level;
    p.setSaberKit(kit);
    if (kit === 'single') p.setStyle(this.singleSaberStyle || 2);
    p.saber.setMove(p.saber.I.LS_READY, this.t);
    p.saber.weaponTime = p.saber.torsoTimer = 0;
    p.prevMove = p.saber.I.LS_READY;
    this.nextSaberSwitchAt = this.t + SABER_SWAP_COOLDOWN;
    this.clearSaberMenuInput();
    this.hud.msg('Lightsaber: ' + SABER_LOADOUTS.find(entry => entry.id === kit).label);
    return true;
  }
  previewLoadout({ side, saber }) {
    this.player.setSaberKit(saber);
    applySide(this.player, side === 'dark' ? 'dark' : 'light', this.player.team);
    this.readySaber(this.player);
    this.player.finish(0); // update the chosen appearance without advancing the match
  }
  joinOnline(options) {
    if (!this.online || this.net) return;
    this.net = new NetGame(this, options);
    return this.net.startPromise;
  }
  populate() {
    if (this.bossWayMode) {
      this.remotes=[];this.readySaber(this.player);
      this.bossWay=optsDragonBoss(this) ? new DragonBossWay(this) : new BossWay(this);
      this.round={state:'fight',t:0};return;
    }
    if (this.online) { this.remotes = []; this.readySaber(this.player); return; }
    if (this.boardingMode) { this.remotes = []; this.readySaber(this.player); this.round = { state: 'fight', t: 0 }; return; }
    if (this.archiveMode) { // BSP exploration only: do not invent enemy groups or mission victory conditions.
      this.remotes=[];this.readySaber(this.player);this.round={state:'fight',t:0};return;
    } // the crew aboard comes from the match (BoardingNet)
    if (this.teamMode) { this.teamMatch = new Game2TeamMatch(this, this.mode, this.opts.mapId || 'training'); return; }
    if (this.attract) return this.populateAttract();
    if (this.tutorialMode) return this.populateTutorial();
    if (this.duel) return this.populateDuel();
    if (this.missionDef) { this.director = new MissionDirector(this, this.missionDef); return; }
    const droidTints = [[0.55, 0.75, 1.0], [0.9, 0.8, 0.5], [0.7, 1.0, 0.75]];
    [[9, 3], [-9, 6], [4, 15]].forEach(([x, z], i) => this.addNpc('droid', x, z, { name: 'droid' + i, label: 'Training Droid', team: 'enemy', hp: 70, tint: droidTints[i], tintAmt: 0.42, saber: false, yaw: Math.PI + 0.4 * i }));
    this.duelist = this.addNpc('duelist', 0, 7, { name: 'duelist', label: 'Sith Duelist', team: 'enemy', hp: 170, tint: [0.62, 0.22, 0.22], tintAmt: 0.3, saber: true, blade: [1, 0.08, 0.06], yaw: Math.PI, dmgScale: 0.55, blockSkill: 0.5 });
    this.ally = this.addNpc('ally', -7, -4, { name: 'ally', label: 'Jedi Ally', team: 'ally', hp: 100, tint: [0.35, 0.7, 0.45], tintAmt: 0.3, saber: true, blade: [0.2, 1, 0.3], yaw: 0.6 }); this.ally.hp = 50;
  }
  populateTutorial() {
    // A private, offline arena. Stationary target receives real combat actions;
    // the instructor shares the player's actual Fighter, Force and animations.
    const p = this.playerSpawn, y = this.playerSpawnYaw ?? 0;
    const fw = [Math.sin(y), Math.cos(y)], right = [Math.cos(y), -Math.sin(y)];
    const at = [p[0] + right[0] * 2, p[1], p[2] + right[1] * 2];
    const foe = [p[0] + fw[0] * 5.5 + right[0], p[1], p[2] + fw[1] * 5.5 + right[1]];
    const target = this.addNpc('darkjedi', foe[0], foe[2], { name: 'tutorial-target', label: 'Training Target', team: 'enemy', hp: 500,
      tint: [0.85, 0.55, 0.36], tintAmt: 0.3, saber: true, blade: [1, 0.3, 0.12], yaw: y + Math.PI, dmgScale: 0, blockSkill: 0 });
    target.pos[1] = foe[1]; target.spawn = foe.slice(); target.hp = target.maxHp = 500; target.reaction = 0;
    const trainer = this.addNpc('darkjedi', at[0], at[2], { name: 'tutorial-instructor', label: 'AI Instructor', team: 'ally', hp: 500,
      tint: [0.2, 0.65, 0.9], tintAmt: 0.25, saber: true, blade: [0.15, 0.8, 1], yaw: y, dmgScale: 0.5, blockSkill: 0 });
    trainer.pos[1] = at[1]; trainer.spawn = at.slice(); trainer.hp = trainer.maxHp = 500;
    trainer.force = new Force(this, trainer, { npc: true, fp: 180, list: SELECT_ORDER });
    this.tutorialTrainer = trainer; this.tutorialTarget = target; this.boss = target;
    this.readySaber(this.player);
    this.round = { state: 'fight', t: 0 };
  }
  populateDuel() {
    // one opponent: a Dark Jedi with the same Force powers, costs and rules as the player (missions spawn the same values from archetypes.js 'reborn')
    const b = this.addNpc('darkjedi', this.enemySpawn[0], this.enemySpawn[2], { name: 'darkjedi', label: 'Reborn', team: 'enemy', hp: 220, tint: [0.12, 0.09, 0.17], tintAmt: 0.66, saber: true, blade: [1, 0.05, 0.04], yaw: Math.PI, dmgScale: 0.6, blockSkill: 0.55 });
    b.pos[1] = this.enemySpawn[1]; b.reaction = 0.7; b.maxHp = 220; b.hp = 220; b.spawn = this.enemySpawn.slice(); b.setStyle(2);
    b.force = new Force(this, b, { npc: true, fp: 100, regen: 7, dmgScale: 0.75, healRate: 18, speedGain: 1.4, protectMul: 0.4, list: SELECT_ORDER });
    this.boss = b; this.readySaber(this.player);
    this.round = { state: 'intro', t: 0 };
  }
  // menu background: a Jedi and a Reborn (the duel's Reborn, same brain and Force) fight on, respawning; nobody is player-controlled
  populateAttract() {
    const p = this.player; p.status = 'dead'; p.hp = 0; p.alpha = 0; p.pos = [0, -60, 0]; this.round = { state: 'fight', t: 0 };
    const sides = [{ at: this.playerSpawn, team: 'blue', label: 'Jedi', blade: [0.22, 0.52, 1], tint: [1, 1, 1], tintAmt: 0, yaw: 0 }, { at: this.enemySpawn, team: 'red', label: 'Reborn', blade: [1, 0.05, 0.04], tint: [0.12, 0.09, 0.17], tintAmt: 0.66, yaw: Math.PI }];
    this.duelists = sides.map((s, i) => {
      const f = this.spawnArchetype('reborn', s.at, s.yaw, { name: 'attract' + i, label: s.label });
      f.team = s.team; f.blade.color = s.blade.slice(); f.actor.tint = s.tint.slice(); f.actor.tintAmt = s.tintAmt; f.hp = f.maxHp = 160; return f;
    });
  }
  readySaber(f) { f.saber.holstered = true; f.blade.set(false); f.blade.len = 0; f.hilt = 'thigh'; f.igniteNow(); }
  addNpc(kind, x, z, o) {
    const f = new Fighter(this, { name: o.name, kind, team: o.team, pos: [x, 0, z], yaw: o.yaw || 0, hp: o.hp, tint: o.tint, tintAmt: o.tintAmt, hasSaber: o.saber, bladeColor: o.blade });
    f.label = o.label; if (o.saber) f.experimentalStamina = createStamina(); f.blockSkill = o.blockSkill; f.dmgScale = o.dmgScale; f.targetYaw = f.yaw; f.humId = this.npcs.length + 1; f.healFlash = 0; f.provoked = true; f.gun = kind === 'droid' || !!o.gun;
    if (kind === 'duelist' || kind === 'darkjedi') f.setStyle(2);
    this.npcs.push(f); if (o.saber) { f.igniteNow(); f.quickIgnited = true; } return f;
  }
  // archetypes.js entry -> Fighter (Force, saber style, AI settings). pos = [x, y, z]
  spawnArchetype(id, pos, yaw = 0, extra = {}) {
    const A = ARCHETYPES[id]; if (!A) throw new Error('Unknown archetype ' + id);
    const f = this.addNpc(A.kind, pos[0], pos[2], { name: extra.name || id + '_' + this.npcs.length, label: extra.label || A.label, team: A.team, hp: A.hp, tint: A.tint, tintAmt: A.tintAmt, saber: A.saber, blade: A.blade, yaw, dmgScale: A.dmgScale, blockSkill: A.blockSkill, gun: A.gun });
    f.pos[1] = pos[1] ?? 0; if (A.reaction != null) f.reaction = A.reaction; f.maxHp = A.hp; f.hp = A.hp; f.spawn = pos.slice(); if (A.style) f.setStyle(A.style);
    if (A.force) f.force = new Force(this, f, { ...A.force, list: SELECT_ORDER });
    if (A.takeMul != null) f.takeMul = A.takeMul; if (A.brain) f.brainCfg = A.brain; f.archetype = id;
    return f;
  }
  removeNpc(f) { const i = this.npcs.indexOf(f); if (i < 0) return; this.humStop(f); if (f.force) f.force.releaseAll?.(true); this.npcs.splice(i, 1); }
  bark(f, text) { if (this.director) this.director.bark(f, text); }
  // ---------------- hooks used by Fighter / Force / Combat
  sfxAt(name, pos, vol = 1) { if (vol <= 0) return; this.sfx.play(name, { pos, vol, vary: 0.06 }); }
  humStart(f) {
    if (f.hum) return; const base = f.isPlayer ? 0.17 : 0.07; f.humBase = base; f.hum = this.sfx.loop('hum' + (1 + (f.humId || 0) % 4), { vol: base, rate: 1 + (f.humId || 0) * 0.03 });
  }
  humStop(f) { if (f.hum) { f.hum.stop(0.1); f.hum = null; } }
  startMapMusic() {
    if (this.disposed) return;
    if (this.scoreDef) { // Generated exploration score retained for authored Game 2 arenas.
      if (this.score || !this.sfx.ctx) return;
      this.score = new Score(this.sfx.ctx, this.scoreDef, { level: this.musicLevel() });
      this.score.start();
    }
  }
  setCombatTrackUrl(url) {
    if (this.disposed || this.attract || this.opts.combatMusicUrl) return;
    this.combatTrack.setUrl(url);
  }
  // Settings' Music volume under the master volume; silent while muted (M).
  musicLevel() { return this.sfx?.muted ? 0 : (this.settings?.musicVolume ?? 0.5) * (this.sfx?.volume ?? 0.7); }
  // Fight detection follows the actual Game 2 player, foes, hit and round state.
  // No shared Game 1 Audio element: Game 2 owns its own loop/fades and cleanup.
  updateMusic(dt) {
    if (this.attract || this.disposed || (!this.combatTrack && !this.score)) return;
    const fighting = game2CombatActive(this);
    const level = this.musicLevel();
    const externalPlaying = this.combatTrack?.update({ fighting, volume: level, dt }) ?? false;
    const S = this.score;
    if (!S) return;
    S.setLevel(externalPlaying ? level * 0.08 : level); // duck arena score under Combat 2
    S.setIntensity(fighting ? 1 : 0.3, dt);
    S.tick();
  }
  stopMapMusic() {
    if (this.score) { this.score.stop(); this.score = null; }
    this.combatTrack?.dispose();
    if (typeof window !== 'undefined' && this.battleMusicUnlock) {
      window.removeEventListener('pointerdown', this.battleMusicUnlock);
      window.removeEventListener('keydown', this.battleMusicUnlock);
    }
  }
  async startAudio() {
    this.sfx.resume(); try { await this.sfx.loading; } catch (e) { }
    for (const f of this.fighters()) if (!f.saber.holstered && f.hasSaber && f.blade.lit !== false) { f.hum = null; this.humStart(f); }
  }
  onSwing(f, move) {
    if (this.experimentalStaminaEligible(f)) {
      this.spendExperimentalStamina(f, STAMINA_SWING_COST, 'swing');
      if (!f.isPlayer) trackCommittedSwing(this, f, move);
      if (!this.tutorialMode && !this.director && !this.bossWay && !this.net)
        noteExchangeSwing(this, f);
      if (f.isPlayer && recordComboSwing(f, this.t)) this.hud?.msg?.('CHAIN · connect this strike');
      const force = this.forceOf(f);
      if (!this.net && !this.director && !this.bossWay && noteSurgeSwing(force, this.t)) {
        if (f.isPlayer && !this.tutorialMode && !this.aiOff) {
          for (const opponent of this.foesOf(f)) {
            const read = planSaberSurgeResponse(force, opponent, this.t);
            if (read && !opponent.experimentalSurgeResponse) {
              opponent.experimentalSurgeResponse = read;
              break;
            }
          }
        }
      }
    }
    if (this.trainingMicrophysics) this.trainingMicrophysics.swingWake(this.fx, f, {quality:this.settings?.quality});
    this.tutorial?.onSwing(f, move);
    if (!this.attract && this.player && (f.isPlayer || this.foesOf(this.player).includes(f)) &&
        Math.hypot(f.pos[0] - this.player.pos[0], f.pos[2] - this.player.pos[2]) < 20) {
      this.lastCombatMusicEventAt = this.t;
    }
    const lv = f.saber.level; this.sfx.play(Math.random() < 0.5 ? 'swing1' : 'swing2', { pos: f.pos, vol: f.isPlayer ? 0.8 : 0.55, rate: (lv === 1 ? 1.12 : lv === 3 ? 0.88 : 1) * (f.saber.rageMul > 1 ? 1.1 : 1), vary: 0.1 }); }
  onSaberBlock(f) {
    if (this.experimentalStaminaEligible(f)) this.spendExperimentalStamina(f, STAMINA_BLOCK_COST, 'guard');
  }
  onExperimentalBlockExchange(attacker, defender) {
    // Only an actual resolved, stamina-charged blade block may schedule this
    // local AI follow-up. Never create it from input guesses or AI animation.
    if (!this.experimentalCombatActive() || this.net || this.director ||
        this.bossWay || this.tutorialMode || this.aiOff || this.noDamage) return false;
    if (attacker?.isPlayer && !defender?.isPlayer)
      return queueAdaptiveExchange(this, defender, attacker, 'blocked');
    if (defender?.isPlayer && !attacker?.isPlayer)
      return queueAdaptiveExchange(this, attacker, defender, 'was-blocked');
    return false;
  }
  onExperimentalDodgeLanded(f) {
    // Only the completed physical dodge, never the button press or a cancelled
    // animation, opens the player's short follow-through blending window.
    if (!f?.isPlayer || !this.experimentalCombatActive() || this.net ||
        this.director || this.bossWay) return;
    // The callback fires only after a completed physical dodge. The existing
    // player combo blends only when a valid combo landing was actually earned.
    const comboLanded = markFlowLanding(f, this.t);
    if (comboLanded) {
      const opponent = f.experimentalCombo?.target;
      if (!this.tutorialMode && opponent && this.foesOf(f).includes(opponent)) {
        const read = planFlankRead(f, opponent, this.t);
        if (read) opponent.experimentalFlankRead = read;
      }
    }
    if (!this.tutorialMode && !this.aiOff) {
      for (const opponent of this.npcs) {
        if (this.foesOf(f).includes(opponent) && currentDuelSight(this, opponent))
          noteTacticalCue(this, opponent, f, 'dodge-landed');
      }
    }
  }
  onExperimentalPlayerParry(attacker, defender) {
    if (!defender?.isPlayer || attacker?.isPlayer || this.tutorialMode ||
        !this.experimentalCombatActive() || this.net) return false;
    return noteTacticalCue(this, attacker, defender, 'player-parry');
  }
  onSaberClash(a, b) {
    // One charge per physical blade bind, on each local participant.
    if (this.experimentalStaminaEligible(a)) this.spendExperimentalStamina(a, STAMINA_CLASH_COST, 'clash');
    if (b !== a && this.experimentalStaminaEligible(b)) this.spendExperimentalStamina(b, STAMINA_CLASH_COST, 'clash');
  }
  spendExperimentalStamina(f, cost, reason) {
    const out = spendStamina(f.experimentalStamina, cost, this.t);
    f.experimentalStamina = out.state;
    if (out.broke) {
      if (f.isPlayer) this.hud.msg('STAMINA BROKEN · disengage to recover');
      else {
        f.experimentalStaggerPending = true;
        if (f === this.lockedTarget || f === this.boss) this.hud.msg((f.label || 'Opponent') + ' guard broken');
      }
    }
    return out;
  }
  onThud(f) { this.sfxAt('hit1', f.pos, 0.7); this.dust(f.pos, 0.9, 10); if (f.isPlayer) this.shake(0.18); }
  onLand(f, impact) { if (impact > 8) { this.dust(f.pos, 0.6 + impact * 0.03, 8); } } // no camera shake: Jedi Outcast lands with a short LAND1 only
  // a taunt: the voice line (when the optional voices are installed) and, online, everyone else hears it too
  onTaunt(f, side, n, fromNet = false) {
    this.tutorial?.onTaunt(f);
    this.sfx.voice?.(side, n, { pos: f.pos, vol: f.isPlayer ? 0.9 : 0.75 });
    if (this.net && !fromNet && !f.remote && f.fid) this.net.fx('taunt', { fid: f.fid, side, n });
  }
  onDeath(f) { if (this.bossWay) this.bossWay.onDeath(f); if (f.killedBy && f.killedBy !== f && !f.remote) this.creditKill(f.killedBy); const K = f.killedBy; if (K && !K.isPlayer && !K.remote && K.taunt && K !== f && Math.random() < 0.6) K.after(0.9, () => { if (K.status === 'normal') K.taunt(); }); /* the AI gloats now and then */ this.sfxAt('hit3', f.pos, 0.8); this.dust(f.pos, 1.0, 12); if (this.teamMatch) this.teamMatch.onDeath(f); if (this.net) this.net.onDeath(f); if (f.isPlayer && !this.online && !this.tutorialMode) this.hud.msg(this.duel ? 'The Dark Jedi has bested you' : 'You were slain'); if (this.duel && !this.tutorialMode) { if (f === this.boss) this.endRound('won'); else if (f.isPlayer) this.endRound('lost'); } if (this.director) this.director.onDeath(f); }
  endRound(state) { if (this.duel && this.infinitePractice && (state === 'won' || state === 'lost')) return; if (this.round.state === 'won' || this.round.state === 'lost') return; this.round = { state, t: 0 }; this.hud.banners.length = 0; } // the result overlay in hud.js replaces any banner
  onForceJump(f) { this.sfxAt('jump', f.pos, 0.9); this.sfxAt('jumpbuild', f.pos, 0.5); this.fx.ring({ p: [f.pos[0], 0.05, f.pos[2]], n: [0, 1, 0], r0: 0.3, r1: 2.2, life: 0.5, w: 0.14, c: [0.6, 0.85, 1, 0.9] }); this.dust(f.pos, 1.0, 14); if (f.isPlayer) this.shake(0.12); }
  dust(p, size = 0.8, n = 8) { for (let i = 0; i < n; i++) { const a = rnd(0, 6.28); this.fx.emit({ p: [p[0] + Math.cos(a) * 0.3, 0.08, p[2] + Math.sin(a) * 0.3], v: [Math.cos(a) * rnd(0.8, 2.6) * size, rnd(0.2, 0.9), Math.sin(a) * rnd(0.8, 2.6) * size], life: rnd(0.4, 0.9), size: rnd(0.12, 0.28), grow: 0.5, c0: [0.5, 0.48, 0.55, 0.22], c1: [0.4, 0.38, 0.45, 0], drag: 2.5 }); } }
  shake(a) { this.shakeAmt = Math.max(this.shakeAmt, a); }
  scorch(p, col) { // saber burn mark on the floor: glows in the blade colour, then fades to a dark scorch
    const S = this.scorches ??= []; const near = S.find(m => Math.hypot(m.p[0] - p[0], m.p[2] - p[2]) < 0.12 && Math.abs(m.p[1] - p[1]) < 0.2);
    if (near) { near.t = Math.min(near.t, 0.2); near.r = Math.min(0.2, near.r + 0.01); return; } S.push({ p: p.slice(), c: col || [1, 0.6, 0.3], t: 0, r: 0.1 }); if (S.length > 60) S.shift();
  }
  flashLight(p, c, dur = 0.2) { this.flashes.push({ p: p.slice(), c, t: dur, max: dur }); if (this.flashes.length > 6) this.flashes.shift(); }
  burstHeal(f) { const p = f.pos; for (let i = 0; i < 30; i++) { const a = rnd(0, 6.28), r = rnd(0.2, 0.7); this.fx.emit({ p: [p[0] + Math.cos(a) * r, rnd(0.1, 1.2), p[2] + Math.sin(a) * r], v: [0, rnd(0.8, 2.2), 0], life: rnd(0.8, 1.4), size: rnd(0.04, 0.1), c0: [0.4, 1, 0.55, 0.9], c1: [0.2, 0.9, 0.4, 0] }); } this.fx.ring({ p: [p[0], 0.05, p[2]], n: [0, 1, 0], r0: 0.2, r1: 1.6, life: 0.9, w: 0.1, c: [0.35, 1, 0.5, 0.8] }); }
  // every fighter in the arena: the player, the AI and (online) the other players' fighters
  fighters() { return this.remotes && this.remotes.length ? [this.player, ...this.npcs, ...this.remotes] : [this.player, ...this.npcs]; }
  // the fighters hostile to f that are alive; kept for the step and rebuilt when anyone dies, comes back (Fighter.die /
  // revive bump foesGen), joins or leaves. Callers only read it.
  foesOf(f) {
    const n = this.npcs.length + (this.remotes ? this.remotes.length : 0), gen = this.foesGen | 0;
    if (f._foesT === this.t && f._foesG === gen && f._foesN === n) return f._foes;
    f._foes = this.fighters().filter(o => o !== f && o.status !== 'dead' && hostile(f, o)); f._foesT = this.t; f._foesG = gen; f._foesN = n; return f._foes;
  }
  // LOD is safe only for a truly quiet, distant NPC. Skipping an active
  // animation frame leaves the saber/hilt skin matrices stale, making enemies
  // snap, freeze or miss visual contact while the combat step keeps running.
  animLod(f) {
    if (!f || f.isPlayer || f.remote || this.npcs.length <= 16 ||
        enemyNeedsContinuousMotion(f, this.t)) return false;
    return this.lodDist2(f) > 144;
  }
  lodDist2(f) { const c = this.cam?.target || this.player.pos; return (f.pos[0] - c[0]) ** 2 + (f.pos[2] - c[2]) ** 2; }
  aiTarget(f) { // who an AI fights: the player offline; online the nearest fighter on the other side (kept unless one is 3 m closer)
    if (!this.openArena) return this.player;
    if (this.npcs.length > 16 && f.aiFoe && f.aiFoe.status !== 'dead' && this.t - (f.aiFoeAt ?? -9) < 0.2) return f.aiFoe; // big matches: look again 5 times a second
    f.aiFoeAt = this.t;
    const foes = this.foesOf(f); if (!foes.length) return null; const d = o => Math.hypot(o.pos[0] - f.pos[0], o.pos[2] - f.pos[2]);
    let best = foes.reduce((a, b) => (d(b) < d(a) ? b : a)); const cur = f.aiFoe && foes.includes(f.aiFoe) ? f.aiFoe : null;
    if (cur && d(cur) < d(best) + 3) best = cur; f.aiFoe = best; return best;
  }
  targets() {
    if (this.openArena) { const out = this.foesOf(this.player).map(n => ({ type: 'npc', ref: n, center: () => n.chest() })); for (const b of this.world.bodies) out.push({ type: 'prop', ref: b, center: () => [b.pos[0], b.pos[1] + 0.5, b.pos[2]] }); return out; }
    const out = []; for (const n of this.npcs) if (n.status !== 'dead') out.push({ type: 'npc', ref: n, center: () => n.chest() });
    for (const b of this.world.bodies) out.push({ type: 'prop', ref: b, center: () => [b.pos[0], b.pos[1] + 0.5, b.pos[2]] }); return out;
  }
  // ---------------- Force rules glue (rules live in forcerules.js; this builds the state they need and applies the outcome)
  forceOf(f) { return f.isPlayer ? this.force : (f.force || null); }
  forces() { const a = [this.force]; for (const n of this.npcs) if (n.force) a.push(n.force); if (this.remotes) for (const r of this.remotes) if (r.force) a.push(r.force); return a; }
  gripperOf(f) { for (const F of this.forces()) if (F.holding === 'grip' && F.target && F.target.type === 'npc' && F.target.ref === f) return F; return null; }
  banner(text, col = [1, 1, 1], life = 1.5) { this.hud.banner(text, col, life); }
  gripSnap(f, fp, cost) { // state for gripBlocker() (ForceGrip)
    const now = this.t; return { alive: f.status !== 'dead' && f.hp > 0, busy: f.forceUntil > now || f.status === 'roll', swinging: f.saber.weaponTime > 0, fp, cost, gripped: f.status === 'gripped', crippled: f.gripCripple > now || f.status === 'flung' || f.status === 'getup' };
  }
  defSnapshot(f, att, pull) { // state of the defender for resolveThrow() (CanCounterThrow + ForceThrow)
    const now = this.t, F = this.forceOf(f), c = f.cmd, kind = pull ? 'pull' : 'push';
    const dx = att.pos[0] - f.pos[0], dz = att.pos[2] - f.pos[2], dl = Math.hypot(dx, dz) || 1;
    return {
      alive: f.status !== 'dead' && f.hp > 0, level: F ? F.lv[kind] : 0, moving: !!(c.fwd || c.right), busy: f.status !== 'normal' || f.forceUntil > now || f.counterUntil > now,
      swinging: f.saber.weaponTime > 0, onGround: !!f.onGround, fp: F ? F.fp : 0, cost: THROW_COST,
      absorbActive: !!(F && F.active.absorb), absorbLevel: F ? F.lv.absorb : 0, facing: (Math.sin(f.yaw) * dx + Math.cos(f.yaw) * dz) / dl > 0.15,
      knockedDown: f.status === 'down' || f.status === 'flung', reaction: f.reaction,
    };
  }
  applyThrow(F, victim, pull, o = {}) {
    const att = F.p, kind = pull ? 'pull' : 'push', vp = victim.isPlayer, ap = att.isPlayer, VF = this.forceOf(victim);
    if (victim.status === 'dead' || !hostile(att, victim) || victim.spawnShield > this.t) return null;
    if (victim.remote && this.net) { this.net.rpc(victim, 'throw', [{ from: att, pull, lv: F.lv[kind], dmgScale: F.dmgScale ?? 1, dir: o.dir, dist: o.dist ?? 5, fall: o.fall, flatD: o.flatD, charge: o.charge || 0 }]); return null; } // resolved by that player's game
    const dist = o.dist ?? 5, fall = o.fall ?? clamp(1 - dist / 15, 0.2, 1), dir = o.dir, ch = clamp(o.charge || 0, 0, 1);
    // Caller passes the additional 20% only from local offline Experimental.
    // Never trust an arbitrary multiplier in any networked RPC.
    const pushMult = !pull && this.experimentalCombatActive() && !this.net
      ? clamp(o.pushMult || 1, 1, 1.2) : 1;
    if (!pull && this.tryClash(att, victim, 'push')) return { outcome: 'clash', scale: 0, reason: '', countered: false }; // two pushes meet
    victim.markAttacker?.(att);
    // Levitate + Push, or a Push on someone already flying (pulled up from above, knocked into the air): nothing to stand
    // on, nothing to counter with
    if (!pull && (victim.status === 'levitated' || (victim.status === 'flung' && !victim.onGround))) return this.launchLevitated(F, victim, dir, ch, pushMult);
    const def = this.defSnapshot(victim, att, pull);
    const res = resolveThrow({ attackerLevel: F.lv[kind] + (ch >= 0.75 ? 1 : 0), pull, def, dist, forceSpent: THROW_COST, knockdownDist: KNOCKDOWN_DIST + 4 * ch });
    if (res.fpGain && VF) VF.fp = Math.min(VF.max, VF.fp + res.fpGain);
    const why = { moving: 'moving', 'mid-swing': 'mid-swing', airborne: 'airborne', 'low Force': 'low on Force', recovering: 'recovering', 'caught off guard': 'caught off guard', 'no Force': '' }[res.reason] ?? res.reason;
    const NAME = pull ? 'PULL' : 'PUSH', mid = victim.chest();
    const note = (txt, col, life) => { if (vp || ap) this.banner(txt, col, life); };
    if (res.countered) { // the defender answers with a push / pull of his own (no Force cost, short lockout)
      victim.counterUntil = this.t + (pull ? 0.6 : 1.0); if (VF && !pull) VF.lastPush = { t: this.t, targets: [att] }; // their answering push: push again now and the two meet (a clash)
      if (victim.status === 'normal') victim.playForce(pull ? 'BOTH_FORCEPULL' : 'BOTH_FORCEPUSH', { durMs: pull ? 450 : 700 });
      this.sfxAt(pull ? 'pull' : 'push', victim.pos, 0.9);
      const back = [-dir[0], 0, -dir[2]]; this.fx.ring({ p: v3.addS(mid, back, 0.5), n: back, r0: 0.25, r1: 2.2, life: 0.45, w: 0.16, c: [0.75, 0.9, 1, 0.95], move: v3.scale(back, 12) });
    }
    switch (res.outcome) {
      case 'absorbed':
        this.sfxAt('absorbhit', victim.pos, 1); this.fx.sparks(mid, [0, 1, 0], 12, [0.7, 0.4, 1, 1]);
        note(vp ? 'ABSORBED  +' + res.fpGain + ' FP' : 'ABSORBED', [0.78, 0.5, 1]); break;
      case 'countered':
        this.sfxAt('hit2', mid, 0.4); this.fx.sparks(mid, [0, 1, 0], 8, [0.7, 0.85, 1, 1]);
        note(vp ? 'FORCE ' + NAME + ' BLOCKED' : 'COUNTERED', vp ? [0.55, 0.95, 1] : [1, 0.65, 0.35]); break;
      default: {
        const sc = res.scale;
        if (VF) VF.interrupt();
        if (res.outcome === 'staggered') { // partly stopped: slides, keeps footing
          victim.shove(pull ? [-dir[0], 0, -dir[2]] : dir, (pull ? 9 : 8 * pushMult) * sc * (0.6 + 0.4 * fall) * (1 + 0.5 * ch)); this.sfxAt('hit1', victim.pos, 0.5);
          note(vp ? NAME + ' PARTLY BLOCKED' : 'PARTLY BLOCKED', [0.75, 0.95, 0.8]);
        } else if (pull) {
          // Force Pull brings the victim to the space in front of the caster, in 3D: jump and pull, and they come up into the air
          const fy = Math.sin(att.yaw), fz = Math.cos(att.yaw), up = !att.onGround && att.pos[1] > victim.pos[1] + 0.8;
          const to = [att.pos[0] + fy * 1.5, up ? att.pos[1] + 0.2 : att.pos[1] + 0.15, att.pos[2] + fz * 1.5];
          victim.pullTo([-dir[0], 0, -dir[2]], 0, { to, power: 0.55 + 0.45 * sc }); this.sfxAt('hit1', victim.pos, 0.6);
          note(vp ? 'PULLED' + (why ? '  ·  ' + why : '') : (res.outcome === 'knockdown' ? 'KNOCKDOWN' : 'PULL HIT'), vp ? [1, 0.5, 0.4] : [0.7, 1, 0.75]);
          if (vp) { this.shake(0.25); this.hud.hit(3); }
        } else if (res.outcome === 'knockdown') {
          const k = 0.5 + 0.5 * sc; victim.push(dir, (6 + 7 * fall) * k * (1 + ch) * pushMult, (3.6 + 2.4 * fall) * k * (1 + 0.3 * ch), { keepYaw: false, quicker: true }); /* a full charge sends them twice as far */ const dmg = (6 + 10 * ch) * (F.dmgScale ?? 1); victim.hurt(dmg, att, { noFlinch: true }); this.sfxAt('hit2', victim.pos, 0.6); // w_force.c: pushed down -> quicker getup
          note(vp ? 'KNOCKED DOWN' + (why ? '  ·  ' + why : '') : 'KNOCKDOWN', vp ? [1, 0.45, 0.35] : [0.7, 1, 0.75]); if (vp) { this.shake(0.35); this.hud.hit(dmg); }
        } else { // a hit that does not knock down: breaks the swing and slides the target back
          victim.stagger(dir, (9 + 4 * fall) * sc * (1 + ch) * pushMult); const dmg = (3 + 6 * ch) * (F.dmgScale ?? 1); victim.hurt(dmg, att, { noFlinch: true }); this.sfxAt('hit1', victim.pos, 0.6);
          note(vp ? 'PUSHED' + (why ? '  ·  ' + why : '') : 'PUSH HIT' + (why ? '  ·  ' + why : ''), vp ? [1, 0.55, 0.4] : [0.7, 1, 0.75]); if (vp) { this.shake(0.28); this.hud.hit(dmg); }
        }
      }
    }
    // an AI that kept its feet pushes back now and then: two pushes meeting are a Force clash
    if (!pull && VF && !VF.remote && !victim.isPlayer && !victim.remote && victim.status === 'normal' && Math.random() < 0.55) victim.after(0.12 + Math.random() * 0.2, () => {
      if (victim.status !== 'normal' || att.status === 'dead' || VF.fp < THROW_COST || (VF.cool.throw || 0) > this.t) return;
      victim.aiFoe = att; victim.aiFoeAt = this.t; victim.yaw = victim.targetYaw = Math.atan2(att.pos[0] - victim.pos[0], att.pos[2] - victim.pos[2]); VF.cast('push');
    });
    return res;
  }
  // a Force clash (clash.js): a's push meets b's push of a moment ago aimed at a, or their lightning streams meet
  tryClash(a, b, kind) {
    if (this.online || this.attract || this.clash || !canClash(a, b)) return false;
    const B = b.force, met = kind === 'push' ? !!B.lastPush && this.t - B.lastPush.t <= CLASH_WINDOW && B.lastPush.targets.includes(a) : B.holding === 'lightning' && (B.ltTargets || []).some(h => h.t.ref === a);
    if (!met) return false;
    this.clash = new ForceClash(this, a, b, kind); return true;
  }
  // a Push on someone helpless in the air (levitated, pulled up, flying): thrown hard with the Force Push knockdown
  // (BOTH_KNOCKDOWN1, blown backward), no counter, and they slam into whatever is behind
  launchLevitated(F, victim, dir, ch = 0, pushMult = 1) {
    const att = F.p; if (victim.status === 'levitated') victim.levitate?.(false, { quiet: true });
    victim.push(dir, (15 + 6 * ch) * pushMult, 3.2, { keepYaw: false, anim: 'BOTH_KNOCKDOWN1' }); const dmg = (8 + 6 * ch) * (F.dmgScale ?? 1); victim.hurt(dmg, att, { noFlinch: true });
    this.sfxAt('hit2', victim.pos, 0.8); this.fx.ring({ p: victim.chest(), n: dir, r0: 0.2, r1: 2.4, life: 0.4, w: 0.16, c: [0.75, 0.9, 1, 0.95], move: v3.scale(dir, 10) });
    if (victim.isPlayer || att.isPlayer) { this.banner('LAUNCHED', [0.7, 0.95, 1]); this.shake(0.3); }
    return { outcome: 'knockdown', scale: 1, knockdown: true, launched: true, reason: '', countered: false };
  }
  // a saberstaff kick lands (Fighter.startKick): whoever stands within 1.9 m in the kick's direction is knocked down that way
  kickHit(f, dir) {
    const s = Math.sin(f.yaw), c = Math.cos(f.yaw), d = { F: [s, c], B: [-s, -c], L: [c, -s], R: [-c, s] }[dir] || [s, c], kd = [d[0], 0, d[1]];
    for (const v of this.foesOf(f)) {
      const dx = v.pos[0] - f.pos[0], dz = v.pos[2] - f.pos[2], L = Math.hypot(dx, dz);
      if (L > 1.9 || L < 0.05 || Math.abs(v.pos[1] - f.pos[1]) > 1.5 || (dx * d[0] + dz * d[1]) / L < 0.45 || v.spawnShield > this.t || v.status === 'executed') continue;
      v.markAttacker?.(f); if (v.status === 'levitated') v.levitate?.(false, { quiet: true });
      v.push(kd, 7.5, 3.2, { keepYaw: false, anim: 'BOTH_KNOCKDOWN2' }); v.hurt(10 * (f.damageMul ?? 1), f, { noFlinch: true });
      const p = v.chest(); this.fx.sparks(p, [-kd[0], 0.3, -kd[2]], 8, [1, 0.9, 0.7, 1]); this.sfxAt('hit2', p, 0.8);
      if (v.isPlayer || f.isPlayer) { this.shake(0.25); if (f.isPlayer) this.banner('KICK', [1, 0.85, 0.55], 0.8); }
    }
  }
  // a fighter thrown into a wall at speed slams into it: damage by impact speed (credited to whoever threw them), a pinned
  // moment against the wall, sparks, dust and a crack left in the wall
  onWallSlam(f, speed, n) {
    const dmg = Math.min(36, 12 + (speed - WALL_SLAM_SPEED) * 2.5), by = f.lastAttacker && this.t - (f.lastAttackerAt ?? -99) < 3 ? f.lastAttacker : null;
    f.hurt(dmg, by, { noFlinch: true }); f.vel[0] = f.vel[2] = 0; f.vel[1] = Math.min(f.vel[1], 0); f.slamUntil = this.t + 0.28;
    const p = [f.pos[0] - n[0] * (f.radius + 0.02), f.pos[1] + 1.05, f.pos[2] - n[2] * (f.radius + 0.02)];
    this.addCrack(p, n, 0.55 + speed * 0.05); this.fx.sparks(p, n, 18, [1, 0.85, 0.6, 1]); this.dust(f.pos, 1.2, 14);
    this.sfxAt('hit3', p, 0.9); this.sfxAt('wall2', p, 0.8); this.flashLight(p, [1, 0.8, 0.6], 0.2);
    if (f.isPlayer || (by && by.isPlayer)) { this.banner('WALL SLAM', [1, 0.8, 0.55]); this.shake(0.4); }
    if (this.net && !f.remote) this.net.fx('crack', { p: p.map(v => Math.round(v * 1000) / 1000), n: n.map(v => Math.round(v * 1000) / 1000), s: 0.55 + speed * 0.05 });
  }
  // a crack in the wall: jagged lines spreading from the impact in the wall's plane; fades out after CRACK_LIFE s
  addCrack(p, n, size = 0.8) {
    const C = this.cracks ??= [], up = Math.abs(n[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0], u = v3.norm(v3.cross(up, n)), w = v3.cross(n, u), at = v3.addS(p, n, 0.015), lines = [];
    const arms = 7 + Math.floor(Math.random() * 3);
    for (let i = 0; i < arms; i++) {
      let a = (i / arms) * Math.PI * 2 + rnd(-0.25, 0.25), r = 0, pt = at; const pts = [at];
      const len = size * rnd(0.55, 1.1);
      for (let k = 0; k < 4; k++) { r += len / 4; a += rnd(-0.45, 0.45); const q = v3.addS(v3.addS(at, u, Math.cos(a) * r), w, Math.sin(a) * r); pts.push(q); pt = q; if (k === 1 && Math.random() < 0.6) { const b = a + rnd(0.5, 1.1) * (Math.random() < 0.5 ? -1 : 1); lines.push([pt, v3.addS(v3.addS(pt, u, Math.cos(b) * len * 0.3), w, Math.sin(b) * len * 0.3)]); } }
      lines.push(pts);
    }
    C.push({ p: at, n, size, t: 0, lines }); if (C.length > 24) C.shift();
  }
  drawCracks(R) {
    for (const c of this.cracks || []) {
      const a = Math.min(1, (CRACK_LIFE - c.t) / 2); if (a <= 0) continue;
      for (const L of c.lines) for (let i = 0; i < L.length - 1; i++) R.beam(L[i], L[i + 1], 0.035 * (1 - i * 0.18), [0.03, 0.03, 0.035, 0.85 * a], [0.03, 0.03, 0.035, 0.85 * a], 1);
      if (c.t < 0.5) R.billboard(c.p, c.size * 0.8, [1, 0.6, 0.3, 0.6 * (1 - c.t / 0.5)], 0);
    }
  }
  // ---------------- Force Repulse burst (Force.startPulse): the caster, curled up in the air, bursts open. A shockwave
  // in every direction; every foe within `radius` is blasted outward and disintegrates in the air a moment later
  forcePulse(att, radius, fromNet = false) {
    const c = att.chest(), gy = this.world.floorAt(att.pos[0], att.pos[2], att.pos[1] + 0.5) ?? att.pos[1];
    for (let k = 0; k < 3; k++) this.fx.ring({ p: [att.pos[0], gy + 0.2 + k * 0.7, att.pos[2]], n: [0, 1, 0], r0: 0.4, r1: radius * (1.15 - k * 0.15), life: 0.6 + k * 0.1, w: 0.35, c: [1, 0.85 - k * 0.15, 0.5, 0.95] });
    for (const n of [[1, 0, 0], [0, 0, 1], [0.7, 0, 0.7], [0.7, 0, -0.7], [0, 1, 0]]) this.fx.ring({ p: c, n, r0: 0.3, r1: radius, life: 0.5, w: 0.25, c: [1, 1, 1, 0.8] }); // a sphere of force
    for (let i = 0; i < 140; i++) { const a = rnd(0, 6.28), up = rnd(-0.6, 0.8); this.fx.emit({ p: c, v: [Math.cos(a) * rnd(8, 18), up * 9, Math.sin(a) * rnd(8, 18)], life: rnd(0.35, 0.75), size: rnd(0.06, 0.15), c0: [1, 0.92, 0.65, 1], c1: [1, 0.4, 0.1, 0], drag: 2 }); }
    this.dust([att.pos[0], gy, att.pos[2]], 2.6, 36); this.flashLight(c, [1, 0.88, 0.65], 0.6); this.sfxAt('push', att.pos, 1); this.sfxAt('hit3', att.pos, 1); this.sfxAt('rage', att.pos, 0.6);
    if (att.isPlayer || v3.dist(this.player.pos, att.pos) < radius + 4) this.shake(0.9);
    if (att.isPlayer) this.banner('FORCE REPULSE', [1, 0.85, 0.5], 1.8);
    if (this.net && !fromNet && att.fid) this.net.fx('pulse', { fid: att.fid, r: radius });
    if (fromNet) return; // the blast's victims are thrown and vaporized by the caster's game (push / vaporize RPCs)
    for (const f of this.foesOf(att)) {
      if (v3.dist(f.pos, att.pos) > radius || Math.abs(f.pos[1] - att.pos[1]) > 4 || f.spawnShield > this.t || f.executor) continue;
      const d = v3.sub(f.pos, att.pos), L = Math.hypot(d[0], d[2]), dir = L > 0.01 ? [d[0] / L, 0, d[2] / L] : [Math.sin(att.yaw), 0, Math.cos(att.yaw)];
      f.markAttacker?.(att); if (f.status === 'levitated') f.levitate?.(false, { quiet: true });
      f.push(dir, 15 + 7 * (1 - L / radius), 5.5, { keepYaw: false, anim: 'BOTH_KNOCKDOWN1' }); // blasted outward...
      f.after(0.22 + 0.14 * L / radius, () => f.vaporize(att));                                // ...and burns away in the air
    }
    for (const b of this.world.bodies) { const d = v3.sub(b.pos, att.pos), L = Math.hypot(d[0], d[2]); if (L < radius * 1.5 && L > 0.01) this.world.impulse(b, [d[0] / L * 18, 7, d[2] / L * 18]); }
  }
  onVaporize(f) { const c = f.chest(); for (let i = 0; i < 50; i++) this.fx.emit({ p: [c[0] + rnd(-0.3, 0.3), c[1] + rnd(-0.9, 0.7), c[2] + rnd(-0.3, 0.3)], v: [rnd(-1.5, 1.5), rnd(0.5, 3), rnd(-1.5, 1.5)], life: rnd(0.6, 1.4), size: rnd(0.03, 0.08), c0: [1, 0.7, 0.3, 1], c1: [0.3, 0.25, 0.25, 0], drag: 1 }); }
  // the Force Repulse meter: damage dealt and defeats (only the attacker's own game counts them)
  creditDamage(from, dmg) { const F = from && this.forceOf(from); if (F && !F.remote && F.gainPulse) F.gainPulse(dmg * PULSE_PER_HP); }
  creditKill(from) { const F = from && this.forceOf(from); if (F && !F.remote && F.gainPulse) F.gainPulse(PULSE_PER_KILL); }
  // ---------------- executions (executions.js)
  startExecution(att, vic, kind, o = {}) {
    if (!att || !vic || vic.status === 'dead' || att.executing) return null;
    const ex = new Execution(this, att, vic, kind, o); (this.executions ??= []).push(ex);
    if (vic.remote && !o.fromNet && vic.executedBy) vic.executedBy(att, kind, { fwd: ex.fwd, hold: ex.hold }); // their game runs their side
    return ex;
  }
  updateExecutions(dt) { if (!this.executions) return; for (const ex of this.executions) ex.update(dt); this.executions = this.executions.filter(ex => !ex.done); }
  // cut a fighter in half (the bisect execution): both halves keep the pose of that moment; shown to everyone online
  cutFighter(f, c, fromNet = false) {
    if (f.cut) return; f.cut = { y: c.y, dir: v3.norm([c.dir[0], 0, c.dir[2]]), floor: c.floor, t: this.t, vertical: !!c.vertical }; f.actor.frozen = true; // vertical: down the middle (the Counter)
    if (this.net && !fromNet && f.fid) this.net.fx('cut', { fid: f.fid, y: Math.round(c.y * 1000) / 1000, dir: c.dir.map(v => Math.round(v * 1000) / 1000), floor: Math.round(c.floor * 1000) / 1000, v: c.vertical ? 1 : 0 });
  }
  bodyArc(n) { if (Math.random() < 0.5) return; const names = ['lhand', 'rhand', 'cranium', 'lradius', 'rradius', 'ltibia', 'rtibia', 'thoracic']; const a = n.actor.bonePos(names[Math.floor(Math.random() * names.length)]), b = n.actor.bonePos(names[Math.floor(Math.random() * names.length)]); this.arcs.push({ pts: bolt(a, b, 5, 0.15), t: 0.06 }); }
  drawArcs(R) { for (let i = this.arcs.length - 1; i >= 0; i--) { const b = this.arcs[i]; drawBolt(R, b.pts, [0.6, 0.8, 1], 0.5); b.t -= this.dtFrame; if (b.t <= 0) this.arcs.splice(i, 1); } }
  onElecTick(f) { this.bodyArc(f); this.fx.sparks(f.chest(), [0, 1, 0], 3, [0.6, 0.8, 1, 1]); this.sfxAt('lhit' + (1 + Math.floor(Math.random() * 3)), f.pos, 0.3); f.flash = Math.max(f.flash, 0.1); if (f.isPlayer) { this.shake(0.1); this.hud.hit(0); } }
  // Duel Practice only: toggle invulnerable training for BOTH opponents.
  // Keep the ordinary health, damage reactions, Force and AI simulation live;
  // do not use Infinity as a numeric HP value (HUD and combat math require finite HP).
  isInfinitePracticeFighter(f) {
    return this.duel && !this.online && this.infinitePractice === true &&
      !!f && (f === this.player || f === this.boss);
  }
  setInfinitePractice(enabled) {
    if (!this.duel || this.online || this.teamMode || this.attract) return false;
    const next = enabled === true;
    if (this.infinitePractice === next) return next;
    this.infinitePractice = next;
    if (next) {
      // If the player switches it on after a victory/defeat, revive both
      // participants immediately instead of leaving the result screen stuck.
      const ended = this.round?.state === 'won' || this.round?.state === 'lost';
      const knockedOut = [this.player, this.boss].some(f =>
        f && ['dead', 'executed', 'executing'].includes(f.status));
      if (this.executions?.length) {
        for (const ex of this.executions) if (!ex.done) ex.cancel?.();
        this.executions = this.executions.filter(ex => !ex.done);
      }
      if (ended || knockedOut) {
        this.resetDuel();
        this.round = { state: 'fight', t: 0 };
      }
      for (const f of [this.player, this.boss]) if (f) f.hp = f.maxHp;
      this.hud?.msg?.('INFINITE PRACTICE ON · both fighters cannot be defeated');
    } else {
      this.hud?.msg?.('INFINITE PRACTICE OFF · normal duel rules restored');
    }
    return next;
  }
  // ---------------- duel rounds
  updateRound(dt) {
    const r = this.round; r.t += dt;
    if (r.state === 'intro' && this.started && !this.hud.help && r.t > 2.2) { r.state = 'fight'; r.t = 0; this.banner('FIGHT', [1, 0.85, 0.5], 1.2); }
  }
  resetDuel() {
    this.clearTargetLock();
    const p = this.player, b = this.boss; this.force.reset(); b.force.reset();
    p.revive(this.playerSpawn.slice()); p.experimentalStamina = createStamina(); p.status = 'normal'; p.speedMul = p.damageMul = p.takeMul = 1; p.glow = 0; p.saber.rageMul = 1; p.yaw = p.targetYaw = this.cam.yaw = this.playerSpawnYaw ?? 0; p.actor.animSpeed = 1; this.readySaber(p); this.cam.pitch = 0.2;
    this.respawnNpc(b); b.force.fp = b.force.max; b.reaction = 0.7;
    for (const w of this.world.bodies) { w.pos = w.home.slice(); w.vel = [0, 0, 0]; w.w = [0, 0, 0]; w.grounded = true; w.lifted = 0; w.rot = [0, Math.random() * 6, 0]; w.hp = 100; }
    this.combat.bolts.length = 0; this.arcs.length = 0; this.scorches = []; this.hud.msgs.length = 0; this.hud.dmg = 0; this.round = { state: 'intro', t: 0 }; this.hud.msg('Rematch');
  }
  dispose() { this.clearTargetLock(); this.disposed = true; this.saberLoadoutMenu?.dispose(); this.stopMapMusic(); try { this.world?.dispose?.(); } catch (e) { console.warn('Game 2 world cleanup',e); } try { this.net && this.net.dispose(); } catch (e) { } try { this.input.dispose(); } catch (e) { } try { this.sfx.dispose(); } catch (e) { } }
  aimDir(ignoreTargetLock = false) {
    // Free-aimed powers (Force Lightning) must not inherit saber target lock.
    if (!ignoreTargetLock && this.lockedTarget && this.foesOf(this.player).includes(this.lockedTarget) &&
        lockTargetIsValid(this, this.lockedTarget) && lockTargetVisible(this, this.lockedTarget)) {
      return v3.norm(v3.sub(this.lockedTarget.chest(), this.player.chest()));
    }
    const c = this.cam; const cp = Math.cos(c.pitch), d = [Math.sin(c.yaw) * cp, -Math.sin(c.pitch), Math.cos(c.yaw) * cp]; const o = this.player.chest(); const pt = v3.addS(c.eye, d, c.dist + 14); return v3.norm([pt[0] - o[0], pt[1] - o[1], pt[2] - o[2]]); }
  clearTargetLock(message = '') {
    if (!this.lockedTarget) return;
    this.lockedTarget = null; this.lockOccluded = 0;
    if (message) this.hud?.msg(message);
  }
  toggleTargetLock() {
    if (this.lockedTarget) { this.clearTargetLock('Target unlocked'); return; }
    const foe = chooseLockTarget(this);
    if (!foe) { this.hud.msg(this.teamMatch?.mode === 'ctf' ? 'No teammate or opponent in sight' : 'No enemy in sight'); return; }
    this.lockedTarget = foe; this.lockOccluded = 0;
    this.hud.msg((foe.team === this.player.team ? 'Shield ally: ' : 'Locked on: ') + (foe.label || 'Enemy'));
  }
  updateTargetLock(dt) {
    const foe = this.lockedTarget;
    if (!foe) return;
    if (!lockTargetIsValid(this, foe)) { this.clearTargetLock('Target lost'); return; }
    if (!lockTargetVisible(this, foe)) this.lockOccluded += dt;
    else this.lockOccluded = 0;
    if (this.lockOccluded >= LOCK_OCCLUSION_GRACE) { this.clearTargetLock('Target out of sight'); return; }
    const c = this.cam, desired = lockTargetAngles(c.pos, foe.chest());
    const smooth = 1 - Math.exp(-13 * Math.min(dt, 0.1));
    c.yaw += wrapTargetAngle(desired.yaw - c.yaw) * smooth;
    c.pitch += (desired.pitch - c.pitch) * smooth;
  }
  combatContext(f) {
    const foes = this.openArena ? this.foesOf(f) : f.team === 'player' ? this.npcs.filter(n => n.team === 'enemy' && n.status !== 'dead') : f.team === 'enemy' && this.player.status !== 'dead' ? [this.player] : [];
    let front = false, behind = false; const fw = [Math.sin(f.yaw), Math.cos(f.yaw)];
    for (const e of foes) { const dx = e.pos[0] - f.pos[0], dz = e.pos[2] - f.pos[2], d = Math.hypot(dx, dz); if (d > 2.7 || d < 0.01) continue; const dot = (fw[0] * dx + fw[1] * dz) / d; if (dot > 0.5) front = true; else if (dot < -0.45 && d < 2.3) behind = true; }
    // Native presence traces run at attack selection, not during idle or a
    // committed action. Avoid four geometry scans per dual fighter per tick.
    const selectDual = f.saber.animLevel === 6 && f.cmd.attack && !f.kata &&
      !f.saber.inSpecial(f.saber.move) && f.saber.weaponTime <= STEP * 1000;
    return { front, behind, dualTargets: selectDual ? academyDualTargetPresence(f, foes, this.world) : undefined };
  }
  separate(f) {
    if (f.status === 'dead' || f.status === 'gripped' || f.status === 'flung' || f.status === 'levitated') return;
    for (const o of this.fighters()) {
      if (o === f || o.status === 'dead' || o.status === 'gripped' || o.status === 'levitated') continue; if (Math.abs(o.pos[1] - f.pos[1]) > 1.3) continue;
      const dx = f.pos[0] - o.pos[0], dz = f.pos[2] - o.pos[2], d = Math.hypot(dx, dz), m = f.radius + o.radius; if (d < m && d > 1e-4) { const k = (m - d) * 0.5; f.pos[0] += dx / d * k; f.pos[2] += dz / d * k; o.pos[0] -= dx / d * k; o.pos[2] -= dz / d * k; }
    }
    if (f.pos[1] < 0.8) for (const b of this.world.bodies) { if (b.lifted > 0 || b.pos[1] > 0.9) continue; const dx = f.pos[0] - b.pos[0], dz = f.pos[2] - b.pos[2], d = Math.hypot(dx, dz), m = f.radius + b.r; if (d < m && d > 1e-4) { f.pos[0] = b.pos[0] + dx / d * m; f.pos[2] = b.pos[2] + dz / d * m; } }
  }
  // ---------------- player input
  experimentalCombatActive() {
    // Mission Archive: the user requested the new duel controls ONLY for the
    // player. Retain existing legacy NPC brains, moves and defensive rules.
    const playerOverride=this.archiveMode && this.opts.playerCombatOverride==='directional360';
    return (playerOverride || this.settings?.combatMode === 'directional360') &&
      !this.online && !this.teamMode && !this.boardingMode && !this.attract;
  }
  experimentalStaminaEligible(f) {
    // Never write stamina to network puppets, ordinary blaster NPCs, or Classic.
    return this.experimentalCombatActive() && !!f && f.hasSaber && !f.remote &&
      !(this.archiveMode && this.opts.npcCombatPolicy==='classic' && !f.isPlayer) &&
      f.status !== 'dead' && f.status !== 'executed' && f.status !== 'executing';
  }
  stepPressed(code) { return this.firstSub && (this.stepPresses ? this.stepPresses.has(code) : this.input.pressed(code)); }
  stepReleased(code) { return this.firstSub && (this.stepReleases ? this.stepReleases.has(code) : (this.input.released?.(code) ?? false)); }
  buildPlayerCmd() {
    const i = this.input, p = this.player, c = p.cmd;
    if (this.saberLoadoutMenu?.isOpen) { clearCmd(c); return; }
    if(this.bossWay?.phase==='intro') { // cinematic frames cannot accept hidden combat commands
      clearCmd(c);return;
    }
    if(this.bossWay && (this.bossWay.phase==='won'||this.bossWay.phase==='lost')) {
      clearCmd(c);return;
    } if (this.hud.help || (this.tutorialMode && this.tutorialPhase === 'demo')) { c.fwd = c.right = 0; c.attack = c.alt = c.jump = c.crouch = c.walk = false; c.jumpPressed = c.jumpReleased = c.crouchPressed = false; p.directionalGuard = null; c.experimentalSector = null; return; }
    const bound = (action, fallback) => i.bindings?.[action] || fallback;
    c.fwd = (i.held(bound('forward', 'KeyW')) ? 1 : 0) - (i.held(bound('back', 'KeyS')) ? 1 : 0);
    c.right = (i.held(bound('right', 'KeyD')) ? 1 : 0) - (i.held(bound('left', 'KeyA')) ? 1 : 0);
    c.aimPitch = this.cam.pitch; c.walk = i.held('ShiftLeft') || i.held('ShiftRight'); c.crouch = i.held('KeyC'); c.attack = (i.held(bound('attack', 'Mouse0')) || this.stepPressed(bound('attack', 'Mouse0'))) && !i.held(bound('alt', 'Mouse2')); c.alt = i.held(bound('alt', 'Mouse2')); c.jump = i.held(bound('jump', 'Space'));
    c.up = c.jump ? 1 : c.crouch ? -1 : 0; c.jumpPressed = this.stepPressed(bound('jump', 'Space')); c.jumpReleased = this.stepReleased(bound('jump', 'Space')); c.crouchPressed = this.stepPressed('KeyC');
    const pm = this.pendingMouse ??= [0, 0]; c.mouseDX = this.firstSub ? pm[0] : 0; c.mouseDY = this.firstSub ? pm[1] : 0; if (this.firstSub) pm[0] = pm[1] = 0; // mouse flick for the swing wind-up
    // New attack direction and stamina rules are offline Experimental-only.
    // The pre-existing Classic hold-B directional guard remains unchanged.
    const experimentalCombat = this.experimentalCombatActive();
    const directionActive = experimentalCombat && !!this.lockedTarget;
    const previousSector = p.experimentalDirection?.sector;
    p.experimentalDirection = updateExperimentalDirection(p.experimentalDirection, {
      dx: c.mouseDX, dy: c.mouseDY, active: directionActive,
    });
    c.experimentalSector = directionActive ? p.experimentalDirection?.sector || null : null;
    if (directionActive && this.firstSub && this.hud.debug &&
        p.experimentalDirection?.sector && p.experimentalDirection.sector !== previousSector) {
      this.hud.msg('360° attack direction: ' + p.experimentalDirection.sector);
    }
    // Experimental-only stamina: committed attacks and successful parries spend
    // the resource elsewhere; holding guard drains it every fixed simulation tick.
    const blockHeld = i.held(bound('block', 'KeyB')) && !p.kata && !p.executing && p.status === 'normal';
    if (experimentalCombat) {
      const wasBroken = staminaBroken(p.experimentalStamina, this.t);
      p.experimentalStamina = stepStamina(p.experimentalStamina, { dt: STEP, now: this.t, guarding: blockHeld });
      if (!wasBroken && staminaBroken(p.experimentalStamina, this.t)) this.hud.msg('GUARD BROKEN · retreat to recover');
      if (staminaBroken(p.experimentalStamina, this.t) || p.experimentalStamina.current < STAMINA_SWING_COST) c.attack = false;
    }
    // Fresh eight-way flick lasts 320 ms. A held guard without a new gesture
    // falls back to 35%; never turn a held button into permanent perfect defense.
    p.directionalGuard = updateDirectionalGuard(p.directionalGuard, {
      held: blockHeld && (!experimentalCombat ||
        (!staminaBroken(p.experimentalStamina, this.t) && p.experimentalStamina.current >= STAMINA_BLOCK_COST)),
      dx: c.mouseDX, dy: c.mouseDY, now: this.t,
    });
    if (p.directionalGuard?.held || (experimentalCombat && blockHeld)) c.attack = c.alt = false;
    // A fresh Q press after a precisely aimed Experimental parry commits a
    // directional Force step. Normal held-Q defensive evades are unchanged.
    if (experimentalCombat && this.stepPressed(bound('evade', 'KeyQ'))) {
      if (this.combat?.counterEvade(p, this.force)) {
        c.attack = c.alt = false;
        this.hud.msg('Counter step · follow up with attack');
      } else if (this.combat?.speedSurgeEvade(p, this.force)) {
        c.attack = c.alt = false;
      }
    }
    if (this.playerWeapon === 'bryar') { c.attack = false; c.alt = false; } // the mouse buttons fire the pistol instead (updatePistol)
    if ((p.status === 'normal' || p.status === 'roll') && !p.swingLocked()) p.targetYaw = this.cam.yaw; // a committed strike keeps its facing until it ends
  }
  frameInput(dt) {
    const i = this.input, p = this.player, c = this.cam, h = this.hud;
    if (i.pressed('Backquote') && !this.attract && (this.saberLoadoutMenu.isOpen || i.enabled)) {
      this.saberLoadoutMenu.toggle(); return;
    }
    if (this.saberLoadoutMenu?.isOpen) { this.clearSaberMenuInput(); return; }
    const binding = (action, fallback) => i.bindings?.[action] || fallback;
    const primary = binding('attack', 'Mouse0'), secondary = binding('alt', 'Mouse2');
    if(this.bossWay?.phase==='intro') {
      // Like the main menu's live AI duel, Boss Way is an in-engine cinematic,
      // not a video. Enter, jump or attack dismisses it without attacking.
      if(i.pressed('Enter')||i.pressed(binding('jump','Space'))||i.pressed(primary)) {
        this.bossWay.skipIntro();
        this.clearTargetLock();
      }
      return;
    }
    // Mouse buttons have both a held-code latch and a physical button latch.
    // The latter must still work when an embedded canvas has delivered the
    // mouse event but its keyboard-like code has not been mirrored yet.
    const attackHeld = i.held(primary) || !!i.btn?.[0], altHeld = i.held(secondary) || !!i.btn?.[2];
    const attackPressed = i.pressed(primary) || !!i.btnPressed?.[0], altPressed = i.pressed(secondary) || !!i.btnPressed?.[2];
    if (this.bossWay && (this.bossWay.phase==='won'||this.bossWay.phase==='lost')) {
      if (i.pressed('Enter')) this.bossWay.restart();return;
    }
    const wasHelpOpen = h.help;
    if (this.tutorialMode && this.tutorialPhase === 'demo') return;
    if (i.pressed('F1')) h.help = !h.help; if (i.pressed('F3')) h.debug = !h.debug; if (i.pressed('KeyM')) { this.sfx.muted = !this.sfx.muted; h.msg(this.sfx.muted ? 'Sound off' : 'Sound on'); }
    if (h.help && (attackPressed || Object.values(i.bindings || {}).some(code => i.pressed(code))) && !i.pressedSet.has('F1')) {
      h.help = false; this.started = true;
    }
    if (!h.help) this.started = true;
    // One press toggles lock, holding the wheel does nothing extra. A click
    // closing F1 help must not unexpectedly acquire a target.
    if (!h.help && !wasHelpOpen && i.pressed(binding('lockOn', 'Mouse1')) && !this.attract && p.status !== 'dead') this.toggleTargetLock();
    if (i.dx || i.dy) { c.yaw -= i.dx * i.sens; c.pitch += i.dy * i.sens * (this.invertY ? -1 : 1); if (!h.help) { const pm = this.pendingMouse ??= [0, 0]; pm[0] += i.dx; pm[1] += i.dy; } }
    const ar = 2.2 * dt; if (i.held('ArrowLeft')) c.yaw += ar; if (i.held('ArrowRight')) c.yaw -= ar; if (i.held('ArrowUp')) c.pitch -= ar * 0.7; if (i.held('ArrowDown')) c.pitch += ar * 0.7;
    c.pitch = clamp(c.pitch, -0.5, 1.3);
    if (this.duel || this.online || this.teamMode || this.missionDef || this.boardingMode || this.bossWayMode) { // wheel / [ ] cycle Force for arena and mission modes
      if (i.wheel && !h.help) this.force.select(Math.max(-3, Math.min(3, i.wheel))); if (i.pressed('BracketRight') && !h.help) this.force.select(1); if (i.pressed('BracketLeft') && !h.help) this.force.select(-1);
      c.dist = clamp(c.dist + (i.zoom + (i.held('Equal') ? -dt * 4 : 0) + (i.held('Minus') ? dt * 4 : 0)) * 0.35, 1.9, 8.5);
    } else c.dist = clamp(c.dist + (i.wheel + i.zoom) * 0.35, 1.9, 8.5);
    if (h.help) { this.throwAt = null; return; }
    // CTF: H hands the stolen flag to the teammate selected with the normal
    // middle-mouse target lock. No auto-targeting or teammate combat attacks.
    if ((this.teamMatch?.mode === 'ctf' || this.net?.ctf) &&
        i.pressed(binding('passFlag', 'KeyH')) &&
        !this.attract && p.status !== 'dead') {
      if (this.teamMatch?.mode === 'ctf') this.teamMatch.tryPassFlag(this.lockedTarget);
      else this.net.tryPassFlag(this.lockedTarget);
    }
    // Handbook lecterns exist only inside the authored Lightsaber Training
    // annex. E shows their lesson without pausing, teleporting, changing
    // Force/saber state or consuming any of the normal attack bindings.
    if (this.world?.level?.name === 'training_garden' && !this.attract) {
      const station = [...(this.world.space?.interactables?.values?.() || [])]
        .filter(entry => entry.id?.startsWith('handbook_'))
        .find(entry => Math.hypot(p.pos[0]-entry.p[0],p.pos[2]-entry.p[2]) <= entry.r);
      if ((station?.id || null) !== (this._nearTrainingHandbook || null)) {
        this._nearTrainingHandbook = station?.id || null;
        if (station) h.msg('Press E · '+station.prompt);
      }
      if (station && i.pressed('KeyE')) {
        const lesson = TRAINING_HANDBOOK[Number(station.id.slice('handbook_'.length))];
        if (lesson) h.msg(lesson.title+' · '+lesson.text);
      }
      const lift = this.world.trainingLift;
      const aboard = lift?.supporting(p.pos);
      if (aboard !== !!this._nearSkyLift) {
        this._nearSkyLift = !!aboard;
        if (aboard) h.msg('Sky lift · Press E to '+(lift.y < 6 ? 'ascend to the overlook' : 'descend to the ridge'));
      }
      if (aboard && i.pressed('KeyE') && !station) {
        if (this.online || this.teamMode || this.net) {
          // Moving collision is not authoritative in online Game 2 yet.
          // Never run a separate elevator timeline on each PvP client.
          h.msg('Sky lift requires server-synchronized platform motion in online games');
        } else if (lift.toggle()) {
          h.msg(lift.target > lift.y ? 'Sky lift ascending' : 'Sky lift descending');
        } else h.msg('Sky lift is moving');
      }
    }
    if (this.clash && attackPressed) this.clash.click(p); // a Force clash: every click pushes harder
    if (attackPressed && !altHeld && p.critUntil > this.t) p.startCritStrike(); // the Counter: a click strikes at once (else it comes on its own, Game.step)
    if (this.director) { if (this.director.frameInput(i)) return; if (p.status === 'dead') return; }
    else if (this.duel) { if ((this.round.state === 'won' || this.round.state === 'lost') && this.round.t > 0.8 && i.pressed('Enter')) { this.resetDuel(); return; } if (p.status === 'dead') return; }
    else if (p.status === 'dead') { if (!this.teamMode && !this.boardingMode && !this.bossWayMode && (i.pressed('Enter') || this.t - p.deadAt > 12)) this.respawnPlayer(); return; } // aboard, the match server respawns you
    // Milestone 1: only local 360° Experimental combat may cycle the physical saber kit.
    // The current Classic and networked rulesets are deliberately unaffected.
    if (this.settings?.combatMode === 'directional360' && !this.online && !this.teamMode &&
        !this.boardingMode && !this.attract && !h.help &&
        i.pressed(binding('saberCycle', 'KeyV'))) {
      if (this.playerWeapon !== 'bryar' && maySwitchSaber(p, this.t, this.nextSaberSwitchAt || 0)) {
        const next = nextSaberKit(p.saberKit);
        p.setSaberKit(next);
        this.nextSaberSwitchAt = this.t + SABER_SWAP_COOLDOWN;
        h.msg('Saber configuration: ' + (next === 'single' ? 'Single saber' : next === 'dual' ? 'Dual sabers' : 'Double-bladed staff'));
      } else h.msg('Saber switch unavailable — finish your current action or draw your saber');
    }
    // R: from the pistol, the saber; otherwise execute the foe that is ready for it (the prompt shows), else draw / holster
    if (i.pressed('KeyR')) { if (this.playerWeapon === 'bryar') this.switchWeapon('saber'); else { const ex = this.execCandidate && findExecutable(this, p); if (ex) this.startExecution(p, ex.victim, ex.kind); else p.toggleSaber(); } }
    // Q is reserved for hold-to-evade. Weapon swapping remains available through the existing R saber draw/holster flow.
    // A holstered saber can be drawn directly with either mouse attack.
    // Draw immediately so that the initiating input is not discarded behind
    // LS_DRAW; the held primary attack can flow into the next saber strike.
    if ((attackPressed || altPressed) && p.saber.holstered && p.hasSaber &&
        p.status === 'normal' && !p.thrown && this.playerWeapon !== 'bryar') {
      p.igniteNow();
    }
    if (i.pressed('KeyT')) p.taunt();
    if (i.pressed('Tab')) { if (p.kitStyle?.()) h.msg((p.saberKit === 'dual' ? 'Dual sabers' : 'Saberstaff') + ' fight in a style of their own'); else { p.setStyle(p.saber.level % 3 + 1); h.msg('Saber style: ' + STYLE_NAMES[p.saber.level]); } }
    // Academy checks the held chord every command, not only the second button's edge. Reserve it so a finishing
    // strike can reach Ready; do not erase that strike, spend Force early, or launch a competing kick/throw.
    // A complete two-button click can occur between rendered frames. Keep
    // both fresh press latches even when their mouseup events already arrived.
    if (this.playerWeapon === 'bryar' || !(altHeld || altPressed)) this.throwAt = null;
    else if (attackHeld || attackPressed) {
      this.throwAt = null;
      const intent = { fwd: +i.held(binding('forward', 'KeyW')) - +i.held(binding('back', 'KeyS')), right: +i.held(binding('right', 'KeyD')) - +i.held(binding('left', 'KeyA')), jump: i.held(binding('jump', 'Space')) };
      if (p.startKata(intent, { quiet: !attackPressed && !altPressed })) h.msg('Saber kata');
    } else if (altPressed) this.throwAt = this.t + KATA_CHORD;
    if (this.throwAt != null && this.t >= this.throwAt) {
      this.throwAt = null;
      if (!p.saber.holstered && (p.status === 'normal' || p.status === 'roll') && !p.kata) {
        const kd = i.held(binding('forward', 'KeyW')) ? 'F' : i.held(binding('back', 'KeyS')) ? 'B' : i.held(binding('left', 'KeyA')) ? 'L' : i.held(binding('right', 'KeyD')) ? 'R' : null;
        if (!(kd && p.startKick(kd)) && p.throwSaber(this.aimDir())) h.msg('Saber throw');
      }
    }
    if (p.status === 'normal' && (i.pressed('KeyF') || FORCE_QUICK_BINDINGS.some(({ code }) => i.pressed(code)))) p.yaw = p.targetYaw = c.yaw; // snap to aim on either cast path
  }
  // respawn immunity: no damage, Force or grabs for RESPAWN_SHIELD s (a soft blue glow while it lasts)
  // a Force pool for an AI fighter that has none (team match bots: Force Push, for instance off a bridge)
  giveForce(f, fp = 100) { if (!f.force) f.force = new Force(this, f, { npc: true, fp, list: SELECT_ORDER }); return f.force; }
  shield(f, sec = RESPAWN_SHIELD) { f.spawnShield = this.t + sec; f.shieldGlow = true; f.glow = 0.35; f.glowCol = [0.55, 0.8, 1]; }
  respawnPlayer() {
    this.clearTargetLock();
    const p = this.player; this.force.releaseAll(); this.force.fp = this.force.max; p.revive(this.playerSpawn.slice()); p.experimentalStamina = createStamina(); this.shield(p); p.hilt = 'thigh'; p.thrown = null; p.speedMul = p.damageMul = p.takeMul = 1; p.glow = 0; p.saber.holstered = true; p.saber.rageMul = 1; p.blade.set(false); p.blade.len = 0; p.yaw = p.targetYaw = this.cam.yaw = this.playerSpawnYaw ?? 0; this.cam.pitch = 0.2; this.hud.msg('You rise again');
  }
  // ---------------- weapons (story mode)
  switchWeapon(to) {
    const p = this.player; to = to || (this.playerWeapon === 'saber' ? 'bryar' : 'saber'); if (to === this.playerWeapon || p.status !== 'normal' || p.thrown || (to === 'saber' && !p.hasSaber)) return; // a trooper has no lightsaber to switch to
    if (to === 'saber') { this.playerWeapon = 'saber'; p.gun = false; p.weaponPose = null; if (p.saber.holstered) p.toggleSaber(); this.hud.msg('Lightsaber'); }
    else { const wasOut = !p.saber.holstered; if (wasOut) p.toggleSaber(); this.playerWeapon = 'bryar'; p.after(wasOut ? 0.62 : 0, () => { if (this.playerWeapon === 'bryar') { p.gun = true; p.weaponPose = 'TORSO_WEAPONREADY2'; } }); this.hud.msg('Bryar pistol'); }
  }
  // Bryar pistol (bg_weapons.c / g_weapon.c): 10 damage, 40 m/s bolt, one shot per 400 ms; hold alt fire to charge
  // in 200 ms steps (1-5); a charged bolt deals 10 x count x 1.7 (x1.5 for a single step).
  updatePistol(dt) {
    const p = this.player, i = this.input, W = this.pistol; W.cool -= dt;
    if (this.playerWeapon !== 'bryar' || !p.gun || p.status !== 'normal' || this.hud.help) { W.charge = 0; return; }
    const primary = i.bindings?.attack || 'Mouse0', secondary = i.bindings?.alt || 'Mouse2';
    // Normal browser Input exposes held(code). The deterministic older combat
    // harness supplies only btn[]; both map to the same physical buttons.
    const held = typeof i.held === 'function' ? code => i.held(code) : code =>
      code === primary ? !!i.btn?.[0] : code === secondary ? !!i.btn?.[2] : false;
    if (this.launcher) { if (held(secondary)) this.launcher.fire(this.aimPoint()); } // a grenade launcher on the right button (Fleet Assault heavy trooper), no charged shot
    else if (held(secondary)) { W.charge = Math.min(1.5, W.charge + dt); return; }
    if (W.charge > 0) { const n = clamp(Math.floor(W.charge / 0.2), 1, 5); W.charge = 0; W.cool = 0; this.firePistol(n); return; }
    if ((held(primary) || this.stepPressed(primary)) && W.cool <= 0) this.firePistol(0);
  }
  firePistol(charge) {
    const p = this.player; this.pistol.cool = 0.4; p.yaw = p.targetYaw = this.cam.yaw;
    const dmg = charge > 1 ? 10 * charge * 1.7 : charge === 1 ? 15 : 10;
    p.playForce('BOTH_ATTACK2', { durMs: 300 });
    this.combat.shoot(p, this.aimPoint(), { dmg, err: 0.003, speed: 40, vol: 0.45, pitch: charge ? 0.75 : 1.15, col: charge ? [1, 0.78, 0.35] : [1, 0.32, 0.16] });
  }
  aimPoint() { // where the crosshair points: camera ray clipped by the level
    if (this.lockedTarget && this.foesOf(this.player).includes(this.lockedTarget) &&
        lockTargetIsValid(this, this.lockedTarget) && lockTargetVisible(this, this.lockedTarget)) return this.lockedTarget.chest();
    const c = this.cam, cp = Math.cos(c.pitch), d = [Math.sin(c.yaw) * cp, -Math.sin(c.pitch), Math.cos(c.yaw) * cp], far = v3.addS(c.eye, d, 80);
    const t = this.world.space ? this.world.space.raycast(c.eye, far) : null; return t === null ? far : v3.lerp(c.eye, far, Math.max(0.02, t));
  }
  // NPC torso pitch toward their opponent so attacks track a crouching or jumping target (torso aim, cg_players.c)
  aimPitchToward(n) {
    const T = this.openArena ? this.aiTarget(n) : n.team === 'enemy' ? this.player : null; if (!T || T.status === 'dead' || n.status !== 'normal') return 0;
    const d = Math.hypot(T.pos[0] - n.pos[0], T.pos[2] - n.pos[2]); if (d > 12) return 0;
    return clamp(-Math.atan2(T.chest()[1] - n.chest()[1], Math.max(d, 0.6)), -0.6, 1.2);
  }
  respawnPlayerAt(pos, yaw = 0) { // mission checkpoints: full health and Force, saber holstered
    this.clearTargetLock();
    const p = this.player; this.force.reset(); p.revive(pos.slice()); p.experimentalStamina = createStamina(); p.status = 'normal'; this.shield(p); p.hilt = 'thigh'; p.thrown = null; p.speedMul = p.damageMul = p.takeMul = 1; p.glow = 0; p.saber.holstered = true; p.saber.rageMul = 1;
    p.blade.set(false); p.blade.len = 0; this.humStop(p); p.actor.animSpeed = 1; p.yaw = p.targetYaw = yaw; this.cam.yaw = yaw; this.cam.pitch = 0.2; this.cam.pos = [pos[0], pos[1] + 1.4, pos[2]];
  }
  respawnNpc(n) {
    n.revive(n.spawn.slice()); n.experimentalStamina = n.hasSaber ? createStamina() : null; n.experimentalStaggerPending = false; n.experimentalAdaptiveResponse = null; n.experimentalAdaptiveReadyAt = 0; n.experimentalExchangeChain = null; n.experimentalExchangeRecoveryUntil = 0; n.experimentalExchangeRecoveryTarget = null; n.experimentalExchangeRecoveryKind = null; n.experimentalExchangeRiposte = null; n.experimentalDuelSight = null; n.experimentalDuelSearch = null; n.experimentalDuelLostAt = null; n.experimentalHadDuelSight = false; n.experimentalTacticalCue = null; n.experimentalTacticalReadyAt = 0; n.experimentalSwingReceipt = null; n.experimentalRecovery = null; n.experimentalRecoveryReadyAt = 0; n.experimentalInjury = null; n.experimentalInjuryReadyAt = 0; n.experimentalWeaponSetback = null; n.experimentalComboResponse = null; n.experimentalSurgeResponse = null; n.experimentalFlankRead = null; n.hilt = n.hasSaber ? 'thigh' : 'none'; n.saber.holstered = true; n.blade.len = 0; n.hitSet.clear(); n.ai = null; n.thrown = null; n.energized = 0; n.glow = 0;
    if (n.kind === 'ally') n.hp = 50; if (n.hasSaber) n.igniteNow(); this.fx.ring({ p: [n.pos[0], 0.05, n.pos[2]], n: [0, 1, 0], r0: 0.2, r1: 1.8, life: 0.8, w: 0.1, c: [0.7, 0.8, 1, 0.8] });
  }
  // ---------------- simulation
  step(dt) {
    this.t += dt; this.dtFrame = dt; const p = this.player;
    this.tutorial?.update();
    if (this.net) this.net.beforeStep(dt);
    this.updateExecutions(dt); // before the fighters: they show where the execution put them this step
    if (this.clash) this.clash.update(dt);
    this.execCandidate = this.attract || p.status !== 'normal' ? null : findExecutable(this, p);
    if (p.critAt && this.t >= p.critAt) { p.critAt = 0; p.startCritStrike(); } // the Counter: the strike comes on its own (a click strikes sooner)
    this.buildPlayerCmd();
    p.update(dt); this.force.update(dt, (this.tutorialMode && this.tutorialPhase === 'demo') || this.bossWay?.phase==='intro' ? null : this.inp); if (this.playerWeapon) this.updatePistol(dt); if (this.launcher) this.launcher.update(dt);
    this.stepNo = (this.stepNo | 0) + 1; const big = this.npcs.length > 16;
    for (const n of this.npcs) {
      if (this.bossWay && n===this.bossWay.boss) { this.bossWay.update(dt);continue; }
      if (this.bossWay && n.isDragonMinion) continue; // Driven by the dragon's server-independent fixed-step AI.
      // The 30/20 Hz optimization is only for stationary, uneventful bots.
      // Active enemies always integrate physics, attack timelines and authored
      // skeletal poses at the original 60 Hz; otherwise every skipped step
      // produces visible teleports and mismatched saber hitboxes in 25v25.
      let ndt = dt;
      if (big && !enemyNeedsContinuousMotion(n, this.t)) {
        const d2 = this.lodDist2(n), k = d2 > 400 ? 3 : d2 > 144 ? 2 : 1;
        if (k > 1) {
          if ((this.stepNo + (n.humId | 0)) % k) continue;
          ndt = dt * k;
        }
      }
      const brain = BRAINS[n.kind]; n.aimPitch = this.aimPitchToward(n);
      if (n.critAt && this.t >= n.critAt) { n.critAt = 0; n.startCritStrike(); } // an AI that parried you open strikes on its own
      if (this.aiOff || this.teamMatch?.ended) { clearCmd(n.cmd); } else if (this.teamMatch) this.teamMatch.brain(n, ndt); else if (brain) brain(this, n, ndt);
      if (this.tutorialMode) this.tutorial?.demoCmd(n, n.cmd);
      if (this.experimentalStaminaEligible(n)) {
        const guarding = n.saber.inParry(n.saber.move) || n.saber.inReflect(n.saber.move);
        const wasBroken = staminaBroken(n.experimentalStamina, this.t);
        n.experimentalStamina = stepStamina(n.experimentalStamina, { dt: ndt, now: this.t, guarding });
        const exhausted = staminaBroken(n.experimentalStamina, this.t);
        // A held guard can also exhaust its own stamina between physical
        // blade contacts. That is a real guard break, not a phantom hit;
        // use the existing knockOpen path before scheduling recovery.
        if (!wasBroken && exhausted) n.experimentalStaggerPending = true;
        // AI cannot chain infinite attacks while its posture is empty.
        if (exhausted || n.experimentalStamina.current < STAMINA_SWING_COST) n.cmd.attack = false;
        // Normal duelists retreat and recover. Do not rewrite scripted mission
        // actions, tutorial demonstrations, cinematic bosses or online puppets.
        if (!this.tutorialMode && !this.director && !this.bossWay && n.status === 'normal' && n.onGround &&
            (exhausted || n.experimentalStamina.current < STAMINA_AI_BACKOFF_THRESHOLD)) {
          n.cmd.attack = false;
          if (this.foesOf(n).length) n.cmd.fwd = -0.7;
        }
      }
      if (this.experimentalStaminaEligible(n) && !this.tutorialMode && !this.director &&
          !this.bossWay && !this.aiOff && n.experimentalSurgeResponse) {
        const read = n.experimentalSurgeResponse, attacker = read.attacker;
        if (this.t > read.until || !attacker || attacker.status === 'dead' ||
            !this.foesOf(n).includes(attacker)) {
          n.experimentalSurgeResponse = null;
        } else if (this.t >= read.noticeAt && n.status === 'normal' &&
                   n.onGround && !n.dodge && n.forceUntil <= this.t &&
                   !n.saber.isActiveSwing() && !n.experimentalFlankRead) {
          const F = this.forceOf(n);
          n.cmd.attack = false;
          n.cmd.right = read.side;
          n.cmd.fwd = -0.35;
          // Skilled AI only responds after a believable delay, pays the
          // normal Force Dodge cost, and still needs a clear physical path.
          if (F && F.fp >= F.max * 0.15 && !F.holding && !F.dash &&
              (n.dodgeReadyAt || 0) <= this.t && n.experimentalStamina.current >= 25 &&
              this.combat.evadeHeld(attacker, n, F, F.max * 0.15)) {
            n.experimentalSurgeResponse = null;
            if (attacker.isPlayer) this.hud.msg('Opponent read your Speed strike');
          }
        }
      }
      if (this.experimentalStaminaEligible(n) && !this.tutorialMode && !this.director &&
          !this.bossWay && !this.aiOff && n.experimentalComboResponse) {
        const response = n.experimentalComboResponse, foe = response.attacker;
        if (this.t > response.until || !foe || foe.status === 'dead' || n.status === 'dead') {
          n.experimentalComboResponse = null;
        } else if (n.status === 'normal' && n.onGround && !n.dodge && n.forceUntil <= this.t &&
                   !n.saber.isActiveSwing() && this.foesOf(n).includes(foe)) {
          // Keep facing the aggressor, step off their attack line and—when
          // there is Force and a safe route—answer with an authored Force Dodge.
          n.cmd.attack = false; n.cmd.right = response.side; n.cmd.fwd = -0.45;
          const F = this.forceOf(n), d = Math.hypot(n.pos[0] - foe.pos[0], n.pos[2] - foe.pos[2]);
          if (response.forceEvade && F && F.fp >= F.max * 0.15 &&
              (n.dodgeReadyAt || 0) <= this.t && d < 4.5 &&
              n.experimentalStamina.current >= STAMINA_BLOCK_COST &&
              this.combat.evadeHeld(foe, n, F, F.max * 0.15)) {
            n.experimentalComboResponse = null; // only one Force response per contact
            if (n === this.lockedTarget) this.hud.msg('Opponent counter-dodged');
          }
        }
      }
      // The AI cannot instantly turn to track a player who blinked behind it.
      // After a skill-scaled awareness delay it turns with ordinary locomotion
      // animation, not a teleport/snap or unlimited automatic rear block.
      if (this.experimentalStaminaEligible(n) && !this.tutorialMode && !this.director &&
          !this.bossWay && !this.aiOff && n.experimentalFlankRead) {
        const read = flankReadCommand(n, this.t);
        if (!read || !this.foesOf(n).includes(n.experimentalFlankRead.attacker)) {
          n.experimentalFlankRead = null;
        } else if (read.phase === 'unaware') {
          n.cmd.attack = false; n.cmd.right = 0; n.cmd.fwd = 0;
          n.targetYaw = n.yaw;
        } else if (read.phase === 'turn') {
          const foe = n.experimentalFlankRead.attacker;
          n.cmd.attack = false; n.cmd.right = read.side * 0.55;
          n.cmd.walk = true;
          n.targetYaw = Math.atan2(foe.pos[0] - n.pos[0], foe.pos[2] - n.pos[2]);
        }
      }
      if (this.experimentalStaminaEligible(n) && !this.tutorialMode && !this.director &&
          !this.bossWay && !this.aiOff && n.experimentalAdaptiveResponse) {
        const decision = tickAdaptiveExchange(this, n, this.t);
        // Short feedback only when a decision actually resolves; the AI
        // still has to earn a hit and move with normal authored controls.
        if (decision && decision !== 'retreat' && n === this.lockedTarget)
          this.hud?.msg?.(decision === 'force-step' ? 'Opponent counter-dodged' : 'Opponent counterattacks');
        if (decision === 'attack')
          startAIExchange(this, n, n.aiFoe?.isPlayer ? n.aiFoe : this.player);
      }
      if (this.experimentalStaminaEligible(n) && !this.tutorialMode && !this.director &&
          !this.bossWay && !this.aiOff && n.experimentalExchangeChain) {
        const answer = tickExchangeDefense(this, n);
        if (answer && n === this.lockedTarget)
          this.hud?.msg?.(answer === 'force-evade' ? 'Opponent escaped your reply' : 'Opponent covered your reply');
      }
      if (this.experimentalStaminaEligible(n) && n.experimentalExchangeRecoveryUntil > this.t) {
        const result = tickExchangeRecovery(this, n);
        if (result === 'riposte' && n === this.lockedTarget)
          this.hud?.msg?.('Opponent replies after a real saber block');
      }
      // After the normal AI and earned defense choices, ensure a saber duelist
      // neither tracks an unseen player perfectly nor piles into the same
      // attack lane as a nearby ally. Fighter.update still owns all motion.
      if (this.experimentalStaminaEligible(n) && !this.tutorialMode &&
          !this.director && !this.bossWay && !this.aiOff) {
        const coordination = runExperimentalDuelCoordination(this, n);
        tickTacticalDuel(this, n, coordination);
        tickCombatRecovery(this, n, coordination); // final vulnerable defensive intent
        applyInjuredFootwork(this, n); // no sprint if a real leg wound remains
        tickWoundedDefense(this, n, coordination); // temporary real-hit weapon guard
      }
      const previousStatus = n.status;
      n.update(ndt);
      if (this.experimentalStaminaEligible(n) && !this.tutorialMode &&
          !this.director && !this.bossWay && !this.aiOff)
        noteGetupRecovery(this, n, previousStatus);
      if (n.experimentalStaggerPending) {
        n.experimentalStaggerPending = false;
        if (this.experimentalStaminaEligible(n) && !this.tutorialMode && !this.director && !this.bossWay &&
            n.status === 'normal' && n.knockOpen(0.55))
          noteGuardBreakRecovery(this, n);
      }
      if (n.force) n.force.update(ndt); if (n.healFlash > 0) n.healFlash = Math.max(0, n.healFlash - ndt);
      if (n.status === 'dead' && this.t - n.deadAt > 8 && this.mode === 'explorer') this.respawnNpc(n);
      if (n.status === 'dead' && this.attract && this.t - n.deadAt > 3) { this.respawnNpc(n); n.hp = n.maxHp; if (n.force) n.force.reset(); this.shield(n); }
    }
    if (this.duel) this.updateRound(dt);
    for (const f of this.fighters()) if (f.status === 'levitated' && Math.random() < 0.6) this.fx.emit({ p: [f.pos[0] + rnd(-0.4, 0.4), f.pos[1] + rnd(0, 1.7), f.pos[2] + rnd(-0.4, 0.4)], v: [0, rnd(0.4, 1.3), 0], life: 0.7, size: rnd(0.03, 0.06), c0: [0.6, 0.85, 1, 0.8], c1: [0.4, 0.6, 1, 0] });
    if (!this.teamMatch?.ended) this.combat.step(dt);
    // Classify misses only AFTER true blade collision and parry resolution.
    if (!this.tutorialMode && !this.director && !this.bossWay && !this.aiOff)
      for (const n of this.npcs) if (this.experimentalStaminaEligible(n)) settleSwingReceipt(this, n);
    this.world.update(dt);
    // Visual-only dust/breath must not alter authoritative movement.
    (this.contactAtmosphere ??= new ContactAtmosphere()).update(this, dt);
    if (this.trainingMicrophysics) {
      const actors = [this.player, ...this.npcs, ...(this.remotes || [])];
      this.trainingMicrophysics.update(this.fx, actors, dt, {
        quality: this.settings?.quality || 'medium',
        temperatureC: this.settings?.temperatureC ?? 18,
        timeOfDay: this.settings?.timeOfDay || 'sunset',
        viewer: this.player.pos,
      });
    }
    this.fx.update(dt);
    if (this.teamMatch) this.teamMatch.update(dt);
    if (this.director) this.director.update(dt); this.firstSub = false; if (this.stepPresses) this.stepPresses.clear(); if (this.stepReleases) this.stepReleases.clear();
    for (const f of this.fighters()) if (!f.remote && f.spawnShield && f.spawnShield <= this.t) { f.spawnShield = 0; if (f.shieldGlow) { f.glow = 0; f.shieldGlow = false; } }
    for (const f of this.flashes) f.t -= dt; this.flashes = this.flashes.filter(f => f.t > 0); if (this.cracks) { for (const c of this.cracks) c.t += dt; this.cracks = this.cracks.filter(c => c.t < CRACK_LIFE); } if (this.scorches) { for (const m of this.scorches) m.t += dt; this.scorches = this.scorches.filter(m => m.t < 8); } this.lightFlash = Math.max(0, this.lightFlash - dt * 3);
    if (p.healFlash > 0 && this.force.holding !== 'heal') p.healFlash = Math.max(0, p.healFlash - dt);
    // brazier fire
    this.fireT -= dt; if (this.fireT <= 0) { this.fireT = 0.03; for (const b of this.world.braziers) this.fx.emit({ p: [b[0] + rnd(-0.15, 0.15), b[1], b[2] + rnd(-0.15, 0.15)], v: [rnd(-0.2, 0.2), rnd(0.8, 1.6), rnd(-0.2, 0.2)], life: rnd(0.4, 0.8), size: rnd(0.08, 0.18), grow: -0.1, c0: [1, 0.55, 0.15, 0.55], c1: [0.8, 0.1, 0.02, 0] }); }
    if (this.net) this.net.afterStep(dt); // snapshot of our fighters, sent as soon as the step is done
    // saber hum volume by distance
    for (const f of this.fighters()) if (f.hum && f.hum.set) { const d = v3.dist(f.pos, this.cam.eye); f.hum.set((f.humBase || 0.1) / (1 + d * 0.25) * (this.sfx.muted ? 0 : 1)); }
  }
  update(dt) {
    dt = Math.min(dt, 0.1); this.fps += (1 / Math.max(dt, 1e-3) - this.fps) * 0.08;
    if (this.slowMo) { if (this.t < this.slowMo.until) dt *= this.slowMo.scale; else this.slowMo = null; } // the execution cut, offline
    this.frameNo++; if (!this.attract) this.frameInput(dt); this.acc += dt; let n = 0; this.firstSub = true;
    if (this.hud.help) { this.stepPresses.clear(); this.stepReleases.clear(); } else { for (const c of this.input.pressedSet) this.stepPresses.add(c); for (const c of (this.input.releasedSet || [])) this.stepReleases.add(c); }
    if (this.duel && this.hud.help) this.acc = 0; // controls panel open: the duel waits
    while (this.acc >= STEP && n++ < 6) { this.step(STEP); this.acc -= STEP; }
    if (n >= 6) this.acc = 0;
    if (this.net) this.net.updatePuppets(dt); // other players every rendered frame: a snapshot shows as soon as it arrives, not at our next 60 Hz step
    this.updateCamera(dt); this.input.endFrame(); this.updateMusic(dt); this.saberLoadoutMenu?.update();
  }
  // menu background camera: a slow orbit around the two fighters, pulled back as they part
  updateAttractCamera(dt) {
    const c = this.cam, live = (this.duelists || []).filter(f => f.status !== 'dead'), pts = live.length ? live : this.duelists || [];
    if (!pts.length) return;
    if (!this.attractCam) { this.attractCam = true; c.yaw = 0.6; c.dist = 5; const e = this.R.env; for (const k of ['ambTop', 'ambBot', 'sunCol']) e[k] = e[k].map(v => v * 1.7); } // a brighter arena for the menu
    const mid = [0, 0, 0]; for (const f of pts) for (let k = 0; k < 3; k++) mid[k] += f.pos[k] / pts.length;
    const spread = pts.length > 1 ? v3.dist(pts[0].pos, pts[1].pos) : 2;
    const calm = !!this.opts.calm; c.yaw += calm ? 0 : dt * 0.11; c.pitch = 0.16 + (calm ? 0 : 0.05 * Math.sin(this.t * 0.21)); c.dist += (clamp(3.4 + spread * 0.6, 3.8, 7) - c.dist) * Math.min(1, dt * 0.8);
    const k = 1 - Math.exp(-2.2 * dt); c.pos[0] += (mid[0] - c.pos[0]) * k; c.pos[1] += (mid[1] + 1.2 - c.pos[1]) * k; c.pos[2] += (mid[2] - c.pos[2]) * k;
    const cp = Math.cos(c.pitch), d = [Math.sin(c.yaw) * cp, -Math.sin(c.pitch), Math.cos(c.yaw) * cp];
    // keep the eye inside the arena: shorten the boom while the wall collision would move it
    let dist = c.dist; for (let i = 0; i < 8; i++) { const e = v3.addS(c.pos, d, -dist), q = e.slice(); this.world.collide(q, 0.35); if (Math.hypot(q[0] - e[0], q[2] - e[2]) < 0.01 && this.world.floorAt(e[0], e[2], e[1] + 4) !== null) break; dist *= 0.8; }
    // frame the fighters on the right of the screen (the menu and its panel sit on the left)
    const right = [-Math.cos(c.yaw), 0, Math.sin(c.yaw)], look = v3.addS(c.pos, right, -0.42 * dist);
    c.target = look; c.eye = v3.addS(look, d, -dist); c.eye[1] = Math.max(0.6, c.eye[1]); c.fov = 56 * Math.PI / 180; this.sfx.listener = c.eye;
  }
  updateBossWayIntroCamera(dt) {
    // Camera language deliberately matches Game 2's live Jedi duel attract
    // scene: a slow orbital establishing shot, moving closer to the fighter,
    // then handing off smoothly to the familiar playable chase camera.
    const B=this.bossWay,p=this.player,b=B.boss,c=this.cam;
    const t=clamp(B.elapsed/BOSS_WAY_INTRO_SECONDS,0,1);
    const angle=-2.55+t*1.53,dist=16-5*t;
    const point=[b.pos[0],b.pos[1]+3.1,b.pos[2]+.5];
    const movieEye=[b.pos[0]+Math.sin(angle)*dist,
      b.pos[1]+5.7-1.4*t,b.pos[2]+Math.cos(angle)*dist];
    const handoff=clamp((t-.69)/.31,0,1),blend=handoff*handoff*(3-2*handoff);
    const eye=[p.pos[0]+.3,p.pos[1]+2.16,p.pos[2]-3.62];
    const look=[p.pos[0]+.3,p.pos[1]+1.42,p.pos[2]];
    c.eye=v3.lerp(movieEye,eye,blend);c.target=v3.lerp(point,look,blend);
    c.pos=[p.pos[0],p.pos[1]+1.42,p.pos[2]];
    c.yaw=p.yaw;c.pitch=.2;c.dist=3.7;
    c.fov=(55+7*blend)*Math.PI/180;
    this.sfx.listener=c.eye;
  }
  updateCamera(dt) {
    if (this.attract) return this.updateAttractCamera(dt);
    if (this.tutorialMode && cameraShowcaseFrame(this, dt)) return;
    if (this.tutorialMode && cameraTutorialDemoFrame(this, dt)) return;
    if (this.bossWay?.phase==='intro') return this.updateBossWayIntroCamera(dt);
    const c = this.cam, P = this.player; const ty = 1.42 + (P.ducked ? -0.42 : 0) + (P.status === 'down' || P.status === 'getup' || P.status === 'dead' ? -0.7 : 0);
    const k = 1 - Math.exp(-16 * dt); c.pos[0] += (P.pos[0] - c.pos[0]) * k; c.pos[1] += (P.pos[1] + ty - c.pos[1]) * k; c.pos[2] += (P.pos[2] - c.pos[2]) * k;
    this.updateTargetLock(dt); // follow the selected foe while either fighter moves
    const cp = Math.cos(c.pitch), d = [Math.sin(c.yaw) * cp, -Math.sin(c.pitch), Math.cos(c.yaw) * cp]; const right = [-Math.cos(c.yaw), 0, Math.sin(c.yaw)];
    const tgt = [c.pos[0] + right[0] * 0.3, c.pos[1], c.pos[2] + right[2] * 0.3]; let eye = v3.addS(tgt, d, -c.dist);
    this.shakeAmt *= Math.exp(-5 * dt); const s = this.shakeAmt * 0.12; eye = [eye[0] + rnd(-s, s), eye[1] + rnd(-s, s), eye[2] + rnd(-s, s)];
    const rr = Math.hypot(eye[0], eye[2]); if (!this.world.map && !this.world.level && rr > 24.2) { eye[0] *= 24.2 / rr; eye[2] *= 24.2 / rr; } eye[1] = Math.max(0.25, eye[1]);
    if (this.world.level) eye = this.world.cameraClip(tgt, eye); // walls and ceilings pull the camera in
    c.eye = eye; c.target = tgt; const wantFov = ((this.baseFov ?? 62) + (this.force.active.speed ? 8 : 0) + (this.force.active.rage ? 4 : 0)) * Math.PI / 180; c.fov += (wantFov - c.fov) * Math.min(1, dt * 5);
    this.sfx.listener = eye;
  }
  // ---------------- rendering
  setLights() {
    const L = this.R.lights, P = this.player; for (const l of L) { l.r = 0; l.c = [0, 0, 0]; }
    const bl = (f, i, k) => { if (f.blade.len > 0.3) { const m = v3.lerp(f.blade.base, f.blade.tip, 0.5); L[i].p = m; L[i].r = 4.2; L[i].c = [f.blade.color[0] * k, f.blade.color[1] * k, f.blade.color[2] * k]; } };
    bl(P, 0, 0.75 * P.blade.len);
    let fl = null; if (this.lightFlash > 0.02) fl = { p: this.lightFlashPos, c: [0.35 * this.lightFlash * 2, 0.55 * this.lightFlash * 2, 1.0 * this.lightFlash * 2], r: 10 }; else if (this.flashes.length) { const f = this.flashes[this.flashes.length - 1]; const k = f.t / f.max * 2.2; fl = { p: f.p, c: [f.c[0] * k, f.c[1] * k, f.c[2] * k], r: 6 }; }
    if (fl) { L[1].p = fl.p; L[1].r = fl.r; L[1].c = fl.c; }
    let best = null, bd = 1e9; for (const n of this.fighters()) if (n !== P && n.hasSaber && n.blade.len > 0.3) { const d = v3.dist(n.pos, P.pos); if (d < bd) { bd = d; best = n; } } if (best) bl(best, 2, 0.7 * best.blade.len);
    let bb = null, bbd = 1e9; for (const b of this.world.braziers) { const d = Math.hypot(b[0] - P.pos[0], b[2] - P.pos[2]); if (d < bbd) { bbd = d; bb = b; } }
    if (bb) { L[3].p = [bb[0], bb[1] + 0.4, bb[2]]; L[3].r = 14; const fk = 0.85 + 0.15 * Math.sin(this.t * 17) * Math.sin(this.t * 7.3); L[3].c = [1.5 * fk, 0.75 * fk, 0.28 * fk]; }
    else if (this.world.lamps.length) { // authored levels: the nearest lamp lights the scene around the player
      let lp = null, ld = 1e9; for (const l of this.world.lamps) { const d = v3.dist(l, P.pos); if (d < ld) { ld = d; lp = l; } }
      if (ld < 22) { L[3].p = lp; L[3].r = 12; L[3].c = [1.1, 0.72, 0.4]; }
    }
  }
  drawFighter(f) {
    if(f.isRancorBoss){this.bossWay?.drawWorld();return;}
    if(f.isDragonMinion)return; // 3D skinned minions render on the dedicated companion layer.
    const R = this.R, a = f.actor; let tint = a.tint, amt = a.tintAmt, glow = 0;
    if (f.glow > 0) { tint = f.glowCol; amt = 0; glow = f.glow; }
    if (f.healFlash > 0) { tint = [0.3, 1, 0.5]; amt = Math.min(0.45, f.healFlash * 0.4); }
    if (f.dmgFlash > 0) { tint = [1, 0.2, 0.15]; amt = Math.max(amt, f.dmgFlash * 0.55); }
    if (f.flash > 0 && f.status === 'shocked') { tint = [0.6, 0.8, 1]; amt = 0.5; }
    if (f.elecUntil > this.t && Math.sin(this.t * 55 + (f.humId || 0)) > 0) { tint = [0.6, 0.8, 1]; amt = 0.42; }
    if (f.vaporized) { const k = (this.t - f.vaporized) / 0.35; if (k >= 1) return; tint = [1, 0.8, 0.5]; amt = 0.85; glow = 0.8; f.alpha = 1 - k; } // Force Pulse: burns away
    if (this.execCandidate && this.execCandidate.victim === f) { tint = [1, 0.12, 0.08]; amt = Math.max(amt, 0.25 + 0.15 * Math.sin(this.t * 8)); glow = Math.max(glow, 0.12); } // ready to be executed
    const far = !f.isPlayer && v3.dist(this.cam.eye, f.pos) > 9, mesh = far ? this.lodMesh : this.bodyMesh;
    if (f.cut) { // cut in half: two halves, each drawn on its side of the cut and moved on its own
      const T = cutTransforms(f, this.t);
      R.drawSkinned(mesh, a, { tint, tintAmt: amt, glow, alpha: f.alpha, clip: T.lowerClip, post: T.lower });
      R.drawSkinned(mesh, a, { tint, tintAmt: amt, glow, alpha: f.alpha, clip: T.upperClip, post: T.upper });
      if (this.t - f.cut.t < 1.5) for (const M of [T.lower, T.upper]) { const p = m4.transformPoint(M, [f.pos[0], f.cut.y, f.pos[2]]); R.billboard(p, 0.28, [1, 0.45, 0.15, 0.55 * (1 - (this.t - f.cut.t) / 1.5)], 0); }
    } else if(!(f.isPlayer && f.externalAvatarVisible)) {
      // A validated, hosted GLB can supply this player's skinned visual.
      // Only hide the old body AFTER the new model has loaded and passed its
      // hash/skin checks. The same Fighter, collisions, saber, HP and Force
      // powers continue to execute; spectator/remote models are unchanged.
      // Preserve character colors and details. Stencil-masked skinned
      // outlines draw a narrow team-colored edge OUTSIDE each body only.
      const useTeamEdge = this.teamMatch && !this.teamMatch.config.ffa &&
        (f.team === 'blue' || f.team === 'red') && f.status !== 'dead';
      if (useTeamEdge)
        R.drawTeamOutlined(mesh, a, { tint, tintAmt: amt, glow, alpha: f.alpha },
          f.team === 'blue' ? [0.12, 0.67, 0.95] : [0.95, 0.16, 0.13]);
      else R.drawSkinned(mesh, a, { tint, tintAmt: amt, glow, alpha: f.alpha });
    }
    if (f.hasSaber && f.hilt !== 'none' && !f.cut) { R.drawMesh(this.hiltMesh, f.hiltMat, { spec: 0.7 }); if (f.hilt2Mat) R.drawMesh(this.hiltMesh, f.hilt2Mat, { spec: 0.7 }); }
    if (f.gun && (!f.hasSaber || f.saber.holstered)) { const bm = a.boneMatrix(this.attach.grip.bone); const loc = m4.trs(this.attach.grip.t, this.attach.grip.q, [1, 1, 1]); R.drawMesh(this.gunMesh, m4.mul(bm, loc), { spec: 0.6 }); }
    const sh = f.status === 'dead' || f.status === 'down' ? 0.8 : 0.55;
    if (this.world.level) { const gy = this.world.floorAt(f.pos[0], f.pos[2], f.pos[1] + 0.3), h = gy === null ? 9 : f.pos[1] - gy; if (h < 3) this.fx.disc([f.pos[0], gy + 0.03, f.pos[2]], sh * (1 - Math.min(0.5, h * 0.15)), [0, 0, 0, 0.42], 1); } // the floor under them (none over a chasm)
    else if (f.pos[1] < 3) this.fx.disc([f.pos[0], 0, f.pos[2]], sh * (1 - Math.min(0.5, f.pos[1] * 0.15)), [0, 0, 0, 0.42], 1);
  }
  // Force Dodge afterimages: the poses a flash step left behind, glowing and fading (additive, after the solid bodies)
  drawGhosts(f) {
    const R = this.R, gl = R.gl, mesh = !f.isPlayer && v3.dist(this.cam.eye, f.pos) > 9 ? this.lodMesh : this.bodyMesh;
    f.ghosts = f.ghosts.filter(gh => this.t - gh.t < GHOST_LIFE); if (!f.ghosts.length) return;
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE); gl.depthMask(false);
    for (const gh of f.ghosts) R.drawSkinned(mesh, gh, { tint: [0.5, 0.75, 1], tintAmt: 0.85, glow: 0.4, alpha: 0.42 * (1 - (this.t - gh.t) / GHOST_LIFE) });
    gl.depthMask(true); gl.disable(gl.BLEND);
  }
  render() {
    const R = this.R, c = this.cam; R.resize(); R.time = this.t;
    if (this.trainingMicrophysics) {
      applyTrainingLighting(R, this.settings?.timeOfDay || 'sunset');
      const speed=Math.hypot(this.player.vel?.[0] || 0,this.player.vel?.[2] || 0);
      R.trainingGrassActor=[this.player.pos[0],0,this.player.pos[2],
        this.player.onGround ? Math.min(1,speed/3.5) : 0];
    } else R.trainingGrassActor=null;
    this.setLights(); R.setCamera(c.eye, c.target, c.fov); R.begin();
    this.world.draw();
    const all = this.attract ? this.npcs : this.fighters(); for (const f of all) this.drawFighter(f);
    for (const f of all) if (f.ghosts && f.ghosts.length) this.drawGhosts(f);
    this.combat.drawRemote(R);
    for (const b of this.world.braziers) R.billboard([b[0], b[1] + 0.35, b[2]], 0.9 + 0.1 * Math.sin(this.t * 13 + b[0]), [1, 0.5, 0.15, 0.22], 0);
    if (this.scorches) for (const m of this.scorches) { const a = Math.min(1, (8 - m.t) / 2); this.fx.disc(m.p, m.r, [0.04, 0.03, 0.03, 0.55 * a], 1); if (m.t < 0.6) this.fx.disc(m.p, m.r * 0.7, [m.c[0], m.c[1], m.c[2], 0.9 * (1 - m.t / 0.6)], 0); }
    this.drawCracks(R); this.fx.draw();
    if (this.teamMatch) this.teamMatch.drawWorld(R);
    for (const f of all) { const fl = 1 + 0.05 * Math.sin(this.t * 41 + (f.humId || 0) * 2); f.blade.draw(R, fl); if (f.blade2) f.blade2.draw(R, fl); }
    for (const ex of this.executions || []) ex.draw(R);
    if (this.clash) this.clash.draw(R);
    this.force.draw(R); for (const n of this.npcs) if (n.force) n.force.draw(R); if (this.remotes) for (const n of this.remotes) if (n.force) n.force.draw(R); this.drawArcs(R); this.combat.drawBolts(R); if (this.director) this.director.draw(R); if (this.net?.draw) this.net.draw(R); if (this.launcher) this.launcher.draw(R);
    R.flushFx();
    if (this.attract) { this.hud.resize(); this.hud.x.setTransform(1, 0, 0, 1, 0, 0); this.hud.x.clearRect(0, 0, this.hud.c.width, this.hud.c.height); return; }
    this.hud.draw(this, this.dtFrame);
    if (this.teamMatch) this.teamMatch.drawHUD(this.hud.x, this.hud.W, this.hud.H);
    if (this.bossWay) this.bossWay.drawHUD(this.hud.x,this.hud.W,this.hud.H);
    if (this.clash) this.clash.drawHUD(this.hud.x, this.hud.W, this.hud.H);
  }
  frame(nowMs) { const now = nowMs / 1000; const dt = this.last ? now - this.last : STEP; this.last = now; this.update(dt); this.render(); }
}
