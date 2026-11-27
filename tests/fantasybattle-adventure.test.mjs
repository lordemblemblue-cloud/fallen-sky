import assert from 'node:assert/strict';
import {test} from 'node:test';
import * as A from '../src/components/fantasybattle/core/adventureState.mjs';
import {UI_SCREENS,makeTemplate} from '../src/components/fantasybattle/uiCatalog.mjs';
const storage=()=>{const m=new Map();return {getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,v)};};
test('empty saves and valid round trip',()=>{const s=storage();assert.equal(A.mostRecent(A.readSlots(s).slots),null);const p=A.createProfile('Archer');A.writeSlot(s,'1',p);assert.equal(A.mostRecent(A.readSlots(s).slots).profile.id,p.id);assert.throws(()=>A.writeSlot(s,'1',p));});
test('corrupted saves never become loadable',()=>{const s=storage();s.setItem(A.SAVE_KEY,'{"1":{"profile":{},"savedAt":0}}');assert.equal(A.readSlots(s).slots[0].status,'corrupt');assert.equal(A.mostRecent(A.readSlots(s).slots),null);});
test('quest, victory, duplicate reward, skill unlock, stats',()=>{let p=A.acceptGroveQuest(A.createProfile('Archer'));let v=A.rewardVictory(p,{id:'wilds_grove_01',category:'Normal'},80);assert.equal(v.xp,25);assert.equal(v.profile.quests.grove,'complete');assert.equal(A.rewardVictory(v.profile,{id:'wilds_grove_01'}).xp,0);p=A.claimGroveQuest(v.profile);assert.equal(A.claimGroveQuest(p),p);v=A.rewardVictory(p,{id:'boss',category:'Boss'});assert.equal(v.leveled,true);assert.ok(v.unlocked.includes('volley'));assert.equal(A.heroStats(A.allocate(v.profile,'strength')).atk,A.heroStats(v.profile).atk+2);});
test('inventory transactions and one-time discovery loot',()=>{let p=A.createProfile('Archer');p={...p,gold:200,world:{...p.world,discoveries:['d']}};let l=A.collectLoot(p,'d');assert.equal(l.loot.length,2);assert.equal(A.collectLoot(l.profile,'d').loot.length,0);p=A.buyItem(l.profile,'sapphireBow');p=A.equipItem(p,'sapphireBow');assert.equal(A.heroStats(p).atk,16);assert.throws(()=>A.sellItem(p,'sapphireBow'));p=A.enhanceWeapon(p);assert.equal(A.heroStats(p).atk,18);p={...p,hp:50};p=A.heal(p);assert.equal(p.hp,90);assert.equal(A.heal(p,{sanctuary:true}).hp,120);assert.ok(A.isProfile(p));});
test('craft and travel gates',()=>{let p=A.createProfile('Archer');assert.throws(()=>A.craftTonic(p));assert.throws(()=>A.travelTo(p,{id:'r',minX:35,maxX:75}));p={...p,inventory:{...p.inventory,sapphireOre:2},world:{...p.world,visitedRegions:['r']}};p=A.craftTonic(p);assert.equal(p.inventory.recoveryTonic,2);assert.equal(p.inventory.sapphireOre,0);assert.equal(A.travelTo(p,{id:'r',minX:35,maxX:75}).world.position[0],41);});
test('48 text-free templates',()=>{assert.equal(Object.keys(UI_SCREENS).length,48);for(const id of Object.keys(UI_SCREENS)){assert.ok(makeTemplate(id).includes('<svg'));assert.ok(!/<text[ >]/.test(makeTemplate(id)));}});

test('cosmetic variants are saved, stat-neutral and backwards compatible',()=>{const p=A.createProfile('Archer');const before=A.heroStats(p);for(const id of Object.keys(A.APPEARANCES)){const next=A.selectAppearance(p,id);assert.equal(next.appearance,id);assert.deepEqual(A.heroStats(next),before);assert.ok(A.isProfile(next));assert.equal(A.appearanceFor(next),A.APPEARANCES[id]);}const legacy={...p};delete legacy.appearance;assert.ok(A.isProfile(legacy));assert.equal(A.appearanceFor(legacy),A.APPEARANCES.silver);assert.throws(()=>A.selectAppearance(p,'invalid'));});
test('portable backup preserves supported save data and rejects malformed or oversized data',()=>{const p=A.selectAppearance(A.createProfile('Traveler'),'sapphire');const raw=A.exportBackup(p);assert.deepEqual(A.parseBackup(raw),p);assert.throws(()=>A.parseBackup('not JSON'));assert.throws(()=>A.parseBackup(' '.repeat(A.MAX_BACKUP_BYTES+1)));assert.throws(()=>A.parseBackup(JSON.stringify({format:'other',version:1,profile:p})));assert.throws(()=>A.parseBackup(JSON.stringify({format:'fantasy-battle-guest-save',version:1,profile:{...p,appearance:'invalid'}})));const parsed=A.parseBackup(JSON.stringify({format:'fantasy-battle-guest-save',version:1,profile:{...p,unknown:'discard',world:{...p.world,unknown:'discard'}}}));assert.equal(parsed.unknown,undefined);assert.equal(parsed.world.unknown,undefined);});

