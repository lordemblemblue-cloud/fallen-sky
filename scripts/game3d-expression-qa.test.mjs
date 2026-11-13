import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 EXPRESSION_GROUPS,ADDITIONAL_PRESETS,projectExpressionPreset,
 supportedExpressionControls,expressionIntensity,
} from '../src/components/onboarding/creatorExpressionPerformance.mjs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const controls=[
 {id:'smile',morphs:['FX_Smile_L','FX_Smile_R']},
 {id:'blink',morphs:['FX_Blink_L','FX_Blink_R']},
 {id:'brow_up',morphs:['FX_BrowUp_L','FX_BrowUp_R']},
 {id:'squint',morphs:['FX_Squint_L','FX_Squint_R']},
];
test('expression presets only advertise authored FX shape keys',()=>{
 const grin={id:'joy',values:{smile:.9,brow_up:.3}};
 const keys=['FX_Smile_L','FX_Smile_R','FX_BrowUp_L','FX_BrowUp_R'];
 const hit=projectExpressionPreset(grin,controls,keys);
 assert.equal(hit.enabled,true);
 assert.equal(hit.partial,false);
 assert.equal(hit.matched,4);
 assert.equal(hit.requested,4);
 assert.deepEqual(hit.values,{smile:.9,brow_up:.3});
 assert.deepEqual(hit.morphs,{});
});
test('partially rigged faces do not claim full bilateral expression support',()=>{
 const result=projectExpressionPreset({id:'warm',values:{smile:.75,brow_up:.3}},
  controls,['FX_Smile_L']);
 assert.equal(result.enabled,true);
 assert.equal(result.partial,true);
 assert.deepEqual(result.values,{smile:.75});
 assert.equal(result.matched,1);
 assert.equal(result.requested,4);
});
test('unsupported preset is disabled; neutral reset always remains available',()=>{
 assert.equal(projectExpressionPreset({id:'angry',values:{squint:.8}},controls,[]).enabled,false);
 assert.equal(projectExpressionPreset({id:'neutral',values:{}},controls,[]).enabled,true);
});
test('the creator has multiple precise emotion groups and real eye controls',()=>{
 assert.ok(EXPRESSION_GROUPS.length>=3);
 assert.ok(ADDITIONAL_PRESETS.length>=6);
 assert.equal(supportedExpressionControls(controls,['FX_Blink_L'])[0]?.id,'blink');
 assert.equal(expressionIntensity(undefined),1);
 assert.equal(expressionIntensity(-1),0);
 assert.equal(expressionIntensity(10),1);
});
test('the original high-detail creator and rig-aware expression panel are wired',()=>{
 const editor=read('src/components/onboarding/CharacterAppearanceEditor.jsx');
 const stage=read('src/components/onboarding/CreatorStage.jsx');
 const scene=read('src/components/onboarding/creatorStageScene.js');
 const panel=read('src/components/onboarding/CreatorExpressionPanel.jsx');
 const css=read('src/components/onboarding/creator-expression-detail.css');
 assert.match(editor,/CreatorExpressionPanel/);
 assert.match(editor,/CREATOR_BODY_PRESETS/);
 assert.match(editor,/GenesisFaceScan/);
 assert.match(panel,/Fine-tune facial movement/);
 assert.match(panel,/Partial rig match/);
 assert.match(panel,/projectExpressionPreset/);
 assert.match(css,/creator-expression-preset-grid/);
 assert.match(stage,/expression\?\.intensity/);
 assert.match(stage,/Retry original model/);
 assert.match(scene,/characterBodyBounds\(model\)/);
 assert.match(scene,/Original Eve\/Adam model could not load/);
 assert.match(scene,/prepareFusedCreatorGeometry/);
 assert.match(scene,/featherFusedNeckTone/);
});
