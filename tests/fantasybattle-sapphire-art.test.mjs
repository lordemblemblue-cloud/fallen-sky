import test from 'node:test';
import assert from 'node:assert/strict';
import {UI_SCREENS} from '../src/components/fantasybattle/uiCatalog.mjs';
import {makeSapphireTemplate,artFor,artUrl,templateUrl} from '../src/components/fantasybattle/sapphireArt.mjs';
const assets=new Set(['title-original','sanctuary','celestial','ruins','moonlit','wilds']);
test('all 48 artwork frames are text free',()=>{assert.equal(Object.keys(UI_SCREENS).length,48);for(const id of Object.keys(UI_SCREENS)){const s=makeSapphireTemplate(id);assert.match(s,/^<svg/);assert.match(s,/<\/svg>$/);assert.doesNotMatch(s,/<text[ >]|<foreignObject|<script/i);}});
test('screen artwork points only to registered assets',()=>{for(const id of Object.keys(UI_SCREENS))for(const running of [true,false]){const a=artFor(id,running);if(a.asset){assert.ok(assets.has(a.asset));assert.match(artUrl(a.asset),/\.webp$/);}}});
test('gameplay HUD and confirmation overlays never cover the world with an opaque picture',()=>{for(const id of ['09','10','41'])assert.equal(artFor(id,true).mode,'transparent');for(const id of ['04','13','39','40','47'])assert.equal(artFor(id,true).mode,'overlay');});

import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const verifiedAssets=[["backgrounds/celestial.webp","6a0a9b62c24fafb9772e3689b20bf52e348fd07b"],["backgrounds/moonlit.webp","5a8900f58a3f5af0c1812c8afdfdeef8c5cf7772"],["backgrounds/ruins.webp","c62d8ed343ee91d6df911a46614955410cdc749b"],["backgrounds/sanctuary.webp","91d9fa3560f935a66c7990b874042dccfde0ccd0"],["backgrounds/title-original.webp","2b63ab980bd29150af8d8b6a06026a268391a74b"],["backgrounds/wilds.webp","01f1f7f4818b99f976bc1d152df02b9d1b94759c"],["illustrations/item-acquired.webp","da87e8b08b703cbc47de188d253d60d12ac600f5"],["illustrations/quest-complete.webp","b0dfd13bd2f68cc76785c6e2b0351ecae5445d4b"],["illustrations/quest-offer.webp","036ba9c7f654fde05ffb4bacec820f802e073d90"],["illustrations/skill-unlocked.webp","d1e4d4e07efd1a4d63d1ffb328acfddb1fd2854a"]];
test('all ten shipped painted assets are valid WebP files and match approved blob hashes',()=>{for(const [name,expected] of verifiedAssets){const bytes=readFileSync(new URL('../public/fantasybattle/sapphire/'+name,import.meta.url));assert.equal(bytes.subarray(0,4).toString(),'RIFF');assert.equal(bytes.subarray(8,12).toString(),'WEBP');const hash=createHash('sha1').update('blob '+bytes.length).update(Buffer.from([0])).update(bytes).digest('hex');assert.equal(hash,expected,name);}});

test('refined static frames are cached and all panels fit the normalized canvas',()=>{for(const [id,s] of Object.entries(UI_SCREENS)){const frame=makeSapphireTemplate(id),url=templateUrl(id);assert.equal(url,templateUrl(id));assert.equal(decodeURIComponent(url.split(',')[1]),frame);assert.match(frame,/id="edge"/);assert.match(frame,/id="sheen"/);assert.doesNotMatch(frame,/<filter|<animate|<text[ >]/i);for(const [x,y,w,h] of s.layout){assert.ok(x>=0&&y>=0&&w>0&&h>0);assert.ok(x+w<=1.000001&&y+h<=1.000001);}}assert.equal(templateUrl('invalid'),'');assert.ok(UI_SCREENS['09'].layout[3][3]>.3);});


