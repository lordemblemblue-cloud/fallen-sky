// Browser-only deterministic tutorial driver. It uses normal world inputs and a separate
// training match; the live match server never accepts a demonstration command.
import { demonstrationCatalog } from '../core/demonstrationCatalog.mjs';
import { SPECIAL_MAX, SPECIAL_BALANCE } from '../core/classes.mjs';
import { respawnFighter, bodyOf } from '../sim/world.mjs';
import { createBot, think } from '../sim/bots.mjs';

const empty = () => ({move:{x:0,z:0},presses:[]});
const dir = {forward:[0,1],back:[0,-1],left:[-1,0],right:[1,0],forwardLeft:[-1,1],forwardRight:[1,1],backLeft:[-1,-1],backRight:[1,-1],stand:[0,0]};
export function createPracticeDemonstration(match, selection) {
  const row = demonstrationCatalog(selection.classId).find(r=>r.id===selection.id && r.command);
  const enemy = [...match.seats.values()].find(s=>s.id!=='you');
  if (!match.training || match.mode!=='practice' || !row || !enemy || match.seats.get('you')?.classId!==selection.classId) throw new Error('Invalid local practice demonstration');
  const world=match.world, actor=match.seats.get('you');
  const distance = row.id==='execution'?3:row.id==='shadowExecution'?1.5:
    row.id==='leapStrike'?7:row.id==='bladeThrow'?6:row.command==='sprint'?10:
    row.group==='Movement'?8:1.5;
  const me=respawnFighter(world,'you',{x:0,z:-distance/2,yaw:0,protect:0});
  const foe=respawnFighter(world,enemy.id,{x:0,z:distance/2,yaw:row.id==='shadowExecution'?0:Math.PI,protect:0});
  actor.specialMeter=me.meter=SPECIAL_MAX;
  if(row.id==='execution') foe.vitals.hp=foe.vitals.max.hp*SPECIAL_BALANCE.duelistExecuteThreshold*.8;
  if(row.id==='mend'||row.id==='sanctuary') me.vitals.hp=me.vitals.max.hp*.45;
  if(row.id==='grip'||row.id==='resist') { const target=row.id==='grip'?foe:me; target.vitals.will=0;target.vitals.collapsed=true; }
  match.phase='live';
  const pilot=createBot('you',{level:'master',seed:11});
  let ticks=0, comboCount=0, previousAction=null;
  const fired=new Set();
  const once=(key,condition,input,command)=>{if(condition&&!fired.has(key)){fired.add(key);input.presses.push(command);}};
  return {
    enemyId:enemy.id,
    inputs() {
      const t=ticks++/60;
      if(row.command==='spar')return {you:think(world,pilot)};
      const a=empty(),b=empty(), f=world.fighters.get('you'), other=world.fighters.get(enemy.id);
      const p=bodyOf(world,'you'),q=bodyOf(world,enemy.id);
      if(!f||!other||!p||!q)return {you:a,[enemy.id]:b};
      a.face=Math.atan2(q.x-p.x,q.z-p.z);a.target=enemy.id;a.strafe=true;
      b.face=row.id==='shadowExecution'?0:Math.atan2(p.x-q.x,p.z-q.z);b.target='you';
      const cmd=row.command;
      if(cmd==='combo'){
        once('first',t>=.35,a,'light');
        if(f.action && f.action!==previousAction){previousAction=f.action;comboCount++;}
        const chain=f.action?.move?.chain;
        if(chain&&comboCount<4&&f.action.t>=chain.from+.015)once('chain'+comboCount,true,a,'light');
      }else if(cmd==='guard'||row.id==='counter'){
        once('enemyAttack',t>=.45,b,'heavy');
        once('defense',!!other.action&&other.action.t>=Math.max(0,other.action.move.startup-.10),a,cmd==='guard'?'blockDown':cmd);
        if(cmd==='guard')once('releaseGuard',t>=1.6,a,'blockUp');
      }else if(cmd==='doubleJump'||cmd==='airDash'){
        once('jump',t>=.35,a,'jump');
        once('air',p.jumped&&p.y>.5&&t>=.55,a,cmd==='doubleJump'?'jump':'dash');
      }else if(cmd==='sprint'){
        if(t>=.35&&t<1.5){a.move={x:1,z:0};a.run=true;a.sprint=true;}
      }else if(cmd==='directional'){
        const d=dir[row.direction]||[0,0];a.move={x:d[0],z:d[1]};
        once('cut',t>=.35,a,'light');
        if(fired.has('cut')&&t>.37)a.move={x:0,z:0};
      }else if(cmd==='resist'){
        // The practice target is deliberately breached; use the public resist command.
        if(!fired.has('resist')&&t>=.35){f.vitals.will=f.vitals.max.will;f.vitals.collapsed=false;f.breaches[enemy.id]=world.time+5;}
        once('resist',t>=.35,a,'resist');
      }else{
        if(cmd==='roll'||cmd==='dash')a.move=t<.37?{x:1,z:0}:{x:0,z:0};
        once('action',t>=.35,a,cmd);
        if(row.id==='grip')once('release',t>=1.1,a,'release');
        if(['rage','empower','quickstep','quickstepAura'].includes(row.id)){
          once('follow',t>=1.25&&!f.action,a,'light');
        }
        if(row.id==='sanctuary')once('incoming',t>=1.1,b,'heavy');
      }
      return {you:a,[enemy.id]:b};
    }
  };
}
