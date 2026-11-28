import assert from 'node:assert/strict';
import {test} from 'node:test';
import * as A from '../src/components/fantasybattle/core/adventureState.mjs';
import {UI_SCREENS,makeTemplate} from '../src/components/fantasybattle/uiCatalog.mjs';
const storage=()=>{const m=new Map();return {getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,v)};};
test('empty saves and valid round trip',()=>{const s=storage();assert.equal(A.mostRecent(A.readSlots(s).slots),null);const p=A.createProfile('Archer');A.writeSlot(s,'1',p);assert.equal(A.mostRecent(A.readSlots(s).slots).profile.id,p.id);assert.throws(()=>A.writeSlot(s,'1',p));});
test('corrupted saves never become loadable',()=>{const s=storage();s.setItem(A.SAVE_KEY,'{"1":{"profile":{},"savedAt":0}}');assert.equal(A.readSlots(s).slots[0].status,'corrupt');assert.equal(A.mostRecent(A.readSlots(s).slots),null);});
test('quest, victory, duplicate reward, skill unlock, stats',()=>{let p=A.acceptGroveQuest(A.createProfile('Archer'));let v=A.rewardVictory(p,{id:'wilds_grove_01',category:'Normal'},80);assert.equal(v.xp,25);assert.equal(v.profile.quests.grove,'complete');assert.equal(A.rewardVictory(v.profile,{id:'wilds_grove_01'}).xp,0);p=A.claimGroveQuest(v.profile);assert.equal(A.claimGroveQuest(p),p);v=A.rewardVictory(p,{id:'boss',category:'Boss'});assert.equal(v.leveled,true);assert.ok(v.unlocked.includes('volley'));assert.equal(A.heroStats(A.allocate(v.profile,'strength')).atk,A.heroStats(v.profile).atk+2);});
test('inventory transactions and one-time discovery loot',()=>{let p=A.createProfile('Archer');p={...p,gold:200,world:{...p.world,discoveries:['disc_pilgrimage']}};let l=A.collectLoot(p,'disc_pilgrimage');assert.equal(l.loot.length,3);assert.equal(A.collectLoot(l.profile,'disc_pilgrimage').loot.length,0);p=A.buyItem(l.profile,'sapphireBow');p=A.equipItem(p,'sapphireBow');assert.equal(A.heroStats(p).atk,16);assert.throws(()=>A.sellItem(p,'sapphireBow'));p=A.enhanceWeapon(p);assert.equal(A.heroStats(p).atk,18);p={...p,hp:50};p=A.heal(p);assert.equal(p.hp,90);assert.equal(A.heal(p,{sanctuary:true}).hp,120);assert.ok(A.isProfile(p));});
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

import {makeCompanionRig,requiredCompanionParts,visualFor} from '../src/components/fantasybattle/core/companionVisuals.mjs';
import {buildRig,createPuppetState,stepPuppet,socketPosition} from '../src/components/fantasybattle/core/puppetCore.mjs';
import {readFileSync} from 'node:fs';
test('three companion art packs contain individual rig geometry and valid local assets',()=>{
 const read=p=>JSON.parse(readFileSync(new URL(p,import.meta.url),'utf8'));
 const base=read('../src/components/fantasybattle/data/archerRig.json'),manifest=read('../public/fantasybattle/archer/parts.json');
 const ids=A.ROSTER.map(m=>m.id);const all=requiredCompanionParts(ids);assert.equal(new Set(all.map(p=>p.key)).size,all.length);assert.equal(requiredCompanionParts(['hero','unknown']).length,0);
 for(const id of ids){const custom=makeCompanionRig(id,base,manifest);const rig=buildRig(custom.data,custom.manifest);const s=createPuppetState(rig);stepPuppet(rig,s,1/60);for(const name of ['chest','headTop','bowGrip','nock'])assert.ok(socketPosition(rig,s,name).every(Number.isFinite));assert.ok(s.positions.every(p=>p.every(Number.isFinite)));assert.notEqual(rig.data.id,base.id);assert.ok(visualFor(id));}
 for(const a of all){const source=readFileSync(new URL('../public'+a.url,import.meta.url),'utf8');assert.ok(source.startsWith('<svg'));assert.ok(!/<script|<foreignObject|https?:\/\/(?!www\.w3\.org)/i.test(source));}
 assert.equal(makeCompanionRig('hero',base,manifest),null);assert.notEqual(makeCompanionRig(ids[1],base,manifest).data.bones[4].pos[1],makeCompanionRig(ids[2],base,manifest).data.bones[4].pos[1]);
});

import {GEAR,gearCount,equippedVisuals} from '../src/components/fantasybattle/core/equipmentCatalog.mjs';
test('gear ownership, real combat bonuses and protected sales',()=>{let p={...A.createProfile('Leader'),gold:500};const base=A.heroStats(p);assert.throws(()=>A.equipGear(p,'hero','armor','sapphirePlate'));p=A.buyItem(p,'sapphirePlate');p=A.equipGear(p,'hero','armor','sapphirePlate');assert.equal(A.heroStats(p).def,base.def+6);assert.throws(()=>A.sellItem(p,'sapphirePlate'));assert.throws(()=>A.equipGear(p,'hero','mantle','sapphirePlate'));p=A.rewardVictory(p,{id:'wilds_pilgrimage_02'}).profile;p=A.recruitCompanion(p,'pilgrimWarden');assert.throws(()=>A.equipGear(p,'pilgrimWarden','armor','sapphirePlate'));p=A.buyItem(p,'sapphirePlate');p=A.equipGear(p,'pilgrimWarden','armor','sapphirePlate');assert.equal(A.memberStats(p,'pilgrimWarden').def,22);assert.equal(gearCount(p,'sapphirePlate'),2);p=A.buyItem(p,'silverMantle');p=A.equipGear(p,'hero','mantle','silverMantle');assert.deepEqual(equippedVisuals(p,'hero'),['sapphirePlate','silverMantle']);assert.deepEqual(A.parseBackup(A.exportBackup(p)),p);p=A.equipGear(p,'hero','armor',null);p=A.sellItem(p,'sapphirePlate');assert.ok(A.isProfile(p));assert.throws(()=>A.sellItem(p,'sapphirePlate'));});
test('legacy gear saves and invalid loadouts',()=>{const p=A.createProfile('Legacy');assert.deepEqual(A.parseBackup(A.exportBackup(p)),p);for(const gear of [{hero:{armor:'missing'}},{hero:{armor:'sapphirePlate'}},{mistScout:{armor:'sapphirePlate'}},{hero:{mantle:'sapphirePlate'}},{fake:{}}])assert.equal(A.isProfile({...p,gear}),false);assert.equal(A.isProfile({...p,inventory:{...p.inventory,sapphirePlate:null}}),false);for(const id of ['groveVest','sapphirePlate','mistJacket','silverMantle','wardMantle','duskMantle'])assert.ok(Object.hasOwn(GEAR,id),id);});

import {classAnimationLibrary,guardPose,MELEE_STANCES} from '../src/components/fantasybattle/core/meleeSkills.mjs';
test('melee classes use distinct reactions, stances and independent weapon channels',()=>{
 for(const kind of ['warden','scout']){const list=classAnimationLibrary(kind);assert.equal(list.length,5);for(const clip of list){assert.ok(validateSkill(clip).ok);const player=new SkillPlayer([clip]);player.play(clip.id);player.update(clip.totalDuration+1);assert.equal(Boolean(player.current),Boolean(clip.hold));}assert.equal(guardPose(kind).weight,1);}
 assert.notDeepEqual(MELEE_STANCES.warden,MELEE_STANCES.scout);assert.deepEqual(classAnimationLibrary('archer'),[]);assert.equal(guardPose('archer'),null);
 for(const clip of MELEE_SKILLS){assert.equal(approachWeight(0,clip.totalDuration,clip.id),0);assert.equal(approachWeight(clip.totalDuration,clip.totalDuration,clip.id),0);for(const e of clip.events)assert.equal(approachWeight(e.time,clip.totalDuration,clip.id),1);}
 const flurry=MELEE_SKILLS.find(s=>s.id==='daggerFlurry');assert.ok(flurry.keyframes.some(k=>k.params.meleeOff<-50));const bash=MELEE_SKILLS.find(s=>s.id==='shieldBash');assert.ok(bash.keyframes.some(k=>k.params.shieldAngle<0));
});

