import test from 'node:test';
import assert from 'node:assert/strict';
import {TARGETS,SCENES} from './referenceTargets.mjs';
import {natureFootprint,architectureFootprint,rectangleOverlapM2} from './architectureSeamAudit.mjs';
import {natureFootprintSurveyPoints} from './natureAnalyticalGroundSurvey.mjs';
import {lineTouchesRectangleMeters} from './sourceClearanceAudit.mjs';
import {clipNatureRoadSegment,natureRectangleLocalMeters} from './natureRoadCenterlineAudit.mjs';
import {studyNatureSiteAlternatives} from './natureRouteAlternatives.mjs';
import {reviewNatureAlternativeNeighborhood} from './natureAlternativeNeighborhood.mjs';

const routes=[
 {id:'west_woodland_fork',width:2.7,points:[[-135,-105],[-230,-35],[-320,65],[-335,145],[-325,235]]},
 {id:'training_forest',width:2.8,points:[[-30,62],[-165,88],[-230,65],[-320,65]]},
 {id:'ridge_path',width:2.8,points:[[4,220],[-55,265],[-105,330],[0,470],[35,680]]},
];
const dummyBuilt=[{id:'WV-S21-WS07-STONE-LANTERN',xMm:-299000,zMm:68000,targetEnvelopeMm:[1150,1150,3100]}];
const study=()=>studyNatureSiteAlternatives({routes});
const inspect=(options={})=>reviewNatureAlternativeNeighborhood({
 siteStudy:study(),architectureTargets:dummyBuilt,heightAt:()=>100,...options,
});
test('all six original/alternate sites remain source-anchored inside their study views',()=>{
 const r=inspect();
 assert.equal(r.reviewedSites,6);
 assert.equal(r.readArchitectureProposals,1);
 assert.ok(r.reports.every(x=>x.withinHomeStudyView));
 assert.ok(r.reports.every(x=>x.proposedBaseYmm===null&&!x.approved&&!x.geometryInstantiated));
 assert.equal(r.geometryAuthorized,false);
 assert.equal(r.sourceCoordinatesModified,false);
});
test('constant analytic source Y never becomes an authorized mesh pivot',()=>{
 const r=inspect();
 assert.ok(r.reports.every(x=>x.candidateAnalyticalCenterYmm===100000));
 assert.ok(r.reports.every(x=>x.candidateAnalyticalRangeMm===0));
 assert.ok(r.reports.every(x=>!x.physicalFootingVerified&&!x.authoritativeHeightVerified));
});
test('architecture exact and 2m provisional buffer checks remain distinct',()=>{
 const boulder={id:'test-building',xMm:-303000,zMm:59000,targetEnvelopeMm:[1000,1000,1000]};
 const r=inspect({architectureTargets:[boulder]});
 const east=r.reports.find(x=>x.key==='S21_EASTERN_CLEARING');
 assert.deepEqual(east.existingArchitectureExactIds,['test-building']);
 assert.ok(east.ownerReviewReasons.includes('WS07_ARCHITECTURE_EXACT_SOURCE_OVERLAP'));
 const later=inspect({architectureTargets:[{
  id:'near-building',xMm:-299300,zMm:59000,targetEnvelopeMm:[1000,1000,1000],
 }]});
 assert.equal(later.reports.find(x=>x.key==='S21_EASTERN_CLEARING').existingArchitectureExactIds.length,0);
 assert.ok(later.reports.find(x=>x.key==='S21_EASTERN_CLEARING')
  .architectureMarginReviewIds.includes('near-building'));
});
test('alternative candidate reference geometry never edits source other-nature objects',()=>{
 const source=JSON.stringify({TARGETS,dummyBuilt,routes}),report=inspect();
 assert.equal(JSON.stringify({TARGETS,dummyBuilt,routes}),source);
 assert.ok(report.reports.every(x=>x.ownerReviewReasons.includes('WS01_WS10_WS11_WS12_RUNTIME_APPROVAL_MISSING')));
 assert.ok(report.reports.every(x=>x.sourceStatus==='ALTERNATIVE_DESIGN_REVIEW_NOT_RUNTIME_APPROVAL'));
});
test('source height samples detect nonflat site contacts without claiming physics grade',()=>{
 const r=inspect({heightAt:(x,z)=>200+(x+300)*.1+z*.2});
 assert.ok(r.reports.every(x=>x.candidateAnalyticalRangeMm>0));
 assert.equal(r.physicalTerrainRaycastVerified,false);
 assert.equal(r.ws10MovementValidated,false);
});
test('missing and forged study/source/architecture inputs cannot approve any site',()=>{
 assert.throws(()=>reviewNatureAlternativeNeighborhood(),/Require source-only site study/);
 const source=study();
 assert.throws(()=>inspect({siteStudy:{...source,geometryAuthorized:true}}),/Require source-only site study/);
 assert.throws(()=>inspect({architectureTargets:[]}),/Require source-only site study/);
 assert.throws(()=>inspect({heightAt:()=>NaN}),/Analytical terrain produced nonfinite/);
 assert.throws(()=>inspect({siteStudy:{...source,sites:source.sites.concat(source.sites[0])}}),/Duplicate or invalid site-study/);
 assert.throws(()=>inspect({reviewSetbackMm:-10}),/Invalid provisional/);
});
