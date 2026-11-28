import test from 'node:test';
import assert from 'node:assert/strict';
import {formatNgPlusLevel} from '../src/components/game3d/narrative/ngPlusLevelDisplay.mjs';

function runCases(check,eq,throws){
  const fmt=formatNgPlusLevel;
  check('base level 1',()=>eq(fmt(1,0).text,'1'));
  check('base level 155 unchanged',()=>eq(fmt(155,0).text,'155'));
  check('base uses existing style semantic token',()=>eq(fmt(155,0).styleToken,'character-level-default'));
  check('base accessible label',()=>eq(fmt(155,0).accessibleLabel,'Level 155'));
  check('base no cycle label',()=>eq(fmt(155,0).cycleLabel,null));
  check('base not NG+',()=>eq(fmt(155,0).isNgPlus,false));
  check('NG+ entry retains 155',()=>eq(fmt(155,1).text,'155+'));
  check('below-cap entry hypothetical retains 87',()=>eq(fmt(87,1).text,'87+'));
  for(let level=155;level<=310;level++)check('actual earned level '+level,()=>eq(fmt(level,1).text,level+'+'));
  for(const cycle of [1,2,5,10,99,Number.MAX_SAFE_INTEGER,'9007199254740993','99999999999999999999999999999999999999']){
    check('single suffix cycle '+cycle,()=>eq(fmt(155,cycle).text,'155+'));
    check('separate exact cycle label '+cycle,()=>eq(fmt(155,cycle).cycleLabel,'New Game +'+cycle));
    check('NG+ semantic blue style '+cycle,()=>eq(fmt(155,cycle).styleToken,'character-level-ngplus'));
    check('NG+ accessible label '+cycle,()=>eq(fmt(155,cycle).accessibleLabel,'Level 155, New Game Plus, cycle '+cycle));
  }
  check('no arithmetic from cycle',()=>eq(fmt(200,99).text,'200+'));
  check('formatter does not invent permanent ceiling',()=>eq(fmt(311,2).text,'311+'));
  check('formatter does not act as progression authority',()=>eq(fmt(200,0).text,'200'));
  check('canonical decimal zero',()=>eq(fmt(155,'0').text,'155'));
  check('canonical decimal one',()=>eq(fmt(155,'1').text,'155+'));
  check('no modification of supplied earned progression',()=>{const p=Object.freeze({level:155,xp:1234,cycle:1});fmt(p.level,p.cycle);eq(p.level,155);eq(p.xp,1234);eq(p.cycle,1)});
  check('immutable detached output',()=>eq(Object.isFrozen(fmt(155,1)),true));
  check('repeat output deterministic',()=>eq(JSON.stringify(fmt(200,3)),JSON.stringify(fmt(200,3))));
  check('serialized input round trip',()=>{const p=JSON.parse(JSON.stringify({level:310,cycle:'9007199254740993'}));eq(fmt(p.level,p.cycle).text,'310+');eq(fmt(p.level,p.cycle).cycleLabel,'New Game +9007199254740993')});
  check('no input coercion hooks',()=>{let called=false;throws(()=>fmt(155,{toString(){called=true;return '1'}}));eq(called,false)});
  for(const level of [0,-1,1.5,NaN,Infinity,Number.MAX_SAFE_INTEGER+1,'155',null,undefined,true,{}])
    check('invalid level '+String(level),()=>throws(()=>fmt(level,1)));
  for(const cycle of [-1,1.5,NaN,Infinity,Number.MAX_SAFE_INTEGER+1,'01','-1','1.0','1e2',' 1','1+','',null,undefined,true,{},'1'.repeat(129)])
    check('invalid cycle '+String(cycle),()=>throws(()=>fmt(155,cycle)));
}
test('isolated NG+ display formatting',()=>runCases((name,fn)=>{try{fn()}catch(error){throw new Error(name,{cause:error})}},assert.equal,assert.throws));