import {CLOTH_PROFILES,createSecondaryMotion,resetSecondaryMotion,sampleMotion,stepCloth,capeGeometry,deformCape} from '../src/components/fantasybattle/core/secondaryMotion.mjs';
test('cape motion is bounded, anchored, settles, and resets on teleport or reduced motion',()=>{for(const p of Object.values(CLOTH_PROFILES)){const s=createSecondaryMotion(),g=capeGeometry(p),out=g.positions.slice();let moved=false;for(let i=0;i<360;i++){sampleMotion(s,i<60?180*Math.sin(i/60*Math.PI):0,0,1/60);const a=stepCloth(s,p,1/60);deformCape(g.positions,out,a);assert.ok(Math.abs(a)<=p.limit);assert.ok(out.every(Number.isFinite));assert.deepEqual(out.slice(0,6),g.positions.slice(0,6));if(Math.abs(a)>.01)moved=true;}assert.ok(moved);assert.ok(Math.abs(s.angle)<.005);sampleMotion(s,2000,0,1/60);assert.equal(s.angle,0);s.angle=.2;assert.equal(stepCloth(s,p,0,0),0);resetSecondaryMotion(s);assert.equal(s.lastX,null);}});

import {createLocomotion,resetLocomotion,advanceVelocity,updateLocomotion,WALK_FACTOR} from '../src/components/fantasybattle/core/locomotion.mjs';
test('exploration walk/run acceleration, diagonal normalization, stopping and collision-driven gait',()=>{const s=createLocomotion();let x=0;for(let i=0;i<120;i++){const m=advanceVelocity(s,{right:true},true,1/120);x+=m.x;}assert.ok(s.vx>7.4*WALK_FACTOR-.01&&s.vx<=7.4*WALK_FACTOR);for(let i=0;i<120;i++)advanceVelocity(s,{right:true,run:true},true,1/120);assert.ok(s.vx>7.39&&s.vx<=7.4);for(let i=0;i<120;i++)advanceVelocity(s,{},true,1/120);assert.equal(s.vx,0);resetLocomotion(s);for(let i=0;i<120;i++)advanceVelocity(s,{right:true,out:true,run:true},true,1/120);assert.ok(Math.abs(Math.hypot(s.vx/7.4,s.vz/4.8)-1)<.001);for(let i=0;i<60;i++)updateLocomotion(s,{dx:.1,grounded:true,running:true},1/60);assert.equal(s.mode,'run');for(let i=0;i<60;i++)updateLocomotion(s,{grounded:true,running:true},1/60);assert.equal(s.mode,'idle');assert.ok(s.gait<.001);assert.ok(x>0);});
test('exploration jump, fall, landing, turn and reset remain finite',()=>{const s=createLocomotion();for(let i=0;i<30;i++)updateLocomotion(s,{dx:.03,vy:4,grounded:false},1/60);assert.equal(s.mode,'jump');for(let i=0;i<30;i++)updateLocomotion(s,{dx:-.03,vy:-5,grounded:false},1/60);assert.equal(s.mode,'fall');updateLocomotion(s,{grounded:true,impact:8},1/60);assert.equal(s.mode,'land');for(let i=0;i<60;i++)updateLocomotion(s,{grounded:true},1/60);assert.equal(s.mode,'idle');assert.ok(Object.values(s.pose).every(Number.isFinite));resetLocomotion(s);assert.equal(s.land,0);assert.equal(s.phase,0);});

import {ENEMY_VISUALS,enemyVisualId,enemyPortrait,requiredEnemyParts,makeEnemyRig} from '../src/components/fantasybattle/core/enemyVisuals.mjs';
test('all ten world encounters have distinct enemy art and valid ranged rig sockets',()=>{const ids=['wilds_grove_01','wilds_pilgrimage_01','wilds_pilgrimage_02','wilds_waterfall_01','wilds_cave_01','wilds_heights_01','wilds_heights_02','wilds_heights_elite','wilds_sanctuary_guard','wilds_sanctuary_boss'];const visuals=ids.map(id=>enemyVisualId({id}));assert.equal(new Set(visuals).size,10);const read=p=>JSON.parse(readFileSync(new URL(p,import.meta.url),'utf8'));const base=read('../src/components/fantasybattle/data/archerRig.json'),manifest=read('../public/fantasybattle/archer/parts.json');for(const id of visuals){const custom=makeEnemyRig(id,base,manifest),rig=buildRig(custom.data,custom.manifest),s=createPuppetState(rig);stepPuppet(rig,s,1/60);for(const k of ['bowGrip','bowTop','bowBottom','nock','chest','headTop'])assert.ok(socketPosition(rig,s,k).every(Number.isFinite));assert.ok(s.positions.every(p=>p.every(Number.isFinite)));assert.ok(readFileSync(new URL('../public'+enemyPortrait(id),import.meta.url),'utf8').startsWith('<svg'));}const assets=requiredEnemyParts(visuals);assert.equal(assets.length,150);for(const a of assets)assert.ok(readFileSync(new URL('../public'+a.url,import.meta.url),'utf8').startsWith('<svg'));assert.equal(Object.keys(ENEMY_VISUALS).length,10);assert.equal(enemyFormation({id:'wilds_sanctuary_boss',category:'Boss'},4)[0].visualId,'gatekeeper');});

import {enemySkillLibrary} from '../src/components/fantasybattle/core/enemySkills.mjs';
test('Gatekeeper phase thresholds and intent match actual deterministic action',()=>{const boss=enemyFormation({id:'wilds_sanctuary_boss',category:'Boss'},1)[0],hero={id:'hero',team:'player',maxHp:500,atk:10,def:20,spd:12};const b=B.createBattle({seed:7,units:[hero,boss]});const u=B.unitById(b,'rival');assert.equal(B.bossPhase(u),1);assert.equal(B.enemyIntent(b,'rival','boss').actionId,'celestialWard');assert.ok(!B.isLegal(b,'hero','celestialLance'));u.focus=3;u.hp=Math.floor(u.maxHp*.65);assert.equal(B.bossPhase(u),2);assert.equal(B.enemyIntent(b,'rival','boss').actionId,'starfall');assert.ok(!B.isLegal(b,'rival','eclipseRay'));u.hp=Math.floor(u.maxHp*.30);assert.equal(B.bossPhase(u),3);const intent=B.enemyIntent(b,'rival','boss');assert.equal(intent.actionId,'eclipseRay');const out=B.resolveRound(b,{hero:'guard',rival:intent.actionId});assert.equal(out.round.steps.find(s=>s.actor==='rival').action,intent.actionId);assert.equal(out.battle.units.find(x=>x.id==='rival').focus,0);assert.deepEqual(out,B.resolveRound(b,{hero:'guard',rival:intent.actionId}));});
test('exclusive enemy kits and animation events are legal and bounded',()=>{const data=JSON.parse(readFileSync(new URL('../src/components/fantasybattle/data/bowSkills.json',import.meta.url),'utf8'));const list=enemySkillLibrary(data.skills);assert.equal(list.length,7);for(const clip of list){assert.ok(validateSkill(clip).ok);assert.equal(clip.events.filter(e=>e.type==='spawnArrow').length,B.ACTIONS[clip.id].hits||0);}for(const id of ['wilds_grove_01','wilds_pilgrimage_01','wilds_waterfall_01','wilds_sanctuary_boss']){const b=B.createBattle({units:[{id:'hero',team:'player',maxHp:100,atk:10,def:10,spd:10},...enemyFormation({id,category:id.endsWith('boss')?'Boss':'Normal'},1)]});const intent=B.enemyIntent(b,'rival');assert.ok(B.isLegal(b,'rival',intent.actionId));assert.equal(B.enemyIntent(b,'hero'),null);}});

