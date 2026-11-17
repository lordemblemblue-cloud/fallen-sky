import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=name=>readFileSync(
  new URL('../src/components/game3d/axe/services/'+name,import.meta.url),'utf8');
const variety=source('AXECompanionStylePane.jsx');
const imbue=source('AXECompanionImbuementPane.jsx');
const control=source('AXECompanionModelViewControl.jsx');
const css=source('AXECompanionModelViewControl.css');
const varietyCSS=source('AXECompanionStylePane.css');
const imbueCSS=source('AXECompanionImbuementPane.css');

test('Variety displays one small View control in the model stage, not the scrollable details panel',()=>{
  assert.match(variety,/import AXECompanionModelViewControl from '.\/AXECompanionModelViewControl'/);
  assert.match(variety,/<AXECompanionModelViewControl owner=\{previewOwner\} onChange=\{setPreviewOwner\}\/>/);
  const modelStage=variety.indexOf('<section className="axe-app-model-stage axe-comp-style-stage"');
  const button=variety.indexOf('<AXECompanionModelViewControl',modelStage);
  const preview=variety.indexOf('<div className="axe-app-model-center">',modelStage);
  const details=variety.indexOf('aria-label="Companion cosmetic details"',modelStage);
  assert(modelStage>=0&&button>modelStage&&button<preview&&details>button);
  assert.match(variety,/previewOwner==='wardrobe'\?<PlayerModel\/>/);
  assert.match(variety,/companionId=\{selectedModel\.id\}/);
  assert.match(variety,/else setPreviewOwner\('companion'\)/);
  assert.match(variety,/setPreviewOwner\('wardrobe'\)/);
  assert.doesNotMatch(variety,/axe-comp-variety-preview-toggle/);
  assert.doesNotMatch(varietyCSS,/axe-comp-variety-preview-toggle/);
});
test('Imbuement gets the same View button directly above its 3D model, preserving the 50/50 details',()=>{
  assert.match(imbue,/import AXECompanionModelViewControl from '.\/AXECompanionModelViewControl'/);
  assert.match(imbue,/<AXECompanionModelViewControl owner=\{previewOwner\} onChange=\{setPreviewOwner\}\/>/);
  assert.match(imbue,/const \[previewOwner,setPreviewOwner\]=useState\('wardrobe'\)/);
  const model=imbue.indexOf('<div className="axe-comp-imbue-model"');
  const button=imbue.indexOf('<AXECompanionModelViewControl',model);
  const host=imbue.indexOf('<div className="axe-comp-imbue-model-host"',model);
  const detail=imbue.indexOf('className="axe-comp-imbue-right"',model);
  assert(model>=0&&button>model&&button<host&&detail>button);
  assert.match(imbue,/previewOwner==='wardrobe'\?<PlayerModel\/>/);
  assert.match(imbue,/companionId=\{selectedModel\.id\}/);
  assert.match(imbue,/else setPreviewOwner\('companion'\)/);
  assert.match(imbue,/data-imbue-layout="unified-split"/);
  assert.match(imbueCSS,/grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(imbue,/IMBUE_TARGETS\.map\(entry=>/);
});
test('shared View button switches to the other model and stays below the top divider',()=>{
  assert.match(control,/View: \{showingPlayer\?'Player':'Companion'\}/);
  assert.match(control,/const nextOwner=showingPlayer\?'companion':'wardrobe'/);
  assert.match(control,/onClick=\{\(\)=>onChange\?\.\(nextOwner\)\}/);
  assert.match(control,/aria-label=\{'Switch 3D preview to '/);
  assert.match(control,/className="axe-comp-model-view-switch"/);
  assert.match(css,/\.axe-comp-style-stage > \.axe-comp-model-view-switch,/);
  assert.match(css,/\.axe-comp-imbue-model > \.axe-comp-model-view-switch/);
  assert.match(css,/position:absolute;top:clamp\(8px,1\.1vh,14px\);left:50%/);
  assert.match(css,/transform:translateX\(-50%\);z-index:12/);
  assert.match(css,/@media\(max-width:610px\)/);
  assert.match(css,/:focus-visible/);
  assert.doesNotMatch(control,/localStorage|award|spend|equip|fetch\(/);
});
