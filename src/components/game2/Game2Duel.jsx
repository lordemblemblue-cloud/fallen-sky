import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, Loader2, Menu, Swords, Users } from 'lucide-react';
import { getAccessToken } from '@base44/sdk';
import { getAppParams } from '@/lib/app-params';
const appParams = getAppParams();
import { game2RailwayUrl } from './net/railway.js';

import Game2Lobby from './Game2Lobby';
import Game2Loadout, { readLoadout } from './Game2Loadout';
import {game2DeploymentCamera} from './deploymentPreviewCamera.mjs';
import { GAME2_SKIRMISH_MAPS } from './engine/arenaMaps.js';
import Game2Menu from './Game2Menu';
import Game2PauseMenu from './Game2PauseMenu';
import Game2FleetAssault from './fleetAssault/Game2FleetAssault';
import Game2TutorialOverlay from './Game2TutorialOverlay';
import Game2SkillTree from './skillTree/Game2SkillTree';
import useSkillTreeMenu from './skillTree/useSkillTreeMenu';
import { Game2TutorialDirector } from './engine/tutorial.js';
import { Game2FrameSupervisor } from './engine/frameSupervisor.js';
import { GAME2_AUTHORED_MAPS } from './engine/arenaMaps.js';
import { usesTrainingGarden } from './engine/levels/trainingGarden.js';
import { loadSettings, QUALITY_DPR } from './settings.js';
import { base44 } from '@/api/base44Client';
import {game2Character,readGame2Character,selectGame2Character} from './characters/game2Characters.js';
import {captureGame2ExplorerPortrait} from './characters/captureGame2ExplorerPortrait.js';

// Game 2 starts on the main menu (Game2Menu.jsx: Story Mode, Multiplayer, Skirmish, Duel Practice, Settings, Controls)
// over a live AI duel. Multiplayer goes through the online lobby (Game2Lobby.jsx); everything else starts here.
// The engine (src/components/game2/engine) is a small WebGL2 renderer + Ghoul2 style skeleton player with the original
// Jedi Outcast animations; the Force rules (push / pull / grip / absorb / lightning) come from Raven's w_force.c,
// see engine/forcerules.js. Both modes run the same combat code; missions add a level, objectives and enemy AI on top.
const BASE = import.meta.env?.BASE_URL ?? '/';
const ASSET_BASE = `${BASE}game2/`;

const MODES = {
  boss_way_preview: {
    tag:'Boss Way · Rancor',title:'Fight the Rancor',loading:'Preparing the Rancor encounter',icon:Swords,
    blurb:'Battle the Rancor with claw sweeps, slams, grabs and roars. Uses a clearly labeled temporary creature mesh if the authentic Rancor model is absent.',
  },
  boss_way: {
    tag:'Boss Way · solo event',title:'The Infernal Dragon',loading:'Preparing the Dragon Arena',icon:Swords,
    blurb:'Battle the 50,000 HP dragon: wing sweeps, smooth shader fire, aerial skyfall, a lethal grabbing claw and fire-breathing offspring.',
  },
  archive: {
    tag: 'Mission Archive', title: 'Jedi Missions', loading: 'Preparing mission', icon: Swords,
    blurb: 'Explore your selected mission. Return to the Jedi Duels menu when finished.',
  },
  tutorial: {
    tag: 'Tutorial', title: 'Guided Arena Academy', loading: 'Training arena', icon: Swords,
    blurb: 'Watch an AI instructor demonstrate real moves, follow the directions, and practice against an idle target.',
  },
  single: {
    tag: 'Single player', title: 'Mission 1 · Kejim Post', loading: 'Kejim Post', icon: Swords,
    blurb: 'Land in the canyon with Jan Ors, breach an Imperial outpost, pull its flight logs while the garrison counter-attacks, and face what waits in the hangar.',
  },
  online: {
    tag: 'Multiplayer', title: 'Public servers', loading: 'Entering the arena', icon: Users,
    blurb: 'Join a public or community server, then choose your character and saber before deploying.',
  },
  ffa: {
    tag: 'Skirmish', title: 'Free-for-all · 50 fighters', loading: 'Free-for-all', icon: Swords,
    blurb: 'You and 49 AI fighters, every one for themselves. First to 15 defeats.',
  },
  tdm: {
    tag: 'Skirmish', title: 'Team Deathmatch · 25v25', loading: 'Team Deathmatch', icon: Users,
    blurb: 'Blue: you and 24 AI teammates. Red: 25 enemy bots. First team to 50 defeats.',
  },
  ctf: {
    tag: 'AI team battle', title: 'Capture the Flag · 15v15', loading: 'Capture the Flag', icon: Users,
    blurb: 'Blue: you and 14 AI teammates. Red: 15 enemy bots. Steal their flag, bring it home and defend your own. First to three captures.',
  },
  sudden: {
    tag: 'AI elimination', title: 'Sudden Death · 25v25', loading: 'Sudden Death', icon: Swords,
    blurb: 'Blue: you and 24 AI teammates. Red: 25 enemies. One life per fighter; eliminate the entire opposing team to win.',
  },
};
const PRACTICE = { tag: 'Practice', title: 'Dark Jedi Duel', loading: 'Dark Jedi duel', icon: Swords };