import {WORLD_MAX_X,WORLD_END_X,EXTRA_REGIONS,EXTRA_ENCOUNTERS,ARENAS,arenaForEncounter,extraHeight} from '../src/components/fantasybattle/core/worldExpansion.mjs';
test('expanded regions preserve old positions and route all encounters to registered arenas',()=>{assert.equal(EXTRA_REGIONS[0].minX,220);assert.equal(EXTRA_REGIONS[0].maxX,EXTRA_REGIONS[1].minX);assert.equal(EXTRA_REGIONS[1].maxX,WORLD_END_X);assert.equal(extraHeight(220),11.64);assert.ok(Math.abs(extraHeight(260)-13.24)<1e-9);for(let x=220;x<WORLD_MAX_X;x+=.5)assert.ok(Math.abs(extraHeight(x+.5)-extraHeight(x))<.1);for(const enc of EXTRA_ENCOUNTERS){assert.ok(Object.hasOwn(ARENAS,arenaForEncounter(enc.id)));assert.ok(EXTRA_REGIONS.some(r=>enc.x>=r.minX&&enc.x<r.maxX));assert.ok(enemyFormation(enc,1)[0].archetype);assert.ok(enemyPortrait(enemyFormation(enc,1)[0].visualId));}assert.equal(arenaForEncounter('wilds_sanctuary_boss'),'sapphire_sanctuary');assert.equal(arenaForEncounter('__proto__'),'sapphire_sanctuary');let p=A.createProfile('Traveler');p=A.updateWorld(p,{position:[289,14,0],regions:EXTRA_REGIONS,region:'8. Astral Ruins',discoveries:[]});assert.equal(p.world.position[0],289);assert.ok(A.isProfile(p));assert.deepEqual(A.parseBackup(A.exportBackup(p)),p);});

import {encryptBackup,importTransfer,MAX_ENCRYPTED_BYTES} from '../src/components/fantasybattle/core/encryptedBackup.mjs';
test('stale overwrite cannot replace newer local save, even with same character',()=>{const s=storage(),p=A.createProfile('Conflict');const first=A.writeSlot(s,'1',p,{expectedStamp:null});const changed=A.writeSlot(s,'1',{...p,gold:5},{overwrite:true,expectedStamp:A.slotStamp(first)});assert.throws(()=>A.writeSlot(s,'1',{...p,gold:99},{overwrite:true,expectedStamp:A.slotStamp(first)}),/conflict/i);assert.equal(A.readSlots(s).slots[0].profile.gold,5);assert.equal(A.readSlots(s).slots[0].stamp,A.slotStamp(changed));assert.throws(()=>A.writeSlot(s,'1',p,{overwrite:true,expectedStamp:null}),/conflict/i);});
test('encrypted transfer round trip, random salt, wrong passphrase, tampering and bounded metadata',async()=>{const p=A.createProfile('Private Traveler'),pass='correct horse garden lantern';const a=await encryptBackup(p,pass),b=await encryptBackup(p,pass);assert.notEqual(a,b);assert.ok(!a.includes(p.name));assert.deepEqual(await importTransfer(a,pass),p);assert.deepEqual(await importTransfer(A.exportBackup(p)),p);await assert.rejects(importTransfer(a,'wrong password example'),/Incorrect passphrase/);const x=JSON.parse(a);x.ciphertext=(x.ciphertext[0]==='A'?'B':'A')+x.ciphertext.slice(1);await assert.rejects(importTransfer(JSON.stringify(x),pass),/Incorrect passphrase/);x.iterations=999999999;await assert.rejects(importTransfer(JSON.stringify(x),pass),/Unsupported/);await assert.rejects(importTransfer(' '.repeat(MAX_ENCRYPTED_BYTES+1),pass),/too large/);await assert.rejects(encryptBackup(p,'short'),/12/);});

import {isCurrentEncounter,currentSaveStamp} from '../src/components/fantasybattle/core/battleLifecycle.mjs';
test('stale battle completion and retry acknowledgements cannot apply to a different encounter',()=>{assert.ok(isCurrentEncounter({token:'new'},'new'));for(const token of ['old',null,undefined,''])assert.equal(isCurrentEncounter({token:'new'},token),false);assert.equal(isCurrentEncounter(null,'new'),false);});
test('loading a stale character snapshot cannot adopt a newer save baseline',()=>{const s=storage(),p=A.createProfile('Snapshot');A.writeSlot(s,'1',p);const old=A.readSlots(s).slots[0];A.writeSlot(s,'1',{...p,gold:20},{overwrite:true,expectedStamp:old.stamp});const records=A.readSlots(s).slots;assert.equal(currentSaveStamp(records,'1',p),undefined);assert.equal(currentSaveStamp(records,'1',records[0].profile),records[0].stamp);assert.equal(currentSaveStamp(records,'2',p),null);});


test('registered encounter gear drops are real inventory items, one-time and portable',()=>{
 let p=A.createProfile('Loot hunter');
 assert.equal(Object.keys(A.ENCOUNTER_GEAR_REWARDS).length,14);
 for(const [id,item] of Object.entries(A.ENCOUNTER_GEAR_REWARDS)){
  assert.ok(Object.hasOwn(A.ITEMS,item));
  const before=p.inventory[item]??0;
  const v=A.rewardVictory(p,{id,category:'Normal'});
  assert.equal(v.profile.inventory[item],before+1);
  assert.ok(v.loot.some(l=>l.id===item&&l.count===1));
  assert.equal(A.rewardVictory(v.profile,{id}).profile,v.profile);
  p=v.profile;
 }
 assert.ok(A.isProfile(p));
 assert.deepEqual(A.parseBackup(A.exportBackup(p)),p);
});
test('practice and capped reward quantities cannot create invalid inventory or duplicate loot',()=>{
 let p=A.createProfile('Loot cap');
 const practice=A.rewardVictory(p,{id:'wilds_grove_01',practice:true});
 assert.equal(practice.profile,p);assert.deepEqual(practice.loot,[]);
 p={...p,xp:99999,gold:9999999,inventory:{...p.inventory,sapphireOre:99999,groveRing:100000,groveVest:100000,recoveryTonic:100000},world:{...p.world,discoveries:['disc_pilgrimage']}};
 const v=A.rewardVictory(p,{id:'wilds_grove_01',category:'Boss'});
 assert.equal(v.xp,1);assert.equal(v.gold,1);
 assert.deepEqual(v.loot,[{id:'sapphireOre',count:1}]);
 assert.ok(A.isProfile(v.profile));
 const t=A.collectLoot(v.profile,'disc_pilgrimage');
 assert.deepEqual(t.loot,[]);assert.ok(A.isProfile(t.profile));
 assert.equal(A.collectLoot(t.profile,'disc_pilgrimage').profile,t.profile);
});

