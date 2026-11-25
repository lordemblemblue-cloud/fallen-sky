import test from 'node:test';
import assert from 'node:assert/strict';
import {createMatch,joinMatch,matchView,stepMatch,purchaseMatchItem,sellPracticeItem,setPracticeOption} from '../src/components/duelist/sim/match.mjs';
import {SHOP_ITEMS,SHOP_RULES} from '../src/components/duelist/core/shop.mjs';
import {classById} from '../src/components/duelist/core/classes.mjs';
import {DEFAULT_PUBLIC_ROOMS,QUICKPLAY_MODES} from '../src/components/duelist/net/protocol.mjs';
import {createLocalSource} from '../src/components/duelist/client/localSource.mjs';

test('practice players buy, sell and repeat real equipment without spending their training balance',()=>{
  const m=createMatch({mode:'practice',practiceMode:true,players:[{id:'a',classId:'healer'}],seats:2});
  const item=SHOP_ITEMS[0];
  assert.equal(matchView(m,'a').me.unlimitedGold,true);
  assert.equal(purchaseMatchItem(m,'a',item.id,3).ok,true);
  assert.equal(m.world.fighters.get('a').items[0].id,item.id);
  assert.equal(sellPracticeItem(m,'a',item.id).ok,true);
  assert.equal(m.world.fighters.get('a').items.length,0);
  assert.equal(purchaseMatchItem(m,'a',item.id,3).ok,true);
  assert.equal(matchView(m,'a').me.gold,SHOP_RULES.goldCap);
  assert.equal(sellPracticeItem(m,'unknown',item.id).ok,false);
});
test('shared practice seats own independent switches; competitive seats reject training actions',()=>{
  const m=createMatch({mode:'practice',practiceMode:true,players:[{id:'a',classId:'duelist'}]});
  assert.equal(joinMatch(m,{id:'b',classId:'healer'}).ok,true);
  assert.equal(setPracticeOption(m,'a','noCooldowns',false),true);
  assert.equal(setPracticeOption(m,'a','unlimitedUltimate',false),true);
  assert.equal(matchView(m,'a').me.training.noCooldowns,false);
  assert.equal(matchView(m,'a').me.specialMeter,0);
  assert.equal(matchView(m,'b').me.training.noCooldowns,true);
  assert.equal(matchView(m,'b').me.specialMeter,100);
  assert.equal(setPracticeOption(m,'a','invalid',true),false);
  const normal=createMatch({mode:'duel',players:[{id:'a',classId:'duelist'}]});
  assert.equal(setPracticeOption(normal,'a','unlimitedUltimate',true),false);
  assert.equal(sellPracticeItem(normal,'a',SHOP_ITEMS[0].id).ok,false);
  assert.equal(matchView(normal,'a').me.unlimitedGold,undefined);
  assert.equal(matchView(normal,'a').me.gold,SHOP_RULES.startingGold);
});
test('cooldown bypass is restricted to abilities; disabling it preserves normal timers',()=>{
  const m=createMatch({mode:'practice',practiceMode:true,players:[{id:'a',classId:'duelist'}],seats:1});
  m.phase='live';
  const f=m.world.fighters.get('a'),ability=classById('duelist').abilities[0].id;
  f.cooldowns[ability]=100;f.cooldowns.roll=100;
  stepMatch(m,1/60,{});
  assert.equal(f.cooldowns[ability],undefined);
  assert.equal(f.cooldowns.roll,100);
  assert.equal(f.meter,100);
  setPracticeOption(m,'a','noCooldowns',false);
  f.cooldowns[ability]=100;
  stepMatch(m,1/60,{});
  assert.equal(f.cooldowns[ability],100);
});
test('local training launch enables options while standard offline battles remain unchanged',()=>{
  assert.equal(createLocalSource({mode:'practice',bots:0}).view().me.unlimitedGold,true);
  assert.equal(createLocalSource({mode:'duel',practiceMode:true}).view().me.unlimitedGold,true);
  assert.equal(createLocalSource({mode:'duel'}).view().me.unlimitedGold,undefined);
  assert.equal(DEFAULT_PUBLIC_ROOMS.find(r=>r.mode==='practice').id,'m8');
  assert.equal(QUICKPLAY_MODES.includes('practice'),false);
});

test('saved settings control initial local resources and finite training gold',()=>{
  const source=createLocalSource({mode:'practice',bots:0,classId:'duelist',practiceSettings:{unlimitedGold:false,unlimitedWill:false,noCooldowns:false,unlimitedUltimate:false}});
  assert.equal(source.view().me.gold,SHOP_RULES.startingGold);
  assert.equal(source.view().me.training.noCooldowns,false);
  assert.equal(source.view().me.specialMeter,0);
  const item=SHOP_ITEMS[0];source.buyItem(item.id,1);
  assert.equal(source.shopAnswer.ok,true);
  assert.ok(source.view().me.gold<SHOP_RULES.startingGold);
  source.sellItem(item.id);
  assert.equal(source.view().me.gold,SHOP_RULES.startingGold);
});
test('resource and health restore only apply to enabled living training seats',()=>{
  const m=createMatch({mode:'practice',practiceMode:true,players:[{id:'a',classId:'duelist'}],seats:1});
  m.phase='live';const f=m.world.fighters.get('a');
  f.vitals.will=1;f.vitals.stamina=1;f.vitals.hp=1;
  assert.equal(setPracticeOption(m,'a','unlimitedStamina',true),true);
  assert.equal(setPracticeOption(m,'a','autoHeal',true),true);
  assert.equal(setPracticeOption(m,'a','autoHeal','true'),false);
  stepMatch(m,1/60,{});
  assert.equal(f.vitals.will,f.vitals.max.will);
  assert.equal(f.vitals.stamina,f.vitals.max.stamina);
  assert.equal(f.vitals.hp,f.vitals.max.hp);
  setPracticeOption(m,'a','autoHeal',false);
  f.vitals.hp=1;stepMatch(m,1/60,{});
  assert.ok(f.vitals.hp<f.vitals.max.hp);
  f.vitals.hp=0;f.vitals.dead=true;
  setPracticeOption(m,'a','autoHeal',true);stepMatch(m,1/60,{});
  assert.equal(f.vitals.dead,true);
});