import * as B from '../src/components/fantasybattle/core/battleRules.mjs';

test('recruitment requires the grove victory and formation persists',()=>{let p=A.createProfile('Leader');assert.throws(()=>A.recruitCompanion(p));p=A.rewardVictory(p,{id:'wilds_grove_01',category:'Normal'}).profile;p=A.recruitCompanion(p);assert.throws(()=>A.recruitCompanion(p));assert.ok(p.party.active);p=A.configureParty(p,{front:A.COMPANION.id});assert.equal(p.party.front,A.COMPANION.id);assert.ok(A.isProfile(p));assert.deepEqual(A.parseBackup(A.exportBackup(p)),p);p=A.configureParty(p,{active:false});assert.equal(p.party.front,'hero');assert.equal(p.party.active,false);assert.ok(A.isProfile(p));});
test('companion bond and HP follow unique victories and sanctuary recovery',()=>{let p=A.recruitCompanion(A.rewardVictory(A.createProfile('Leader'),{id:'wilds_grove_01'}).profile);const e={id:'second',category:'Normal'};const u=[{id:A.COMPANION.id,hp:25}];const v=A.rewardVictory(p,e,120,u);assert.equal(v.profile.party.hp,25);assert.equal(v.profile.party.bond,5);assert.equal(A.rewardVictory(v.profile,e,120,u).profile.party.bond,5);assert.equal(A.companionProgress(v.profile,{id:'practice',practice:true},u).bond,5);assert.equal(A.heal(v.profile,{sanctuary:true}).party.hp,A.COMPANION.maxHp);});
test('older profiles migrate and invalid companion data is rejected',()=>{const p=A.createProfile('Leader');delete p.party;assert.ok(A.isProfile(p));assert.equal(A.partyFor(p).active,false);assert.equal(A.parseBackup(A.exportBackup(p)).party.recruited,false);assert.equal(A.isProfile({...p,party:{...A.partyFor(p),recruited:true,active:true}}),false);});

test('two allies act separately and enemy targets the living frontline',()=>{const hero={id:'hero',team:'player',maxHp:120,atk:12,def:10,spd:11},ally={id:'groveArcher',team:'player',maxHp:85,atk:9,def:9,spd:9},enemy={id:'rival',team:'enemy',maxHp:150,atk:11,def:10,spd:10};const choices={hero:'quickShot',groveArcher:'guard',rival:'quickShot'};const first=B.resolveRound(B.createBattle({seed:2,units:[ally,hero,enemy]}),choices);assert.equal(first.round.steps.find(s=>s.actor==='rival').target,'groveArcher');assert.equal(first.round.steps.length,3);const second=B.resolveRound(B.createBattle({seed:2,units:[hero,ally,enemy]}),choices);assert.equal(second.round.steps.find(s=>s.actor==='rival').target,'hero');const knocked=B.createBattle({seed:2,units:[ally,hero,enemy]});knocked.units[0].hp=0;knocked.units[0].ko=true;const next=B.resolveRound(knocked,{hero:'guard',rival:'quickShot'});assert.equal(next.round.steps.find(s=>s.actor==='rival').target,'hero');assert.equal(next.battle.phase,'choose');});

