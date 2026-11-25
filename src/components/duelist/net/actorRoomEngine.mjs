// Server-authoritative room engine for Base44 realtime Actors. No browser or database access.
import { createMatch, joinMatch, leaveMatch, stepMatch, matchView, queueMatchClass, purchaseMatchItem, MODES } from '../sim/match.mjs';
import { createInputRateLimiter, classById } from '../core/index.mjs';
import { PROTOCOL, DEFAULT_PUBLIC_ROOMS, BODY_IDS, MAX_MESSAGE_BYTES, MAX_MESSAGES_PER_SECOND, ABUSE_MESSAGES_PER_SECOND, compactWaitingInputs, TICK_HZ, SNAPSHOT_EVERY, VIEW_EVERY, sanitizeInput, encodeFighter, encodeOwn } from './protocol.mjs';

export const ACTOR_TRANSPORT = 'base44:duelist';
const STEP = 1 / TICK_HZ;
const modeFor = id => DEFAULT_PUBLIC_ROOMS.find(r => r.id === id)?.mode || null;
const safeId = () => globalThis.crypto.randomUUID().replace(/-/g,'');
export class DuelistRoomEngine {
  constructor(roomId, { clock=()=>Date.now()/1000, idFactory=safeId }={}) {
    this.roomId=roomId; this.mode=modeFor(roomId); this.clock=clock; this.idFactory=idFactory;
    this.clients=new Map(); this.match=null; this.last=clock(); this.carry=0;
    this.ticks=0; this.effects=[]; this.events=[]; this.overAt=null;
  }
  status() {
    if(!this.mode) return null;
    const seats=MODES[this.mode].seats;
    const players=[...this.clients.values()].filter(c=>c.joined).length;
    const phase=this.match?.phase==='roundOver'?'countdown':this.match?.phase||'countdown';
    return {id:this.roomId,mode:this.mode,name:MODES[this.mode].name,players,bots:seats-players,seats,phase,open:players<seats&&phase!=='over',publicRoom:true};
  }
  connect(conn) {
    if(!this.mode || !conn.identity){conn.reject(4403,'Invalid public room');return;}
    if(this.clients.has(conn.id)){conn.reject(4409,'Connection already active');return;}
    if(this.clients.size>=MODES[this.mode].seats+4){conn.reject(4403,'Room busy');return;}
    const now=this.clock();
    this.clients.set(conn.id,{conn,id:'guest-'+this.idFactory(),key:this.idFactory().slice(0,24),
      joined:false,body:BODY_IDS[0],classId:null,input:{},waiting:[],lastSeq:-1,ack:-1,limiter:createInputRateLimiter(),since:now,count:0,lastInput:now});
    conn.send({t:'actorReady'});
  }
  send(c,msg){c.conn.send(msg);}
  seats() {
    return [...(this.match?.seats.values()||[])].map((s,i)=>({id:s.id,name:s.name,team:s.team,kind:s.kind,
      body:[...this.clients.values()].find(c=>c.id===s.id)?.body||BODY_IDS[i%BODY_IDS.length]}));
  }
  broadcastSeats(){const seats=this.seats();for(const c of this.clients.values())if(c.joined)this.send(c,{t:'seats',seats});}
  newMatch(){this.match=createMatch({mode:this.mode,seed:Math.floor(this.clock()*1000)%1000003});this.last=this.clock();this.carry=0;this.ticks=0;this.effects=[];this.events=[];this.overAt=null;}
  enter(c,rematch=false) {
    if(!this.match)this.newMatch();
    if(this.match.phase==='over'&&!rematch){this.send(c,{t:'error',code:'room',message:'Round resetting. Try again shortly.'});return;}
    const r=joinMatch(this.match,{id:c.id,name:'Guest',classId:c.classId});
    if(!r.ok){this.send(c,{t:'error',code:'full',message:'That room is full.'});return;}
    c.joined=true;c.waiting=[];c.input={};c.lastInput=this.clock();
    this.send(c,{t:'joined',match:this.roomId,mode:this.mode,you:c.id,team:r.team,replaced:r.replaced,seats:this.seats(),key:c.key,...(rematch?{rematch:true}:{})});
    this.broadcastSeats();
  }
  remove(connId) {
    const c=this.clients.get(connId);if(!c)return;
    this.clients.delete(connId);
    if(c.joined&&this.match){leaveMatch(this.match,c.id);this.broadcastSeats();}
    if(![...this.clients.values()].some(p=>p.joined)){this.match=null;this.effects=[];this.events=[];}
  }
  message(conn,msg) {
    const c=this.clients.get(conn.id);if(!c)return;
    const now=this.clock();
    if(now-c.since>=1){c.since=now;c.count=0;}
    c.count++;
    if(c.count>ABUSE_MESSAGES_PER_SECOND){this.remove(conn.id);conn.reject(4429,'Too many messages');return;}
    if(c.count>MAX_MESSAGES_PER_SECOND||!msg||typeof msg!=='object'||Array.isArray(msg)||typeof msg.t!=='string')return;
    if(JSON.stringify(msg).length>MAX_MESSAGE_BYTES)return;
    if(msg.t==='hello'){
      if(c.welcomed)return;
      if(msg.v!==PROTOCOL){conn.send({t:'error',code:'version',message:'Game updated. Reload the page.'});this.remove(conn.id);conn.reject(4426,'Version');return;}
      c.welcomed=true;c.body=BODY_IDS.includes(msg.body)?msg.body:BODY_IDS[0];
      this.send(c,{t:'welcome',id:c.id,name:'Guest',protocol:PROTOCOL,resumed:false});return;
    }
    if(!c.welcomed)return;
    if(msg.t==='join'){
      if(c.joined)return;
      if((msg.mode!==this.mode&&msg.mode!=='any'&&msg.mode!=='online')||(msg.matchId!=null&&msg.matchId!==this.roomId)){
        this.send(c,{t:'error',code:'room',message:'Invalid room selection.'});return;
      }
      c.classId=typeof msg.cls==='string'&&classById(msg.cls)?msg.cls:null;this.enter(c);return;
    }
    if(!c.joined||!this.match)return;
    if(msg.t==='leave'){this.send(c,{t:'left'});this.remove(conn.id);return;}
    if(msg.t==='class'){
      const r=typeof msg.id==='string'&&msg.id.length<=48?queueMatchClass(this.match,c.id,msg.id):{accepted:false,reason:'invalid'};
      if(r.accepted)c.classId=msg.id;
      this.send(c,{t:'class',ok:r.accepted,pending:r.pendingClass??null,reason:r.reason??null});return;
    }
    if(msg.t==='shop'){
      const r=typeof msg.id==='string'&&msg.id.length<=48?purchaseMatchItem(this.match,c.id,msg.id):{ok:false,reason:'invalid'};
      this.send(c,{t:'shop',...r});return;
    }
    if(msg.t!=='input')return;
    const input=sanitizeInput(msg);if(!input||!Number.isSafeInteger(input.seq)||input.seq<=c.lastSeq)return;
    c.lastSeq=input.seq;c.lastInput=now;
    input.presses=input.presses.filter(p=>p==='blockUp'||p==='release'||c.limiter.allow(now));
    c.waiting.push(input);
    compactWaitingInputs(c.waiting);
  }
  shouldTick(){return this.clients.size>0;}
  tick(){
    const now=this.clock();
    for(const [id,c] of this.clients)if(now-c.lastInput>(c.joined?90:12)){this.remove(id);c.conn.reject(4403,'Idle connection');}
    if(!this.match){this.last=now;return;}
    this.carry=Math.min(.15,this.carry+Math.max(0,now-this.last));this.last=now;
    while(this.carry>=STEP){
      this.carry-=STEP;
      const inputs={};
      for(const c of this.clients.values())if(c.joined){
        const next=c.waiting.shift();
        if(next){const {seq,presses,...held}=next;c.input=held;c.ack=seq;inputs[c.id]={...held,presses};}
        else inputs[c.id]=now-c.lastInput>0.5?{}:{...c.input,presses:[]};
      }
      const r=stepMatch(this.match,STEP,inputs);
      this.effects.push(...r.effects);this.events.push(...r.events.filter(e=>e.type!=='xp'));
      this.ticks++;
      if(this.ticks%SNAPSHOT_EVERY===0)this.snapshot();
      if(this.match.phase==='over'){
        if(this.overAt===null)this.overAt=now;
        if(now-this.overAt>=12){
          const active=[...this.clients.values()].filter(c=>c.joined);
          this.newMatch();
          for(const c of active)this.enter(c,true);
          break;
        }
      }
    }
  }
  snapshot(){
    const match=this.match,{world}=match;
    const flags=match.flags?Object.fromEntries(Object.entries(match.flags).map(([t,f])=>[t,{state:f.state,carrier:f.carrier,x:f.x,y:f.y,z:f.z}])):null;
    const ball=match.ball?{x:match.ball.x,z:match.ball.z}:null;
    const projectiles=world.projectiles.map(p=>({id:p.id,x:p.x,y:p.y,z:p.z,d:[p.dir.x,p.dir.z],move:p.move}));
    const effects=this.effects,events=this.events;this.effects=[];this.events=[];
    const withView=this.ticks%(SNAPSHOT_EVERY*VIEW_EVERY)===0||events.length>0;
    for(const c of this.clients.values())if(c.joined){
      const f=world.fighters.get(c.id);
      const fighters=[...world.fighters.values()].map(fighter=>encodeFighter(fighter,world.bodies.get(fighter.id),{own:fighter.id===c.id}));
      this.send(c,{t:'snap',time:Math.round(world.time*1000)/1000,ack:c.ack,fighters,projectiles,flags,ball,
        escortDistance:match.escort?.distance,effects,events,
        own:match.phase==='live'&&f&&!f.vitals.dead?encodeOwn(f,world.bodies.get(c.id),world.time):undefined,
        view:withView?matchView(match,c.id):undefined});
    }
  }
}

