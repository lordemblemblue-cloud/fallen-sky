// Game 2 · Boss Way: one real combatant with 10 independent 5,000-HP
// health segments (50,000 total). Battle uses Game 2 Combat.damage and
// Fighter.hurt, not a UI-only fake HP meter. Loot remains a non-persistent hook.
import { clamp, wrapPi } from '../math.js';
import { RancorVisual } from './rancorVisual.js';
import { BOSS_WAY_ARENA } from '../levels/bossWayArena.js';

export const BOSS_WAY_BARS = 10;
export const BOSS_WAY_HP_PER_BAR = 5000;
export const BOSS_WAY_TOTAL_HP = BOSS_WAY_BARS * BOSS_WAY_HP_PER_BAR;
// Boss HP is large enough to require an actual event encounter, but weapon
// contacts are scaled so the fight can be completed without thousands of hits.
export const BOSS_WAY_DAMAGE_FACTOR = 12;
export const BOSS_WAY_INTRO_SECONDS = 6; // live in-engine cinematic, not a video file
export const BOSS_WAY_ATTACKS = Object.freeze([
  {id:'sweep',label:'Claw sweep',windup:1.00,recover:1.55,range:5.1,arc:2.05,damage:19},
  {id:'slam',label:'Ground slam · JUMP!',windup:1.35,recover:1.85,range:7.0,arc:Math.PI*2,damage:32},
  {id:'grab',label:'Crushing grab · DODGE!',windup:1.15,recover:2.0,range:3.8,arc:1.55,damage:43},
  {id:'roar',label:'Terrifying roar · TAKE COVER!',windup:1.65,recover:2.5,range:8.5,arc:2.40,damage:12},
]);
const pretty=n=>Math.round(Math.max(0,n)).toLocaleString('en-US');

export function bossWayBars(hp) {
  const clamped=clamp(Number(hp)||0,0,BOSS_WAY_TOTAL_HP);
  return Array.from({length:BOSS_WAY_BARS},(_,i)=>clamp((clamped-i*BOSS_WAY_HP_PER_BAR)/BOSS_WAY_HP_PER_BAR,0,1));
}
export function bossWayStage(hp) {
  return clamp(Math.ceil((Number(hp)||0)/BOSS_WAY_HP_PER_BAR),0,BOSS_WAY_BARS);
}

export class BossWay {
  constructor(g) {
    this.g=g;this.phase='intro';this.attack=null;this.attackTimer=0;
    this.recover=2.3;this.sequence=0;this.stage=BOSS_WAY_BARS;this.stageBreaks=[];
    this.elapsed=0;this.introBeat=false;this.bossSpawn=[...BOSS_WAY_ARENA.rancor];
    this.reward=null;this.bossName='Rancor';
    const b=g.addNpc('rancor',this.bossSpawn[0],this.bossSpawn[2],{
      name:'boss_way_rancor',label:'Rancor',team:'enemy',hp:BOSS_WAY_TOTAL_HP,
      saber:false,gun:false,yaw:Math.PI,blockSkill:0,dmgScale:1,
    });
    b.isRancorBoss=true;b.pos=this.bossSpawn.slice();b.spawn=this.bossSpawn.slice();
    b.hp=b.maxHp=BOSS_WAY_TOTAL_HP;b.radius=2.05;b.gun=false;b.reaction=0;
    b.chest=()=>[b.pos[0],b.pos[1]+2.6,b.pos[2]+.25];
    b.headPos=()=>[b.pos[0],b.pos[1]+4.65,b.pos[2]+.9];
    // Giant boss cannot be vaporised, parried, gripped, thrown, mind-dominated
    // or killed by a Force "execution". Hit points must actually reach zero.
    b.push=()=>false;b.levitate=()=>false;b.vaporize=()=>false;
    const hurt=b.hurt.bind(b);
    b.hurt=(amount,source,options={})=>{
      if(b.status==='dead'||this.phase==='won')return false;
      const scaled=Math.max(0,Number(amount)||0)*(source?.isPlayer?BOSS_WAY_DAMAGE_FACTOR:1);
      const killed=hurt(scaled,source,{...options,noFlinch:true});
      const stage=bossWayStage(b.hp);
      if(stage<this.stage) {
        for(let s=this.stage;s>stage;s--)this.stageBreaks.push(s);
        this.stage=stage;
        if(!killed) {
          g.hud.banner(this.bossName.toUpperCase()+' ARMOR BROKEN', [1,.68,.35],.85);
          g.shake(.26);
        }
      }
      return killed;
    };
    this.boss=b;g.boss=b;
    this.visual=new RancorVisual(g.R,g.A.rancorModel||null);
  }