import {enemyFormation,tacticFor} from '../src/components/fantasybattle/core/enemyCatalog.mjs';
test('four-member roster unlocks independently, saves and restores without losing legacy companion',()=>{
 let p=A.createProfile('Leader');
 for(const m of A.ROSTER){assert.throws(()=>A.recruitCompanion(p,m.id));p=A.rewardVictory(p,{id:m.requiredEncounter}).profile;p=A.recruitCompanion(p,m.id);}
 assert.equal(A.activeRoster(p).length,3);p=A.configureParty(p,{front:'pilgrimWarden'});assert.equal(p.party.front,'pilgrimWarden');
 assert.deepEqual(A.parseBackup(A.exportBackup(p)),p);assert.ok(A.isProfile(p));
 p=A.configureParty(p,{id:'pilgrimWarden',active:false});assert.equal(p.party.front,'hero');assert.equal(A.activeRoster(p).length,2);
 assert.throws(()=>A.configureParty(p,{front:'pilgrimWarden'}));
});
test('independent companion damage, bonds and rest include reserve members',()=>{
 let p=A.createProfile('Leader');for(const m of A.ROSTER){p=A.rewardVictory(p,{id:m.requiredEncounter}).profile;p=A.recruitCompanion(p,m.id);}
 p=A.configureParty(p,{id:'mistScout',active:false});
 const v=A.rewardVictory(p,{id:'new'},120,[{id:'groveArcher',hp:20},{id:'pilgrimWarden',hp:40},{id:'mistScout',hp:1}]).profile;
 assert.equal(A.memberFor(v,'groveArcher').hp,20);assert.equal(A.memberFor(v,'pilgrimWarden').hp,40);assert.equal(A.memberFor(v,'mistScout').hp,75);
 assert.equal(A.memberFor(v,'pilgrimWarden').bond,5);assert.equal(A.memberFor(v,'mistScout').bond,0);
 const h=A.heal(v,{sanctuary:true});assert.equal(A.partyNeedsRest(h),false);assert.ok(A.isProfile(h));
});
test('boss party formation and legal deterministic tactics',()=>{
 const enemies=enemyFormation({category:'Boss',label:'Gatekeeper'},4);assert.equal(enemies.length,3);
 const hero={id:'hero',team:'player',maxHp:120,atk:12,def:10,spd:11};let b=B.createBattle({seed:5,units:[hero,...enemies]});
 assert.equal(B.chooseAiAction(b,'rival','boss'),'guard');
 b=B.resolveRound(b,{hero:'guard',...Object.fromEntries(enemies.map(e=>[e.id,B.chooseAiAction(b,e.id,e.strategy)]))}).battle;
 assert.equal(B.chooseAiAction(b,'rival','boss'),'chargedShot');assert.ok(tacticFor('boss').includes('Radiant Shot'));
 assert.equal(enemyFormation({category:'Normal'},1).length,1);
});

import {MELEE_SKILLS,approachWeight} from '../src/components/fantasybattle/core/meleeSkills.mjs';
import {validateSkill,SkillPlayer} from '../src/components/fantasybattle/core/skillTimeline.mjs';
test('weapon kits restrict actions and preserve legacy archers',()=>{
 const stat={maxHp:200,atk:12,def:10,spd:11}; const units=[{...stat,id:'tank',team:'player',combatClass:'warden'},{...stat,id:'scout',team:'player',combatClass:'scout'},{...stat,id:'rival',team:'enemy'}];const b=B.createBattle({seed:2,units});
 assert.deepEqual(B.legalActions(b,'tank').map(a=>a.id),B.CLASS_KITS.warden);assert.ok(!B.isLegal(b,'tank','quickShot'));assert.ok(!B.isLegal(b,'scout','swordSlash'));assert.ok(B.isLegal(b,'rival','quickShot'));assert.throws(()=>B.resolveRound(b,{tank:'quickShot',scout:'guard',rival:'guard'}));
 const choices={tank:'swordSlash',scout:'daggerFlurry',rival:'quickShot'};const next=B.resolveRound(b,choices);assert.deepEqual(next,B.resolveRound(b,choices));assert.equal(next.round.steps.find(s=>s.actor==='scout').hits.length,3);assert.equal(B.unitById(next.battle,'tank').focus,2);
});
test('bulwark mitigates more damage than the normal guard and resets each round',()=>{
 const u={maxHp:300,atk:12,def:10,spd:11};const rival={...u,id:'rival',team:'enemy'};const base={...u,id:'tank',team:'player'};
 const a=B.resolveRound(B.createBattle({seed:2,units:[{...base,combatClass:'warden'},rival]}),{tank:'bulwark',rival:'quickShot'});const b=B.resolveRound(B.createBattle({seed:2,units:[base,rival]}),{tank:'guard',rival:'quickShot'});
 assert.ok(B.unitById(a.battle,'tank').hp>B.unitById(b.battle,'tank').hp);assert.equal(B.unitById(a.battle,'tank').guarding,false);assert.equal(B.unitById(a.battle,'tank').guardFactor,undefined);
});
test('melee animation timelines have exactly one impact per potential hit and no projectiles',()=>{
 for(const s of MELEE_SKILLS){assert.ok(validateSkill(s).ok);assert.equal(s.events.filter(e=>e.effect==='meleeImpact').length,B.ACTIONS[s.id].hits);assert.ok(!s.events.some(e=>e.type==='spawnArrow'));const player=new SkillPlayer([s]);player.play(s.id);const fired=player.update(s.totalDuration+1).events;assert.equal(fired.length,B.ACTIONS[s.id].hits);assert.equal(player.current,null);assert.equal(approachWeight(0,s.totalDuration),0);assert.equal(approachWeight(s.totalDuration,s.totalDuration),0);}
});