test('bulk trade quotes and transactions agree, bound quantities and protect equipped copies',()=>{
 const p={...A.createProfile('Trader'),gold:1000};
 const q=A.tradeQuote(p,'buy','sapphirePlate',3);
 assert.equal(q.total,300);assert.ok(q.ok);
 let next=A.buyItem(p,'sapphirePlate',3);assert.equal(next.gold,700);assert.equal(next.inventory.sapphirePlate,3);
 next=A.equipGear(next,'hero','armor','sapphirePlate');
 assert.throws(()=>A.sellItem(next,'sapphirePlate',3));
 next=A.sellItem(next,'sapphirePlate',2);
 assert.equal(next.inventory.sapphirePlate,1);assert.equal(next.gold,784);assert.ok(A.isProfile(next));
 for(const qty of [0,-1,1.5,100,Infinity,'2',null]){assert.equal(A.tradeQuote(p,'buy','sapphirePlate',qty).ok,false);assert.throws(()=>A.buyItem(p,'sapphirePlate',qty));}
 assert.equal(A.tradeQuote(p,'buy','__proto__').ok,false);
 assert.throws(()=>A.sellItem({...next,gold:10000000},'recoveryTonic'));
 assert.throws(()=>A.buyItem({...p,inventory:{...p.inventory,sapphirePlate:99999}},'sapphirePlate',2));
 assert.equal(p.gold,1000);
});
test('six recipes are level-gated, atomic, save compatible and cannot yield a resale profit',()=>{
 const p={...A.createProfile('Smith'),gold:1000,inventory:{...A.createProfile('Inventory').inventory,sapphireOre:100}};
 assert.equal(Object.keys(A.RECIPES).length,6);
 for(const r of Object.values(A.RECIPES)){
  const item=A.ITEMS[r.id];assert.ok(item);assert.ok(r.ore*A.ITEMS.sapphireOre.sell+r.gold>=item.sell);
  const ready={...p,xp:(r.level-1)*100};
  const q=A.craftQuote(ready,r.id,2);assert.ok(q.ok);
  const next=A.craftItem(ready,r.id,2);assert.equal(next.gold,ready.gold-q.gold);assert.equal(next.inventory.sapphireOre,100-q.ore);assert.equal(next.inventory[r.id],(ready.inventory[r.id]??0)+2);
  assert.ok(A.isProfile(next));assert.deepEqual(A.parseBackup(A.exportBackup(next)),next);
  if(r.level>1)assert.throws(()=>A.craftItem(p,r.id));
 }
 assert.throws(()=>A.craftItem(p,'__proto__'));assert.throws(()=>A.craftItem(p,'recoveryTonic',0));
 assert.throws(()=>A.craftItem({...p,inventory:{...p.inventory,recoveryTonic:100000}},'recoveryTonic'));
 assert.throws(()=>A.craftItem({...p,gold:0},'sapphireBow'));
 assert.throws(()=>A.craftItem({...p,inventory:{...p.inventory,sapphireOre:0}},'recoveryTonic'));
 assert.equal(p.inventory.sapphireOre,100);
});

import {TREASURES,TREASURE_IDS,treasureFor,treasureProgress} from '../src/components/fantasybattle/core/treasureCatalog.mjs';
test('all five real discovery markers award distinct persistent treasure exactly once',()=>{
 let p=A.createProfile('Explorer');
 assert.deepEqual(treasureProgress(p),{found:0,collected:0,total:5});
 assert.equal(A.collectLoot(p,'disc_pilgrimage').profile,p);
 const world=readFileSync(new URL('../src/components/fantasybattle/world/sapphireWorld.js',import.meta.url),'utf8');
 for(const id of TREASURE_IDS){
  assert.ok(world.includes(id),id);
  const t=treasureFor(id);assert.ok(t.label);
  p={...p,world:{...p.world,discoveries:[...p.world.discoveries,id]}};
  const result=A.collectLoot(p,id);assert.deepEqual(result.loot,t.loot);
  for(const row of result.loot){assert.ok(Object.hasOwn(A.ITEMS,row.id));assert.equal(result.profile.inventory[row.id],(p.inventory[row.id]??0)+row.count);}
  p=result.profile;assert.ok(A.isProfile(p));
  assert.equal(A.collectLoot(p,id).profile,p);
 }
 assert.equal(new Set(Object.values(TREASURES).map(t=>t.loot[2].id)).size,5);
 assert.deepEqual(treasureProgress(p),{found:5,collected:5,total:5});
 const loaded=A.parseBackup(A.exportBackup(p));assert.deepEqual(loaded,p);
 assert.equal(A.collectLoot(loaded,'disc_astral').profile,loaded);
 const forged={...p,world:{...p.world,discoveries:[...p.world.discoveries,'unknown','__proto__']}};
 assert.equal(A.collectLoot(forged,'unknown').profile,forged);assert.equal(A.collectLoot(forged,'__proto__').profile,forged);
});

import {WORLD_SERVICES,serviceFor,withinService,nearestService,liveService,PLANNED_ANCHORS,validAnchorTransform} from '../src/components/fantasybattle/core/worldInteractions.mjs';
test('service placement retains original coordinates and rejects out-of-range interactions',()=>{
 assert.deepEqual(WORLD_SERVICES.map(s=>[s.id,s.x,s.z]),[['grove_service',9,-1.4],['sanctuary_service',191,-1.4],['moonveil_service',226,-1.4]]);
 for(const s of WORLD_SERVICES){
  const p=[s.x,12,s.z],w={mode:'wilds',position:p,nearbyService:s.id};
  assert.equal(serviceFor(s.id),s);assert.equal(nearestService(p,()=>12),s);assert.ok(withinService(p,s,12));assert.ok(liveService(w,s.id));
  assert.equal(withinService([s.x,14,s.z],s,12),false);
  assert.equal(nearestService([s.x+3,12,s.z],()=>12),null);
  assert.equal(liveService({...w,position:[s.x+3,12,s.z]},s.id),false);
  assert.equal(liveService({...w,mode:'sanctuary'},s.id),false);
  assert.equal(liveService({...w,nearbyService:'unknown'},s.id),false);
 }
 assert.equal(serviceFor('__proto__'),null);assert.equal(liveService(null,'grove_service'),false);
 assert.equal(nearestService([NaN,12,0],()=>12),null);
});
test('planned anchors remain inactive and candidate transform review is bounded',()=>{
 assert.equal(PLANNED_ANCHORS.length,24);
 assert.equal(new Set(PLANNED_ANCHORS.map(a=>a.id)).size,24);
 for(const a of PLANNED_ANCHORS){assert.equal(a.transform,null);assert.equal(a.status,'awaiting-approved-map');}
 const t={position:[55,5,-2.2],facing:0,radius:2};
 assert.ok(validAnchorTransform('fb.pilgrim.ledger',t));
 for(const bad of [{...t,position:[190,5,0]},{...t,position:[55,NaN,0]},{...t,position:[55,5,10]},{...t,radius:0},{...t,radius:4},{...t,facing:Infinity}])assert.equal(validAnchorTransform('fb.pilgrim.ledger',bad),false);
 assert.equal(validAnchorTransform('unknown',t),false);
 const world=readFileSync(new URL('../src/components/fantasybattle/world/sapphireWorld.js',import.meta.url),'utf8');
 assert.ok(world.includes('app.servicePoints=WORLD_SERVICES'));
 assert.ok(world.includes('else this.openService?.();'));
 assert.ok(world.includes("'Interact [E]'"));
 const page=readFileSync(new URL('../src/components/fantasybattle/SapphireAdventure.jsx',import.meta.url),'utf8');
 assert.ok(page.includes('liveService(e.world,registered.id)'));assert.ok(page.includes('gearSlotLabel(item.slot)'));
 assert.ok(!page.includes('item.gearSlotLabel(slot)'));
});

