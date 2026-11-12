import test from 'node:test';
import assert from 'node:assert/strict';
import {NATURE_SITE_ALTERNATIVES} from './natureRouteAlternatives.mjs';
import {makeNaturePhysicalReviewerRequests} from './naturePhysicalVolumeRequests.mjs';
import {
 PINNED_WS08_SURVEY_CATALOG_BLOBS,reconcileNaturePhysicalSurveyQuestions,
} from './naturePhysicalSurveyCrosswalk.mjs';

const fixture=()=>{
 const ws01Points=Array.from({length:200},(_,i)=>({id:'WV-CTRL-'+String(i+1).padStart(4,'0'),
   local_mm:[1000000+i*1000,-400000]}));
 const ws11Requests=Array.from({length:17},(_,i)=>({id:'G0-TEST-'+i,
   local_anchor_mm:[2000000+i*1000,-300000]}));
 return {
  reviewPackets:makeNaturePhysicalReviewerRequests(),
  ws01Points,ws11Requests,
  managerCrosswalk:{
   approved_ws01_sha:null,gate0_ready:false,
   priority_crosswalk:ws11Requests.map(r=>({
    ws11_id:r.id,source_local_mm:[...r.local_anchor_mm]})),
   scene21_new_issue:[{id:'S21-MOSS_BOULDER',center_local_mm:[-310000,56000]}],
  },
 };
};
test('six source/proposed site coordinates are catalog-joined without fake measured Y',()=>{
 const r=reconcileNaturePhysicalSurveyQuestions(fixture());
 assert.equal(r.sourceStudySites,6);
 assert.equal(r.checkedWs01Controls,200);
 assert.equal(r.checkedWs11Priorities,17);
 assert.equal(r.physicalLayerQuestions,7);
 assert.equal(r.authorizedPhysicalMeasurements,0);
 assert.equal(r.geometryActivated,false);
 assert.equal(r.canMergePhysicalMeasurements,false);
 assert.ok(r.rows.every(x=>x.measuredRuntimeSurfaceYmm===null&&
  x.measuredCollisionLayerYmm===null&&!x.physicalGeometryApproved));
});
test('original S21 source issue acknowledgment is not an official physical raycast',()=>{
 const r=reconcileNaturePhysicalSurveyQuestions(fixture());
 const rock=r.rows.find(x=>x.key==='S21_REFERENCE');
 assert.deepEqual(rock.managerIssueAcknowledgments,['S21-MOSS_BOULDER']);
 assert.equal(rock.ws08PhysicalQuestionIds.length,3);
 assert.equal(rock.managerIssuedMeasurementRequestId,null);
 assert.deepEqual(rock.ws11PriorityRequestIds,[]);
});
test('original S24 packet has four separate unmeasured physical layers',()=>{
 const r=reconcileNaturePhysicalSurveyQuestions(fixture());
 const pine=r.rows.find(x=>x.key==='S24_REFERENCE');
 assert.equal(pine.ws08PhysicalQuestionIds.length,4);
 assert.ok(pine.ws08PhysicalQuestionIds.every(x=>x.includes('/PHYSICAL/')));
 assert.deepEqual(pine.managerIssueAcknowledgments,[]);
 assert.equal(pine.observedTrunkRootOrStoneVolume,null);
});
test('exact XZ equality can join catalogs but NEVER merges physical evidence',()=>{
 const f=fixture();
 f.ws01Points[0].local_mm=[-310000,56000];
 f.ws11Requests[0].local_anchor_mm=[-72000,375000];
 f.managerCrosswalk.priority_crosswalk[0].source_local_mm=[-72000,375000];
 const r=reconcileNaturePhysicalSurveyQuestions(f);
 assert.deepEqual(r.rows.find(x=>x.key==='S21_REFERENCE').ws01TerrainControlIds,['WV-CTRL-0001']);
 const pine=r.rows.find(x=>x.key==='S24_REFERENCE');
 assert.deepEqual(pine.ws11PriorityRequestIds,['G0-TEST-0']);
 assert.deepEqual(pine.managerCrosswalkIds,['G0-TEST-0']);
 assert.equal(pine.measuredRuntimeSurfaceYmm,null);
 assert.equal(pine.managerIssuedMeasurementRequestId,null);
 assert.equal(r.ws11ApprovalGiven,false);
});
test('optional relocation study sites do not inherit source-anchor physical requests',()=>{
 const r=reconcileNaturePhysicalSurveyQuestions(fixture());
 assert.equal(r.rows.filter(x=>x.role==='ALTERNATIVE_STUDY').length,4);
 assert.ok(r.rows.filter(x=>x.role==='ALTERNATIVE_STUDY')
  .every(x=>x.ws08PhysicalQuestionIds.length===0));
});
test('stale blob/catalog count/premature manager approval is rejected',()=>{
 assert.throws(()=>reconcileNaturePhysicalSurveyQuestions(),/Complete static/);
 const q=fixture();q.ws01Points.pop();
 assert.throws(()=>reconcileNaturePhysicalSurveyQuestions(q),/Unexpected survey inventory/);
 const a=fixture();a.managerCrosswalk.gate0_ready=true;
 assert.throws(()=>reconcileNaturePhysicalSurveyQuestions(a),/Unexpected survey inventory/);
 const b=fixture();
 assert.throws(()=>reconcileNaturePhysicalSurveyQuestions({...b,sourceBlobs:{
  ...PINNED_WS08_SURVEY_CATALOG_BLOBS,ws01:'deadbeef',
 }}),/Stale ws01/);
});
test('duplicate survey IDs and forged reference anchors fail closed',()=>{
 const x=fixture();x.ws01Points[1].id=x.ws01Points[0].id;
 assert.throws(()=>reconcileNaturePhysicalSurveyQuestions(x),/duplicate WS01/);
 const y=fixture();
 const altered=NATURE_SITE_ALTERNATIVES.map(s=>s.key==='S21_REFERENCE'?{...s,xMm:-309000}:s);
 assert.throws(()=>reconcileNaturePhysicalSurveyQuestions({...y,sites:altered}),/Missing original-anchor/);
});
test('all original object references and source catalogs remain immutable',()=>{
 const f=fixture(),old=JSON.stringify(f),src=JSON.stringify(NATURE_SITE_ALTERNATIVES);
 const r=reconcileNaturePhysicalSurveyQuestions(f);
 assert.equal(JSON.stringify(f),old);
 assert.equal(JSON.stringify(NATURE_SITE_ALTERNATIVES),src);
 assert.equal(Object.isFrozen(r.rows),true);
 assert.equal(Object.isFrozen(r.rows[0]),true);
});