function fillParent(el) {
  Object.assign(el.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', display: 'block', outline: 'none' });
}

const TEAM_CHOICES = ['ctf', 'sudden', 'ffa', 'tdm']; // offline matches against AI (engine/teamMatch.js)

// Fills its nearest positioned parent (Game2.jsx gives it a relative flex-1 section).
export default function Game2Duel({initialLaunch=null,onWindowExit=null,userId=null,displayName=''}) {
  const [character,setCharacter] = useState(() => initialLaunch?.character||null);
  const [avatarId,setAvatarId]=useState(()=>game2Character(
    initialLaunch?.avatarId||readGame2Character(undefined,userId).id).id);
  const [choice, setChoice] = useState(initialLaunch?.choice||null); // 'single' | 'archive' | 'boss_way' | 'online' | 'multi' | 'ffa' | 'tdm' | 'ctf' | 'sudden'
  const [mapId, setMapId] = useState(initialLaunch?.mapId||'skybridge');
  const [saber, setSaber] = useState(initialLaunch?.saber||'single'); // 'single' | 'dual' | 'staff'
  const [online, setOnline] = useState(null); // lobby result: { name, side, selfId, local }
  const [hostOnOpen,setHostOnOpen] = useState(false);
  const [inlineOnline,setInlineOnline] = useState(false);
  const fromMenu = (r) => {
    const selected=game2Character(r.avatarId);
    setAvatarId(selected.id);
    setCharacter(current=>({
      ...(current||{}),
      id:current?.id||'game2-'+selected.id,
      name:'Jedi',
      gender:selected.gender||'male',
      model:selected.url||'Explorer_G2_Game.glb',
      avatarId:selected.id,
    }));
    setMapId(r.mapId || 'training');
    setSaber(r.saber || 'single');
    setHostOnOpen(!!r.hostOnOpen);
    // The menu can now initiate a real Railway room directly from its inline
    // right-hand command panel; the legacy full-screen lobby remains a fallback.
    if (r.choice === 'online' && r.onlineSession) {
      setOnline(r.onlineSession);
      setInlineOnline(true);
    } else {
      setInlineOnline(false);
      setOnline(null);
    }
    setChoice(r.choice);
  };
  if (!choice) return <Game2Menu userId={userId} onStart={fromMenu} />;
  if (choice === 'fleet_assault') return <Game2FleetAssault selectedPilot={game2Character(avatarId)} onExit={() => setChoice(null)} />;
  if (choice === 'online' && !online) return <Game2Lobby initialHost={hostOnOpen} onBack={() => setChoice(null)} onStart={setOnline} onPractice={() => setChoice('multi')} />;
  const exit = () => {
    if(initialLaunch?.choice==='archive' && onWindowExit) return onWindowExit();
    if (choice === 'online' && inlineOnline) {
      setOnline(null); setInlineOnline(false); setChoice(null);
    } else if (choice === 'online') setOnline(null);
    else setChoice(null);
  }; // Inline quick match/customs returns to Jedi Duels; legacy lobby stays intact.
  return <Game2Session key={choice + mapId + saber + avatarId + (online ? online.selfId : '')}
    choice={choice} online={online} mapId={mapId} saber={saber}
    character={character} avatarId={avatarId} displayName={displayName} userId={userId} onExit={exit} />;
}

function Game2Session({ choice, online, mapId, saber, character, avatarId, displayName, userId, onExit }) {
  const [avatarWarning,setAvatarWarning]=useState('');
  const hostRef = useRef(null);
  const forceOrbRef=useRef(null),specialOrbRef=useRef(null);
  const previewRef = useRef(null), deployRef = useRef(null), avatarChangeRef=useRef(null);
  const [deployAvatar,setDeployAvatar]=useState(()=>game2Character(avatarId));
  const [explorerPortrait,setExplorerPortrait]=useState(null);
  const changeDeployAvatar=useCallback(id=>{
    const selected=selectGame2Character(id,undefined,userId);
    setDeployAvatar(selected);
    // Swap only the visual GLB layer; retain the current Game 2 world,
    // real player/Fighter/Force state, network connection and HUD.
    avatarChangeRef.current?.(selected);
  },[userId]);
  // The guided Arena Academy owns an instructor controller for this session.
  // Keep it in a ref so the overlay, effect and cleanup share the same instance.
  const directorRef = useRef(null);
  const previewLoadout = useCallback(value => previewRef.current?.(value), []);
  const deploy = useCallback(value => deployRef.current?.(value), []);
  const mode = MODES[choice] || PRACTICE;
  const [status, setStatus] = useState({ phase: 'loading', text: `Loading ${mode.loading}` });
  const [humanCount, setHumanCount] = useState(null);
  const [hasRancorModel,setHasRancorModel]=useState(false);
  const gameRef = useRef(null), canvasRef = useRef(null), pauseRef = useRef(false);
  const onExitRef = useRef(onExit);
  onExitRef.current = onExit;
  const [paused, setPaused] = useState(false);
  const skillTree = useSkillTreeMenu({ gameRef, ready: status.phase === 'ready', blocked: paused });
  const [infinitePractice, setInfinitePractice] = useState(false);
  const [sessionSettings, setSessionSettings] = useState(loadSettings);
  // Tap targets inject the SAME F/X key presses handled by Game/Force;
  // they never manipulate meters or bypass an ability's normal costs.
  const orbPress=(code,event)=>{
    event?.preventDefault?.();event?.stopPropagation?.();
    const game=gameRef.current;
    if(!game || game.disposed || !game.input.enabled || game.hud.help ||
      pauseRef.current || skillTree.openRef.current || status.phase!=='ready')return;
    game.input.pressedSet.add(code);
    game.input.down.add(code);
    game.input.gesture();
  };
  const orbRelease=(code,event)=>{
    event?.stopPropagation?.();
    const input=gameRef.current?.input;
    if(!input)return;
    input.down.delete(code);
    input.releasedSet.add(code);
  };
  const orbKeyboard=(code,event)=>{
    if(event?.detail!==0)return; // pointer already dispatched onPointerDown
    orbPress(code,event);orbRelease(code,event);
  };
  const toggleInfinitePractice = () => {
    if (choice !== 'multi' || status.phase !== 'ready') return;
    const game = gameRef.current;
    if (!game || game.disposed) return;
    setInfinitePractice(game.setInfinitePractice(!game.infinitePractice));
    // Clicking the toggle should not fire a saber attack or steal the game
    // controls. Pointer lock can be regained by clicking the 3D canvas.
    game.input.down.clear();
    game.input.pressedSet.clear();
    game.input.btn.fill(false);
    game.input.endFrame();
  };
  const togglePause = useCallback(next => {
    pauseRef.current = next;
    setPaused(next);
    const game = gameRef.current;
    if (game) {
      game.input.enabled = !next;
      game.input.down.clear();
      game.input.pressedSet.clear();
      game.input.releasedSet.clear();
      game.input.btn.fill(false);
      game.input.endFrame();
      game.last = 0; // don't simulate a large dt when resuming
    }
    try { if (next && document.pointerLockElement) document.exitPointerLock(); } catch { /* browser/editor restrictions */ }
    if (!next) canvasRef.current?.focus?.({ preventScroll: true });
  }, []);
  useEffect(() => {
    const onKeyDown = event => {
      if (event.code !== 'Escape' || event.repeat || event.defaultPrevented || status.phase !== 'ready') return;
      if (event.target?.closest?.('[data-game2-interface]') && !pauseRef.current) return;
      event.preventDefault();
      togglePause(!pauseRef.current);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [status.phase, togglePause]);
  useEffect(() => {
    const game = gameRef.current;
    if (!game) return;
    game.settings = sessionSettings;
    game.input.bindings = sessionSettings.bindings;
    game.input.sens = 0.0022 * sessionSettings.sensitivity;
    game.invertY = sessionSettings.invertY;
    game.baseFov = sessionSettings.fov;
    game.R.maxDpr = QUALITY_DPR[sessionSettings.quality];
    game.R.renderQuality = sessionSettings.quality;
    game.sfx.volume = sessionSettings.masterVolume;
    game.hud.showFps = sessionSettings.showFps;
  }, [sessionSettings]);
  const [tutorialSnapshot, setTutorialSnapshot] = useState(null);
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;
    let cancelled = false;
    let game = null;
    let renderer = null;
    let raf = 0;
    let tutorialTimer = null;
    let dragonRenderer = null;
    let selectedCharacterRenderer = null;
    // Guided tutorial starts with the instructor immediately. The generic PvP
    // loadout screen previously hid the lessons until a second Deploy click.
    let pendingDeployment = choice === 'online' || choice === 'multi' || TEAM_CHOICES.includes(choice);
    let previewElapsed = 0, previousPreviewFrame = null, previewPlayerYaw = null;
    let explorerPortraitAttempted = false;
    // fresh canvases per mount: a WebGL canvas cannot get a second context after the first one was released (StrictMode remounts)
    const canvas = document.createElement('canvas');
    const hud = document.createElement('canvas');
    fillParent(canvas);
    fillParent(hud);
    canvas.tabIndex = 0;
    canvasRef.current = canvas;
    hud.style.pointerEvents = 'none';
    const onGraphicsContextLost = event => {
      // Browsers can silently lose WebGL on memory-constrained Base44 previews,
      // especially with multiple GLB/avatar contexts and large terrain maps.
      // Without this, the last rendered frame looks like an input deadlock.
      event.preventDefault();
      if(cancelled)return;
      if(game)game._fatalFrameError=true;
      setStatus({phase:'error',text:'The browser lost the Game 2 graphics context. Return to the lobby and reopen the arena. Try a lower graphics quality if it happens again.'});
    };
    canvas.addEventListener('webglcontextlost',onGraphicsContextLost);
    host.append(canvas, hud);
    const duel = choice === 'multi' || choice === 'tutorial', teamMode = TEAM_CHOICES.includes(choice);
    const arena = choice !== 'single';
    const map = choice === 'online' ? online?.mapId || 'training' : mapId; // online: the arena picked in the lobby
    const trainingMode = choice === 'multi' ? 'duel' : choice;
    const authored = arena && (usesTrainingGarden({ mode: trainingMode, mapId: map }) || !!GAME2_AUTHORED_MAPS[map]);
    // Game 2's own original recorded battle theme. Shared by story, training,
    // duel, FFA and online matches, but only played when combat is active.
    const common = { sfxBase: `${ASSET_BASE}sfx/`, settings: loadSettings(), saber, mapId: map,
      combatMusicUrl: `${ASSET_BASE}audio/Game2_Battle_Theme.mp3`,
      quickStartCharacter: ['male','female'].includes(character?.gender) ? character : null };
    let engineOptions = choice === 'boss_way' || choice === 'boss_way_preview'
      ? { mode: 'boss_way', ...common, bossPreview:choice === 'boss_way_preview', dragonBoss:choice === 'boss_way' }
      : choice === 'archive'
      ? { mode: 'archive', ...common, playerCombatOverride:'directional360', npcCombatPolicy:'classic' }
      : teamMode
      ? { mode: choice, ...common }
      : duel
        ? { mode: choice === 'tutorial' ? 'tutorial' : 'duel', ...common }
        : { mode: 'mission', mission: 'kejim', returnToMenuOnComplete:true, ...common };

    (async () => {
      try {
        const [{ Renderer }, { loadAll }, { Game }] = await Promise.all([
          import('./engine/gl.js'),
          import('./engine/assets.js'),
          import('./engine/game.js'),
        ]);
        if (cancelled) return;
        renderer = new Renderer(canvas);
        renderer.maxDpr = QUALITY_DPR[common.settings.quality] ?? 1.35;
        renderer.renderQuality = common.settings.quality;
        const loadOptions = { map: arena && !authored, mapId: GAME2_AUTHORED_MAPS[map] ? 'training' : map };
        if (choice === 'archive') {
          loadOptions.archiveId = map;
          // Check genuine mission bytes before loading all avatar rigs and
          // animations. A missing mission reports an actionable problem in
          // its own window instead of waiting on an unrelated asset pipeline.
          setStatus({phase:'loading',text:'Checking original mission data on the game server…'});
          const {readMissionArchive}=await import('./engine/missionArchiveStorage.js');
          loadOptions.archiveBuffer=await readMissionArchive(map,ASSET_BASE,(...args)=>fetch(...args),{cloudClient:base44});
          if(cancelled)return;
        }
        if (choice === 'boss_way' || choice === 'boss_way_preview') {
          loadOptions.map=false;
          // Both are genuine playable game modes, not just a menu mockup.
          // The Rancor can load a privately supplied converted owner model,
          // or the existing disclosed combat proxy when the source is missing.
          // The Dragon uses its separate skinned GLB/Three.js renderer.
          loadOptions.bossWay=choice==='boss_way_preview';
        }
        const assets = await loadAll(ASSET_BASE, (what) => {
          if (!cancelled) setStatus({ phase: 'loading', text: `Loading ${what}` });
        }, loadOptions);
        if (cancelled) return;
        if (choice === 'boss_way_preview') setHasRancorModel(!!assets.rancorModel);
        // Resolve the approved animated FBX/GLB from Base44 Admin > 3D Models.
        // Every player streams the same hosted model: no file picker, IndexedDB,
        // or local model installation. Never substitute the Rancor proxy.
        if (choice === 'boss_way') {
          setStatus({phase:'loading',text:'Loading hosted Dragon model and animations…'});
          const { resolveHostedDragonAsset } = await import('./engine/bossWay/dragonHostedAsset.js');
          const model = await resolveHostedDragonAsset(base44, ASSET_BASE);
          if (cancelled) return;
          const { DragonBossRenderer } = await import('./engine/bossWay/dragonRenderer.js');
          dragonRenderer = new DragonBossRenderer(host);
          host.insertBefore(dragonRenderer.canvas,hud); // HUD remains above the animated dragon.
          try {
            await dragonRenderer.load(model.url, model.format);
          } catch (error) {
            dragonRenderer.dispose();
            dragonRenderer = null;
            if (!cancelled) setStatus({
              phase: 'error',
              text: 'The server-hosted Dragon model is unavailable or invalid: ' +
                (error?.message || 'asset load failed') + '. An administrator must restore the game asset.',
            });
            return;
          }
          if (cancelled) return;
        }
        if (choice === 'online') {
          if (online.local) { // isolated localhost developer test; never on editor/live
            const { LocalSignaling } = await import('./net/signaling.js');
            const signaling = new LocalSignaling(online.selfId);
            if (cancelled) { signaling.close(); return; }
            engineOptions = { mode: 'online', ...common,
              net: { ...online, signaling, iceServers: [] } };
          } else if (online.backend === 'base44' || (!online.backend && online.actorMode)) {
            engineOptions = { mode: 'online', ...common,
              net: { ...online, transport: 'base44', client: base44 } };
          } else {
            // Keep the tested Railway relay as production fallback while the
            // Base44 Actor rollout is gated.
            const token = getAccessToken() || appParams.token;
            if (!token) throw new Error('Sign in to your Atom X Eve account again before joining multiplayer.');
            engineOptions = { mode: 'online', ...common,
              net: { ...online, transport: 'railway', url: game2RailwayUrl(), token } };
          }
        }
        game = new Game(renderer, assets, canvas, hud, { ...engineOptions, deferOnlineJoin: choice === 'online' });
        gameRef.current = game;
        // The real Game 2 player and networking remain alive as the deployment
        // screen selects another uploaded character. Only its optional, verified
        // visual GLB overlay changes. Fast consecutive selections cancel stale
        // downloads so an older model cannot overwrite the newest choice.
        let avatarLoadGeneration=0;
        const loadVisualAvatar=async selected=>{
          const generation=++avatarLoadGeneration;
          setAvatarWarning('');
          selectedCharacterRenderer?.dispose();
          selectedCharacterRenderer=null;
          if(game?.player)game.player.externalAvatarVisible=false;
          if(!selected?.url)return;
          let nextRenderer=null;
          try{
            const {Game2SelectedCharacterRenderer}=await import('./characters/Game2SelectedCharacterRenderer.js');
            if(cancelled||generation!==avatarLoadGeneration||game?.disposed)return;
            nextRenderer=new Game2SelectedCharacterRenderer(host);
            host.insertBefore(nextRenderer.canvas,hud);
            await nextRenderer.load(selected);
            if(cancelled||generation!==avatarLoadGeneration||game?.disposed){
              nextRenderer.dispose();
              return;
            }
            selectedCharacterRenderer=nextRenderer;
            game.player.externalAvatarVisible=true;
          }catch(error){
            nextRenderer?.dispose();
            if(cancelled||generation!==avatarLoadGeneration)return;
            setAvatarWarning('Selected character could not load; using original Explorer model. '+(error?.message||''));
            console.warn('Selected Game 2 character unavailable; retaining playable native rig',error);
            if(game?.player)game.player.externalAvatarVisible=false;
          }
        };
        avatarChangeRef.current=loadVisualAvatar;
        // Load the character chosen in the entry menu on first launch. Later
        // carousel clicks use this same safe swap path without remounting Game.
        loadVisualAvatar(game2Character(avatarId));
        // Keep combat inactive until Enter Match, but use the live player mesh
        // and its existing idle pose for the character preview.
        previewPlayerYaw = game.player.yaw;
        previewRef.current = value => game.previewLoadout(value);
        // The first React selection effect can run before the WebGL game is
        // loaded; apply persisted defaults once the actual player exists.
        if (pendingDeployment) previewRef.current(readLoadout());
        deployRef.current = value => {
          if (!pendingDeployment || cancelled) return;
          game.previewLoadout(value);
          // Restore the playable orientation and normal chase camera before
          // joining or enabling movement. The cinematic view is preview-only.
          game.player.yaw = game.player.targetYaw = previewPlayerYaw ?? game.player.yaw;
          game.player.legsYaw = game.player.yaw;
          game.player.finish(0);
          game.updateCamera(0.1);
          if (choice === 'online') game.joinOnline({ ...engineOptions.net, ...value });
          pendingDeployment = false;
          hud.style.visibility = 'visible';
          setStatus({phase:choice === 'online'?'loading':'ready',text:choice === 'online'?'Joining server…':''});
          game.input.down.clear(); game.input.pressedSet.clear(); game.input.releasedSet.clear(); game.input.btn.fill(false); game.input.endFrame(); game.last = 0;
          canvas.focus({preventScroll:true});
        };
        for (const fighter of game.fighters()) fighter.finish(0);
        game.update(0);
        if (pendingDeployment) hud.style.visibility = 'hidden';
        if (choice === 'tutorial') {
          const tutorial = new Game2TutorialDirector(game);
          game.tutorial = tutorial;
          directorRef.current = tutorial;
          tutorial.demo(); // start a real AI lesson, not a stalled selection screen
          setTutorialSnapshot(tutorial.snapshot());
          tutorialTimer = setInterval(() => {
            if (!cancelled && !game?.disposed) setTutorialSnapshot(tutorial.snapshot());
          }, 160);
        }

        if (import.meta.env?.DEV) window.__game2 = game; // development builds only: lets local tests stage scenes
        if (choice !== 'online') setStatus({ phase: pendingDeployment ? 'loadout' : 'ready', text: '' });
        // A server-matched queue pop already had both real human participants.
        // Reuse the last saved saber and server-assigned team to deploy
        // immediately, without a second manual "Deploy" button.
        if (choice === 'online' && online?.queued) {
          const saved = readLoadout();
          deployRef.current?.({ ...saved, side: online.side || saved.side,
            name: online.name || 'Jedi' });
        }
        // Online play must not look connected until the shared arena welcomes this player.
        if (choice === 'online') {
          if (!online?.queued) setStatus({ phase: 'loadout', text: '' });
          const checkConnection = () => {
            if (cancelled || !game || pendingDeployment || game._fatalFrameError) return;
            const net = game.net;
            if (net?.ended) setStatus({ phase: 'error', text: String(net.ended) });
            else if (net?.me && net?.session?.state === 'live') {
              setHumanCount(previous => previous === net.session.roster.size ? previous : net.session.roster.size);
              setStatus(previous => previous.phase === 'ready' ? previous : { phase: 'ready', text: '' });
            }
            else setStatus({ phase: 'loading', text: net?.statusText || 'Connecting to the shared arena…' });
          };
          const connectionTimer = setInterval(checkConnection, 250);
          game._connectionTimer = connectionTimer;
        }
        canvas.focus({ preventScroll: true });
        let completionHandled=false;
        // A thrown error inside requestAnimationFrame used to abandon this
        // callback before scheduling its successor. The last 3D frame stayed
        // visible while React's online roster/pause controls still worked.
        const frameSupervisor = new Game2FrameSupervisor({
          maxCoreFailures: 2,
          onTransient: error => console.warn('Game 2 transient frame error; retrying next frame',error),
          onFatal: error => {
            console.error('Game 2 arena frame stopped',error);
            game._fatalFrameError = true;
            try { if (document.pointerLockElement === canvas) document.exitPointerLock(); } catch { /* browser sandbox */ }
            if (!cancelled) setStatus({phase:'error',
              text: 'The 3D game loop stopped: ' + (error?.message || String(error)) +
                '. The multiplayer lobby remains available; return to it to retry.'});
          },
          onOptionalFailure: (id,error) =>
            console.error('Game 2 optional '+id+' layer failed; native gameplay continues',error),
        });
        const loop = (time) => {
          if (cancelled || frameSupervisor.stopped) return;
          const running = frameSupervisor.tick(() => {
            // Authored story missions have actual completion objectives. Let
            // the result screen finish before returning to the menu.
            if(!completionHandled && game.director?.state==='complete' && game.director.endT>=5.5){
              completionHandled=true;
              onExitRef.current?.();
              return;
            }
            if (pendingDeployment) {
              // Front-facing live 3D character: offset to the left 35% of the
              // frame, with no duplicate WebGL renderer or screenshot sprite.
              // Advance only the cosmetic skeleton clock; enemy and network
              // simulation stay frozen until the player presses Enter Match.
              const seconds = time / 1000;
              const delta = previousPreviewFrame == null ? 0 : Math.min(0.05, Math.max(0, seconds - previousPreviewFrame));
              previousPreviewFrame = seconds;
              previewElapsed += delta;
              const originalTime = game.t;
              const p = game.player, c = game.cam;
              p.yaw = p.targetYaw = p.legsYaw = 0;
              game.t = previewElapsed;
              try { p.finish(0); } finally { game.t = originalTime; }
              // Frame the live fighter in the left-side transparent preview,
              // rather than behind the deployment controls on the right.
              const previewCamera=game2DeploymentCamera(p.pos,canvas.clientWidth || 1280,canvas.clientHeight || 720);
              c.eye=previewCamera.eye;
              c.target=previewCamera.target;
              c.fov=previewCamera.fov;
              if(!explorerPortraitAttempted){
                // Capture the native Explorer from the SAME active Game 2 frame,
                // preserving the newer shared deployment camera and live session.
                explorerPortraitAttempted=true;
                const originalVisibility=p.externalAvatarVisible;
                p.externalAvatarVisible=false;
                try{
                  game.render();
                  const narrow=(canvas.clientWidth||1280)<800;
                  const image=captureGame2ExplorerPortrait(canvas,{compact:narrow});
                  if(image)setExplorerPortrait(image);
                }finally{
                  p.externalAvatarVisible=originalVisibility;
                }
                if(originalVisibility)game.render();
              }else game.render();
            }
            else if ((pauseRef.current || skillTree.openRef.current) && choice !== 'online') {
              // Single-player pauses deterministically; online relay continues.
              game.last = 0;
              if (!skillTree.openRef.current) game.render();
            } else if (skillTree.openRef.current) {
              // Online simulation/transport stays live under the skill artwork.
              const now = time / 1000;
              const dt = game.last ? now - game.last : 1 / 60;
              game.last = now;
              game.update(dt);
            } else game.frame(time);
            // Missing HUD anchors must not crash an otherwise healthy frame.
            const anchors=game.hud?.resourceLayout;
            for(const [el,at] of [
              [forceOrbRef.current,anchors?.force?.button],
              [specialOrbRef.current,anchors?.special?.button],
            ])if(el && Number.isFinite(at?.x) && Number.isFinite(at?.y)){
              el.style.left=at.x+'px';el.style.top=at.y+'px';
            }
          },[
            {id:'dragon',render:dragonRenderer && !skillTree.openRef.current
              ? () => dragonRenderer.sync(game) : null,
              onFailure:() => {
                try { dragonRenderer?.dispose(); } catch(error) { console.warn('Dragon renderer cleanup',error); }
                dragonRenderer=null;
              }},
            {id:'selected-character',render:selectedCharacterRenderer && !skillTree.openRef.current
              ? () => selectedCharacterRenderer.sync(game) : null,
              onFailure:() => {
                if(game.player)game.player.externalAvatarVisible=false;
                try { selectedCharacterRenderer?.dispose(); }
                catch(error){console.warn('Avatar renderer cleanup',error);}
                selectedCharacterRenderer=null;
                if (!cancelled)setAvatarWarning('Optional character graphics stopped; using the native playable Game 2 character instead.');
              }},
          ]);
          if(running && !cancelled && !completionHandled)raf = requestAnimationFrame(loop);
        };
        raf = requestAnimationFrame(loop);
      } catch (error) {
        dragonRenderer?.dispose();
        selectedCharacterRenderer?.dispose();
        console.error('Game 2 failed to start', error);
        if (!cancelled) setStatus({ phase: 'error', text: error?.message || 'The game could not start' });
      }
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      if (tutorialTimer) clearInterval(tutorialTimer);
      directorRef.current = null; previewRef.current = null; deployRef.current = null;
      avatarChangeRef.current = null;
      gameRef.current = null; canvasRef.current = null;
      if (game?._connectionTimer) clearInterval(game._connectionTimer);
      if (game) game.dispose();
      selectedCharacterRenderer?.dispose();
      if(game?.player)game.player.externalAvatarVisible=false;
      dragonRenderer?.dispose();
      try {
        renderer?.gl?.getExtension('WEBGL_lose_context')?.loseContext();
      } catch {
        // the context is already gone
      }
      canvas.removeEventListener('webglcontextlost',onGraphicsContextLost);
      canvas.remove();
      hud.remove();
    };
  }, [choice, online, mapId, saber, avatarId, skillTree.openRef]);

  return (
    <div className="absolute inset-0 select-none overflow-hidden bg-[#05060c]" style={{ touchAction: 'none' }}>
      <div ref={hostRef} className="absolute inset-0" style={{ visibility: skillTree.open ? 'hidden' : undefined }} />
      {avatarWarning && status.phase==='ready' && (
        <div role="status" data-game2-interface data-testid="game2-character-fallback"
             className="pointer-events-none absolute bottom-24 left-1/2 z-30 max-w-lg -translate-x-1/2 rounded-lg border border-amber-300/30 bg-[#180d05]/85 px-4 py-2 text-center text-xs text-amber-100">
          {avatarWarning}
        </div>
      )}
      {/* Center orbs double as actual Force (F) and earned Repulse (X) buttons. */}
      {status.phase==='ready' && !paused && !skillTree.open && (
        <>
          <button type="button" ref={forceOrbRef} data-game2-interface
            data-testid="game2-force-orb" aria-label="Cast selected Force ability (F)"
            title="Selected Force ability · F"
            onPointerDown={e=>orbPress('KeyF',e)}
            onPointerUp={e=>orbRelease('KeyF',e)}
            onPointerCancel={e=>orbRelease('KeyF',e)}
            onPointerLeave={e=>orbRelease('KeyF',e)}
            onClick={e=>orbKeyboard('KeyF',e)}
            className="absolute z-20 flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-cyan-200/45 bg-[#061525]/60 text-[18px] text-cyan-200 shadow-[0_0_12px_rgba(45,188,255,.23)] backdrop-blur-sm transition hover:bg-cyan-500/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-200"
            style={{left:'41.5%',top:'55%'}}><span aria-hidden="true">◉</span>
          </button>
          <button type="button" ref={specialOrbRef} data-game2-interface
            data-testid="game2-special-orb" aria-label="Activate Repulse special (X)"
            title="Repulse special · X · requires 80% charge"
            onPointerDown={e=>orbPress('KeyX',e)}
            onPointerUp={e=>orbRelease('KeyX',e)}
            onPointerCancel={e=>orbRelease('KeyX',e)}
            onPointerLeave={e=>orbRelease('KeyX',e)}
            onClick={e=>orbKeyboard('KeyX',e)}
            className="absolute z-20 flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-amber-200/45 bg-[#24180b]/60 text-[18px] text-amber-200 shadow-[0_0_12px_rgba(251,170,64,.23)] backdrop-blur-sm transition hover:bg-amber-500/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-200"
            style={{left:'58.5%',top:'55%'}}><span aria-hidden="true">✧</span>
          </button>
        </>
      )}
      {skillTree.open && status.phase === 'ready' && <Game2SkillTree game={gameRef.current} onClose={skillTree.close} online={choice === 'online'} />}
      {choice === 'multi' && status.phase === 'ready' && (
        <button type="button" data-game2-interface data-testid="game2-duel-infinite-practice"
          aria-label="Toggle infinite practice for both duel fighters"
          aria-pressed={infinitePractice}
          onClick={toggleInfinitePractice}
          className={`absolute left-1/2 top-4 z-30 flex -translate-x-1/2 items-center gap-3 rounded-xl border-2 px-5 py-2.5 text-sm font-extrabold tracking-wide shadow-xl backdrop-blur-md transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-100 ${infinitePractice ? 'border-cyan-200 bg-cyan-300/25 text-cyan-50 shadow-[0_0_22px_rgba(34,211,238,0.35)]' : 'border-white/60 bg-[#080e1c]/90 text-white/90 hover:border-cyan-300 hover:bg-[#13253c]'}`}
        >
          <span aria-hidden="true" className="text-2xl font-black leading-none">∞</span>
          <span className="whitespace-nowrap">INFINITE PRACTICE</span>
          <span className={`rounded-md px-2 py-1 text-[11px] font-black ${infinitePractice ? 'bg-cyan-200 text-[#08121b]' : 'bg-white/15 text-white'}`}>{infinitePractice ? 'ON' : 'OFF'}</span>
        </button>
      )}
      <button
        type="button"
        onClick={() => choice === 'archive' ? onExit() : status.phase === 'ready' ? togglePause(!pauseRef.current) : onExit()}
        className="absolute left-3.5 top-[62px] z-20 flex items-center gap-1.5 rounded-lg border border-white/10 bg-[#080a16]/70 px-2.5 py-1.5 text-[11px] font-semibold text-white/70 backdrop-blur transition hover:bg-[#101528]/90 hover:text-white"
      >
        <Menu className="h-3.5 w-3.5" />
        {choice === 'archive' ? 'Return to Jedi Duels' : status.phase === 'ready' ? 'Pause · Esc' : (choice === 'online' ? 'Lobby' : 'Main menu')}
      </button>
      {paused && status.phase === 'ready' && (
        <Game2PauseMenu value={sessionSettings} onChange={setSessionSettings}
          onResume={() => togglePause(false)} onExit={onExit} online={choice === 'online'} />
      )}
      {status.phase === 'loadout' && <Game2Loadout name={displayName || online?.name} serverName={online?.serverName} mapName={GAME2_SKIRMISH_MAPS[online?.mapId || mapId]?.label || 'Arena'} teamMode={['teams', 'team_duel', 'ctf'].includes(online?.matchMode)} onPreview={previewLoadout} onDeploy={deploy} onBack={onExit} selectedCharacterId={deployAvatar.id} onCharacterChange={changeDeployAvatar} explorerPortrait={explorerPortrait}/>}
      {choice === 'tutorial' && status.phase === 'ready' && (
        <Game2TutorialOverlay director={directorRef.current} snapshot={tutorialSnapshot} onChange={setTutorialSnapshot} />
      )}
      {choice === 'boss_way_preview' && status.phase === 'ready' && (
        <div data-testid="game2-boss-way-rancor-status" role="status" className="pointer-events-none absolute right-3 top-[62px] z-20 max-w-[290px] rounded-lg border border-amber-300/35 bg-[#140e08]/85 px-3 py-2 text-xs font-semibold text-amber-100/90">
          {hasRancorModel
            ? 'BOSS WAY · RANCOR · Owner-supplied creature mesh · No rewards'
            : 'BOSS WAY · RANCOR · Temporary stylized creature, NOT the authentic Raven Rancor · No rewards'}
        </div>
      )}
      {choice === 'online' && status.phase === 'ready' && humanCount !== null && (
        <div role="status" aria-live="polite" className="absolute right-3 top-[62px] z-20 rounded-lg border border-white/15 bg-[#080a16]/85 px-3 py-2 text-xs font-semibold text-white/90">
          {`ONLINE · ${online?.matchMode === 'duel' ? 'Duel 1v1' :
            online?.matchMode === 'team_duel' ? 'Team Duel 2v2' :
            online?.matchMode === 'ctf' ? 'Capture the Flag' :
            online?.matchMode === 'teams' ? 'Team Deathmatch' : 'Free-for-all'} · ${humanCount}/${online?.maxPlayers || 100} human players`}
          <div className="mt-0.5 text-[10px] font-normal text-white/50">AI Reborn enemies are separate from these players.</div>
        </div>
      )}
      {status.phase === 'loading' && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-[#05060c] text-white/80">
          <Loader2 className="h-7 w-7 animate-spin text-cyan-300" />
          <div className="text-[13px] font-semibold uppercase tracking-[0.18em]">{mode.loading}</div>
          <div className="text-xs text-white/45">{status.text}</div>
        </div>
      )}
      {status.phase === 'error' && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-[#05060c] px-6 text-center text-white/80">
          <AlertTriangle className="h-7 w-7 text-amber-300" />
          <div className="text-sm font-semibold">Game 2 could not start</div>
          <div className="max-w-md text-xs text-white/50">{status.text}</div>
          <div className="max-w-md text-xs text-white/35">{choice === 'boss_way'
            ? 'The Dragon is loaded from Base44-hosted 3D Models. Players should never need to supply the asset themselves.'
            : choice === 'online'
            ? 'Multiplayer requires a Railway WebSocket connection and valid Atom X Eve login. Return to the lobby to retry.'
            : choice === 'tutorial'
            ? 'The Arena Tutorial could not initialize. The specific error above identifies the problem; return to the main menu to retry.'
            : choice === 'archive'
            ? 'This is the actual selected Jedi Academy mission window. The administrator must install the verified original BSP and its dependent game assets on the game server; players do not need to supply game files. A different map will not be substituted.'
            : 'Game 2 could not initialize. Check the error above; WebGL2 is only one possible cause.'}</div>
          <button type="button" onClick={onExit} className="mt-3 rounded-lg border border-white/30 bg-white/10 px-5 py-2 text-sm font-semibold text-white hover:bg-white/20">
            {choice === 'archive' ? 'Return to Jedi Duels' : choice === 'boss_way'||choice === 'boss_way_preview' ? 'Back to Boss Selection' : 'Back to Main Menu'}
          </button>
        </div>
      )}
    </div>
  );
}