  onDeath(f) {
    if(this.phase==='won'||this.phase==='lost')return;
    if(f===this.boss) {
      this.phase='won';this.attack=null;
      // Stable interface for a future authenticated reward transaction.
      // NOT a grant: no currency, cards or inventory state is changed.
      this.reward={eventId:'boss_way_rancor_v1',boss:'rancor',eligible:!this.g.bossPreview,
        state:'not-integrated',claimed:false,loot:[]};
      this.g.clearTargetLock();
      this.g.hud.banner('BOSS DEFEATED!',[1,.8,.3],3);
      this.g.sfxAt('hit3',this.boss.pos,.9);
    } else if(f.isPlayer) {
      this.phase='lost';this.attack=null;
      this.g.clearTargetLock();
    }
  }

  // Telegraphs are visible for at least 1.0 s. Attack impact is applied
  // once per windup, with directional hit checks and real world cover.
  chooseAttack(distance) {
    const stage=bossWayStage(this.boss.hp);
    const moves=distance<4.0?['sweep','grab','slam','roar']:
      distance<7.2?['sweep','slam','roar']:
      ['roar','slam'];
    const id=moves[this.sequence++%moves.length];
    const attack=BOSS_WAY_ATTACKS.find(a=>a.id===id);
    this.attack=attack;
    const rage=(BOSS_WAY_BARS-stage)/BOSS_WAY_BARS;
    this.attackTimer=attack.windup*(1-0.2*rage);
    this.phase='windup';
    this.g.hud.msg(this.bossName+': '+attack.label);
    this.g.sfxAt(id==='roar'?'swing2':'swing1',this.boss.pos,.68);
  }

  impact() {
    const g=this.g,b=this.boss,p=g.player,a=this.attack;
    if(!a||p.status==='dead'||b.status==='dead')return false;
    const dx=p.pos[0]-b.pos[0],dz=p.pos[2]-b.pos[2];
    const distance=Math.hypot(dx,dz);
    const yaw=Math.atan2(dx,dz);
    const angle=Math.abs(wrapPi(yaw-b.yaw));
    if(distance>a.range||angle>a.arc/2)return false;
    if(!g.world.lineOfSight(b.chest(),p.chest()))return false;
    const floor=g.world.floorAt(p.pos[0],p.pos[2],p.pos[1]+1);
    if(a.id==='slam'&&floor!=null&&p.pos[1]-floor>1.2) {
      g.hud.msg('You jumped the shockwave');return false;
    }
    if(p.dodge)return false; // active Force Dodge movement avoids collision
    const direction=[dx/(distance||1),0,dz/(distance||1)];
    const damaged=p.hurt(a.damage,b,{noFlinch:a.id==='roar'});
    if(!damaged&&p.status!=='dead')p.push(direction,a.id==='roar'?6:4.5,a.id==='slam'?2.3:1.5);
    g.hud.hit(a.damage);g.shake(a.id==='slam'?.55:.32);
    g.fx.ring({p:[b.pos[0],.12,b.pos[2]],n:[0,1,0],r0:1.1,r1:a.range,
      life:.4,w:.20,c:[1,.43,.14,.65]});
    g.sfxAt(a.id==='slam'?'wall3':'hit3',p.pos,.85);
    return true;
  }

