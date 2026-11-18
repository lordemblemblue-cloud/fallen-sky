// A separate, local-only dragon event using the existing Boss Way arena,
// real Fighter hit points, Game 2 damage/collision and the existing ten-bar HUD.
// The commercial Rancor mechanics preview remains untouched.
import { clamp, wrapPi } from '../math.js';
import { BossWay, BOSS_WAY_INTRO_SECONDS, BOSS_WAY_TOTAL_HP } from './bossWay.js';

export const DRAGON_ATTACKS = Object.freeze([
  { id: 'breath', label: 'INFERNO · BREAK LINE OF SIGHT!', windup: 1.45, recover: 1.15, range: 23, arc: 0.7, damage: 13 },
  { id: 'grab', label: 'CRUSHING GRAB · EVADE!', windup: 1.55, recover: 1.75, range: 4.1, arc: 1.5, damage: 0 },
  { id: 'leap', label: 'SKYFALL · CLEAR THE LANDING ZONE!', windup: 1.3, recover: 1.8, range: 9, arc: 6.283, damage: 34 },
  { id: 'summon', label: 'DRAGON BROOD · MINIONS INCOMING!', windup: 1.1, recover: 1.6, range: 0, arc: 0, damage: 0 },
  { id: 'sweep', label: 'WING SWEEP · DODGE!', windup: 0.95, recover: 1.3, range: 5.4, arc: 2.5, damage: 21 },
]);

const flatDist = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);
const forward = yaw => [Math.sin(yaw), 0, Math.cos(yaw)];
const MAX_MINIONS = 4;

