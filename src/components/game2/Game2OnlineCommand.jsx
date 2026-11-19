import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronRight, CircleX, Clock3, Play, Plus, RefreshCw, Search, Server, Shield, Swords, Users, X } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { GAME2_SKIRMISH_MAPS } from './engine/arenaMaps.js';
import { LocalSignaling, makePeerId, pickArena, MAX_PLAYERS } from './net/signaling.js';
import { getAccessToken } from '@base44/sdk';
import { getAppParams } from '@/lib/app-params';
const appParams = getAppParams();
import { game2RailwayStatus } from './net/railway.js';
import { openGame2MatchQueue } from './net/matchQueue.js';
import { game2ActorStatus, openGame2ActorMatchQueue } from './net/base44Actor.js';
import { game2BackendPreference, selectGame2Backend } from './net/backendSelect.mjs';
import { pickGame2OccupiedPublicOpponent } from './game2QuickMatch.mjs';
import { GAME2_QUEUE_RULES, requestedGame2QueueModes, isGame2TeamMode } from '../../../server/game2/queueRules.mjs';
import { SERVER_MODES, serversFromStatus, validateServerSettings } from './net/serverRules.js';
import { mapOptionsForMode, queueMapAllowed, MODE_MAP_POOLS, ONLINE_QUEUE_MAPS } from '../../../server/game2/onlineArenaPolicy.mjs';
import { buildOnlineModeServerCatalog } from '../../../server/game2/onlineServerCatalog.mjs';
import './game2-online-command.css';

const LIVE_QUEUE_MODES = [
  { id: 'random', name: 'Random Mode', description: 'Roll one available match type.' },
  { id: 'all', name: 'Queue for All', description: 'Join whichever supported match fills first.' },
  { id: 'ffa', name: 'Free-for-all', description: 'Every player for themselves · 2 to begin' },
  { id: 'teams', name: 'Team Deathmatch', description: 'Team battle · 4 players to begin' },
  { id: 'duel', name: 'Duel', description: 'One versus one · 2 to begin' },
  { id: 'team_duel', name: 'Team Duel', description: 'Two versus two · 4 to begin' },
  { id: 'ctf', name: 'Capture the Flag', description: 'Capture 3 flags to win · 4 to begin' },
];
const initialCustom = () => ({ name: '', mapId: 'training', matchMode: 'ffa', maxPlayers: 50, botFill: 0 });

/**
 * Lives inside the existing Game 2 menu's right-hand detail column.
 *
 * Base44's authenticated Actor is the primary real-time transport. When the
 * Actor is unavailable, a working Railway queue may be considered *before*
 * admission; a match or custom room stays pinned to its admitting backend.
 * Never represent an unsupported service as working matchmaking.
 */
