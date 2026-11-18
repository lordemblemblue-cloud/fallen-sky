import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { validateServerSettings, botSidesFor, SERVER_CAPACITY, TEAM_CAPACITY } from './serverRules.mjs';
import { GAME2_QUEUE_RULES, GAME2_QUEUE_MODES, isGame2TeamMode, normalizeGame2QueueModes } from './queueRules.mjs';
import { ONLINE_CTF_MAPS, createOnlineCtf, advanceOnlineCtf,
  dropOnlineCtfCarrier, passOnlineCtfFlag, publicOnlineCtf } from './ctfMatch.mjs';
import { WebSocket, WebSocketServer } from 'ws';
import { createFleetHub } from './fleet/hub.mjs';
import { PUBLIC_MODE_ROOMS, chooseQueueMap, queueMapAllowed, selectPublicModeRoom } from './onlineArenaPolicy.mjs';
import { createDuelLine, joinDuelLine, leaveDuelLine,
  defeatDuelFighter, publicDuelLine, duelRole, duelSideForArrival } from './duelLine.mjs';

// All Game 2 viewers connect to this server. Every map is its own arena (room): players only see and reach the players
// in theirs. Messages are relayed directly over WebSockets; no Base44 entity polls or WebRTC peer establishment.
// Character simulation remains client-owned; authoritative anti-cheat is future work. Fleet Assault (a join with
// mode 'fleet') is the exception: fleet/ runs those matches on the server.
export const GAME2_VERSION = 2;
// the arenas; a join that names none (clients from before rooms) goes to 'training', the original Lightsaber Training
export const ARENA_ROOMS = Object.freeze(['training', 'skybridge', 'hangar', 'carbon', 'sumi_stronghold']);
// Arena capacity; an environment setting may reduce it for a smaller deployment.
export const MAX_PLAYERS = SERVER_CAPACITY;
export const MAX_TEAM_PLAYERS = TEAM_CAPACITY;
export const MATCH_MODES = Object.freeze(['ffa', 'teams']);
const roomKey = (map, mode) => mode === 'teams' ? map + ':teams' : map;
const MAX_PACKET_BYTES = 64 * 1024;
const MAX_TOKEN_LENGTH = 8192;
const ALLOWED_KINDS = new Set(['s', 'rpc', 'fx']);
const PING_INTERVAL_MS = 15000;
const HELLO_TIMEOUT_MS = 12000;
const HOST_ELECTION_INTERVAL_MS = 30000;
const HOST_SWITCH_MARGIN_MS = 35; // avoid bouncing hosts over tiny RTT changes
const HOST_MIN_OBSERVATIONS = 3;

const cleanName = value => String(value || 'Jedi').trim().slice(0, 20) || 'Jedi';
const validPeer = (peer, userId) =>
  typeof peer === 'string' && typeof userId === 'string' &&
  peer.startsWith(userId + '~') && /^[a-z0-9]{4,16}$/.test(peer.slice(userId.length + 1));