// Boss physics remain authoritative in the fixed 60 Hz Game.step loop;
// shaders/3D rigs read this state but cannot apply damage themselves.
export class DragonBossWay extends BossWay {
  constructor(g) {
    super(g);
    this.bossName = 'Dragon';
    this.boss.label = 'Infernal Dragon';
    this.boss.name = 'boss_way_dragon';
    this.boss.kind = 'dragon';
    this.boss.isDragonBoss = true;
    this.boss.chest = () => [this.boss.pos[0], this.boss.pos[1] + 2.6, this.boss.pos[2] + .2];
    this.boss.headPos = () => [this.boss.pos[0], this.boss.pos[1] + 4.3, this.boss.pos[2] + 1.6];
    this.minions = [];
    this.airTimer = 0;
    this.flightOrigin = this.boss.pos.slice();
    this.flightTarget = this.boss.pos.slice();
    this.breathTimer = 0;
    this.fireTick = 0;
    this.grabTimer = 0;
    this.grabbedPlayer = false;
    this.nextSummonAt = 14;
    this.attack = null;
  }
  onDeath(f) {
    if (f.isDragonMinion) return; // Minion deaths do not complete the boss event.
    super.onDeath(f);
    if (f === this.boss && this.phase === 'won') {
      this.reward = { eventId:'boss_way_dragon_v1', boss:'dragon', eligible:!this.g.bossPreview, state:'not-integrated', claimed:false, loot:[] };
      this.g.hud.banner('DRAGON DEFEATED!', [1, .67, .25], 2.5);
      for (const m of this.minions) if (m.status !== 'dead') m.hurt(m.hp + 999, this.g.player, { noFlinch: true });
    }
  }
  chooseAttack(distance) {
    const maySummon = this.elapsed >= this.nextSummonAt && this.minions.filter(m => m.status !== 'dead').length <= MAX_MINIONS - 2;
    const pool = maySummon ? ['summon'] : distance < 4.7
      ? ['grab','sweep','leap','breath'] : distance < 13 ? ['breath','leap','sweep'] : ['breath','leap'];
    const id = pool[this.sequence++ % pool.length];
    this.attack = DRAGON_ATTACKS.find(a => a.id === id);
    this.attackTimer = this.attack.windup;
    this.phase = 'windup';
    this.g.hud.msg('DRAGON: ' + this.attack.label);
    this.g.sfxAt(id === 'breath' ? 'swing2' : 'swing1', this.boss.pos, .8);
  }
  canHit(p, range, arc = Math.PI * 2, cover = true, from = this.boss.pos) {
    if (p.status === 'dead' || p.dodge || p.spawnShield > this.g.t) return false;
    const distance = flatDist(from, p.pos);
    const yaw = Math.atan2(p.pos[0] - from[0], p.pos[2] - from[2]);
    return distance <= range && Math.abs(wrapPi(yaw - this.boss.yaw)) <= arc / 2
      && (!cover || this.g.world.lineOfSight(this.boss.headPos(), p.chest()));
  }
  applyDamage(amount, from = this.boss) {
    const p = this.g.player;
    if (p.status === 'dead') return false;
    const was = p.hp;
    p.hurt(amount, from, { noFlinch:true });
    if (p.hp < was) { this.g.hud.hit(was - p.hp); this.g.shake(.13); }
    return p.hp < was;
  }
  // Breath is continuous, checked repeatedly against real line of sight, not
  // an unconditional screen-wide damage pulse. The GPU fire is visual only.
  tickBreath(dt) {
    this.breathTimer -= dt;
    this.fireTick -= dt;
    if (this.fireTick <= 0) {
      this.fireTick += .33;
      if (this.canHit(this.g.player, 23, .72, true)) this.applyDamage(13);
    }
    if (this.breathTimer <= 0) { this.phase = 'recover'; this.recover = 1.2; this.attack = null; }
  }
  moveBoss(dt, maxSpeed = 3.15) {
    const b = this.boss, p = this.g.player, dist = flatDist(b.pos, p.pos);
    if (dist < 4.5) return;
    const dx = (p.pos[0] - b.pos[0]) / dist, dz = (p.pos[2] - b.pos[2]) / dist;
    const next = [b.pos[0] + dx * maxSpeed * dt, b.pos[1], b.pos[2] + dz * maxSpeed * dt];
    this.g.world.collide(next, b.radius);
    const ground = this.g.world.floorAt(next[0], next[2], next[1] + 2);
    if (ground !== null) next[1] = ground;
    b.vel = [(next[0] - b.pos[0]) / dt, 0, (next[2] - b.pos[2]) / dt];
    b.pos = next;
  }
  takeOff() {
    this.flightOrigin = this.boss.pos.slice();
    const p = this.g.player;
    // Land in a nearby open area inside the physical arena. No wall teleport.
    const target = [clamp(p.pos[0] - Math.sin(this.boss.yaw) * 5, -38, 38),
      p.pos[1], clamp(p.pos[2] - Math.cos(this.boss.yaw) * 5, -39, 47)];
    this.g.world.collide(target, this.boss.radius);
    const floor = this.g.world.floorAt(target[0], target[2], target[1] + 3);
    this.flightTarget = [target[0], floor ?? p.pos[1], target[2]];
    this.phase = 'takeoff'; this.airTimer = 0;
  }
  // Takeoff -> cruise -> targeted landing; height is a real world position.
  tickFlight(dt) {
    this.airTimer += dt;
    const b = this.boss;
    const origin = this.flightOrigin, target = this.flightTarget;
    if (this.phase === 'takeoff') {
      const t = clamp(this.airTimer / 1.9, 0, 1);
      b.pos[1] = origin[1] + 14 * t * t * (3 - 2 * t);
      if (t >= 1) { this.phase = 'airborne'; this.airTimer = 0; }
    } else if (this.phase === 'airborne') {
      const t = clamp(this.airTimer / 2.3, 0, 1);
      b.pos[0] = origin[0] + (target[0] - origin[0]) * t;
      b.pos[2] = origin[2] + (target[2] - origin[2]) * t;
      b.pos[1] = origin[1] + 14 + Math.sin(this.airTimer * 5) * .45;
      if (this.airTimer >= 2.3) { this.phase = 'landing'; this.airTimer = 0; }
    } else if (this.phase === 'landing') {
      const t = clamp(this.airTimer / 1.25, 0, 1);
      b.pos[1] = origin[1] + 14 + (target[1] - origin[1] - 14) * (t*t*(3-2*t));
      if (t >= 1) {
        b.pos = target.slice(); this.phase = 'recover'; this.recover = 2.0;
        const p=this.g.player;
        if (flatDist(p.pos, b.pos) < 9 && p.pos[1] - b.pos[1] < 1.6 && !p.dodge) this.applyDamage(34);
        this.g.fx.ring({ p:[b.pos[0],b.pos[1]+.15,b.pos[2]], n:[0,1,0], r0:1.1,r1:9,life:.5,w:.22,c:[1,.35,.08,.7] });
        this.g.shake(.65); this.g.sfxAt('wall3',b.pos,.9);
      }
    }
  }
  summonMinions() {
    const g = this.g, b = this.boss;
    let count = 0;
    for (let i = 0; i < 2; i++) {
      if (this.minions.filter(m => m.status !== 'dead').length >= MAX_MINIONS) break;
      const side = i ? -1 : 1, x = b.pos[0] + side * 4.3, z = b.pos[2] - 2.3;
      const place = [x, b.pos[1], z];
      g.world.collide(place, .8);
      const floor = g.world.floorAt(place[0],place[2],place[1]+2);
      if (floor !== null) place[1] = floor;
      const m = g.addNpc('rancor', place[0], place[2], {
        name: 'dragon_brood_' + this.sequence + '_' + i, label:'Dragon Whelp', team:'enemy',
        hp:250, saber:false,gun:false,yaw:b.yaw,blockSkill:0,dmgScale:1,
      });
      m.pos = place; m.spawn = place.slice(); m.radius=.82; m.isDragonMinion=true;
      m.gun=false; m.nextFlame = g.t + 2.5 + i * .7;
      m.chest = () => [m.pos[0], m.pos[1] + .9, m.pos[2]];
      this.minions.push(m); count++;
    }
    this.nextSummonAt = this.elapsed + 23;
    g.hud.msg(count + ' dragon whelps enter the arena');
  }
  updateMinions(dt) {
    const g=this.g,p=g.player;
    for (const m of this.minions) {
      if (m.status==='dead') continue;
      const dist=flatDist(m.pos,p.pos), yaw=Math.atan2(p.pos[0]-m.pos[0],p.pos[2]-m.pos[2]);
      m.yaw += clamp(wrapPi(yaw-m.yaw),-dt*2.5,dt*2.5);m.targetYaw=m.yaw;
      if (dist > 5 && dist < 90) {
        const next=[m.pos[0]+Math.sin(yaw)*dt*3.6,m.pos[1],m.pos[2]+Math.cos(yaw)*dt*3.6];
        g.world.collide(next,m.radius);
        const floor=g.world.floorAt(next[0],next[2],next[1]+2);
        if (floor!==null) next[1]=floor;
        m.pos=next;
      }
      if (g.t >= m.nextFlame && dist < 11 && g.world.lineOfSight(m.chest(),p.chest())) {
        m.flameUntil=g.t+.9; m.nextFlame=g.t+4.8;
      }
      if (m.flameUntil>g.t && !p.dodge && dist<10 && Math.abs(wrapPi(yaw-m.yaw))<.55) {
        m.flameTick ??= 0;
        m.flameTick -= dt;
        if(m.flameTick<=0){m.flameTick=.45;this.applyDamage(5,m);}
      } else m.flameTick=0;
    }
  }
  impact() {
    const a=this.attack,b=this.boss,p=this.g.player;
    if(!a || b.status==='dead')return false;
    if(a.id==='breath'){
      this.phase='breathing';this.breathTimer=3;this.fireTick=0;return true;
    }
    if(a.id==='leap'){this.takeOff();return true;}
    if(a.id==='summon'){this.summonMinions();return true;}
    if(a.id==='grab'){
      if(!this.canHit(p,a.range,a.arc,true))return false;
      this.phase='crushing';this.grabTimer=.65;this.grabbedPlayer=true;
      this.g.hud.banner('CAUGHT IN THE DRAGON\'S CLAW', [1,.3,.13], .8);return true;
    }
    if(a.id==='sweep'){
      if(this.canHit(p,a.range,a.arc,true))return this.applyDamage(a.damage);
      return false;
    }
    return false;
  }
  update(dt) {
    const b=this.boss,p=this.g.player;
    if(b.status==='dead'){if(this.phase!=='won')this.onDeath(b);return;}
    if(p.status==='dead'){if(this.phase!=='lost'&&this.phase!=='won')this.onDeath(p);return;}
    if(this.phase==='won'||this.phase==='lost')return;
    if(this.phase==='intro'){super.update(dt);return;}
    this.elapsed+=dt;
    this.updateMinions(dt);
    const dx=p.pos[0]-b.pos[0],dz=p.pos[2]-b.pos[2];
    b.yaw += clamp(wrapPi(Math.atan2(dx,dz)-b.yaw),-2*dt,2*dt);
    b.targetYaw=b.yaw;
    if(['takeoff','airborne','landing'].includes(this.phase)){this.tickFlight(dt);return;}
    if(this.phase==='crushing'){
      this.grabTimer-=dt;
      const d=forward(b.yaw);
      p.pos[0]=b.pos[0]+d[0]*2.1+Math.cos(b.yaw)*1.4;
      p.pos[1]=b.pos[1]+3.2;
      p.pos[2]=b.pos[2]+d[2]*2.1-Math.sin(b.yaw)*1.4;
      p.vel=[0,0,0];p.cmd.fwd=p.cmd.right=0;
      if(this.grabTimer<=0) {
        // Explicitly lethal after a clearly telegraphed, confirmed grab.
        this.applyDamage(Math.max(1000,p.maxHp*10));
        this.grabbedPlayer=false;
        if(this.phase!=='lost'&&this.phase!=='won'){this.phase='recover';this.recover=1.7;}
      }
      return;
    }
    if(this.phase==='breathing'){this.tickBreath(dt);return;}
    if(this.phase==='windup'){
      this.attackTimer-=dt;
      if(this.attackTimer<=0) {
        const executed=this.impact();
        if(this.phase==='windup'){this.phase='recover';this.recover=this.attack.recover;}
        if(executed)this.g.sfxAt('hit3',b.pos,.8);
      }return;
    }
    if(this.phase==='recover'){this.recover-=dt;if(this.recover<=0){this.phase='hunt';this.attack=null;}return;}
    this.moveBoss(dt);
    if(flatDist(b.pos,p.pos)<30)this.chooseAttack(flatDist(b.pos,p.pos));
  }
  skipIntro(){
    if(this.phase!=='intro')return false;
    this.phase='hunt';this.elapsed=BOSS_WAY_INTRO_SECONDS;
    this.g.hud.msg('The Infernal Dragon awakens! Dodge the claw, fire and skyfall.');
    return true;
  }
  restart() {
    super.restart();
    this.phase='intro';this.attack=null;this.airTimer=0;this.breathTimer=0;this.grabTimer=0;this.grabbedPlayer=false;this.nextSummonAt=14;
    for(const m of this.minions) this.g.removeNpc(m);
    this.minions.length=0;this.boss.kind='dragon';this.boss.label='Infernal Dragon';
    this.g.hud.msg('Infernal Dragon restored · '+ BOSS_WAY_TOTAL_HP.toLocaleString() +' HP');
  }
  // Three.js renders the actual supplied dragon and its offspring on the
  // transparent companion layer. Never show the old Rancor proxy in real mode.
  drawWorld() {
    if(this.phase==='windup'&&this.attack){
      const a=this.attack,b=this.boss;
      if(a.id==='leap'||a.id==='grab')
        this.g.fx.ring({p:[b.pos[0],b.pos[1]+.14,b.pos[2]],n:[0,1,0],r0:1,r1:a.range,life:.05,w:.12,c:[1,.33,.08,.45]});
    }
  }
  drawHUD(x,W,H) {
    // Reuse the original ten physical health bars, avoiding a second UI
    // implementation. The base HUD reads this.bossName when present.
    super.drawHUD(x,W,H);
  }
}