import {STAGED_ORIGINAL_ART,stagedOriginalFor,ORIGINAL_SAVE_PLAQUE} from '../src/components/fantasybattle/sapphireArt.mjs';
test('staged original artwork uses only explicit owner-media WebP URLs',()=>{
 const allowed=/^https:\/\/media\.base44\.com\/images\/public\/6af625cd654fa5b8954442ce\/[a-zA-Z0-9_-]+\.webp$/;
 assert.deepEqual(Object.keys(STAGED_ORIGINAL_ART).sort(),['01','02','03','04','05','06','07','08','09','10','11','12','13','14','15','18','19','20','23','25','26','27','30','31','32','35','36','40','42','43','44','45','47']);
 for(const [id,entry] of Object.entries(STAGED_ORIGINAL_ART)){
  assert.ok(Object.hasOwn(UI_SCREENS,id));assert.equal(stagedOriginalFor(id),entry);
  assert.equal(entry.mode,'full');assert.match(entry.url,allowed);assert.ok(entry.source);
 }
 assert.match(ORIGINAL_SAVE_PLAQUE,allowed);
 for(const id of ['invalid','__proto__','constructor'])assert.equal(stagedOriginalFor(id),null);
});

 test('original menu plates use wide-only staging and never register sample save data',()=>{assert.equal(stagedOriginalFor('01').wideOnly,true);assert.equal(stagedOriginalFor('02').wideOnly,true);assert.equal(stagedOriginalFor('35').wideOnly,undefined);});

test('settings and save art preserve responsive fallback',()=>{for(const id of ['03','18']){assert.equal(stagedOriginalFor(id).wideOnly,true);assert.match(templateUrl(id),/^data:image\/svg\+xml,/);}});

test('pause and character plates use wide-only staging',()=>{for(const id of ['04','19','20','47']){assert.equal(stagedOriginalFor(id).wideOnly,true);assert.match(templateUrl(id),/^data:image\/svg\+xml,/);}});

test('character statistics art is optional and uses live profile and equipment data',()=>{
 assert.equal(stagedOriginalFor('05').wideOnly,true);
 assert.match(templateUrl('05'),/^data:image\/svg\+xml,/);
 const page=readFileSync(new URL('../src/components/fantasybattle/SapphireAdventure.jsx',import.meta.url),'utf8');
 const section=page.slice(page.indexOf("case '05':"),page.indexOf("case '06':"));
 for(const marker of ['fa-original-character','profile.hp','stats.maxHp','stats.atk','stats.def','stats.spd','pointsFor(profile)','gearFor(profile','availableActions(level)','statPanel'])assert.ok(section.includes(marker),marker);
});

test('equipment plate uses original image with actual owned inventory and existing equip transactions',()=>{
 assert.equal(stagedOriginalFor('06').wideOnly,true);
 assert.ok(templateUrl('06').startsWith('data:image/svg+xml,'));
 const page=readFileSync(new URL('../src/components/fantasybattle/SapphireAdventure.jsx',import.meta.url),'utf8');
 const section=page.slice(page.indexOf("case '06':"),page.indexOf("case '07':"));
 for(const marker of ['fa-original-equipment','inv[k]>0','gearCount(profile,itemId)','memberStats(profile,wearer)','gearCompare','equipGear(p,wearer','equipItem(p,itemId)','Boolean(profile&&selectedOwned','!encounter'])assert.ok(section.includes(marker),marker);
});

test('wardrobe uses original artwork, draft-only palette selection, and validated application on both layouts',()=>{
 assert.equal(stagedOriginalFor('27').wideOnly,true);
 assert.ok(templateUrl('27').startsWith('data:image/svg+xml,'));
 const page=readFileSync(new URL('../src/components/fantasybattle/SapphireAdventure.jsx',import.meta.url),'utf8');
 const section=page.slice(page.indexOf('function Wardrobe('),page.indexOf('function SaveToast('));
 for(const marker of ['fa-original-wardrobe','Object.entries(APPEARANCES)','setPreview(key)','appearance:preview','chooseAppearance(preview)','setPreview(saved)','Boolean(encounter)','disabled={locked||!dirty}','<Panel rect={layout[0]}'])assert.ok(section.includes(marker),marker);
 assert.match(page,/case '27':content=<Wardrobe/);
});