test('previous save checkpoint is bounded, explicit, and revision checked',()=>{
 const s=storage(),p=A.createProfile('Traveler');
 const first=A.writeSlot(s,'1',p,{expectedStamp:null});
 assert.equal(A.readSlots(s).slots[0].recovery,null);
 const second=A.writeSlot(s,'1',{...p,gold:10},{overwrite:true,expectedStamp:A.slotStamp(first)});
 const third=A.writeSlot(s,'1',{...p,gold:20},{overwrite:true,expectedStamp:A.slotStamp(second)});
 const row=A.readSlots(s).slots[0];assert.equal(row.recovery.profile.gold,10);
 assert.equal(third.previous.previous,undefined);
 assert.throws(()=>A.recoverSlot(s,'1',A.slotStamp(second)));
 const restored=A.recoverSlot(s,'1',row.stamp);
 assert.equal(restored.profile.gold,10);assert.equal(restored.previous.profile.gold,20);
 assert.ok(A.isProfile(restored.profile));assert.equal(A.readSlots(s).slots[0].profile.gold,10);
});
test('a damaged current slot can recover a valid prior record but malformed storage is not overwritten',()=>{
 const s=storage(),p=A.createProfile('Recovery');
 const first=A.writeSlot(s,'2',p);
 const second=A.writeSlot(s,'2',{...p,gold:30},{overwrite:true,expectedStamp:A.slotStamp(first)});
 const raw=JSON.parse(s.getItem(A.SAVE_KEY));raw['2'].profile={};s.setItem(A.SAVE_KEY,JSON.stringify(raw));
 const row=A.readSlots(s).slots[0];assert.equal(row.status,'corrupt');assert.equal(row.recovery.profile.id,p.id);
 assert.equal(A.recoverSlot(s,'2',row.stamp).profile.gold,0);
 s.setItem(A.SAVE_KEY,'broken');assert.throws(()=>A.recoverSlot(s,'2',A.slotStamp(second)));assert.equal(s.getItem(A.SAVE_KEY),'broken');
});
test('movement checkpoints throttle writes, require actual displacement, and reject invalid position',()=>{
 const last={at:100,position:[6,0,0]};
 assert.equal(A.positionSaveDue(last,[10,0,0],10099),false);
 assert.equal(A.positionSaveDue(last,[6.2,0,0],10100),false);
 assert.equal(A.positionSaveDue(last,[7,0,0],10100),true);
 assert.equal(A.positionSaveDue(last,[6,10,0],10100),false);
 assert.equal(A.positionSaveDue(last,[NaN,0,0],10100),false);
 assert.equal(A.positionSaveDue(null,[7,0,0],10100),false);
});

import {createWorldTelemetry,WORLD_HEARTBEAT_INTERVAL} from '../src/components/fantasybattle/core/worldTelemetry.mjs';
test('unchanged exploration telemetry suppresses redundant updates but preserves checkpoint heartbeat',()=>{
 const t=createWorldTelemetry(),world={position:[6,0,0],discoveries:[],encounters:[],mode:'wilds'};
 assert.deepEqual(t.sample(world,0),{world,unchanged:false});
 for(let n=250;n<WORLD_HEARTBEAT_INTERVAL;n+=250)assert.equal(t.sample({...world},n),null);
 assert.deepEqual(t.sample(world,2000),{world,unchanged:true});
 const moved={...world,position:[8,0,0]};
 assert.deepEqual(t.sample(moved,2250),{world:moved,unchanged:false});
 assert.equal(t.sample(moved,2500),null);
 const found={...moved,discoveries:['disc_pilgrimage']};
 assert.deepEqual(t.sample(found,2750),{world:found,unchanged:false});
 t.reset();assert.deepEqual(t.sample(found,2800),{world:found,unchanged:false});
});
test('world merge preserves identity, rejects malformed metadata, and bounds legacy histories',()=>{
 const p=A.createProfile('Telemetry'),w={position:[...p.world.position],discoveries:[],regions:[]};
 assert.equal(A.updateWorld(p,w),p);
 assert.equal(A.updateWorld(p,{...w,regions:{},discoveries:['x'.repeat(161)]}),p);
 assert.equal(A.updateWorld(p,{...w,position:[NaN,0,0]}),p);
 const moved=A.updateWorld(p,{...w,position:[7,0,0]});assert.notEqual(moved,p);assert.equal(moved.world.discoveries,p.world.discoveries);
 const region=A.updateWorld(moved,{...w,position:[35,0,0],regions:[null,{id:'first',minX:0,maxX:35},{id:'second',minX:35,maxX:75}]});
 assert.deepEqual(region.world.visitedRegions,['second']);
 const legacy={...p,world:{...p.world,discoveries:Array(999).fill('legacy')}};
 const merged=A.updateWorld(legacy,{...w,discoveries:['new','overflow']});assert.equal(merged.world.discoveries.length,1000);assert.ok(A.isProfile(merged));
 assert.equal(A.updateWorld(merged,{...w,discoveries:['overflow']}),merged);
 assert.equal(A.isProfile({...p,equipped:{toString:null}}),false);
});

import {disposeResources,createCleanupScope} from '../src/components/fantasybattle/core/resourceCleanup.mjs';
test('final GPU cleanup disposes shared references once and continues after individual failure',()=>{
 let count=0;const shared={dispose(){count++;}},bad={dispose(){throw Error('driver');}},later={dispose(){count++;}};
 assert.deepEqual(disposeResources([shared,null,shared,bad,later,{}]),{disposed:2,failed:1});assert.equal(count,2);
});
test('viewer listener scope removes all callbacks and is idempotent',()=>{
 const scope=createCleanupScope(),target=new EventTarget();let count=0;
 scope.listen(target,'move',()=>count++);scope.listen(target,'move',()=>count++);
 target.dispatchEvent(new Event('move'));assert.equal(count,2);
 scope.close();scope.close();scope.listen(target,'move',()=>count++);
 target.dispatchEvent(new Event('move'));assert.equal(count,2);
 const world=readFileSync(new URL('../src/components/fantasybattle/world/sapphireWorld.js',import.meta.url),'utf8');
 for(const marker of ['this.cleanupScope.close()','this.forge.cache.clear()','this.assets?.geoCache.clear()','this.scene.environment=null','app.destroy();throw error','stop(){clearInterval(timer);app.destroy();}'])assert.ok(world.includes(marker),marker);
});

import {createConfirmationGate} from '../src/components/fantasybattle/core/confirmationGate.mjs';
test('confirmation actions are single use and bound to the original screen and character',()=>{
 const g=createConfirmationGate(),base={id:'16',running:true,profile:{id:'first'},encounter:null},live={...base,id:'40',stack:['10','16','40']};
 let calls=0;const action=()=>calls++;
 let t=g.open('Buy',action,base);assert.equal(g.consume(t,live),action);action();
 assert.equal(g.consume(t,live),null);assert.equal(calls,1);
 for(const change of [{profile:{id:'other'}},{encounter:{token:'new'}},{running:false},{stack:['10','22','40']},{id:'16'}]){
  t=g.open('Buy',action,base);assert.equal(g.consume(t,{...live,...change}),null);assert.equal(g.consume(t,live),null);
 }
 const old=g.open('Old',action,base),newer=g.open('New',action,base);
 assert.equal(g.consume(old,live),null);assert.equal(g.consume(newer,live),action);
 t=g.open('Cancel',action,base);g.cancel();assert.equal(g.consume(t,live),null);
 assert.equal(g.open('Nested',action,live),null);
 const title={id:'03',running:false,profile:null,encounter:null};
 t=g.open('Import',action,title);assert.equal(g.consume(t,{...title,id:'40',stack:['01','03','40']}),action);
 const defeat={id:'15',running:true,profile:{id:'first'},encounter:{token:'defeat'}};
 t=g.open('Exit',action,defeat);assert.equal(g.consume(t,{...defeat,id:'40',stack:['15','40']}),action);
});
test('every catalog screen has an explicit runtime switch case and confirmation is gated',()=>{
 const page=readFileSync(new URL('../src/components/fantasybattle/SapphireAdventure.jsx',import.meta.url),'utf8');
 const cases=[...page.matchAll(/case '(\d{2})':/g)].map(m=>m[1]);
 assert.equal(new Set(cases).size,48);
 for(const id of Object.keys(UI_SCREENS))assert.ok(cases.includes(id),id);
 assert.ok(page.includes('confirmGate.current.consume(ticket,current.current)'));
 assert.ok(page.includes('onClick={()=>executeConfirm(pending)}'));
 assert.ok(page.includes('onClick={dismissConfirm}'));
});