  update(dt) {
    this.elapsed+=dt;
    const b=this.boss,p=this.g.player;
    if(b.status==='dead'&&this.phase!=='won')this.onDeath(b);
    if(p.status==='dead'&&this.phase!=='won'&&this.phase!=='lost')this.onDeath(p);
    if(this.phase==='won'||this.phase==='lost')return;
    if(this.phase==='intro') {
      // A timed, non-damaging creature reveal within the live cinematic.
      // Existing dust and ring particles, no pretend pre-rendered footage.
      if(!this.introBeat&&this.elapsed>=2.7){
        this.introBeat=true;
        this.g.dust(b.pos,2.0,20);
        this.g.fx.ring({p:[b.pos[0],b.pos[1]+.12,b.pos[2]],n:[0,1,0],
          r0:1.6,r1:7.4,life:1.1,w:.24,c:[.9,.57,.32,.52]});
      }
      if(this.elapsed>=BOSS_WAY_INTRO_SECONDS)this.skipIntro();
      return;
    }
    b.dmgFlash=Math.max(0,(b.dmgFlash||0)-dt*2.4);
    const dx=p.pos[0]-b.pos[0],dz=p.pos[2]-b.pos[2];
    const dist=Math.hypot(dx,dz),angle=Math.atan2(dx,dz);
    b.yaw+=clamp(wrapPi(angle-b.yaw),-dt*2.0,dt*2.0);
    b.targetYaw=b.yaw;
    if(this.phase==='windup') {
      this.attackTimer-=dt;
      if(this.attackTimer<=0) {
        this.impact();
        this.phase='recover';
        this.recover=this.attack.recover;
      }
      return;
    }
    if(this.phase==='recover') {
      this.recover-=dt;
      if(this.recover<=0){this.phase='hunt';this.attack=null;}
      return;
    }
    // Massive but mobile boss: chase the player without walking through the
    // authored cover pillars, and stay far enough away for saber collisions.
    if(dist>3.0&&dist<110) { // enlarged arena: boss closes the distance instead of idling at spawn
      const rage=(BOSS_WAY_BARS-bossWayStage(b.hp))/BOSS_WAY_BARS;
      const speed=clamp(1.9+rage*1.55,1.9,3.5);
      const next=[b.pos[0]+dx/(dist||1)*speed*dt,b.pos[1],
        b.pos[2]+dz/(dist||1)*speed*dt];
      this.g.world.collide(next,b.radius);
      b.vel=[(next[0]-b.pos[0])/dt,0,(next[2]-b.pos[2])/dt];
      b.pos[0]=next[0];b.pos[2]=next[2];
      const ground=this.g.world.floorAt(b.pos[0],b.pos[2],b.pos[1]+2);
      if(ground!=null)b.pos[1]=ground;
    } else b.vel=[0,0,0];
    if(dist<9.5)this.chooseAttack(dist);
  }

  skipIntro() {
    if(this.phase!=='intro')return false;
    this.phase='hunt';this.elapsed=BOSS_WAY_INTRO_SECONDS;
    this.g.hud.msg(this.bossName+' unleashed! · Strike carefully and use the ruins for cover');
    return true;
  }

  restart() {
    const g=this.g,b=this.boss;
    this.phase='intro';this.elapsed=0;this.introBeat=false;this.attack=null;this.attackTimer=0;
    this.recover=2.3;this.sequence=0;this.stage=BOSS_WAY_BARS;this.stageBreaks=[];
    this.reward=null;
    b.revive(this.bossSpawn);b.hp=b.maxHp=BOSS_WAY_TOTAL_HP;
    b.pos=this.bossSpawn.slice();b.spawn=this.bossSpawn.slice();
    b.status='normal';b.radius=2.05;b.yaw=b.targetYaw=Math.PI;
    g.force.reset();g.clearTargetLock();
    g.player.revive(g.playerSpawn);
    g.player.yaw=g.player.targetYaw=g.cam.yaw=0;
    g.cam.pitch=.2;
    g.readySaber(g.player);
    g.combat.wound?.clear();g.combat.pair?.clear();g.combat.bolts.length=0;
    g.hud.msgs.length=0;g.hud.msg('Boss Way restarted · '+this.bossName+' 50,000 HP');
  }

  drawWorld() {
    if(this.boss.status!=='dead') {
      const revealing=this.phase==='intro'&&this.elapsed>=2.1&&this.elapsed<4.3;
      this.visual.draw(this.boss,revealing?{state:'windup',attack:{id:'roar'}}:
        {state:this.phase,attack:this.attack},this.g.t);
    }
    if(this.phase==='windup'&&this.attack) {
      const b=this.boss,a=this.attack,progress=clamp(this.attackTimer/a.windup,0,1);
      this.g.fx.ring({p:[b.pos[0],.10,b.pos[2]],n:[0,1,0],
        r0:a.range*(.65+(.3*(1-progress))),r1:a.range,
        life:.06,w:.13,c:[1,.32,.13,.45]});
    }
  }