test('skillbook original plate uses real battle actions and automatic progression',()=>{
 assert.equal(stagedOriginalFor('12').wideOnly,true);
 assert.ok(templateUrl('12').startsWith('data:image/svg+xml,'));
 const page=readFileSync(new URL('../src/components/fantasybattle/SapphireAdventure.jsx',import.meta.url),'utf8');
 const section=page.slice(page.indexOf('function Skillbook('),page.indexOf('function SaveToast('));
 for(const marker of ['fa-original-skillbook','ACTION_ORDER.map','availableActions(level)','ACTIONS[selectedId]','learnedAt[selectedId]','action.focusCost','action.focusGain','setSelectedId(id)','<Panel rect={layout[0]}','No manual skill upgrades'])assert.ok(section.includes(marker),marker);
 assert.match(page,/case '12':content=<Skillbook/);
});

test('original attribute screen previews a bounded draft before confirming via existing allocation logic',()=>{
 assert.equal(stagedOriginalFor('32').wideOnly,true);
 assert.ok(templateUrl('32').startsWith('data:image/svg+xml,'));
 const page=readFileSync(new URL('../src/components/fantasybattle/SapphireAdventure.jsx',import.meta.url),'utf8');
 const section=page.slice(page.indexOf('function Attributes('),page.indexOf('function SaveToast('));
 for(const marker of ['fa-original-attributes','pointsFor(profile)','draft.slice(0,budget)','allocate(p,k)','old.length<budget','setDraft([])','onConfirm(profile,draft)','submitted.current','<Panel rect={layout[0]}'])assert.ok(section.includes(marker),marker);
 const handler=page.slice(page.indexOf("case '32':"),page.indexOf("case '33':"));
 for(const marker of ['live!==base','draft.length>pointsFor(live)','STAT_KEYS.includes(k)','autosave(next)','finishLevel()'])assert.ok(handler.includes(marker),marker);
});

test('original skill unlock notification reflects only awarded and learned skills',()=>{
 assert.equal(stagedOriginalFor('45').wideOnly,true);
 assert.ok(templateUrl('45').startsWith('data:image/svg+xml,'));
 const page=readFileSync(new URL('../src/components/fantasybattle/SapphireAdventure.jsx',import.meta.url),'utf8');
 const section=page.slice(page.indexOf('function SkillUnlocked('),page.indexOf('function SaveToast('));
 for(const marker of ['fa-original-unlock','result?.unlocked','new Set(result.unlocked)','ACTION_ORDER.includes(id)','learned.includes(id)','ACTIONS[selected]','learnedAt[selected]','SkillArt id={selected}','No newly unlocked abilities','onContinue','onSkillbook','<Panel rect={layout[0]}'])assert.ok(section.includes(marker),marker);
 assert.match(page,/case '45':content=<SkillUnlocked/);
});

test('original party formation uses existing roster, party slots and validated mutations',()=>{
 assert.equal(stagedOriginalFor('11').wideOnly,true);
 assert.ok(templateUrl('11').startsWith('data:image/svg+xml,'));
 const page=readFileSync(new URL('../src/components/fantasybattle/SapphireAdventure.jsx',import.meta.url),'utf8');
 const section=page.slice(page.indexOf('function PartyFormation('),page.indexOf('function SaveToast('));
 for(const marker of ['fa-original-party','activeRoster(profile)','partyFor(profile)','memberFor(profile','configureParty(p,','Boolean(encounter)','memberStats(profile','length:4','No formation stat bonuses','<Panel rect={layout[0]}'])assert.ok(section.includes(marker),marker);
 assert.match(page,/case '11':content=<PartyFormation/);
});

