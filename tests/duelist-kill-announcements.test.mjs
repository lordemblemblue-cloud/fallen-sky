import test from 'node:test';
import assert from 'node:assert/strict';
import {createMatch,stepMatch} from '../src/components/duelist/sim/match.mjs';
import {respawnFighter} from '../src/components/duelist/sim/world.mjs';
import {recordKill,resetKillChain,killAnnouncement,MULTI_KILL_WINDOW} from '../src/components/duelist/core/killAnnouncements.mjs';
import {createHudFeed,KILL_BANNER_SECONDS} from '../src/components/duelist/client/hudFeed.mjs';
const ctx={me:'hero',nameOf:id=>id};
test('life streak thresholds, exact rapid window and death reset',()=>{
  const seat={};resetKillChain(seat);
  assert.deepEqual(recordKill(seat,1),{streak:1,multiKill:1});
  assert.deepEqual(recordKill(seat,1+MULTI_KILL_WINDOW),{streak:2,multiKill:2});
  assert.deepEqual(recordKill(seat,1+2*MULTI_KILL_WINDOW+.01),{streak:3,multiKill:1});
  assert.equal(killAnnouncement(3,1).text,'KILLING SPREE');
  assert.deepEqual(killAnnouncement(3,3),{text:'TRIPLE KILL',subtitle:'KILLING SPREE'});
  assert.equal(killAnnouncement(7,1).text,'UNSTOPPABLE');
  assert.equal(killAnnouncement(12,1).text,'GODLIKE');
  resetKillChain(seat);
  assert.deepEqual(recordKill(seat,30),{streak:1,multiKill:1});
});
test('server counts are preferred after joining/reconnecting; objective and kill notices coexist',()=>{
  const feed=createHudFeed();
  feed.event({type:'defeat',by:'hero',who:'enemy',streak:12,multiKill:1,at:45},100,ctx);
  assert.equal(feed.banners(100).kill.text,'GODLIKE');
  feed.event({type:'flagTaken',team:'red',by:'hero'},100.1,ctx);
  assert.ok(feed.banners(100.2).objective);
  assert.equal(feed.banners(100.2).kill.text,'GODLIKE');
  assert.equal(feed.banners(100+KILL_BANNER_SECONDS+.01).kill,null);
  feed.event({type:'defeat',by:null,who:'hero'},104,ctx);
  assert.equal(feed.streakOf('hero'),0);
  feed.event({type:'defeat',by:'hero',who:'hero'},105,ctx);
  assert.equal(feed.banners(105).kill,null);
});
test('actual practice match defeat events carry authoritative kill counts, not input claims',()=>{
  const m=createMatch({mode:'practice',players:[{id:'hero',classId:'duelist'},{id:'enemy',classId:'duelist'}],seats:2});
  m.phase='live';
  const dt=1/60;
  function eliminate(by,who){
    respawnFighter(m.world,by,{x:0,z:0,yaw:0});
    const target=respawnFighter(m.world,who,{x:0,z:1,yaw:Math.PI});
    target.vitals.hp=1;target.vitals.will=0;target.vitals.shield=0;target.vitals.collapsed=true;
    const events=[];
    for(let i=0;i<100;i++){
      const out=stepMatch(m,dt,{[by]:{face:0,presses:i===0?['light']:[],streak:999,multiKill:999},[who]:{}});
      events.push(...out.events);
      const death=events.find(e=>e.type==='defeat'&&e.who===who);
      if(death)return death;
    }
    assert.fail('authoritative hit did not defeat target');
  }
  let e=eliminate('hero','enemy');
  assert.equal(e.streak,1);assert.equal(e.multiKill,1);
  e=eliminate('hero','enemy');
  assert.equal(e.streak,2);assert.equal(e.multiKill,2);
  e=eliminate('enemy','hero');
  assert.equal(e.streak,1);assert.equal(m.seats.get('hero').killStreak,0);
  e=eliminate('hero','enemy');
  assert.equal(e.streak,1);assert.equal(e.multiKill,1);
});