  drawHUD(x,W,H) {
    const b=this.boss,values=bossWayBars(b.hp),width=Math.min(480,W-40);
    const bx=(W-width)/2,by=22,gap=3,h=8;
    x.save();
    x.fillStyle='rgba(9,9,12,.87)';x.fillRect(bx-14,by-10,width+28,167);
    x.textAlign='center';x.textBaseline='top';x.font='800 17px system-ui,sans-serif';
    x.fillStyle='#ffd0ad';x.fillText('BOSS WAY · '+this.bossName.toUpperCase(),W/2,by-3);
    x.font='700 12px system-ui,sans-serif';x.fillStyle='#f7e7d5';
    x.fillText(pretty(b.hp)+' / '+pretty(BOSS_WAY_TOTAL_HP)+' HP · '+bossWayStage(b.hp)+' OF 10 BARS',W/2,by+23);
    for(let i=9;i>=0;i--){
      const idx=9-i,row=idx>=5?1:0,col=idx%5;
      const sw=(width-4*gap)/5,sx=bx+col*(sw+gap),sy=by+48+row*21;
      const fraction=values[i];
      x.fillStyle='rgba(90,41,33,.9)';x.fillRect(sx,sy,sw,h);
      x.fillStyle=idx>=5?'#d37340':'#c64637';x.fillRect(sx,sy,sw*fraction,h);
      x.strokeStyle=idx===10-bossWayStage(b.hp)?'#ffd8a0':'#6a4437';
      x.lineWidth=1;x.strokeRect(sx+.5,sy+.5,sw-1,h-1);
      x.fillStyle='#d6bfb0';x.font='10px system-ui,sans-serif';
      x.fillText((i+1)+' · '+pretty(Math.round(fraction*BOSS_WAY_HP_PER_BAR)),sx+sw/2,sy+10);
    }
    x.fillStyle='#e5beb0';x.font='600 11px system-ui,sans-serif';
    x.fillText(this.bossName==='Dragon'?'Dragon · authored GLB rig · shader flame VFX':this.visual.source==='owner-converted-glb'?'Owner-supplied creature mesh':'Temporary creature mesh · original Rancor model missing',W/2,by+100);
    if(this.phase==='windup'&&this.attack){
      x.fillStyle='#ffc173';x.font='800 17px system-ui,sans-serif';
      x.fillText(this.attack.label.toUpperCase(),W/2,by+121);
    }
    if(this.phase==='intro'){
      x.fillStyle='#f3c48b';x.font='800 16px system-ui,sans-serif';
      x.fillText('THE '+this.bossName.toUpperCase()+' AWAKENS',W/2,by+121);
      x.fillStyle='rgba(7,8,12,.73)';x.fillRect(0,H-59,W,59);
      x.textAlign='center';x.fillStyle='#f8e2be';x.font='700 17px system-ui,sans-serif';
      x.fillText('BOSS WAY · THE '+this.bossName.toUpperCase()+' PIT',W/2,H-49);
      x.fillStyle='#d6d3cf';x.font='11px system-ui,sans-serif';
      x.fillText('Live cinematic · ENTER / SPACE / CLICK to skip',W/2,H-24);
    }
    if(this.phase==='won'||this.phase==='lost') {
      const won=this.phase==='won',px=W/2,py=H*.40;
      x.fillStyle='rgba(4,6,11,.84)';x.fillRect(px-235,py-70,470,172);
      x.font='900 32px system-ui,sans-serif';
      x.fillStyle=won?'#f9d180':'#ff9b89';
      x.fillText(won?this.bossName.toUpperCase()+' DEFEATED':'EVENT FAILED',px,py-42);
      x.font='600 14px system-ui,sans-serif';x.fillStyle='#eae7df';
      x.fillText(won?'50,000 HP defeated · 10 bars cleared':'The '+this.bossName+' has defeated you',px,py+3);
      x.font='12px system-ui,sans-serif';x.fillStyle='#bdb7aa';
      x.fillText(won?'Loot hook reserved · rewards not enabled yet':'Try another strategy · evade its telegraphed attacks',px,py+32);
      x.fillStyle='#f5dfae';x.fillText('Press ENTER to retry · ESC for Main Menu',px,py+63);
    }
    x.restore();
  }
}
