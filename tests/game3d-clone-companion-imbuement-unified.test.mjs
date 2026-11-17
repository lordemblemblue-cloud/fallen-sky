import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {IMBUE_TARGETS,imbuementTargetView,IMBUE_MATERIAL_RECIPE_STATUS,canManuallyImbue}
  from '../src/components/game3d/axe/services/AXEImbuementPresentation.mjs';
import {SOUL_INFUSION_SLOTS,getSoulBodySlot,soulInfusionItemBonusPct}
  from '../src/components/game3d/axe/progression/AXESoulRegaliaSystem.js';

const src=name=>readFileSync(new URL('../src/components/game3d/axe/services/'+name,import.meta.url),'utf8');
const variety=src('AXECompanionStylePane.jsx');
const varietyCSS=src('AXECompanionStylePane.css');
const imbue=src('AXECompanionImbuementPane.jsx');
const css=src('AXECompanionImbuementPane.css');

test('Variety removes both View Companion / View Player Wardrobe buttons',()=>{
  assert.doesNotMatch(variety,/View Companion|View Player Wardrobe|axe-comp-variety-preview-toggle/);
  assert.doesNotMatch(varietyCSS,/axe-comp-variety-preview-toggle/);
  assert.match(variety,/else setPreviewOwner\('companion'\)/);
  assert.match(variety,/setPreviewOwner\('wardrobe'\)/);
  assert.match(variety,/previewOwner==='wardrobe'\?<PlayerModel\/>/);
  assert.match(variety,/companionId=\{selectedModel.id\}/);
  assert.match(variety,/VARIETY_VIEWER_SLOTS.slice\(0,3\).map\(varietySlotCard\)/);
  assert.match(variety,/VARIETY_VIEWER_SLOTS.slice\(3\).map\(varietySlotCard\)/);
  assert.match(variety,/onDoubleClick=\{\(\)=>equipOwnedWardrobe\(piece\)\}/);
  assert.doesNotMatch(variety,/equipCompanionGear\(piece/);
});
test('Imbuement has one unified 50/50 layout: vertical targets and right-hand details',()=>{
  assert.match(variety,/if\(isImbue\)return <AXECompanionImbuementPane onNotice=\{onNotice\}\/>/);
  assert.match(imbue,/data-imbue-layout="unified-split"/);
  assert.match(imbue,/className="axe-comp-imbue-target-stack"/);
  assert.match(imbue,/className="axe-comp-imbue-info-scroll"/);
  assert.match(css,/grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css,/border-left:1px solid rgba\(242,210,147,\.43\)/);
  assert.match(css,/@media\(max-width:880px\)/);
  assert.match(imbue,/IMBUE_TARGETS.map\(entry=>/);
  assert.doesNotMatch(imbue,/axe-comp-imbue-corner|axe-comp-imbue-list/);
  assert.match(imbue,/aria-valuenow=\{view.percent\}/);
  assert.match(imbue,/onClick=\{\(\)=>\{setTarget\(entry.id\);setRequirementsOpen\(true\);\}\}/);
});
test('Hands, Helmet, Feet, Armor and Weapons use 4 authentic soul infusion tracks',()=>{
  assert.deepEqual(IMBUE_TARGETS.map(x=>x.id),
    ['hands','helmet','feet','armor','weapons']);
  assert.deepEqual(SOUL_INFUSION_SLOTS,['head','arms','chest','legs']);
  assert.equal(getSoulBodySlot('weapon'),'arms');
  assert.equal(getSoulBodySlot('gloves'),'arms');
  const soul={infusion:{head:10,arms:35,chest:75,legs:100}};
  const items=[
    {instanceId:'glove',slot:'gloves',name:'Gloves',equipped:true},
    {instanceId:'blade',slot:'weapon',name:'Blade',equipped:true},
    {instanceId:'helm',slot:'helm',name:'Helmet',equipped:true},
    {instanceId:'boots',slot:'boots',name:'Boots',equipped:true},
    {instanceId:'pants',slot:'legs',name:'Pants',equipped:true},
  ];
  assert.equal(imbuementTargetView('hands',soul,items).percent,35);
  const weapons=imbuementTargetView('weapons',soul,items);
  assert.equal(weapons.percent,35);
  assert.equal(weapons.sharedWith,'hands');
  assert.deepEqual(weapons.equipment.map(i=>i.instanceId),['blade']);
  assert.deepEqual(imbuementTargetView('feet',soul,items).equipment.map(i=>i.instanceId),['boots','pants']);
  assert.equal(imbuementTargetView('helmet',soul,items).percent,10);
  assert.equal(imbuementTargetView('armor',soul,items).percent,75);
  assert.equal(imbuementTargetView('unknown',soul).id,'hands');
});
test('right information panel derives actual stat bonuses, companion XP and fusion gates',()=>{
  for(const token of [
    'getAXESoulRegaliaBonuses()','getAXEPetState','getAXEMountState',
    'getEquippedAXEItems()','soulInfusionItemBonusPct',
    'xpForAXEPetLevel','isSoulCompanionMastered',
    'current', 'Over-Enchantment','Companion Experience','Active mount experience',
    'Stat','Current infusion','Equipment stat increases',
    'previewBonus(piece)','actualBonus(piece)','fusion',
  ])assert(imbue.toLowerCase().includes(token.toLowerCase()),'Missing live detail: '+token);
  const pet={instanceId:'pet1',level:200,overEnchantPercent:200};
  const equipped={instanceId:'gear1',slot:'weapon',equipped:true};
  const basic={fused:true,bondedPetId:'pet1',infusion:{arms:100}};
  const normalSet={grade:'rare',complete:false};
  assert.equal(soulInfusionItemBonusPct(equipped,basic,normalSet,pet),20);
  assert.equal(soulInfusionItemBonusPct(equipped,{...basic,infusion:{arms:99}},normalSet,pet),0);
  assert.equal(soulInfusionItemBonusPct(equipped,basic,{grade:'chosen',complete:true},
    pet),20);
  assert.equal(soulInfusionItemBonusPct(equipped,{...basic,ascension:{chosen:1}},
    {grade:'chosen',complete:true},pet),20);
});
test('Imbue exposes real material inventory but cannot invent a local XP/material payment',()=>{
  assert.equal(IMBUE_MATERIAL_RECIPE_STATUS,'UNCONFIGURED');
  assert.equal(canManuallyImbue(),false);
  assert.match(imbue,/Manual imbuement recipe/);
  assert.match(imbue,/pets.materials\?\.pet_soul/);
  assert.match(imbue,/pets.materials\?\.pet_catalyst/);
  assert.match(imbue,/verified quest or loot rewards/);
  assert.match(imbue,/disabled title="Manual imbuement is unavailable/);
  assert.match(imbue,/materials are consumed here/);
  assert.doesNotMatch(imbue,/applyVerifiedAXESoulReward\(|grantAXEPetMaterials\(|awardAXEPetXP\(|feedAXEPet\(/);
});