import {bondConversation,BOND_GIFT} from '../src/components/fantasybattle/core/companionBonds.mjs';
test('companion gifts require recruitment and ore, preserve other members and cap bond',()=>{
 let p=A.createProfile('Companion test');
 assert.equal(A.companionGiftQuote(p,'groveArcher').ok,false);assert.throws(()=>A.giveCompanionGift(p,'groveArcher'));
 assert.equal(bondConversation('groveArcher',A.memberFor(p,'groveArcher')),null);
 for(const m of A.ROSTER){p=A.rewardVictory(p,{id:m.requiredEncounter}).profile;p=A.recruitCompanion(p,m.id);}
 p={...p,inventory:{...p.inventory,sapphireOre:50}};
 for(const m of A.ROSTER){
  const before=p,quote=A.companionGiftQuote(p,m.id);assert.ok(quote.ok);
  const stats=A.memberStats(p,m.id);p=A.giveCompanionGift(p,m.id);
  assert.equal(p.inventory.sapphireOre,before.inventory.sapphireOre-BOND_GIFT.cost);
  assert.equal(A.memberFor(p,m.id).bond,quote.bond+quote.gain);
  assert.deepEqual(A.memberStats(p,m.id),stats);
  for(const other of A.ROSTER.filter(x=>x.id!==m.id))for(const key of ['recruited','active','hp','bond'])assert.equal(A.memberFor(p,other.id)[key],A.memberFor(before,other.id)[key]);
  assert.equal(p.party.front,before.party.front);
  const lines=[0,25,75].map(bond=>bondConversation(m.id,{recruited:true,bond}));
  assert.equal(new Set(lines).size,3);
 }
 assert.ok(A.isProfile(p));assert.deepEqual(A.parseBackup(A.exportBackup(p)),p);
 assert.throws(()=>A.giveCompanionGift(p,'__proto__'));
 assert.throws(()=>A.giveCompanionGift({...p,inventory:{...p.inventory,sapphireOre:0}},'groveArcher'));
 p={...p,party:{...p.party,bond:98}};
 const near=A.companionGiftQuote(p,'groveArcher');assert.equal(near.gain,2);
 const max=A.giveCompanionGift(p,'groveArcher');assert.equal(A.memberFor(max,'groveArcher').bond,100);assert.throws(()=>A.giveCompanionGift(max,'groveArcher'));
 assert.ok(A.isProfile(max));assert.equal(p.party.bond,98);
});

test('combine consumes only a spare bow, shares enhancement cap and preserves save compatibility',()=>{
 let p={...A.createProfile('Combiner'),gold:1000};
 assert.equal(A.combineQuote(p).ok,false);assert.throws(()=>A.combineWeapon(p));
 p=A.buyItem(p,'sapphireBow',2);p=A.equipItem(p,'sapphireBow');
 const before=p,q=A.combineQuote(p),stats=A.heroStats(p);assert.ok(q.ok);assert.equal(q.cost,5);
 p=A.combineWeapon(p);
 assert.equal(p.inventory.sapphireBow,1);assert.equal(p.equipped,'sapphireBow');assert.equal(p.gold,before.gold-5);
 assert.equal(A.heroStats(p).atk,stats.atk+2);assert.equal(p.inventory.sapphireOre,before.inventory.sapphireOre);
 assert.throws(()=>A.combineWeapon(p));assert.equal(before.inventory.sapphireBow,2);
 p={...p,inventory:{...p.inventory,sapphireOre:4,sapphireBow:2}};
 for(let i=0;i<4;i++)p=A.enhanceWeapon(p);
 assert.equal(p.enhancements.sapphireBow,5);assert.equal(A.combineQuote(p).ok,false);assert.throws(()=>A.combineWeapon(p));
 assert.ok(A.isProfile(p));assert.deepEqual(A.parseBackup(A.exportBackup(p)),p);
 const insufficient={...before,gold:0};assert.throws(()=>A.combineWeapon(insufficient));
});

import {ascensionLevel,activeGearSet,scaledSet} from '../src/components/fantasybattle/core/equipmentCatalog.mjs';
test('ascension increases only completed set bonuses by 25 percent per rank, per wearer',()=>{
 let p={...A.createProfile('Ascender'),xp:300,gold:1000};
 p={...p,inventory:{...p.inventory,sapphireOre:50,pilgrimCuirass:2,pilgrimCloak:2}};
 assert.equal(A.ascendQuote(p).ok,false);
 p=A.equipGear(p,'hero','armor','pilgrimCuirass');
 assert.throws(()=>A.ascendSet(p));
 p=A.equipGear(p,'hero','mantle','pilgrimCloak');
 const baseline=A.heroStats(p),baseInventory=p.inventory,baseEnhancements=p.enhancements;
 for(let rank=1;rank<=4;rank++){
  const q=A.ascendQuote(p);assert.ok(q.ok);assert.equal(q.level,rank-1);
  const before=p;p=A.ascendSet(p);
  assert.equal(p.gold,before.gold-q.cost);assert.equal(p.inventory.sapphireOre,before.inventory.sapphireOre-q.ore);
  assert.equal(ascensionLevel(p,'hero','pilgrim'),rank);assert.equal(activeGearSet(p,'hero').def,2+rank*.5);
  assert.equal(A.heroStats(p).def,baseline.def+rank*.5);assert.equal(A.heroStats(p).atk,baseline.atk);
  assert.equal(A.heroStats(p).spd,baseline.spd);assert.ok(A.isProfile(p));
 }
 assert.equal(p.inventory.pilgrimCuirass,baseInventory.pilgrimCuirass);assert.deepEqual(p.enhancements,baseEnhancements);
 assert.equal(A.ascendQuote(p).ok,false);assert.throws(()=>A.ascendSet(p));
 assert.deepEqual(A.parseBackup(A.exportBackup(p)),p);
 const removed=A.equipGear(p,'hero','mantle',null);assert.equal(activeGearSet(removed,'hero'),null);assert.equal(ascensionLevel(removed,'hero','pilgrim'),4);
 const restored=A.equipGear(removed,'hero','mantle','pilgrimCloak');assert.deepEqual(A.heroStats(restored),A.heroStats(p));
 let ally=A.rewardVictory(p,{id:'wilds_grove_01'}).profile;ally=A.recruitCompanion(ally,'groveArcher');
 ally=A.equipGear(ally,'groveArcher','armor','pilgrimCuirass');ally=A.equipGear(ally,'groveArcher','mantle','pilgrimCloak');
 assert.equal(activeGearSet(ally,'groveArcher').def,2);assert.equal(A.ascendQuote(ally,'groveArcher').level,0);
 ally=A.ascendSet(ally,'groveArcher');assert.equal(activeGearSet(ally,'groveArcher').def,2.5);assert.equal(activeGearSet(ally,'hero').def,4);
 for(const ascensions of [{hero:{pilgrim:5}},{hero:{pilgrim:1.5}},{hero:{unknown:1}},{mistScout:{pilgrim:1}},{unknown:{pilgrim:1}},null])assert.equal(A.isProfile({...p,ascensions}),false);
 assert.equal(scaledSet('moonveil',1).spd,1.25);
});

