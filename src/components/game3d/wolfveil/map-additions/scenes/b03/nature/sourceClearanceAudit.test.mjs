import test from 'node:test';
import assert from 'node:assert/strict';
import { TARGETS } from './referenceTargets.mjs';
import { lineTouchesRectangleMeters, auditWs08SourceClearance }
  from './sourceClearanceAudit.mjs';

// Exact source-layout segments/coordinates sampled from main WolfveilLayout.js
// @ b4b10dd15737d62c62a476e500adb433a6d015b6. This test fixture is not
// another runtime source of truth; on source change, refresh from main.
const routes = [
 {id:'west_woodland_fork',width:2.7,points:[[-135,-105],[-230,-35],[-320,65],[-335,145],[-325,235]]},
 {id:'training_forest',width:2.8,points:[[-30,62],[-165,88],[-230,65],[-320,65]]},
 {id:'ridge_path',width:2.8,points:[[4,220],[-55,265],[-105,330],[0,470],[35,680]]},
];
const buildings=[{id:'bathhouse',x:-105,z:330,w:22,d:18}];
const housingPlots=[{id:'wolfveil_plot_sun_05',x:-281,z:-283,w:16,d:20}];
const river={width:19,points:[[142,184,45],[132,166,19],[121,115,17],[123,75,13],[119,34,10]]};
const inputs={routes,buildings,housingPlots,river};

test('corridor scan detects continuous segments and avoids outside areas',()=>{
 const box={x:0,z:0,w:2,d:2};
 assert.equal(lineTouchesRectangleMeters([-2,0],[2,0],box),true);
 assert.equal(lineTouchesRectangleMeters([-2,2],[2,2],box),false);
 assert.equal(lineTouchesRectangleMeters([-2,1],[2,1],box),true);
 assert.throws(()=>lineTouchesRectangleMeters([0,0],[1,1],{...box,w:0}),/Invalid/);
});

test('requires explicit existing-layout inputs, never silently claims all-clear',()=>{
 assert.throws(()=>auditWs08SourceClearance(),/Requires verified/);
 assert.throws(()=>auditWs08SourceClearance({...inputs,river:{width:19,points:[]}}),/Invalid existing river/);
 assert.throws(()=>auditWs08SourceClearance({...inputs,planningSetbackM:-1}),/Invalid planning setback/);
});

test('source road segment contacts proposed forest and alpine pine footprints',()=>{
 const out=auditWs08SourceClearance(inputs);
 const cedar=out.findings.find(x=>x.sourceId==='S21-CEDAR_01');
 const alpinePine=out.findings.find(x=>x.sourceId==='S24-BLACK_PINE');
 assert.ok(cedar?.routeReviews.includes('west_woodland_fork') || cedar?.routeReviews.includes('training_forest'));
 assert.ok(alpinePine?.routeReviews.includes('ridge_path'));
 assert.equal(out.activation,false);
 assert.equal(out.coordinateShiftApplied,false);
});

test('wetlands water requires WS02 review; no river rewrite or new pool',()=>{
 const out=auditWs08SourceClearance(inputs);
 const reeds=out.findings.find(x=>x.sourceId==='S26-REED_CLUSTER');
 assert.ok(reeds?.riverReview);
 assert.equal(out.checkedTargets,19);
});

test('source housing & bathhouse reference footprints are preserved and unmutated',()=>{
 const before=JSON.stringify(inputs),targetsBefore=JSON.stringify(TARGETS);
 const out=auditWs08SourceClearance(inputs);
 assert.equal(JSON.stringify(inputs),before);
 assert.equal(JSON.stringify(TARGETS),targetsBefore);
 assert.equal(out.checkedHousingPlots,1);
 assert.equal(out.checkedBuildings,1);
 assert.ok(out.findings.every(x=>x.status==='AUTHORING_CLEARANCE_REVIEW_ONLY'));
});

test('rejects malformed route and does not bypass protected checks',()=>{
 assert.throws(()=>auditWs08SourceClearance({...inputs,routes:[{id:'broken',width:0,points:[]}] }),/Invalid existing Wolfveil route/);
 assert.throws(()=>auditWs08SourceClearance({...inputs,buildings:[{id:'broken',x:0,z:0,w:0,d:2}]}),/Invalid source building/);
});
