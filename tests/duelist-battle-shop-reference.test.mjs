import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {URL} from 'node:url';
import {SHOP_ITEMS,SHOP_RECIPES,SHOP_RULES,shopItem,purchaseRule,tierPrice,itemBonuses} from '../src/components/duelist/core/shop.mjs';
import {STAT_FILTERS,STATUS_FILTERS,filterShopItems,supportsStat,itemArt,buildsInto,recipeFor,shopQuote} from '../src/components/duelist/core/shopView.mjs';
import {createMatch,purchaseMatchItem,matchView,stepMatch} from '../src/components/duelist/sim/match.mjs';
import {DuelistRoomEngine} from '../src/components/duelist/net/actorRoomEngine.mjs';
import {PROTOCOL} from '../src/components/duelist/net/protocol.mjs';
import {bodyOf} from '../src/components/duelist/sim/world.mjs';
const source=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('all 50 catalog items have three standalone, distinct tier artworks',()=>{
 const all=new Set();
 for(const item of SHOP_ITEMS)for(const tier of [1,2,3]){
  const path=itemArt(item.id,tier);
  assert.ok(path);const svg=source('public'+path);
  assert.match(svg,/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  assert.match(svg,/viewBox="0 0 112 112"/);
  assert.match(svg,new RegExp('aria-label="'+item.id+' tier '+['','I','II','III'][tier]+'"'));
  assert.doesNotMatch(svg,/<script\b|\b(?:href|onload)\s*=/i);
  assert.ok(!all.has(svg));all.add(svg);
 }
 assert.equal(all.size,150);assert.equal(itemArt('../unsafe',1),null);assert.equal(itemArt('ironfang',4),null);
});

test('stat filters can combine ALL or ANY, independent of purchase status',()=>{
 const me={gold:500,items:[],canShop:true};
 const both=filterShopItems(me,{stats:['power','critChance']});
 assert.ok(both.some(x=>x.id==='ironfang'));assert.ok(!both.some(x=>x.id==='bloodrite'));
 assert.ok(both.every(x=>supportsStat(x,'power')&&supportsStat(x,'critChance')));
 assert.ok(filterShopItems(me,{stats:['power','critChance'],matchAll:false}).length>both.length);
 assert.ok(filterShopItems(me,{stats:['lifesteal']}).every(x=>x.passive.type==='lifesteal'));
 assert.ok(filterShopItems(me,{stats:['hpGain']}).some(x=>x.id==='radiantseed'));
 assert.ok(filterShopItems(me,{stats:['shieldGain']}).some(x=>x.id==='harborlantern'));
 assert.equal(filterShopItems(me,{statuses:['owned']}).length,0);
 const withOwned={...me,items:[{id:'ironfang',tier:1},{id:'bloodrite',tier:3}]};
 assert.deepEqual(filterShopItems(withOwned,{stats:['power','critChance'],statuses:['owned']}).map(x=>x.id),['ironfang']);
 assert.deepEqual(filterShopItems(withOwned,{statuses:['completed']}).map(x=>x.id),['bloodrite']);
 assert.deepEqual(filterShopItems(withOwned,{statuses:['upgradeable']}).map(x=>x.id),['ironfang']);
 assert.equal(new Set([...STAT_FILTERS,...STATUS_FILTERS].map(x=>x[0])).size,STAT_FILTERS.length+STATUS_FILTERS.length);
});

test('every item can be purchased at any higher tier atomically at exact cumulative price',()=>{
 for(const item of SHOP_ITEMS){
  for(const tier of [1,2,3]){
   const q=purchaseRule({gold:9999,items:[],id:item.id,targetTier:tier});
   assert.equal(q.ok,true,item.id);assert.equal(q.cost,tierPrice(item,tier));assert.deepEqual(q.items,[{id:item.id,tier}]);
   assert.equal(purchaseRule({gold:9999,items:q.items,id:item.id,targetTier:tier}).ok,false);
  }
  const q=purchaseRule({gold:9999,items:[{id:item.id,tier:1}],id:item.id,targetTier:3});
  assert.equal(q.cost,item.cost-tierPrice(item,1));assert.equal(q.tier,3);
 }
 for(const targetTier of [0,4,1.5,'3',null,Infinity])assert.equal(purchaseRule({gold:9999,items:[],id:'ironfang',targetTier}).ok,false);
 assert.equal(purchaseRule({gold:9999,items:[],id:'ironfang',targetTier:3,allowed:false}).reason,'shop-at-spawn');
 assert.equal(purchaseRule({gold:1,items:[],id:'ironfang',targetTier:3}).reason,'not-enough-gold');
 assert.equal(purchaseRule({gold:9999,items:[{id:'thundermirror',tier:1}],id:'siphonmirror',targetTier:3}).reason,'active-relic-slot-full');
});

test('ten real hybrid recipes consume exact Tier I components once, credit their paid gold and preserve inventory',()=>{
 assert.equal(Object.keys(SHOP_RECIPES).length,10);
 for(const [id,parts] of Object.entries(SHOP_RECIPES)){
  assert.deepEqual(recipeFor(id),parts);assert.ok(parts.every(part=>buildsInto(part).some(x=>x.id===id)));
  const items=parts.map(id=>({id,tier:1}));const saved=JSON.stringify(items);
  const q=purchaseRule({gold:9999,items,id,targetTier:3,combine:true});
  assert.equal(q.ok,true,id);assert.equal(q.cost,shopItem(id).cost-parts.reduce((n,p)=>n+tierPrice(shopItem(p),1),0));
  assert.deepEqual(q.items,[{id,tier:3}]);assert.equal(JSON.stringify(items),saved);
  assert.equal(purchaseRule({gold:9999,items:q.items,id,targetTier:3,combine:true}).ok,false);
  assert.equal(purchaseRule({gold:9999,items:[{id:parts[0],tier:2},items[1]],id,targetTier:3,combine:true}).reason,'missing-components');
  assert.equal(purchaseRule({gold:9999,items:[items[0],items[0],items[1]],id,targetTier:3,combine:true}).reason,'invalid-loadout');
  assert.equal(purchaseRule({gold:q.cost-1,items,id,targetTier:3,combine:true}).reason,'not-enough-gold');
  assert.equal(shopQuote({gold:9999,items,canShop:true},id,3,true).ok,true);
 }
 const full=[{id:'ironfang',tier:1},{id:'stoneguard',tier:1},...['runeweaver','heartseed','resolvecord','bloodrite'].map(id=>({id,tier:1}))];
 const result=purchaseRule({gold:9999,items:full,id:'vanguardfang',targetTier:3,combine:true});
 assert.equal(full.length,SHOP_RULES.slots);assert.equal(result.items.length,5);
 assert.equal(purchaseRule({gold:9999,items:full,id:'vanguardfang',targetTier:3}).reason,'inventory-full');
 assert.equal(purchaseRule({gold:9999,items:full,id:'ironfang',targetTier:3,combine:true}).reason,'invalid-recipe');
});

test('actual match atomically applies purchase, credits, passive and spawn restriction',()=>{
 const match=createMatch({mode:'practice',players:[{id:'hero',classId:'healer'}],seats:1});
 const seat=match.seats.get('hero');seat.gold=1200;
 assert.equal(purchaseMatchItem(match,'hero','ironfang',1).ok,true);
 assert.equal(purchaseMatchItem(match,'hero','stoneguard',1).ok,true);
 const before=seat.gold;
 const result=purchaseMatchItem(match,'hero','vanguardfang',3,true);
 assert.equal(result.ok,true);assert.equal(seat.gold,before-result.cost);
 assert.equal(match.world.fighters.get('hero').shopStats.passive.onKillShield,itemBonuses(result.items).passive.onKillShield);
 assert.deepEqual(matchView(match,'hero').me.items,[{id:'vanguardfang',tier:3}]);
 assert.equal(purchaseMatchItem(match,'hero','vanguardfang',3,true).ok,false);assert.equal(seat.gold,before-result.cost);
 assert.equal(purchaseMatchItem(match,'stranger','heartseed',3).ok,false);
 match.phase='live';bodyOf(match.world,'hero').x+=12;
 assert.equal(purchaseMatchItem(match,'hero','heartseed',3).reason,'shop-at-spawn');
 stepMatch(match,1/60,{});
});

test('Actor negotiates explicit tier protocol and refuses malformed or repeated purchase',()=>{
 const engine=new DuelistRoomEngine('m1',{clock:()=>10,idFactory:()=> '123456789012345678901234'});
 const messages=[];const conn={id:'hero',identity:'guest-hero',send:m=>messages.push(m),reject:()=>assert.fail('rejected')};
 engine.connect(conn);engine.message(conn,{t:'hello',v:PROTOCOL});
 assert.equal(messages.find(m=>m.t==='welcome').shopBuild,true);
 engine.message(conn,{t:'join',mode:'duel',matchId:'m1',cls:'healer'});
 const seat=engine.match.seats.get(messages.find(m=>m.t==='welcome').id);seat.gold=800;
 engine.message(conn,{t:'shopBuild',id:'ironfang',tier:3,combine:false});
 assert.equal(messages.at(-1).ok,true);assert.equal(messages.at(-1).tier,3);assert.equal(seat.gold,500);
 engine.message(conn,{t:'shopBuild',id:'ironfang',tier:3,combine:false});
 assert.equal(messages.at(-1).ok,false);assert.equal(seat.gold,500);
 engine.message(conn,{t:'shopBuild',id:'stoneguard',tier:3,combine:'false'});
 assert.equal(messages.at(-1).ok,false);assert.equal(seat.gold,500);
});

test('shop presents independent filter rails, linked tier nodes and touch tabs; both hosts accept only explicit valid requests',()=>{
 const jsx=source('src/components/duelist/client/ShopPanel.jsx'),css=source('src/components/duelist/client/duelistBattleShop.css');
 assert.match(jsx,/title="Stat filters"/);assert.match(jsx,/title="Shop filters"/);
 assert.match(jsx,/className="bs-build-tree"/);assert.match(jsx,/Builds into/);
 assert.match(jsx,/onBuy\(item.id,wanted,combine\)/);
 // the 5px glass blur and the fading separator now come from the shared sapphire material tokens
 const tokens=source('src/components/duelist/menu/duelistMaterialTokens.css');
 assert.match(css,/@import '\.\.\/menu\/duelistMaterialTokens\.css'/);assert.match(css,/backdrop-filter:var\(--ds-blur\)/);
 assert.match(tokens,/--ds-blur:blur\(5px\)/);
 assert.match(css,/\.bs-separator::after \{[^}]*background:var\(--ds-divider\)/);assert.match(tokens,/--ds-divider:linear-gradient\(180deg,transparent,/);
 assert.match(css,/data-mobile-pane="build"/);
 const client=source('src/components/duelist/net/client.mjs');
 assert.match(client,/shop-build-unavailable/);assert.match(client,/supportsShopBuild = msg.shopBuild === true/);
 assert.match(source('server/duelist/server.mjs'),/msg.t === 'shopBuild'/);
});
