// Base44's authenticated Actor is the preferred Game 2 multiplayer transport.
// Railway is a pre-admission fallback only when it genuinely supports the requested queue.
// Never move a live session/ticket between the two independent room registries.
import { RailwayGameSession } from './railway.js';
import { normalizeGame2QueueModes } from '../../../../server/game2/queueRules.mjs';
import { queueMapAllowed } from '../../../../server/game2/onlineArenaPolicy.mjs';

export const GAME2_ACTOR_ID = 'game2-realtime-v1';
export const GAME2_ACTOR_STALE_MS = 18000;

// Detect a connected-looking but silent Actor socket. Browser/WebSocket
// heartbeats are *not* proof that the authenticated game room still exists;
// requiring a real server response avoids indefinitely frozen opponents.
export function game2ActorIsStalled(lastMessageAt, now = Date.now(), maxSilenceMs = GAME2_ACTOR_STALE_MS) {
  return Number.isFinite(lastMessageAt) && Number.isFinite(now) &&
    lastMessageAt > 0 && now >= lastMessageAt && now - lastMessageAt > maxSilenceMs;
}

export function game2ActorEnabled({ search, enabled } = {}) {
  const query = search === undefined ? (typeof window !== 'undefined' ? window.location.search : '') : search;
  const params = new URLSearchParams(query);
  if (params.get('g2actor') === '0' || params.get('g2transport') === 'railway') return false;
  if (params.get('g2actor') === '1' || params.get('g2transport') === 'base44') return true;
  const flag = enabled === undefined ?
    (typeof import.meta.env === 'object' ? import.meta.env.VITE_GAME2_ACTOR : undefined) : enabled;
  // Base44 is the default on the hosted app; an explicit 0 still permits
  // legacy troubleshooting. Backend selection decides availability separately.
  return flag !== false && flag !== '0';
}
export function requireGame2Actor(client) {
  if (typeof client?.actors?.Game2Realtime !== 'function') {
    throw new Error('The Game2Realtime Actor is not available in this Base44 app. Deploy the Actor before queuing.');
  }
  return client.actors.Game2Realtime(GAME2_ACTOR_ID);
}
function makeConnectionId({ key, storage } = {}) {
  let id;
  try { id = storage?.getItem(key); } catch { /* private mode */ }
  if (!id || !/^[a-z0-9-]{16,80}$/i.test(id)) {
    if (!globalThis.crypto?.randomUUID) throw new Error('Secure Game 2 connections require crypto.randomUUID');
    id = crypto.randomUUID();
    try { storage?.setItem(key, id); } catch { /* private mode */ }
  }
  return id;
}
function freshConnection(client) {
  return requireGame2Actor(client).connect({id:makeConnectionId()});
}

export function game2ActorStatus({ client, timeoutMs = 7000 } = {}) {
  return new Promise((resolve, reject) => {
    let room, sub, timer, retry, done = false;
    const finish = (err, value) => {
      if(done)return;
      done=true;clearTimeout(timer);clearInterval(retry);
      sub?.unsubscribe();room?.close();
      if(err)reject(err);else resolve(value);
    };
    // The actor's handleConnect greeting can arrive before SDK subscribe().
    // A read-only status request is safe to retry until the socket is ready.
    const request = () => {
      if(done)return;
      try { room?.send({t:'status'}); } catch { /* still connecting */ }
    };
    try {
      room=freshConnection(client);
      sub=room.subscribe(message=>{
        if(message?.t==='actor_ready') {
          if(message.version !== 1)finish(new Error('Base44 Actor protocol version mismatch'));
          else request();
        } else if(message?.t==='status') {
          if(message.status?.ready && message.status?.actorProtocol===1)finish(null,message.status);
          else finish(new Error('Incompatible Base44 Game 2 actor'));
        } else if(message?.t==='error')finish(new Error(message.message||'Actor status rejected'));
      });
      timer=setTimeout(()=>finish(new Error('Base44 Game 2 Actor unavailable or not deployed')),timeoutMs);
      retry=setInterval(request,900);
      request();
    }catch(e){finish(e);}
  });
}