export default function Game2OnlineCommand({ onEnter, onPractice, offlineDesktop = false, onSwitchOnline }) {
  const local = useMemo(() => ['localhost', '127.0.0.1'].includes(window.location.hostname)
    && new URLSearchParams(window.location.search).get('g2net') === 'local', []);
  const backendPreference = useMemo(() => game2BackendPreference(), []);
  const [backend, setBackend] = useState(backendPreference);
  const actorMode = backend === 'base44';
  const resolveBackend = useCallback((queueRequired = false, customRequired = false, requiredModes = [], railwayStatusPromise = null) => selectGame2Backend({
    preference: backendPreference,
    railwayStatus: async () => {
      const next = railwayStatusPromise ? await railwayStatusPromise : await game2RailwayStatus();
      if (!next) throw new Error('Railway Game 2 status is unavailable');
      return next;
    },
    // Actors can cold-wake from hibernation. The old 2.5s probe caused
    // premature fallback to a stale Railway relay before startup completed.
    actorStatus: () => game2ActorStatus({ client: base44, timeoutMs: 8000 }),
    queueRequired,
    customRequired,
    requiredModes,
  }), [backendPreference]);
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState(null);
  const [railwayFallbackStatus, setRailwayFallbackStatus] = useState(null);
  const [statusError, setStatusError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState('servers');
  const [mapPrompt, setMapPrompt] = useState(null);
  const [queueMapChoice, setQueueMapChoice] = useState('random');
  const [queueState, setQueueState] = useState('idle');
  const [queueMode, setQueueMode] = useState('all');
  const [queueMessage, setQueueMessage] = useState('');
  const [queueStartedAt, setQueueStartedAt] = useState(0);
  const [queueElapsed, setQueueElapsed] = useState(0);
  const [selectedCustom, setSelectedCustom] = useState(null);
  const [search, setSearch] = useState('');
  const [serverSearch, setServerSearch] = useState('');
  const [serverModeFilter, setServerModeFilter] = useState('all');
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(initialCustom);
  const [formError, setFormError] = useState('');
  const queueRequestRef = useRef(0);
  const queueConnectionRef = useRef(null);

  const signaling = useMemo(() => local && user ? new LocalSignaling(makePeerId(user.id)) : null, [local, user]);
  useEffect(() => () => signaling?.close(), [signaling]);
  useEffect(() => {
    let cancelled = false;
    if (local) {
      setUser({ id: 'local-' + Math.random().toString(36).slice(2), full_name: 'Duelist' });
      return undefined;
    }
    base44.auth.me().then(found => { if (!cancelled) setUser(found); })
      .catch(() => { if (!cancelled) setUser(null); });
    return () => { cancelled = true; };
  }, [local]);

  const refresh = useCallback(async (signal) => {
    setRefreshing(true);
    try {
      // Reuse one Railway status probe for backend selection and the CTF-only
      // fallback. Base44 hosts the other four modes; Railway remains CTF's
      // authoritative relay until the Actor's flag rules are migrated.
      const railwayProbe = local ? Promise.resolve(null) : game2RailwayStatus().catch(() => null);
      const selected = local ? null : await resolveBackend(false, false, [], railwayProbe);
      const next = local ? {
        ready: true, rooms: false, max_players: MAX_PLAYERS,
        players: signaling ? (pickArena(await signaling.listRooms())?.players || 0) : 0,
      } : selected.status;
      if (!signal?.aborted) {
        if (selected) setBackend(selected.backend);
        setStatus(next);
        setRailwayFallbackStatus(null);
        setStatusError('');
        if (selected?.backend === 'base44') {
          void railwayProbe.then(fallback => {
            if (!signal?.aborted) setRailwayFallbackStatus(fallback);
          });
        }
      }
      return next;
    } catch (error) {
      if (!signal?.aborted) {
        setStatus(null);
        setRailwayFallbackStatus(null);
        setStatusError('Base44 multiplayer is not available, and no compatible fallback answered. ' + String(error?.message || error));
      }
      return null;
    } finally {
      if (!signal?.aborted) setRefreshing(false);
    }
  }, [local, signaling, resolveBackend]);

  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal);
    // Avoid needless WebSocket churn for actor status polling.
    const poll = setInterval(() => { void refresh(controller.signal); }, 15000);
    return () => { controller.abort(); clearInterval(poll); };
  }, [refresh]);
  useEffect(() => () => {
    queueRequestRef.current += 1;
    queueConnectionRef.current?.cancel();
    queueConnectionRef.current = null;
  }, []);
  useEffect(() => {
    if (!queueStartedAt || (queueState !== 'searching' && queueState !== 'joining')) return undefined;
    const update = () => setQueueElapsed(Math.floor(Math.max(0, Date.now() - queueStartedAt) / 1000));
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [queueStartedAt, queueState]);

  const allServers = useMemo(() => status ? serversFromStatus(status, GAME2_SKIRMISH_MAPS)
    .map(room => ({ ...room, backend })) : [], [status, backend]);
  const railwayCtfServers = useMemo(() => railwayFallbackStatus
    ? serversFromStatus(railwayFallbackStatus, GAME2_SKIRMISH_MAPS)
      .filter(room => room.matchMode === 'ctf')
      .map(room => ({ ...room, backend: 'railway' })) : [], [railwayFallbackStatus]);
  useEffect(() => {
    if (!creating) return undefined;
    const onEscape = event => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      event.preventDefault();
      setCreating(false);
    };
    window.addEventListener('keydown', onEscape);
    return () => window.removeEventListener('keydown', onEscape);
  }, [creating]);
  const liveModeServers = useMemo(() => buildOnlineModeServerCatalog({
    primaryServers: allServers,
    fallbackServers: railwayCtfServers,
    primaryBackend: backend,
    maxPlayers: status?.max_players || MAX_PLAYERS,
  }), [allServers, railwayCtfServers, backend, status?.max_players]);
  const visibleModeServers = useMemo(() => liveModeServers.filter(room => {
    const modeMatches = serverModeFilter === 'all' || room.matchMode === serverModeFilter;
    const query = serverSearch.trim().toLowerCase();
    const mapName = GAME2_SKIRMISH_MAPS[room.mapId]?.label || ONLINE_QUEUE_MAPS[room.mapId]?.label || room.mapId;
    return modeMatches && (!query || (room.name + ' ' + mapName + ' ' + room.matchMode).toLowerCase().includes(query));
  }), [liveModeServers, serverModeFilter, serverSearch]);
  const customs = useMemo(() => allServers.filter(room => room.custom)
    .filter(room => (room.name + ' ' + (GAME2_SKIRMISH_MAPS[room.mapId]?.label || '')).toLowerCase()
      .includes(search.trim().toLowerCase())), [allServers, search]);
  const currentCustom = customs.find(room => room.id === selectedCustom) || customs[0];
  const isAvailable = server => !server?.unavailable &&
    Number(server?.players) < Number(server?.maxPlayers) && !statusError &&
    (!(server?.matchMode === 'duel' || server?.matchMode === 'team_duel') || !!server?.duelLine) &&
    !(server?.backend === 'base44' && server?.matchMode === 'ctf');
  const signIn = () => base44.auth.redirectToLogin(window.location.href);
  const enter = (server, creatingServer = null) => {
    if (offlineDesktop) { onSwitchOnline?.(); return; }
    if (!user) { signIn(); return; }
    if (!server) return; // Callers verify the latest live server status before admission.
    let savedName;
    try { savedName = localStorage.getItem('atomxe.game2.callsign'); } catch { /* storage blocked */ }
    // Team servers enforce per-side capacity; join the available smaller team
    // instead of blindly selecting Light and being rejected from an open room.
    const teamCap = Math.min(50, Math.ceil(Number(server.maxPlayers) / 2));
    const light = Number(server.light), dark = Number(server.dark);
    const side = server.side || (isGame2TeamMode(server.matchMode) && Number.isFinite(light) && Number.isFinite(dark)
      && (light >= teamCap || dark < light) ? 'dark' : 'light');
    const selectedBackend = server.backend || backend;
    onEnter({
      name: savedName || user.full_name?.split(' ')[0] || 'Duelist',
      side, ai: 0, selfId: makePeerId(user.id), local,
      backend: selectedBackend, actorMode: selectedBackend === 'base44', actorRoomId: server.actorRoomId,
      mapId: server.mapId, serverId: creatingServer ? undefined : (server.serverId || server.id),
      serverName: server.serverName || server.name, matchMode: server.matchMode,
      maxPlayers: server.maxPlayers, createServer: creatingServer,
      matchTicket: server.matchTicket,
      queued: !!server.matchTicket || !!server.legacyMatched || !!server.actorMatched,
    });
  };
  const openMapPrompt = mode => {
    if(queueState==='searching'||queueState==='joining')return;
    setQueueMode(mode);
    setQueueMapChoice('random');
    setMapPrompt(mode);
  };
  const stopQueue = () => {
    queueRequestRef.current += 1;
    queueConnectionRef.current?.cancel();
    queueConnectionRef.current = null;
    setQueueState('idle');
    setQueueMessage('');
    setQueueStartedAt(0);
    setQueueElapsed(0);
  };
  const startQueue = async (requested = queueMode, requestedMap = null) => {
    if (offlineDesktop) { onSwitchOnline?.(); return; }
    if (!user) { signIn(); return; }
    // Cancel any previous socket or pending status check before taking a new
    // request. A late HTTP response must never launch a cancelled match.
    stopQueue();
    const request = queueRequestRef.current;
    if(requestedMap && requested!=='random' && requested!=='all' &&
      !queueMapAllowed(requested,requestedMap)){
      setQueueState('error');
      setQueueMessage('The selected map is not available for this multiplayer mode.');
      return;
    }
    setQueueMode(requested);
    setQueueStartedAt(Date.now());
    setQueueElapsed(0);
    setQueueState('searching');
    setQueueMessage('Checking the Base44 realtime matchmaking service…');
    let latest;
    let queueBackend = backend;
    try {
      // Choose a real server once, before admitting the queue. Never move
      // waiting users or their tickets between incompatible room registries.
      const requiredModes = requested === 'random' ? Object.keys(GAME2_QUEUE_RULES) : requestedGame2QueueModes(requested);
      const selected = local ? { backend: 'local', status } : await resolveBackend(true, false, requiredModes);
      latest = selected.status;
      queueBackend = selected.backend;
      if (request !== queueRequestRef.current) return;
      if (!local) { setBackend(queueBackend); setStatus(latest); setStatusError(''); }
    } catch (error) {
      if (request !== queueRequestRef.current) return;
      setQueueState('error');
      setQueueMessage('Base44 matchmaking is unavailable and no compatible backup queue answered. ' + String(error?.message || error));
      return;
    }
    const queueUsesActor = queueBackend === 'base44';
    const supported = latest?.queueSupported && latest?.matchmaking?.modes;
    const actorModes = Object.keys(supported || {}).filter(mode => supported[mode]);
    const modes = requested === 'random' && queueUsesActor
      ? (actorModes.length ? [actorModes[Math.floor(Math.random() * actorModes.length)]] : [])
      : requestedGame2QueueModes(requested).filter(mode => supported?.[mode]);
    if (!modes.length) {
      // Compatibility mode for the last working public-arena relay: only
      // launch when an actual opponent is already in an open public room.
      // Never pretend that the old relay can maintain a waiting-room queue.
      const opponent = !local ? pickGame2OccupiedPublicOpponent(
        serversFromStatus(latest, GAME2_SKIRMISH_MAPS), requested,
      ) : null;
      if (opponent) {
        setQueueState('joining');
        setQueueMessage('Opponent found in ' + opponent.name + '. Joining the public arena…');
        enter({ ...opponent, legacyMatched: true, backend: queueBackend });
        return;
      }
      setQueueState('error');
      setQueueMessage(queueUsesActor
        ? 'This mode is not supported by the Base44 realtime beta. Capture the Flag requires the server-owned flag rules.'
        : local
          ? 'Local test mode does not offer the Railway waiting-room queue. Use Offline Practice.'
          : 'The connected multiplayer relay is an older version without waiting-room matchmaking. No opponent is in a compatible public room right now. The Game 2 Railway service must be updated before it can queue and pair two waiting players.');
      return;
    }
    const token = queueUsesActor ? null : (getAccessToken() || appParams.token);
    if (!queueUsesActor && !token) {
      setQueueState('error');
      setQueueMessage('Sign in again to queue for Game 2 multiplayer.');
      return;
    }
    let savedName;
    try { savedName = localStorage.getItem('atomxe.game2.callsign'); } catch { /* storage blocked */ }
    setQueueMessage('Searching for enough players. Your map will load when the match is ready.');
    try {
      queueConnectionRef.current = (queueUsesActor ? openGame2ActorMatchQueue : openGame2MatchQueue)({
        ...(queueUsesActor ? { client: base44 } : { token }), peer: makePeerId(user.id),
        name: savedName || user.full_name?.split(' ')[0] || 'Duelist', modes,
        mapId:requested==='random'||requested==='all'?null:requestedMap,
        onWaiting: message => {
          if (request !== queueRequestRef.current) return;
          const counts = modes.map(mode => (GAME2_QUEUE_RULES[mode]?.label || mode) +
            ' ' + (message.waiting?.[mode] || 0) + '/' + GAME2_QUEUE_RULES[mode].minPlayers).join(' · ');
          setQueueMessage('Waiting for players · ' + counts + ' · Cancel any time.');
        },
        onMatch: match => {
          if (request !== queueRequestRef.current) return;
          queueConnectionRef.current = null;
          setQueueState('joining');
          setQueueMessage('Match ready! Entering ' + (GAME2_QUEUE_RULES[match.matchMode]?.label || 'the match') + '…');
          enter({ ...match, backend: queueBackend });
        },
        onError: message => {
          if (request !== queueRequestRef.current) return;
          queueConnectionRef.current = null;
          setQueueState('error');
          setQueueMessage(message);
        },
      });
    } catch (error) {
      if (request !== queueRequestRef.current) return;
      setQueueState('error');
      setQueueMessage(String(error?.message || error));
    }
  };
  const submitCustom = async event => {
    event.preventDefault();
    if (offlineDesktop) { onSwitchOnline?.(); return; }
    if (!user) { signIn(); return; }
    try {
      // Check capabilities at creation time so a stale Customs tab cannot
      // create a room on a backend which has since gone offline.
      const selected = local ? {backend:'local',status} : await resolveBackend(false, true);
      const validated = validateServerSettings(form);
      setBackend(selected.backend);
      setStatus(selected.status);
      setStatusError('');
      setFormError('');
      enter({...validated,backend:selected.backend},validated);
    } catch (error) { setFormError('Could not create a custom room on Base44 or its fallback. '+String(error?.message || error)); }
  };

  const queueActive = queueState === 'searching' || queueState === 'joining';
  const queueTime = String(Math.floor(queueElapsed / 60)).padStart(2, '0') + ':' +
    String(queueElapsed % 60).padStart(2, '0');

  return <>
  {mapPrompt && typeof document !== 'undefined' && createPortal(
    <div className="g2-map-choice-backdrop">
      <div className="g2-map-choice-dialog" role="dialog" aria-modal="true"
        aria-labelledby="g2-map-choice-title"
        onKeyDown={event => { if(event.key==='Escape'){event.preventDefault();setMapPrompt(null);} }}>
        <span className="g2-inline-online__eyebrow">ONLINE ARENA · MAP SELECTION</span>
        <h3 id="g2-map-choice-title">Choose your map</h3>
        <p>{mapPrompt === 'random' || mapPrompt === 'all'
          ? 'The game mode and its compatible map will be selected when a match is found.'
          : (GAME2_QUEUE_RULES[mapPrompt]?.label || 'Online match') +
            ' · Select a map, or let the matchmaking server choose one at random.'}</p>
        <div className="g2-map-choice-options" role="radiogroup" aria-label="Select multiplayer map">
          <button type="button" role="radio" aria-checked={queueMapChoice==='random'}
            data-game2-map-choice="random" onClick={() => setQueueMapChoice('random')}
            className={queueMapChoice==='random'?'is-selected':''}>
            <strong>Random map</strong><small>Server selects an allowed map</small>
          </button>
          {mapOptionsForMode(mapPrompt).map(map =>
            <button type="button" key={map.id} role="radio"
              aria-checked={queueMapChoice===map.id} data-game2-map-choice={map.id}
              onClick={() => setQueueMapChoice(map.id)}
              className={queueMapChoice===map.id?'is-selected':''}>
              <strong>{map.label}</strong>
              <small>{map.asset.startsWith('authored:')?'Authored 3D world':'Original arena map'}</small>
            </button>)}
        </div>
        <div className="g2-map-choice-actions">
          <button type="button" className="g2-inline-online__quiet" onClick={()=>setMapPrompt(null)}>
            <X size={15}/> Cancel
          </button>
          <button type="button" className="g2-inline-online__primary" data-game2-map-confirm
            onClick={() => {
              const mode=mapPrompt, map=queueMapChoice==='random'?null:queueMapChoice;
              setMapPrompt(null);
              void startQueue(mode,map);
            }}>
            <Play size={14} fill="currentColor"/> Join Match
          </button>
        </div>
      </div>
    </div>,
    document.body)}
  <div className="g2-inline-online" data-game2-inline-online>
    {queueActive && typeof document !== 'undefined' && createPortal(
      <aside data-game2-queue-timer role="region" aria-label="Matchmaking queue timer" className="g2-queue-timer">
        <div className="g2-queue-timer__heading">
          <span className="g2-queue-timer__pulse" aria-hidden="true"/>
          {queueState === 'joining' ? 'MATCH FOUND' : 'MATCHMAKING'}
        </div>
        <strong className="g2-queue-timer__time" aria-live="off" aria-label={'Queue time ' + queueTime}>{queueTime}</strong>
        <span className="g2-queue-timer__mode">{LIVE_QUEUE_MODES.find(m => m.id === queueMode)?.name || 'Online Match'}</span>
        <p role="status" aria-live="polite">{queueMessage}</p>
        {queueState === 'searching' && <button type="button" onClick={stopQueue}
          className="g2-queue-timer__cancel"><CircleX size={14} aria-hidden="true"/> Cancel queue</button>}
      </aside>,
      document.body
    )}
    <div className="g2-inline-online__heading">
      <span className="g2-inline-online__eyebrow">LIVE · ONLINE PLAY</span>
      <h2>Online Play</h2>
      <p>{statusError ? 'Multiplayer server status is unavailable. Refresh to try again.' :
        'Choose a public server from the list and enter its arena directly.'}</p>
    </div>
    <div className="g2-inline-online__tabs" role="tablist" aria-label="Online multiplayer">
      <button type="button" role="tab" aria-selected={tab === 'servers'} data-game2-online-tab="servers"
        onClick={() => { stopQueue(); setMapPrompt(null); setTab('servers'); setCreating(false); }}>
        <Server size={17} aria-hidden="true"/> Online Play
      </button>
      <button type="button" role="tab" aria-selected={tab === 'customs'} data-game2-online-tab="customs"
        onClick={() => { stopQueue(); setMapPrompt(null); setTab('customs'); }}>
        <Users size={17} aria-hidden="true"/> Customs
      </button>
    </div>
    <section role="tabpanel" aria-label={tab === 'queue' ? 'Queue for online match' : tab === 'servers' ? 'Active public arenas' : 'Custom matches'}
      className="g2-inline-online__detail">
      {tab === 'queue' ? <>
        <div className="g2-inline-online__section-head">
          <h3>Choose your queue</h3>
          <p>Pick one mode, go random, or queue for all. The map opens only after the required players are matched.</p>
        </div>
        {queueMessage && queueState === 'error' && <p role="alert" data-game2-queue-feedback className="g2-inline-online__alert">{queueMessage}</p>}
        <div className="g2-inline-online__modes" role="radiogroup" aria-label="Online queue modes">
          {LIVE_QUEUE_MODES.map(mode => {
            const available = mode.ready !== false && !(actorMode && mode.id === 'ctf');
            const busy = queueState === 'searching' || queueState === 'joining';
            return <div key={mode.id} className={'g2-inline-online__mode-row' +
              (queueMode === mode.id ? ' is-selected' : '') + (!available ? ' is-pending' : '')}>
              <button type="button" role="radio" aria-checked={queueMode === mode.id}
                data-game2-queue-mode={mode.id}
                disabled={busy}
                onClick={() => openMapPrompt(mode.id)} className="g2-inline-online__mode">
                {mode.ready === false ? <Clock3 size={15} aria-hidden="true"/> : <Check size={15} aria-hidden="true"/>}
                <span><strong>{mode.name}</strong><small>{actorMode && mode.id === 'ctf'
                  ? 'Base44 beta: server-side flag rules not yet migrated. Use Railway mode.' : mode.description}</small></span>
              </button>
              <button type="button" className="g2-inline-online__mode-play"
                aria-label={'Play ' + mode.name} title={'Queue for ' + mode.name}
                disabled={busy || !available}
                onClick={() => openMapPrompt(mode.id)}>
                <Play size={16} fill="currentColor" aria-hidden="true" />
              </button>
            </div>;
          })}
        </div>
        <p className="g2-inline-online__fineprint">{actorMode
          ? 'Base44 realtime beta · matchmaking and player-created FFA/Team rooms. CTF remains on the existing relay until its server-owned flag rules are ported. Your Q Force Dodge and controls are unchanged.'
          : 'Duel (1v1) and Team Duel (2v2) always use Training Grounds. Free-for-all, Team Deathmatch and Capture the Flag use a random suitable map. The waiting queue does not load a map until the server fills the match; your in-game Q Force Dodge remains unchanged.'}</p>
        <div className="g2-inline-online__actions">
          <button type="button" className="g2-inline-online__primary" data-game2-queue-start
            disabled={queueState === 'searching' || queueState === 'joining'}
            onClick={() => openMapPrompt(queueMode)}>
            <Swords size={17} aria-hidden="true"/>
            {queueMode === 'all' ? 'Queue for All' :
              'Queue for ' + (LIVE_QUEUE_MODES.find(m => m.id === queueMode)?.name || 'Selected Mode')}
            <ChevronRight size={16} aria-hidden="true"/>
          </button>
          {queueMode !== 'all' &&
            <button type="button" className="g2-inline-online__queue-all"
              data-game2-queue-all disabled={queueState === 'searching' || queueState === 'joining'}
              onClick={() => openMapPrompt('all')}>
              <Users size={16} aria-hidden="true"/> Queue for All
            </button>}
          {(queueState === 'searching' || queueState === 'joining') &&
            <button type="button" className="g2-inline-online__quiet" onClick={stopQueue}>
              <CircleX size={15} aria-hidden="true"/> Cancel queue
            </button>}
        </div>
        {queueMessage && queueState !== 'error' && <p role="status" aria-live="polite" className="g2-inline-online__status">{queueMessage}</p>}
        {status && !status.queueSupported && <p role="status" className="g2-inline-online__fineprint">{actorMode
          ? 'This mode is not supported by the Base44 Actor. A compatible backup will be checked when you press Queue.'
          : 'Railway is reachable, but its deployed server still lacks waiting-room matchmaking. Game 2 checks the Base44 Actor as a fallback; if both are missing the needed queue, no empty or fake match will launch.'}</p>}
      </> : tab === 'servers' ? <>
        <div className="g2-inline-online__section-head">
          <h3>Choose a server</h3>
          <p>Browse available servers by map or mode, then join immediately. No matchmaking queue is required.</p>
        </div>
        <div className="g2-inline-online__server-tools">
          <label className="g2-inline-online__server-search">
            <Search size={15} aria-hidden="true" />
            <input aria-label="Search public servers" placeholder="Find a server or map"
              value={serverSearch} onChange={event => setServerSearch(event.target.value)} />
          </label>
          <select aria-label="Filter public servers by mode" value={serverModeFilter}
            onChange={event => setServerModeFilter(event.target.value)}>
            <option value="all">All modes</option>
            {Object.entries(SERVER_MODES).map(([id, label]) => (
              <option key={id} value={id}>{label}</option>
            ))}
          </select>
        </div>
        <div className="g2-inline-online__server-grid" data-game2-active-servers>
          {visibleModeServers.map(room => <button key={room.backend + ':' + room.id} type="button"
            className="g2-inline-online__server-row" data-game2-active-server={room.id}
            disabled={!isAvailable(room)}
            onClick={() => enter(room)}>
            <strong>{room.name || GAME2_QUEUE_RULES[room.matchMode]?.label}</strong>
            <span>{ONLINE_QUEUE_MAPS[room.mapId]?.label || GAME2_SKIRMISH_MAPS[room.mapId]?.label || room.mapId} · {GAME2_QUEUE_RULES[room.matchMode]?.label || room.matchMode}</span>
            <small>{room.unavailable ? room.unavailableReason :
              (['duel','team_duel'].includes(room.matchMode) && !room.duelLine
                ? 'Server update required for winner-stays rotation'
                : `${room.players}/${room.maxPlayers} players · ${room.matchMode === 'team_duel'
                  ? 'Winner stays · 2v2 teams rotate in' : room.matchMode === 'duel'
                    ? 'Winner stays · next challenger rotates in' : 'Direct join'} · ${room.players >= room.maxPlayers ? 'Full' : 'Open'}`)}</small>
            <span className="g2-inline-online__server-join">{isAvailable(room) ? 'Join Server' : 'Unavailable'} <ChevronRight size={13} aria-hidden="true" /></span>
          </button>)}
          {!visibleModeServers.length && <p className="g2-inline-online__empty">No servers match these filters.</p>}
        </div>
        {actorMode && <p className="g2-inline-online__fineprint">
          Capture the Flag connects to its Railway relay while the other public modes use Base44 realtime.
        </p>}
        <button type="button" className="g2-inline-online__quiet" onClick={() => void refresh()} disabled={refreshing}>
          <RefreshCw size={15}/> Refresh server list
        </button>
      </> : creating ? <>
        <div className="g2-inline-online__section-head g2-inline-online__section-head--row">
          <div><h3>Create Custom Match</h3><p>Choose a name, rules and arena.</p></div>
          <button type="button" aria-label="Back to custom matches" onClick={() => setCreating(false)}
            className="g2-inline-online__quiet"><X size={16} /> Back</button>
        </div>
        <form className="g2-inline-online__create" onSubmit={submitCustom} data-game2-custom-create>
          <label>Match name
            <input required maxLength={48} placeholder="Name your arena" value={form.name}
              onChange={event => setForm(previous => ({...previous, name:event.target.value}))} />
          </label>
          <div className="g2-inline-online__form-pair">
            <label>Map
              <select value={form.mapId} onChange={event => setForm(previous => ({...previous, mapId:event.target.value}))}>
                {mapOptionsForMode(form.matchMode).map(map => <option key={map.id} value={map.id}>{map.label}</option>)}
              </select>
            </label>
            <label>Mode
              <select value={form.matchMode} onChange={event => setForm(previous => {
                const matchMode=event.target.value;
                return {...previous,matchMode,
                  mapId:MODE_MAP_POOLS[matchMode]?.includes(previous.mapId) ? previous.mapId : MODE_MAP_POOLS[matchMode]?.[0]||'training',
                  botFill:['duel','team_duel','ctf'].includes(matchMode)?0:previous.botFill};
              })}>
                {Object.entries(SERVER_MODES).map(([id,name])=><option key={id} value={id}>{name}</option>)}
              </select>
            </label>
            <label>Player capacity
              <select value={form.maxPlayers} onChange={event => setForm(previous => ({...previous, maxPlayers:Number(event.target.value), botFill:Math.min(previous.botFill,Number(event.target.value))}))}>
                <option value={50}>50 players</option><option value={100}>100 players</option>
              </select>
            </label>
            <label>Fill with AI
              <select value={form.botFill} disabled={['duel','team_duel','ctf'].includes(form.matchMode)}
                onChange={event => setForm(previous => ({...previous, botFill:Number(event.target.value)}))}>
                {[0,8,16,32,50,100].filter(n=>n<=form.maxPlayers).map(n=>
                  <option key={n} value={n}>{n === 0 ? 'No bots' : 'Up to '+n+' fighters'}</option>)}
              </select>
            </label>
          </div>
          <p className="g2-inline-online__fineprint">Your custom room appears in the browser after you enter. Duel and Team Duel use winner-stays spectator rotation; duel and CTF modes require human players rather than bot fill.</p>
          {formError && <p role="alert" className="g2-inline-online__alert">{formError}</p>}
          <button type="submit" className="g2-inline-online__primary">
            <Plus size={16} aria-hidden="true"/> Create Custom Match <ChevronRight size={15} aria-hidden="true"/>
          </button>
        </form>
      </> : <>
        <div className="g2-inline-online__section-head g2-inline-online__section-head--row">
          <div><h3>Custom Matches</h3><p>Browse rooms created by other players.</p></div>
          <button type="button" className="g2-inline-online__primary" data-game2-custom-open
            onClick={() => offlineDesktop ? onSwitchOnline?.() : setCreating(true)}><Plus size={16} aria-hidden="true"/> Create Custom</button>
        </div>
        <label className="g2-inline-online__search"><Search size={16} aria-hidden="true"/>
          <input aria-label="Search custom matches" placeholder="Search custom matches" value={search} onChange={event=>setSearch(event.target.value)} />
        </label>
        <div className="g2-inline-online__custom-list" role="group" aria-label="Available custom matches">
          {customs.map(room =>
            <button type="button" key={room.id} aria-pressed={currentCustom?.id === room.id}
              data-game2-custom-room={room.id} onClick={() => setSelectedCustom(room.id)}>
              <span><strong>{room.name}</strong>
                <small>{GAME2_SKIRMISH_MAPS[room.mapId]?.label || room.mapId} · {SERVER_MODES[room.matchMode] || room.matchMode}</small></span>
              <span className="g2-inline-online__players">{room.players}/{room.maxPlayers}</span>
            </button>)}
          {!customs.length && <p className="g2-inline-online__empty">
            {!status ? 'Connecting to multiplayer…' : status?.serverBrowser
              ? 'No active custom rooms. Create one to begin.'
              : 'The connected server does not currently advertise custom rooms.'}
          </p>}
        </div>
        {currentCustom && <div className="g2-inline-online__actions">
          <button type="button" className="g2-inline-online__primary" onClick={() => enter(currentCustom)}
            disabled={!isAvailable(currentCustom)}>
            <Users size={16} aria-hidden="true"/> Join {currentCustom.name} <ChevronRight size={16} aria-hidden="true"/>
          </button>
        </div>}
        <div className="g2-inline-online__minor-actions">
          <button type="button" className="g2-inline-online__quiet" onClick={() => void refresh()} disabled={refreshing}>
            <RefreshCw size={15} aria-hidden="true"/> Refresh
          </button>
        </div>
      </>}
      {offlineDesktop && <p className="g2-inline-online__fineprint">Switch to online mode to search for matches or create Customs.</p>}
      {statusError && <p role="alert" className="g2-inline-online__alert">{statusError}</p>}
      {!user && !local && <p className="g2-inline-online__fineprint">Sign in to enter an online match. You can still browse available rooms.</p>}
      <div className="g2-inline-online__footer">
        <span><Shield size={14} aria-hidden="true"/> {statusError
          ? 'Base44 Actor and backup multiplayer unavailable'
          : status ? (actorMode ? 'Base44 realtime connected' : 'Railway relay connected')
            : 'Checking Base44 realtime multiplayer'}</span>
        <button type="button" className="g2-inline-online__quiet" onClick={onPractice}>Offline practice</button>
      </div>
    </section>
  </div></>;
}