test('original recruitment uses actual roster and encounter-gated transaction',()=>{
 assert.equal(stagedOriginalFor('26').wideOnly,true);
 assert.ok(templateUrl('26').startsWith('data:image/svg+xml,'));
 const page=readFileSync(new URL('../src/components/fantasybattle/SapphireAdventure.jsx',import.meta.url),'utf8');
 const section=page.slice(page.indexOf('function Recruitment('),page.indexOf('function SaveToast('));
 for(const marker of ['fa-original-recruit','ROSTER.map','memberFor(profile','completedEncounters.includes(selected.requiredEncounter)','memberStats(profile,selected.id)','actionsForClass(selected.combatClass)','member.recruited||Boolean(encounter)||!eligible','onRecruit(selected)','decorative','<Panel rect={layout[0]}'])assert.ok(section.includes(marker),marker);
 const handler=page.slice(page.indexOf("case '26':"),page.indexOf("case '27':"));
 assert.ok(handler.includes("requestConfirm("));
 assert.ok(handler.includes("transact(p=>recruitCompanion(p,m.id)"));
});

test('original bonds interface reads actual recruited companion progression without fictional rewards',()=>{
 assert.equal(stagedOriginalFor('30').wideOnly,true);
 assert.ok(templateUrl('30').startsWith('data:image/svg+xml,'));
 const page=readFileSync(new URL('../src/components/fantasybattle/SapphireAdventure.jsx',import.meta.url),'utf8');
 const section=page.slice(page.indexOf('function CompanionBonds('),page.indexOf('function SaveToast('));
 for(const marker of ['fa-original-bonds','memberFor(profile','state.bond','bond>=75','bond>=25','max={100}','Practice and repeat victories do not count','No bond-based statistic bonuses','no rewards are claimable','<Btn disabled>Gifts','<Panel rect={layout[0]}'])assert.ok(section.includes(marker),marker);
 assert.match(page,/case '30':content=<CompanionBonds/);
 assert.ok(!section.includes('transact('));
});

test('original world map uses streamed regions and discovered-only travel navigation',()=>{
 assert.equal(stagedOriginalFor('07').wideOnly,true);
 assert.ok(templateUrl('07').startsWith('data:image/svg+xml,'));
 const page=readFileSync(new URL('../src/components/fantasybattle/SapphireAdventure.jsx',import.meta.url),'utf8');
 const section=page.slice(page.indexOf('function WorldMap('),page.indexOf('function SaveToast('));
 for(const marker of ['fa-original-worldmap','world?.regions','visitedRegions.includes(r.id)','world?.encounters','<RegionMap world={world} profile={profile}','visited.find','!profile||!selected||Boolean(encounter)','onTravel(selected)','conceptual, not navigable geography','<Panel rect={layout[0]}'])assert.ok(section.includes(marker),marker);
 assert.match(page,/case '07':content=<WorldMap/);
});

test('original quest journal reads saved state and records completion without repeat rewards',()=>{
 assert.equal(stagedOriginalFor('08').wideOnly,true);
 assert.ok(templateUrl('08').startsWith('data:image/svg+xml,'));
 const page=readFileSync(new URL('../src/components/fantasybattle/SapphireAdventure.jsx',import.meta.url),'utf8');
 const section=page.slice(page.indexOf('function QuestJournal('),page.indexOf('function SaveToast('));
 for(const marker of ['fa-original-journal','profile?.quests.grove','completedEncounters.includes','state===\'complete\'&&!encounter','No additional reward','No additional quests','<Panel rect={layout[0]}'])assert.ok(section.includes(marker),marker);
 const handler=page.slice(page.indexOf("case '08':"),page.indexOf("case '09':"));
 assert.ok(handler.includes('transact(p=>'));
 assert.ok(handler.includes('claimGroveQuest(p)'));
 assert.ok(handler.includes("p.quests.grove!=='complete'"));
 assert.ok(!handler.includes('rewardVictory'));
});

test('original fast travel validates live discovered destinations before confirmation',()=>{
 assert.equal(stagedOriginalFor('25').wideOnly,true);
 assert.ok(templateUrl('25').startsWith('data:image/svg+xml,'));
 const page=readFileSync(new URL('../src/components/fantasybattle/SapphireAdventure.jsx',import.meta.url),'utf8');
 const section=page.slice(page.indexOf('function FastTravel('),page.indexOf('function SaveToast('));
 for(const marker of ['fa-original-fast-travel','visitedRegions.includes(r.id)','visited.find','disabled={!discovered}','profile&&selected&&!encounter','onTravel(selected)','<RegionMap world={world} profile={profile}','<Panel rect={layout[0]}'])assert.ok(section.includes(marker),marker);
 const handler=page.slice(page.indexOf("case '25':"),page.indexOf("case '26':"));
 for(const marker of ['requestConfirm','p.id!==profileId','current.current.world?.regions.find','travelTo(p,liveRegion)','transact(p=>','post(\'restore\''])assert.ok(handler.includes(marker),marker);
});