export function openGame2ActorMatchQueue({
  client, peer, name, modes, mapId=null, onWaiting=()=>{}, onMatch=()=>{}, onError=()=>{}, timeoutMs=10000,
}={}) {
  const valid=normalizeGame2QueueModes(modes);
  if(!valid || !peer || (mapId && valid.some(mode=>!queueMapAllowed(mode,mapId))))throw new Error('Choose a valid multiplayer queue/map');
  let actor,sub,active=true,started=false,retry=null,pulse=null;
  let lastQueueReplyAt=0,pingId=0;
  const clearTimers=()=>{
    clearTimeout(timer);
    clearInterval(retry);
    clearInterval(pulse);
    retry=null;pulse=null;
  };
  const requestQueue=()=>{
    if(!active||started)return;
    try { actor?.send({t:'queue',peer,name:String(name||'Jedi').slice(0,20),modes:valid,mapId}); }
    catch { /* socket not open yet */ }
  };
  const fail=message=>{
    if(!active)return;
    active=false;clearTimers();
    sub?.unsubscribe();actor?.close();
    onError(String(message||'Matchmaking disconnected'));
  };
  const timer=setTimeout(()=>{if(!started)fail('Base44 Game 2 queue did not acknowledge a connection')},timeoutMs);
  try {
    actor=freshConnection(client);
    sub=actor.subscribe(message=>{
      if(!active||!message)return;
      if(message.t==='actor_ready'){
        if(message.version !== 1){fail('Base44 Game 2 Actor protocol mismatch');return;}
        requestQueue();
      } else if(message.t==='queue_wait'){
        started=true;lastQueueReplyAt=Date.now();
        clearTimeout(timer);clearInterval(retry);retry=null;
        onWaiting(message);
      } else if(message.t==='pong'){
        // Only actual server responses keep a waiting queue alive.
        // A WebSocket object that exists but has gone silent is not healthy.
        if(started && Number.isInteger(message.id))lastQueueReplyAt=Date.now();
      }
      else if(message.t==='match_found'){
        if(!message.actorMatched || typeof message.actorRoomId!=='string' ||
          !/^(match-|public-(?:duel|team_duel)-)/.test(message.actorRoomId) || !valid.includes(message.matchMode)) {
          fail('Base44 sent an invalid room reservation');return;
        }
        active=false;clearTimers();
        sub?.unsubscribe();actor?.close();
        onMatch(message);
      } else if(message.t==='error')fail(message.message);
    });
    // SDK test doubles and some resumed sessions can invoke callbacks
    // synchronously. Do not install orphaned timers after an early match.
    if(active){
      if(!started)retry=setInterval(requestQueue,1300);
      // A queue can wait for minutes. Verify actual Actor responses instead
      // of leaving a frozen spinner when the socket silently drops.
      pulse=setInterval(()=>{
        if(!active||!started)return;
        if(game2ActorIsStalled(lastQueueReplyAt)){
          fail('Base44 matchmaking connection lost. Please queue again.');
          return;
        }
        try {actor?.send({t:'ping',id:++pingId});}
        catch { /* a brief reconnect is allowed until the stale timeout */ }
      },3000);
      requestQueue();
    }
  }catch(error){clearTimers();sub?.unsubscribe();actor?.close();throw error;}
  return {cancel(){
    if(!active)return;
    active=false;clearTimers();
    try{actor?.send({t:'queue_cancel'});}catch{/* closing */}
    sub?.unsubscribe();actor?.close();
  }};
}

export class Base44GameSession extends RailwayGameSession {
  constructor(options) {
    super(options);
    this.actor=null;this.subscription=null;
    this.snapshotAt=0;
    this.snapshotTick=null;
    this.handshakeTimer=null;
    this.lastActorMessageAt=0;
  }
  _write(message) {
    if(!this.actor || this.ended)return false;
    if(message.t==='packet' && message.reliable===false && message.body?.k==='s') {
      const now=typeof performance!=='undefined'?performance.now():Date.now();
      const tick=message.body.t;
      if (tick!==this.snapshotTick) {
        if(now-this.snapshotAt<50)return true; // 20Hz max with engine-side interpolation
        this.snapshotAt=now;
        this.snapshotTick=tick;
      }
    }
    try{this.actor.send(message);return true;}catch{return false;}
  }
  start() {
    if(this.state!=='idle')return Promise.reject(new Error('Game 2 already connecting'));
    this.state='connecting';
    this.lastActorMessageAt=Date.now();
    this.status('Connecting to the Base44 realtime arena');
    return new Promise(resolve=>{
      let finished=false;
      const finish=()=>{if(finished)return;finished=true;clearTimeout(timer);resolve();};
      this.joined=finish;
      const timer=setTimeout(()=>{
        if(this.state!=='live'&&!this.ended)this.end('Base44 realtime room connection timed out');
        finish();
      },16000);
      try{
        const storage=typeof sessionStorage!=='undefined'?sessionStorage:null;
        const id=makeConnectionId({key:'atomxe.game2.actor.'+
          (this.o.actorRoomId||this.o.serverId||'new-custom'),storage});
        this.actor=requireGame2Actor(this.o.client).connect({id});
        const requestJoin=()=>{
          if(this.state!=='connecting' || this.ended)return;
          this._write({t:'join',peer:this.self,name:this.o.name,side:this.o.side,
            actorRoomId:this.o.actorRoomId,serverId:this.o.serverId,
            createServer:this.o.createServer,mapId:this.o.mapId});
        };
        const requestHandshake=()=>{
          if(this.state!=='connecting' || this.ended)return;
          try {this.actor.send({t:'hello'});}catch{/* socket not ready */}
          requestJoin();
        };
        this.subscription=this.actor.subscribe(message=>{
          if(this.ended || !message || typeof message !== 'object') return;
          this.lastActorMessageAt=Date.now();
          if(message?.t==='actor_ready'){
            if(this.state!=='connecting' || this.ended)return;
            if(message.version!==1){this.end('Base44 Actor protocol mismatch');return;}
            this.status('Joining the Game 2 arena');
            requestJoin();
          } else {
            this._receive(JSON.stringify(message));
            if(this.state==='live'){
              clearInterval(this.handshakeTimer);this.handshakeTimer=null;
            }
          }
        });
        // Recover greeting lost before subscribe, and retry joins safely.
        // The server treats a duplicate join on this connection idempotently.
        this.handshakeTimer=setInterval(requestHandshake,900);
        requestHandshake();
        this.pingTimer=setInterval(()=>{
          if(this.state!=='live' || this.ended)return;
          if(game2ActorIsStalled(this.lastActorMessageAt)){
            this.end('Base44 realtime connection stalled. Return to the Game 2 lobby to reconnect.');
            return;
          }
          const id=++this.pingId;
          this.pingWait.set(id,Date.now());
          if(this.pingWait.size>5)this.pingWait.delete(this.pingWait.keys().next().value);
          this._write({t:'ping',id});
        },3000);
      }catch(error){
        this.end(error.message||'Cannot connect to Base44 realtime');
        finish();
      }
    });
  }
  _stop() {
    clearInterval(this.pingTimer);this.pingTimer=null;
    clearInterval(this.handshakeTimer);this.handshakeTimer=null;
    this.subscription?.unsubscribe();this.subscription=null;
    this.actor?.close();this.actor=null;
  }
}