import {SOCKET_GEMS,socketFor,equippedSocketItems} from '../src/components/fantasybattle/core/equipmentCatalog.mjs';
test('socket gems apply only to equipped eligible types, upgrade and replace without stacking',()=>{
 let p={...A.createProfile('Socket test'),xp:300,gold:1000};
 p={...p,inventory:{...p.inventory,sapphireOre:40,sapphireBow:1,pilgrimCuirass:2,pilgrimCloak:1}};
 assert.deepEqual(equippedSocketItems(p,'hero'),[]);
 assert.equal(A.socketQuote(p,'hero','starterBow','ruby').ok,false);
 assert.equal(A.socketQuote(p,'hero','sapphireBow',undefined).ok,false);
 assert.throws(()=>A.socketEquipment(p,'hero','sapphireBow','ruby'));
 p=A.equipItem(p,'sapphireBow');p=A.equipGear(p,'hero','armor','pilgrimCuirass');p=A.equipGear(p,'hero','mantle','pilgrimCloak');
 const baseline=A.heroStats(p),base=p;
 for(let rank=1;rank<=3;rank++){
  const q=A.socketQuote(p,'hero','sapphireBow','ruby');assert.ok(q.ok);assert.equal(q.nextRank,rank);
  const before=p;p=A.socketEquipment(p,'hero','sapphireBow','ruby');
  assert.equal(p.gold,before.gold-q.cost);assert.equal(p.inventory.sapphireOre,before.inventory.sapphireOre-q.ore);
  assert.equal(A.heroStats(p).atk,baseline.atk+rank);assert.equal(p.inventory.sapphireBow,1);assert.ok(A.isProfile(p));
 }
 assert.throws(()=>A.socketEquipment(p,'hero','sapphireBow','ruby'));
 assert.equal(A.socketQuote(p,'hero','sapphireBow','emerald').replacing,true);
 p=A.socketEquipment(p,'hero','sapphireBow','emerald');
 assert.deepEqual(socketFor(p,'hero','sapphireBow'),{gem:'emerald',rank:1});
 assert.equal(A.heroStats(p).atk,baseline.atk);assert.equal(A.heroStats(p).spd,baseline.spd+1);
 const stowed=A.equipItem(p,'starterBow');assert.equal(A.heroStats(stowed).spd,baseline.spd);
 assert.deepEqual(socketFor(stowed,'hero','sapphireBow'),{gem:'emerald',rank:1});
 assert.deepEqual(A.heroStats(A.equipItem(stowed,'sapphireBow')),A.heroStats(p));
 p=A.socketEquipment(p,'hero','pilgrimCuirass','sapphire');assert.equal(A.heroStats(p).def,baseline.def+1);
 assert.deepEqual(A.parseBackup(A.exportBackup(p)),p);
 assert.deepEqual(A.parseBackup(A.exportBackup(base)),base);
 assert.equal(A.socketQuote({...p,gold:0},'hero','pilgrimCuirass','sapphire').ok,false);
 assert.equal(A.socketQuote({...p,inventory:{...p.inventory,sapphireOre:0}},'hero','pilgrimCuirass','sapphire').ok,false);
 assert.equal(A.socketQuote(p,'hero','pilgrimCloak','__proto__').ok,false);
 const ally=A.recruitCompanion(A.rewardVictory(p,{id:'wilds_grove_01'}).profile,'groveArcher');
 let equipped=A.equipGear(ally,'groveArcher','armor','pilgrimCuirass');const allyStats=A.memberStats(equipped,'groveArcher'),heroStats=A.heroStats(equipped);
 equipped=A.socketEquipment(equipped,'groveArcher','pilgrimCuirass','ruby');
 assert.equal(A.memberStats(equipped,'groveArcher').atk,allyStats.atk+1);assert.deepEqual(A.heroStats(equipped),heroStats);
 for(const sockets of [{hero:{starterBow:{gem:'ruby',rank:1}}},{hero:{sapphireBow:{gem:'ruby',rank:4}}},{hero:{sapphireBow:{gem:'bogus',rank:1}}},{mistScout:{pilgrimCuirass:{gem:'ruby',rank:1}}},null])assert.equal(A.isProfile({...p,sockets}),false);
 assert.equal(Object.keys(SOCKET_GEMS).length,3);
});

import {enchantRank,enchantBonus} from '../src/components/fantasybattle/core/equipmentCatalog.mjs';
test('enchant scales only original equipment attributes, caps ranks and preserves other upgrade systems',()=>{
 let p={...A.createProfile('Enchanter'),xp:300,gold:1000};
 p={...p,inventory:{...p.inventory,sapphireOre:50,sapphireBow:1,pilgrimCuirass:2,pilgrimCloak:1}};
 assert.equal(A.enchantQuote(p,'hero','starterBow').ok,false);
 assert.throws(()=>A.enchantEquipment(p,'hero','sapphireBow'));
 p=A.equipItem(p,'sapphireBow');p=A.equipGear(p,'hero','armor','pilgrimCuirass');p=A.equipGear(p,'hero','mantle','pilgrimCloak');
 p=A.enhanceWeapon(p);p=A.socketEquipment(p,'hero','sapphireBow','ruby');p=A.ascendSet(p,'hero');
 const before=p,baseline=A.heroStats(p);
 for(let rank=1;rank<=3;rank++){
  const q=A.enchantQuote(p,'hero','sapphireBow'),prior=p;
  assert.ok(q.ok);assert.equal(q.nextRank,rank);
  p=A.enchantEquipment(p,'hero','sapphireBow');
  assert.equal(p.gold,prior.gold-q.cost);assert.equal(p.inventory.sapphireOre,prior.inventory.sapphireOre-q.ore);
  assert.equal(enchantRank(p,'hero','sapphireBow'),rank);
  assert.ok(Math.abs(A.heroStats(p).atk-baseline.atk-4*rank/10)<1e-9);
  assert.equal(A.heroStats(p).def,baseline.def);assert.equal(A.heroStats(p).spd,baseline.spd);
  assert.ok(A.isProfile(p));
 }
 assert.throws(()=>A.enchantEquipment(p,'hero','sapphireBow'));
 assert.deepEqual(p.enhancements,before.enhancements);assert.deepEqual(p.sockets,before.sockets);assert.deepEqual(p.ascensions,before.ascensions);
 p=A.enchantEquipment(p,'hero','pilgrimCuirass');
 assert.ok(Math.abs(A.heroStats(p).def-baseline.def-.4)<1e-9);
 assert.deepEqual(enchantBonus('pilgrimCuirass',1),{atk:.1,def:.4,spd:0});
 const stowed=A.equipItem(p,'starterBow');assert.equal(enchantRank(stowed,'hero','sapphireBow'),3);
 assert.deepEqual(A.heroStats(A.equipItem(stowed,'sapphireBow')),A.heroStats(p));
 const removed=A.equipGear(p,'hero','armor',null);
 assert.equal(enchantRank(removed,'hero','pilgrimCuirass'),1);
 assert.deepEqual(A.heroStats(A.equipGear(removed,'hero','armor','pilgrimCuirass')),A.heroStats(p));
 assert.deepEqual(A.parseBackup(A.exportBackup(p)),p);assert.deepEqual(A.parseBackup(A.exportBackup(before)),before);
 assert.equal(A.enchantQuote({...p,gold:0},'hero','pilgrimCuirass').ok,false);
 assert.equal(A.enchantQuote({...p,inventory:{...p.inventory,sapphireOre:0}},'hero','pilgrimCuirass').ok,false);
 let ally=A.recruitCompanion(A.rewardVictory(p,{id:'wilds_grove_01'}).profile,'groveArcher');
 ally=A.equipGear(ally,'groveArcher','armor','pilgrimCuirass');const hs=A.heroStats(ally),as=A.memberStats(ally,'groveArcher');
 ally=A.enchantEquipment(ally,'groveArcher','pilgrimCuirass');assert.deepEqual(A.heroStats(ally),hs);assert.ok(Math.abs(A.memberStats(ally,'groveArcher').def-as.def-.4)<1e-9);
 for(const enchants of [null,{hero:{starterBow:1}},{hero:{sapphireBow:4}},{hero:{sapphireBow:1.5}},{hero:{unknown:1}},{mistScout:{pilgrimCuirass:1}}])assert.equal(A.isProfile({...p,enchants}),false);
});