test('original discovery screen reports persisted region and landmark data without awarding loot',()=>{
 assert.equal(stagedOriginalFor('42').wideOnly,true);
 assert.ok(templateUrl('42').startsWith('data:image/svg+xml,'));
 const page=readFileSync(new URL('../src/components/fantasybattle/SapphireAdventure.jsx',import.meta.url),'utf8');
 const section=page.slice(page.indexOf('function RegionDiscovery('),page.indexOf('function SaveToast('));
 for(const marker of ['fa-original-discovery','visited.includes(discovery.id)','world.discoveries.includes(discovery.id)','No new discovery','onContinue','onMap','<Panel rect={layout[0]}'])assert.ok(section.includes(marker),marker);
 assert.ok(!section.includes('collectLoot('));
 assert.ok(page.includes("setDiscovery({kind:'region',id:newRegion"));
 assert.ok(page.includes("setDiscovery({kind:'landmark',id:e.id"));
 assert.ok(page.includes('<p>{discovery?.label}</p>{lootList}'));
 assert.match(page,/case '42':content=<RegionDiscovery/);
});

test('original dialogue plate uses actual world service availability and legal navigation',()=>{
 assert.equal(stagedOriginalFor('13').wideOnly,true);
 assert.ok(templateUrl('13').startsWith('data:image/svg+xml,'));
 const page=readFileSync(new URL('../src/components/fantasybattle/SapphireAdventure.jsx',import.meta.url),'utf8');
 const section=page.slice(page.indexOf('function NPCDialogue('),page.indexOf('function SaveToast('));
 for(const marker of ['fa-original-dialogue','profile&&serviceAvailable','profile?.quests.grove','service?.label','world?.region','disabled={!available||!enabled}','onClick={()=>go(id)}','<Panel rect={layout[0]}'])assert.ok(section.includes(marker),marker);
 assert.ok(page.includes('world?.nearbyService===service.id&&!encounter'));
 assert.match(page,/case '13':content=<NPCDialogue/);
});

test('original quest offer respects current saved state and does not grant duplicate rewards',()=>{
 assert.equal(stagedOriginalFor('43').wideOnly,true);
 assert.ok(templateUrl('43').startsWith('data:image/svg+xml,'));
 const page=readFileSync(new URL('../src/components/fantasybattle/SapphireAdventure.jsx',import.meta.url),'utf8');
 const section=page.slice(page.indexOf('function QuestOffer('),page.indexOf('function SaveToast('));
 for(const marker of ['fa-original-offer','profile?.quests.grove','completedEncounters.includes','disabled={!available}','onClick={onAccept}','onClick={back}','does not grant additional rewards','<Panel rect={layout[0]}'])assert.ok(section.includes(marker),marker);
 const handler=page.slice(page.indexOf("case '43':"),page.indexOf("case '44':"));
 for(const marker of ['transact(p=>','acceptGroveQuest(p)',"p.quests.grove!=='available'","go('08')"])assert.ok(handler.includes(marker),marker);
 assert.ok(!handler.includes('rewardVictory'));
});

test('original quest completion only acknowledges actual recorded completion',()=>{
 assert.equal(stagedOriginalFor('44').wideOnly,true);
 assert.ok(templateUrl('44').startsWith('data:image/svg+xml,'));
 const page=readFileSync(new URL('../src/components/fantasybattle/SapphireAdventure.jsx',import.meta.url),'utf8');
 const section=page.slice(page.indexOf('function QuestCompletion('),page.indexOf('function SaveToast('));
 for(const marker of ['fa-original-completion','profile?.quests.grove',"state==='claimed'&&defeated",'completedEncounters.includes','No additional experience, gold or loot','onContinue','onJournal','<Panel rect={layout[0]}'])assert.ok(section.includes(marker),marker);
 for(const forbidden of ['rewardVictory(','claimGroveQuest(','transact(','autosave('])assert.ok(!section.includes(forbidden),forbidden);
 assert.match(page,/case '44':content=<QuestCompletion/);
});