export function createGame2ArenaServer({ authenticate, host = '0.0.0.0', port = 0, now = Date.now, maxPlayers = MAX_PLAYERS, fleet: fleetOptions = {}, rng = Math.random } = {}) {
  if (typeof authenticate !== 'function') throw new TypeError('Game 2 requires an account token verifier');
  // Fleet Assault: a join with mode 'fleet' goes to server-authoritative matches (fleet/hub.mjs), never to an arena room
  const fleet = createFleetHub({ now, ...fleetOptions });
  const clients = new Map(); // every connected player by peer id; each also belongs to one room
  const limit = Math.min(MAX_PLAYERS, Math.max(1, Math.floor(Number(maxPlayers) || MAX_PLAYERS)));
  const rooms = new Map(ARENA_ROOMS.flatMap((mapId,i)=>MATCH_MODES.map(matchMode=>{
    const id=roomKey(mapId,matchMode);
    return [id,{id,name:'Legacy public server '+(i+1),mapId,matchMode,maxPlayers:limit,
      botFill:0,clients:new Map(),hostPeer:null,aiCount:0,botSides:[],custom:false,legacy:true}];
  })));
  // Exactly one visible, always-existing public server room for each mode.
  for(const tpl of PUBLIC_MODE_ROOMS)rooms.set(tpl.id,{
    ...tpl,maxPlayers:limit,botFill:0,clients:new Map(),reservations:new Map(),
    hostPeer:null,aiCount:0,botSides:[],custom:false,publicMode:true,
    ...(tpl.mode==='ctf'?{ctf:createOnlineCtf(tpl.mapId)}:{}),
    ...(['duel','team_duel'].includes(tpl.mode)?{duelLine:createDuelLine(tpl.mode)}:{}),
  });
  const queueWaiters = new Map();
  const chooseMap=(mode,mapId=null)=>chooseQueueMap(mode,rng,mapId);
  // Hosting here means simulating the room's bots. The Railway relay still carries
  // every player's packets; no unverified peer-to-peer or upload-speed claim.
  const hostScore = c => c.rttSamples >= HOST_MIN_OBSERVATIONS &&
    Number.isFinite(c.smoothedRtt) ? c.smoothedRtt : Infinity;
  const chooseHost = (R, force = false) => {
    const peers = [...R.clients.values()];
    if (!peers.length) { R.hostPeer = null; return; }
    const current = R.clients.get(R.hostPeer);
    const candidates = peers.filter(c => Number.isFinite(hostScore(c)));
    if (!candidates.length) { if (!current) R.hostPeer = peers[0].player.id; return; }
    candidates.sort((a,b) => hostScore(a)-hostScore(b));
    const best = candidates[0];
    if (!current || (current !== best && (force || hostScore(best) + HOST_SWITCH_MARGIN_MS < hostScore(current)))) {
      R.hostPeer = best.player.id;
      rosterChanged(R);
    }
  };
  const entryList = R => [...R.clients.values()].map(c => ({ ...c.player, host: c.player.id === R.hostPeer }));
  const stats = R => {
    const roster = entryList(R);
    return {
      id: R.id, name: R.name, mapId: R.mapId, matchMode: R.matchMode, maxPlayers: R.maxPlayers, botFill: R.botFill, custom: R.custom,
      publicMode: !!R.publicMode, duelLine: R.duelLine ? publicDuelLine(R.duelLine) : null,
      players: roster.length, mode: R.matchMode, map: R.mapId, max_players: R.maxPlayers,
      max_team_players: isGame2TeamMode(R.matchMode) ? Math.min(TEAM_CAPACITY, Math.ceil(R.maxPlayers / 2)) : null,
      light: roster.filter(p => p.side === 'light').length,
      dark: roster.filter(p => p.side === 'dark').length,
      ai: R.aiCount, host_name: roster.find(p => p.host)?.name || '', teamScore: R.teamScore || { light: 0, dark: 0 },
    };
  };
  // the top-level numbers are the training arena's (what clients from before rooms read); `arenas` has every map
  const report = () => ({
    ready: true, protocol: GAME2_VERSION, room: 'lightsaber-training', rooms: true, supports_modes: true, maps: ARENA_ROOMS,
    ...stats(rooms.get('training')), max_players: limit, max_team_players: TEAM_CAPACITY,
    arenas: Object.fromEntries(ARENA_ROOMS.map(id => [id, stats(rooms.get(id))])),
    team_arenas: Object.fromEntries(ARENA_ROOMS.map(id => [id, stats(rooms.get(roomKey(id, 'teams')))])),
    serverBrowser: true, servers: [...rooms.values()].filter(room => room.publicMode || room.custom).map(stats),
    queueSupported: true, matchmaking: {
      waiting: queueWaiters.size,
      modes: Object.fromEntries(GAME2_QUEUE_MODES.filter(mode => GAME2_QUEUE_RULES[mode].minPlayers <= limit)
        .map(mode => [mode, { minPlayers: GAME2_QUEUE_RULES[mode].minPlayers,
          waiting: [...queueWaiters.values()].filter(entry => entry.modes.includes(mode)).length }]))
    },
    fleet: fleet.report(),
  });
  const send = (ws, value, reliable = true) => {
    if (ws.readyState !== WebSocket.OPEN) return false;
    if (ws.bufferedAmount > (reliable ? 4 * 1024 * 1024 : 1024 * 1024)) {
      if (reliable) ws.close(1013, 'Slow receiving connection');
      return false;
    }
    try { ws.send(JSON.stringify(value)); return true; } catch { return false; }
  };
  const removeQueue = ws => {
    const wasQueued = queueWaiters.delete(ws);
    ws.game2Queue = null;
    return wasQueued;
  };
  const queueCounts = () => Object.fromEntries(GAME2_QUEUE_MODES.map(mode =>
    [mode, [...queueWaiters.values()].filter(entry => entry.modes.includes(mode)).length]));
  const notifyQueue = () => {
    const waiting = queueCounts();
    for (const entry of queueWaiters.values()) send(entry.ws, { t: 'queue_wait', waiting, playersAhead:
      Math.max(0, [...queueWaiters.values()].filter(e => e.at < entry.at).length) });
  };
  const dispatchMatches = () => {
    // Each participant is removed at allocation: one identity cannot be
    // consumed by two overlapping mode pools, even when queued for All.
    for (const mode of GAME2_QUEUE_MODES) {
      const rules = GAME2_QUEUE_RULES[mode];
      if (rules.minPlayers > limit) continue;
      let candidates=[...queueWaiters.values()].filter(e=>e.modes.includes(mode));
      while(candidates.length>=rules.minPlayers){
        let chosen=null,mapId=null;
        const ladder=mode==='duel'||mode==='team_duel';
        // Ladder modes now have one canonical public server and map. Keep the
        // legacy queue protocol aligned with that server if an older client calls it.
        for(const anchor of candidates){
          const desired=ladder
            ? (PUBLIC_MODE_ROOMS.find(room=>room.matchMode===mode)?.mapId || chooseMap(mode,anchor.mapId||null))
            : chooseMap(mode,anchor.mapId||null);
          const compatible=candidates.filter(e=>!e.mapId||e.mapId===desired);
          if(compatible.length>=rules.minPlayers){
            chosen=compatible.slice(0,rules.minPlayers);mapId=desired;break;
          }
        }
        if(!chosen)break;
        const existing=ladder?selectPublicModeRoom([...rooms.values()],mode,mapId):null;
        if(ladder&&!existing)break;
        const id=existing?.id||'match-'+randomUUID();
        const R=existing||{id,name:rules.label,mapId,matchMode:mode,
          maxPlayers:rules.minPlayers,botFill:0,clients:new Map(),hostPeer:null,
          aiCount:0,botSides:[],custom:false,queueMatch:true,
          reservations:new Map(),ctf:mode==='ctf'?createOnlineCtf(mapId):null};
        if(!existing)rooms.set(id,R);
        chosen.forEach((entry,index)=>{
          const ticket=randomUUID();
          const side=(rules.team||ladder)&&index%2?'dark':'light';
          R.reservations.set(entry.userId,{ticket,side,expiresAt:now()+300000});
          removeQueue(entry.ws);
          send(entry.ws,{t:'match_found',serverId:id,mapId,matchMode:mode,
            serverName:R.name,maxPlayers:R.maxPlayers,matchTicket:ticket,side});
          entry.ws.close(1000,'Match ready');
        });
        candidates=[...queueWaiters.values()].filter(e=>e.modes.includes(mode));
      }
    }
    notifyQueue();
  };
  const broadcast = (R, payload, skipPeer = null, reliable = true) => {
    for (const [peer, client] of R.clients) if (peer !== skipPeer) send(client.ws, payload, reliable);
  };
  const ctfPlayers = R => [...R.clients.values()].map(client => ({
    id: client.player.id, side: client.player.side, pos: client.pos, alive: client.alive,
  }));
  const publishCtf = R => broadcast(R, { t: 'ctf', state: publicOnlineCtf(R.ctf) });
  const stepCtf = R => {
    if (!R.ctf || R.clients.size < Math.min(R.maxPlayers,GAME2_QUEUE_RULES.ctf.minPlayers)) return;
    if (advanceOnlineCtf(R.ctf, ctfPlayers(R), now())) publishCtf(R);
  };
  const syncDuelSides=R=>{
    if(!R.duelLine)return;
    const sides=R.duelLine.active;
    for(const side of ['light','dark'])for(const id of sides[side]){
      const fighter=R.clients.get(id);
      if(fighter)fighter.player.side=side;
    }
  };
  const updateBots = R => { R.botSides = R.custom ? botSidesFor(R, entryList(R)) : Array.from({length:R.legacyAi || 0}, () => 'dark'); R.aiCount = R.botSides.length; };
  const rosterChanged = R => {
    updateBots(R);
    broadcast(R, { t: 'roster', roster: entryList(R), host: R.hostPeer, ai: R.aiCount, botSides: R.botSides, matchMode: R.matchMode, maxPlayers: R.maxPlayers });
  };
  const disconnect = ws => {
    const client = ws.game2Client;
    if (!client || clients.get(client.player.id) !== client) return;
    if (client.fleet) { clients.delete(client.player.id); ws.game2Client = null; fleet.leave(client.fleet); return; }
    const R = client.room;
    if (R.ctf && dropOnlineCtfCarrier(R.ctf, client.player.id, client.pos, now())) publishCtf(R);
    clients.delete(client.player.id); R.clients.delete(client.player.id);
    if(R.duelLine){
      leaveDuelLine(R.duelLine,client.player.id);
      syncDuelSides(R);
      broadcast(R,{t:'duel_state',state:publicDuelLine(R.duelLine)});
    }
    for (const fid of R.deadFighters || []) if (fid.startsWith(client.player.id + ':')) R.deadFighters.delete(fid);
    ws.game2Client = null;
    if (R.hostPeer === client.player.id) {
      R.hostPeer = null;
      chooseHost(R, true);
    }
    if (!R.clients.size) { R.aiCount = 0; R.legacyAi = 0; }
    rosterChanged(R);
    if ((R.custom || R.queueMatch) && !R.clients.size && (!R.queueMatch || !R.reservations.size)) rooms.delete(R.id);
  };
  const reject = (ws, reason, closeCode = 1008) => {
    send(ws, { t: 'error', message: reason });
    ws.close(closeCode, reason.slice(0, 100));
  };
  const onPacket = (ws, client, message) => {
    const t = message.t;
    if (t === 'ping') {
      if (typeof message.id === 'number' && Number.isFinite(message.id)) {
        send(ws, { t: 'pong', id: message.id, serverTime: now() }, false);
      }
      return;
    }
    if (t === 'leave') { ws.close(1000, 'Left arena'); return; }
    if (t === 'ctf_pass') {
      const R = client.room;
      const to = R.clients.get(message.to);
      if (R.ctf && to && passOnlineCtfFlag(R.ctf,
        {id: client.player.id, side: client.player.side, pos: client.pos, alive: client.alive},
        {id: to.player.id, side: to.player.side, pos: to.pos, alive: to.alive}, now())) publishCtf(R);
      return;
    }
    if (t !== 'packet' || !message.body || !ALLOWED_KINDS.has(message.body.k)) return;
    const body = message.body;
    const line=client.room.duelLine;
    if(line){
      const state=publicDuelLine(line);
      const role=duelRole(state,client.player.id);
      // Spectator movement snapshots are visual-only. All damage, Force RPCs
      // and death notifications from a sideline fighter are rejected.
      if((role!=='duelist' || state.fallen.includes(client.player.id)) && body.k!=='s')return;
      if(state.phase!=='fighting' && body.k!=='s')return;
      if(body.k==='rpc' && typeof body.fid==='string'){
        const target=body.fid.endsWith(':p')?body.fid.slice(0,-2):null;
        if(target && duelRole(state,target)!=='duelist')return;
      }
      if(body.k==='fx' && body.e==='died' && body.fid===client.player.id+':p'){
        const outcome=defeatDuelFighter(line,client.player.id);
        if(outcome){
          syncDuelSides(client.room);
          rosterChanged(client.room);
          broadcast(client.room,{t:'duel_state',state:publicDuelLine(line),
            outcome:outcome.complete?{winner:outcome.winner,benched:outcome.benched}:null});
        }
      }
    }
    const sideOf = fid => {
      if (typeof fid !== 'string') return undefined;
      const human = client.room.clients.get(fid.slice(0, -2));
      if (fid.endsWith(':p') && human) return human.player.side;
      const bot = /:a(\d+)$/.exec(fid);
      if (bot && fid.startsWith(client.room.hostPeer + ':a')) return client.room.botSides[Number(bot[1])];
    };
    if (body.k === 'fx' && body.e === 'died' && isGame2TeamMode(client.room.matchMode)) {
      if (typeof body.fid !== 'string' || !body.fid.startsWith(client.player.id + ':') || !sideOf(body.fid)) return;
      const R = client.room; R.deadFighters ||= new Set();
      if (!R.deadFighters.has(body.fid)) {
        R.deadFighters.add(body.fid);
        const side = sideOf(body.by);
        if (side && side !== sideOf(body.fid)) { R.teamScore ||= {light:0,dark:0}; R.teamScore[side]++; broadcast(R, {t:'score',teamScore:R.teamScore}); }
      }
    }
    // Same-team hits and Force RPCs are ignored by the relay as well as by normal clients.
    if (isGame2TeamMode(client.room.matchMode) && body.k === 'rpc' && typeof body.fid === 'string' &&
        !(body.actor == null && client.room.hostPeer === client.player.id && client.room.aiCount > 0)) {
      const actor = body.actor || client.player.id + ':p';
      if (!actor.startsWith(client.player.id + ':') || !sideOf(actor)) return;
      if (sideOf(body.fid) === sideOf(actor)) return;
    }
    const reliable = message.reliable !== false;
    if (body.k === 's') {
      // Only the player who owns a fighter may publish its transform/animations.
      if (!Array.isArray(body.f) || body.f.length > 5 ||
          body.f.some(f => !Array.isArray(f) || typeof f[0] !== 'string' ||
            !f[0].startsWith(client.player.id + ':') ||
            (f[0] !== client.player.id + ':p' && (client.room.hostPeer !== client.player.id || !/^a\d+$/.test(f[0].slice(client.player.id.length + 1)) || Number(f[0].slice(client.player.id.length + 2)) >= client.room.aiCount)))) return;
    }
    if (body.k === 's') for (const f of body.f) {
      if (client.room.ctf && f[0] === client.player.id + ':p' &&
          [f[3], f[4], f[5], f[14]].every(Number.isFinite) &&
          [f[3], f[4], f[5]].every(value => Math.abs(value) < 10000)) {
        client.pos = [f[3], f[4], f[5]];
        const alive = f[13] !== 1 && f[14] > 0;
        if (!alive && client.alive && dropOnlineCtfCarrier(client.room.ctf, client.player.id, client.pos, now())) publishCtf(client.room);
        client.alive = alive;
      }
      const bot = /:a(\d+)$/.exec(f[0]);
      f[1] = (bot ? client.room.botSides[Number(bot[1])] : client.player.side) === 'dark' ? 1 : 0;
      if (f[13] !== 1 && f[14] > 0) client.room.deadFighters?.delete(f[0]);
    }
    if (body.k === 's' && client.room.ctf) stepCtf(client.room);
    const out = { t: 'packet', from: client.player.id, body, reliable };
    const target = typeof message.to === 'string' ? message.to : null;
    if (target) {
      const dest = client.room.clients.get(target); // only within the same arena
      if (dest) send(dest.ws, out, reliable);
    } else {
      broadcast(client.room, out, client.player.id, reliable);
    }
  };
  const handle = async (ws, raw) => {
    if (raw.length > MAX_PACKET_BYTES) { reject(ws, 'Message too large', 1009); return; }
    let data;
    try { data = JSON.parse(raw.toString()); } catch { reject(ws, 'Invalid JSON'); return; }
    if (!data || typeof data !== 'object') return;
    if (!ws.game2Client) {
      if (ws.game2Queue) {
        if (data.t === 'queue_cancel') {
          removeQueue(ws); notifyQueue(); ws.close(1000, 'Queue cancelled');
        }
        return;
      }
      if (!['join', 'queue'].includes(data.t) || ws.authenticating) { reject(ws, 'Join or queue first'); return; }
      if (data.version !== GAME2_VERSION ||
        typeof data.token !== 'string' || !data.token.length || data.token.length > MAX_TOKEN_LENGTH ||
        typeof data.peer !== 'string' || data.peer.length > 200) {
        reject(ws, 'Invalid multiplayer join request');
        return;
      }
      ws.authenticating = true;
      let user = null;
      try { user = await authenticate(data.token); } catch { /* reject without leaking token or auth server errors */ }
      ws.authenticating = false;
      if (ws.readyState !== WebSocket.OPEN) return;
      const userId = String(user?.id || '');
      if (!userId || !validPeer(data.peer, userId)) { reject(ws, 'Game 2 account authentication failed'); return; }
      if (clients.has(data.peer)) { reject(ws, 'This session is already connected'); return; }
      if (data.t === 'queue') {
        const modes = normalizeGame2QueueModes(data.modes);
        if (!modes || modes.some(mode => GAME2_QUEUE_RULES[mode].minPlayers > limit) ||
          (data.mapId != null && (typeof data.mapId !== 'string' ||
            modes.some(mode=>!queueMapAllowed(mode,data.mapId))))) {
          reject(ws, 'Select an available multiplayer queue mode'); return;
        }
        if ([...queueWaiters.values()].some(entry => entry.userId === userId) ||
            [...rooms.values()].some(room => room.reservations?.has(userId)) ||
            [...clients.values()].some(client => client.room?.queueMatch && client.userId === userId)) {
          reject(ws, 'You already have a queued or active match'); return;
        }
        const entry = { ws, userId, peer: data.peer, name: cleanName(data.name), modes, mapId:data.mapId||null, at: now() };
        ws.game2Queue = entry; queueWaiters.set(ws, entry);
        clearTimeout(ws.helloTimer);
        notifyQueue();
        dispatchMatches();
        return;
      }
      if (data.mode === 'fleet') {
        const conn = { send: (value, reliable = true) => send(ws, value, reliable) };
        const joined = fleet.join(conn, { id: data.peer, name: cleanName(data.name), role: data.role, side: data.side });
        if (!joined.ok) { reject(ws, joined.reason); return; }
        const client = { ws, player: { id: data.peer, name: cleanName(data.name) }, fleet: conn, windowMs: now(), messages: 0 };
        ws.game2Client = client;
        clients.set(data.peer, client);
        clearTimeout(ws.helloTimer);
        return;
      }
      let R;
      if (data.createServer) {
        let settings;
        try { settings = validateServerSettings(data.createServer); } catch (error) { reject(ws, error.message); return; }
        if ([...rooms.values()].some(r => r.custom && r.ownerId === userId)) { reject(ws, 'You already have an active server'); return; }
        const id = 'server-' + randomUUID();
        R = { ...settings, id, ownerId: userId, custom: true, clients: new Map(),
          hostPeer: null, aiCount: 0, botSides: [],
          ...(['duel','team_duel'].includes(settings.matchMode)
            ? {duelLine:createDuelLine(settings.matchMode)}:{}),
          ...(settings.matchMode==='ctf'?{ctf:createOnlineCtf(settings.mapId)}:{}),
        };
        R.maxPlayers = Math.min(R.maxPlayers, limit);
        rooms.set(id, R);
      } else if (data.serverId) {
        R = rooms.get(data.serverId);
        if (!R) { reject(ws, 'This server has closed. Refresh the server list.'); return; }
        if (data.room !== R.mapId) { reject(ws, 'This server is playing a different map. Refresh the server list.'); return; }
      } else {
        const map = data.room ?? 'training', mode = data.matchMode ?? 'ffa';
        if (!ARENA_ROOMS.includes(map) || !MATCH_MODES.includes(mode)) { reject(ws, 'Unknown map or multiplayer match mode'); return; }
        R = rooms.get(roomKey(map, mode));
      }
      const reservation = R.reservations?.get(userId) || null;
      // Reservations have first claim on fighter slots. Direct-join spectators
      // can enter once the reserved players have finished admission.
      if(R.duelLine && R.reservations?.size && !reservation){
        reject(ws,'Reserved duelists are entering. Try joining this server again shortly.');return;
      }
      if ((R.queueMatch || data.matchTicket) && (!reservation || reservation.ticket !== data.matchTicket || reservation.expiresAt <= now())) {
        reject(ws, 'Your match ticket expired. Queue again to join.'); return;
      }
      if (R.clients.size >= R.maxPlayers) { reject(ws, 'The server is full'); return; }
      const side = reservation ? reservation.side : R.duelLine
        ? duelSideForArrival(R.duelLine) : R.publicMode && isGame2TeamMode(R.matchMode)
          ? (entryList(R).filter(p=>p.side==='light').length <=
             entryList(R).filter(p=>p.side==='dark').length ? 'light':'dark')
          : data.side === 'dark' ? 'dark' : 'light';
      if (isGame2TeamMode(R.matchMode) && entryList(R).filter(p => p.side === side).length >= Math.min(TEAM_CAPACITY, R.maxPlayers / 2)) { reject(ws, 'That team is full. Choose the other team.'); return; }
      const player = {
        id: data.peer, name: cleanName(data.name),
        side, matchMode: R.matchMode, at: now(), host: false,
      };
      const client = { ws, player, room: R, userId, pos: null, alive: false,
        windowMs: now(), messages: 0, smoothedRtt: Infinity, rttSamples: 0 };
      ws.game2Client = client;
      clients.set(data.peer, client); R.clients.set(data.peer, client);
      if (reservation) R.reservations.delete(userId);
      if(R.duelLine){joinDuelLine(R.duelLine,data.peer,side);syncDuelSides(R);}
      clearTimeout(ws.helloTimer);
      if (!R.hostPeer) {
        R.hostPeer = data.peer;
        if (!R.custom) R.legacyAi = R.matchMode === 'ffa' && Number.isInteger(data.ai) ? Math.min(3, Math.max(0, data.ai)) : 0;
      }
      updateBots(R);
      send(ws, { t: 'welcome', you: { ...player, host: R.hostPeer === data.peer }, room: R.id,
        roster: entryList(R), host: R.hostPeer, ai: R.aiCount, botSides: R.botSides, mapId: R.mapId, serverName: R.name, custom: R.custom, matchMode: R.matchMode, maxPlayers: R.maxPlayers, teamScore: R.teamScore || {light:0,dark:0}, ctf: publicOnlineCtf(R.ctf), duelState:publicDuelLine(R.duelLine), serverTime: now() });
      rosterChanged(R);
      if (R.duelLine)broadcast(R,{t:'duel_state',state:publicDuelLine(R.duelLine)});
      if (R.ctf) publishCtf(R);
      return;
    }
    const client = ws.game2Client;
    const stamp = now();
    if (stamp - client.windowMs > 1000) { client.windowMs = stamp; client.messages = 0; }
    client.messages++;
    const messageBudget = 300 + (client.room?.hostPeer === client.player.id ? client.room.aiCount * 30 : 0);
    if (client.messages > messageBudget) { reject(ws, 'Excessive network traffic'); return; }
    if (client.fleet) {
      if (data.t === 'fleet') fleet.message(client.fleet, data);
      else if (data.t === 'leave') ws.close(1000, 'Left Fleet Assault');
      else if (data.t === 'ping' && typeof data.id === 'number' && Number.isFinite(data.id)) send(ws, { t: 'pong', id: data.id, serverTime: now() }, false);
      return;
    }
    if (client.messages > 150 && data.t === 'packet' && data.body?.k === 's') return;
    onPacket(ws, client, data);
  };
  const server = createServer((req, res) => {
    const path = new URL(req.url || '/', 'http://localhost').pathname;
    const status = path === '/health' ? { status: 'ok', protocol: GAME2_VERSION } : report();
    if (path !== '/health' && path !== '/status') {
      res.writeHead(404, { 'Content-Type': 'application/json' }); res.end('{"error":"Not found"}'); return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*', 'X-Content-Type-Options': 'nosniff' });
    res.end(JSON.stringify(status));
  });
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_PACKET_BYTES });
  server.on('upgrade', (req, socket, head) => {
    if (new URL(req.url || '/', 'http://localhost').pathname !== '/ws/game2') {
      socket.destroy(); return;
    }
    wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, req));
  });
  wss.on('connection', ws => {
    ws.alive = true; ws.authenticating = false; ws.game2Client = null; ws.game2Queue = null;
    ws.helloTimer = setTimeout(() => { if (!ws.game2Client) reject(ws, 'Game 2 authentication timeout'); }, HELLO_TIMEOUT_MS);
    ws.on('pong', () => {
      ws.alive = true;
      const client = ws.game2Client;
      if (!client || client.fleet || !Number.isFinite(ws.pingSentAt)) return;
      const sample = now() - ws.pingSentAt;
      ws.pingSentAt = undefined;
      if (sample < 0 || sample > PING_INTERVAL_MS) return;
      client.smoothedRtt = Number.isFinite(client.smoothedRtt) ? client.smoothedRtt * .7 + sample * .3 : sample;
      client.rttSamples++;
    });
    ws.on('message', raw => { void handle(ws, raw).catch(() => reject(ws, 'Game 2 networking error')); });
    ws.on('close', () => { clearTimeout(ws.helloTimer); if (removeQueue(ws)) notifyQueue(); disconnect(ws); });
    ws.on('error', () => { /* close will clean up membership */ });
  });
  const pingTimer = setInterval(() => {
    for (const client of clients.values()) {
      if (!client.ws.alive) { client.ws.terminate(); continue; }
      client.ws.alive = false;
      client.ws.pingSentAt = now();
      client.ws.ping();
    }
  }, PING_INTERVAL_MS);
  pingTimer.unref?.();
  const electionTimer = setInterval(() => {
    for (const room of rooms.values()) {
      if (room.clients.size > 1) chooseHost(room);
      if (!room.reservations) continue;
      for (const [userId, reservation] of room.reservations) {
        if (reservation.expiresAt <= now()) room.reservations.delete(userId);
      }
      if (room.queueMatch && !room.clients.size && !room.reservations.size) rooms.delete(room.id);
    }
  }, HOST_ELECTION_INTERVAL_MS);
  electionTimer.unref?.();
  const ctfTimer = setInterval(() => {
    for (const R of rooms.values()) if (R.ctf) stepCtf(R);
  }, 500);
  ctfTimer.unref?.();
  const fleetTimer = setInterval(() => fleet.tick(), 1000 / 30);
  fleetTimer.unref?.();
  const listen = () => new Promise((resolve, rejectStart) => {
    server.once('error', rejectStart);
    server.listen(port, host, () => { server.off('error', rejectStart); resolve(server.address()); });
  });
  const close = async () => {
    clearInterval(pingTimer);
    clearInterval(electionTimer);
    clearInterval(fleetTimer);
    clearInterval(ctfTimer);
    for (const client of [...clients.values()]) client.ws.terminate();
    for (const client of wss.clients) client.terminate();
    await new Promise(resolve => wss.close(resolve));
    await new Promise(resolve => server.close(resolve));
  };
  return { listen, close, server, wss, report, fleet };
}