import {PASSIVES,learnedPassives,applyPassives} from '../src/components/fantasybattle/core/passiveSkills.mjs';
test('automatic passives unlock from level without spending points or adding actions',()=>{
 const p=A.createProfile('Passive test'),base=A.heroStats(p);
 assert.deepEqual(learnedPassives(1),[]);assert.deepEqual(A.heroStats(p),base);
 for(const [xp,atk,def,spd] of [[100,1,0,0],[200,1,1,0],[300,1,1,1],[400,1,1,1]]){
  const next={...p,xp},stats=A.heroStats(next);
  assert.deepEqual(stats,{...base,atk:base.atk+atk,def:base.def+def,spd:base.spd+spd});
  assert.equal(A.pointsFor(next),xp/100);assert.ok(A.isProfile(next));
  assert.deepEqual(A.parseBackup(A.exportBackup(next)),next);
  assert.ok(A.availableActions(A.levelFor(xp)).every(id=>!Object.hasOwn(PASSIVES,id)));
 }
 const result=A.rewardVictory({...p,xp:99},{id:'passive-test',category:'Normal'});
 assert.ok(result.unlocked.includes('steadyAim'));assert.ok(result.unlocked.includes('volley'));
 assert.deepEqual(A.rewardVictory(result.profile,{id:'passive-test',category:'Normal'}).unlocked,[]);
 assert.deepEqual(applyPassives(base,4),A.heroStats({...p,xp:300}));assert.deepEqual(base,A.heroStats(p));
 const page=readFileSync(new URL('../src/components/fantasybattle/SapphireAdventure.jsx',import.meta.url),'utf8');
 for(const marker of ['fa-skillbook-passive-nodes','PASSIVE_IDS.map','learnedPassives(level)','learnedSkills(level).includes(id)','result.unlocked.map(skillName)'])assert.ok(page.includes(marker),marker);
});

test('Moonfall is a leader-only full-Focus ultimate, used at most once per battle',()=>{
 const base={name:'Fighter',maxHp:1000,atk:12,def:10,spd:11};
 const hero={...base,id:'hero',team:'player',focus:3,actions:[...B.ACTION_ORDER,B.ULTIMATE_ID]};
 const ally={...base,id:'ally',team:'player',focus:3,actions:[...B.ACTION_ORDER,B.ULTIMATE_ID]};
 const enemy={...base,id:'enemy',team:'enemy',focus:3,actions:[...B.ACTION_ORDER,B.ULTIMATE_ID]};
 const fresh=B.createBattle({seed:42,units:[hero,ally,enemy]});
 assert.ok(B.isLegal(fresh,'hero',B.ULTIMATE_ID));
 assert.equal(B.isLegal(fresh,'ally',B.ULTIMATE_ID),false);
 assert.equal(B.isLegal(fresh,'enemy',B.ULTIMATE_ID),false);
 assert.equal(B.isLegal(B.createBattle({units:[{...hero,focus:2},enemy]}),'hero',B.ULTIMATE_ID),false);
 assert.equal(B.isLegal(B.createBattle({units:[{...hero,actions:B.ACTION_ORDER},enemy]}),'hero',B.ULTIMATE_ID),false);
 const {battle,round}=B.resolveRound(fresh,{hero:B.ULTIMATE_ID,ally:'guard',enemy:'guard'});
 assert.equal(B.unitById(battle,'hero').focus,0);assert.equal(B.unitById(battle,'hero').ultimateUsed,true);
 assert.equal(round.steps.find(s=>s.actor==='hero').hits.length,1);assert.equal(B.unitById(fresh,'hero').ultimateUsed,undefined);
 const charged=B.resolveRound(B.resolveRound(battle,{hero:'guard',ally:'guard',enemy:'guard'}).battle,{hero:'guard',ally:'guard',enemy:'guard'}).battle;
 assert.equal(B.unitById(charged,'hero').focus,3);assert.equal(B.isLegal(charged,'hero',B.ULTIMATE_ID),false);
 assert.throws(()=>B.resolveRound(charged,{hero:B.ULTIMATE_ID,ally:'guard',enemy:'guard'}));
 assert.equal(B.isLegal(B.createBattle({units:[hero,enemy]}),'hero',B.ULTIMATE_ID),true);
 assert.equal(A.availableActions(B.ULTIMATE_LEVEL-1).includes(B.ULTIMATE_ID),false);
 assert.equal(A.availableActions(B.ULTIMATE_LEVEL).includes(B.ULTIMATE_ID),true);
 const result=A.rewardVictory({...A.createProfile('Moonfall'),xp:299},{id:'moonfall-test',category:'Normal'});
 assert.ok(result.unlocked.includes(B.ULTIMATE_ID));
 assert.ok(result.unlocked.includes('windstep'));
 assert.equal(B.ACTIONS[B.ULTIMATE_ID].skill,'chargedShot');
});

import {ENCOUNTER_BALANCE,encounterBalance} from '../src/components/fantasybattle/core/enemyCatalog.mjs';
test('all 14 encounters have fixed regional tuning and bounded party-size scaling',()=>{
 assert.equal(Object.keys(ENCOUNTER_BALANCE).length,14);
 assert.equal(encounterBalance('__proto__'),null);
 for(const [id,tier] of Object.entries(ENCOUNTER_BALANCE)){
  const solo=enemyFormation({id},1),full=enemyFormation({id},4);
  assert.equal(solo[0].maxHp,tier.hp);
  assert.equal(full[0].maxHp,Math.round(tier.hp*1.54));
  assert.equal(full[0].atk,tier.atk);assert.equal(full[0].def,tier.def);
  assert.equal(enemyFormation({id},NaN)[0].maxHp,tier.hp);
  assert.deepEqual(enemyFormation({id},999),full);
  assert.ok(full.every(u=>['maxHp','atk','def','spd'].every(k=>Number.isInteger(u[k])&&u[k]>0)));
 }
 assert.ok(encounterBalance('wilds_astral_elite').hp>encounterBalance('wilds_grove_01').hp);
 assert.equal(enemyFormation({id:'wilds_grove_01',practice:true},1)[0].maxHp,120);
});
test('reference starter and tactically guarded late-game party remain viable in deterministic battles',()=>{
 const leader={id:'hero',team:'player',maxHp:140,atk:28,def:22,spd:13,actions:['quickShot','guard','volley','chargedShot','moonfall']};
 const party=[{id:'pilgrimWarden',team:'player',maxHp:135,atk:10,def:18,spd:7,combatClass:'warden'},leader,{id:'groveArcher',team:'player',maxHp:85,atk:10,def:10,spd:9,actions:['quickShot','guard','volley']},{id:'mistScout',team:'player',maxHp:75,atk:13,def:10,spd:16,combatClass:'scout'}];
 function simulate(id,allies){
  let wins=0,rounds=0;
  for(let seed=1;seed<=64;seed++){
   let battle=B.createBattle({seed,units:[...allies,...enemyFormation({id},allies.length)]});
   for(let n=0;n<45&&battle.phase==='choose';n++){
    const choices={};
    for(const u of battle.units.filter(u=>!u.ko&&u.team==='enemy'))choices[u.id]=B.chooseAiAction(battle,u.id);
    const front=battle.units.find(u=>u.team==='player'&&!u.ko);
    for(const u of battle.units.filter(u=>!u.ko&&u.team==='player')){
     const legal=B.legalActions(battle,u.id).filter(a=>a.enabled).map(a=>a.id);
     const guard=u.id==='pilgrimWarden'?'bulwark':'guard';
     const danger=['celestialLance','starfall','eclipseRay'].includes(choices.rival);
     choices[u.id]=u===front&&danger&&legal.includes(guard)?guard:['moonfall','chargedShot','shieldBash','daggerLunge','volley','swordFlurry','daggerFlurry','quickShot','swordSlash','daggerJab','guard','bulwark'].find(a=>legal.includes(a));
    }
    battle=B.resolveRound(battle,choices).battle;
   }
   wins+=Number(battle.winner==='player');rounds+=battle.round-1;
  }
  return {wins,rounds};
 }
 const starter=simulate('wilds_grove_01',[{...leader,maxHp:120,atk:12,def:10,spd:11,actions:['quickShot','guard']}]);
 const boss=simulate('wilds_sanctuary_boss',party),final=simulate('wilds_astral_elite',party);
 assert.ok(starter.wins>=56);assert.ok(boss.wins>=40&&boss.wins<64);assert.ok(final.wins>=40&&final.wins<64);
 assert.ok(boss.rounds>starter.rounds);assert.ok(final.rounds>starter.rounds);
});