test('original dungeon entrance previews the same real enemy formation as battle',()=>{
 assert.equal(stagedOriginalFor('23').wideOnly,true);
 assert.ok(templateUrl('23').startsWith('data:image/svg+xml,'));
 const page=readFileSync(new URL('../src/components/fantasybattle/SapphireAdventure.jsx',import.meta.url),'utf8');
 const section=page.slice(page.indexOf('function DungeonEntrance('),page.indexOf('function SaveToast('));
 for(const marker of ['fa-original-entrance','profile&&running&&candidate&&!encounter','activeRoster(profile)','enemyFormation(candidate,partySize)','completedEncounters.includes','EnemyPortrait enemy={e}','disabled={!ready}','Fixed by world encounter','No reward is granted at entry','<Panel rect={layout[0]}'])assert.ok(section.includes(marker),marker);
 assert.ok(!section.includes('rewardVictory('));
 assert.match(page,/case '23':content=<DungeonEntrance/);
});

test('original boss introduction previews actual encounter mechanics and guards battle entry',()=>{
 assert.equal(stagedOriginalFor('36').wideOnly,true);
 assert.ok(templateUrl('36').startsWith('data:image/svg+xml,'));
 const page=readFileSync(new URL('../src/components/fantasybattle/SapphireAdventure.jsx',import.meta.url),'utf8');
 const section=page.slice(page.indexOf('function BossIntroduction('),page.indexOf('function SaveToast('));
 for(const marker of ['fa-original-boss','profile&&running&&candidate&&!encounter','enemyFormation(candidate,partySize)','tacticFor(e.strategy,e.archetype)','completedEncounters.includes','disabled={!ready}','No reward at entry','<Panel rect={layout[0]}'])assert.ok(section.includes(marker),marker);
 const handler=page.slice(page.indexOf("case '36':"),page.indexOf("case '37':"));
 assert.ok(handler.includes("s.id==='36'"));
 assert.ok(handler.includes('s.candidate.id===candidate?.id'));
 assert.ok(handler.includes('startBattle(s.candidate)'));
});

test('original combat HUD preserves the live stage and legal action controls',()=>{
 assert.equal(stagedOriginalFor('09').wideOnly,true);
 assert.equal(stagedOriginalFor('09').transparent,true);
 assert.ok(templateUrl('09').startsWith('data:image/svg+xml,'));
 const page=readFileSync(new URL('../src/components/fantasybattle/SapphireAdventure.jsx',import.meta.url),'utf8');
 const section=page.slice(page.indexOf('function OriginalCombatHud('),page.indexOf('function SaveToast('));
 for(const marker of ['fa-original-combat','hud?.order.map','hud?.legal.map','disabled={!choosing||!a.enabled}','onAction(a.id)','hud.intents','hud.pendingChoices','max={u.maxHp}','max={u.maxFocus}','onPause','onSkills'])assert.ok(section.includes(marker),marker);
 assert.match(page,/case '09':content=original\?<OriginalCombatHud/);
 assert.ok(page.includes("s.id==='09'&&s.encounter"));
 assert.ok(page.includes('stageRef.current?.chooseAction(id)'));
 const css=readFileSync(new URL('../src/components/fantasybattle/sapphireAdventure.css',import.meta.url),'utf8');
 assert.ok(css.includes('.fa-ui.hud[data-staged-original="true"][data-screen="09"]{background:transparent;pointer-events:none}'));
});

test('original exploration HUD uses live world input and releases held movement',()=>{
 assert.equal(stagedOriginalFor('10').wideOnly,true);
 assert.equal(stagedOriginalFor('10').transparent,true);
 assert.ok(templateUrl('10').startsWith('data:image/svg+xml,'));
 const page=readFileSync(new URL('../src/components/fantasybattle/SapphireAdventure.jsx',import.meta.url),'utf8');
 const section=page.slice(page.indexOf('function OriginalExplorationHud('),page.indexOf('function SaveToast('));
 for(const marker of ['activeRoster(profile)','memberFor(profile,m.id).hp','memberStats(profile,m.id).maxHp','RegionMap world={world} profile={profile}','world?.nearby','profile?.quests.grove','onPointerCancel','onLostPointerCapture','held.current.clear()', "window.addEventListener('blur',release)", "send.current('move',{key,value:false})", "post('interact')","post('jump')"])assert.ok(section.includes(marker),marker);
 assert.match(page,/case '10':content=original\?<OriginalExplorationHud/);
 const css=readFileSync(new URL('../src/components/fantasybattle/sapphireAdventure.css',import.meta.url),'utf8');
 assert.ok(css.includes('.fa-ui.hud[data-staged-original="true"][data-screen="10"]{background:transparent;pointer-events:none}'));
});

test('original victory reports the resolved result without granting or reusing rewards',()=>{
 assert.equal(stagedOriginalFor('14').wideOnly,true);
 assert.ok(templateUrl('14').startsWith('data:image/svg+xml,'));
 const page=readFileSync(new URL('../src/components/fantasybattle/SapphireAdventure.jsx',import.meta.url),'utf8');
 const section=page.slice(page.indexOf('function BattleVictory('),page.indexOf('function SaveToast('));
 for(const marker of ["hud?.winner==='player'",'result.xp','result.gold','result.loot||[]','encounter.practice','first-victory rewards already recorded','hud.round','not tracked in this build','onContinue','onItems'])assert.ok(section.includes(marker),marker);
 for(const forbidden of ['rewardVictory(','transact(','autosave('])assert.ok(!section.includes(forbidden),forbidden);
 assert.match(page,/case '14':content=<BattleVictory/);
 assert.ok(page.includes('gold:0,loot:[],leveled:false,unlocked:[]});setLoot([])'));
});

test('original defeat uses resolved party condition and existing recovery actions',()=>{
 assert.equal(stagedOriginalFor('15').wideOnly,true);
 assert.ok(templateUrl('15').startsWith('data:image/svg+xml,'));
 const page=readFileSync(new URL('../src/components/fantasybattle/SapphireAdventure.jsx',import.meta.url),'utf8');
 const section=page.slice(page.indexOf('function BattleDefeat('),page.indexOf('function SaveToast('));
 for(const marker of ["hud?.phase==='over'","hud?.winner!=='player'",'hud.units.filter','max={u.maxHp}','validSlots.length>0','No progression rewards were granted','onRetry','onExplore','onLoad','onTitle'])assert.ok(section.includes(marker),marker);
 for(const forbidden of ['rewardVictory(','transact(','autosave('])assert.ok(!section.includes(forbidden),forbidden);
 assert.match(page,/case '15':content=<BattleDefeat/);
 assert.ok(page.includes("s.id==='15'&&s.encounter&&s.profile"));
});

test('original treasure reveal only shows recorded discovery rewards',()=>{
 assert.equal(stagedOriginalFor('31').wideOnly,true);
 assert.ok(templateUrl('31').startsWith('data:image/svg+xml,'));
 const page=readFileSync(new URL('../src/components/fantasybattle/SapphireAdventure.jsx',import.meta.url),'utf8');
 const section=page.slice(page.indexOf('function TreasureReveal('),page.indexOf('function SaveToast('));
 for(const marker of ["discovery?.kind==='landmark'",'profile.rewardedDiscoveries.includes(discovery.id)','loot.filter','profile.inventory[l.id]','No further claim is required','disabled={!earned.length}','onItems','onContinue'])assert.ok(section.includes(marker),marker);
 for(const forbidden of ['collectLoot(','rewardVictory(','transact(','autosave('])assert.ok(!section.includes(forbidden),forbidden);
 assert.match(page,/case '31':content=<TreasureReveal/);
 assert.ok(page.includes('setLoot(awarded.loot)'));
});
