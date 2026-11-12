import test from 'node:test';
import assert from 'node:assert/strict';
import {TARGETS} from './referenceTargets.mjs';
import {lineTouchesRectangleMeters} from './sourceClearanceAudit.mjs';
import {clipNatureRoadSegment,natureRectangleLocalMeters} from './natureRoadCenterlineAudit.mjs';
import {
 NATURE_DESIGN_PROFILE_RINGS,NATURE_SITE_ALTERNATIVES,
 clipSegmentToDesignEllipse,studyNatureSiteAlternatives,
} from './natureRouteAlternatives.mjs';

// Exact existing main WolfveilLayout.js route rows; explicit fixture is
// partial, so results for whole-catalog routes need separate source testing.
const roads=[
 {id:'west_woodland_fork',kind:'explore',width:2.7,
  points:[[-135,-105],[-230,-35],[-320,65],[-335,145],[-325,235]]},
 {id:'training_forest',kind:'explore',width:2.8,
  points:[[-30,62],[-165,88],[-230,65],[-320,65]]},
 {id:'ridge_path',kind:'ridge',width:2.8,
  points:[[4,220],[-55,265],[-105,330],[0,470],[35,680]]},
];
const study=()=>studyNatureSiteAlternatives({routes:roads});

test('exact seven source-design rings of Scene21 rock and Scene24 pine are present',()=>{
 assert.equal(NATURE_DESIGN_PROFILE_RINGS['S21-MOSS_BOULDER'].length,7);
 assert.equal(NATURE_DESIGN_PROFILE_RINGS['S24-BLACK_PINE'].length,7);
 assert.deepEqual(NATURE_DESIGN_PROFILE_RINGS['S21-MOSS_BOULDER'][0],[0,0,0,1760,1320]);
 assert.deepEqual(NATURE_DESIGN_PROFILE_RINGS['S24-BLACK_PINE'][0],[0,0,0,3400,2550]);
 assert.deepEqual(NATURE_DESIGN_PROFILE_RINGS['S24-BLACK_PINE'][6],[10400,659,349,680,510]);
});
test('ellipse intersection computes central pass and rejects tangent as zero',()=>{
 const e={cx:0,cz:0,rx:1,rz:1};
 assert.equal(clipSegmentToDesignEllipse([-2,0],[2,0],e),2);
 assert.equal(clipSegmentToDesignEllipse([-2,1],[2,1],e),0);
 assert.equal(clipSegmentToDesignEllipse([2,0],[3,0],e),0);
 assert.equal(clipSegmentToDesignEllipse([0,0],[0,0],e),0);
});
test('original source ring and footprint crossings are retained and unapproved',()=>{
 const result=study();
 assert.equal(result.sites.length,6);
 const rock=result.sites.find(s=>s.key==='S21_REFERENCE');
 const pine=result.sites.find(s=>s.key==='S24_REFERENCE');
 assert.equal(rock.maximumRingCrossingM,1.770713);
 assert.equal(pine.maximumRingCrossingM,5.452637);
 assert.equal(rock.exactAabbCenterlineCrossings[0].lengthM,3.66985);
 assert.equal(pine.exactAabbCenterlineCrossings[0].lengthM,6.375);
 assert.ok(rock.nominalRoadRibbonReviewIds.includes('west_woodland_fork'));
 assert.ok(pine.nominalRoadRibbonReviewIds.includes('ridge_path'));
 assert.equal(rock.approved,false);
 assert.equal(result.geometryAuthorized,false);
});
test('near-trail study sites avoid nominal ribbon but not unapproved 2m margin',()=>{
 const result=study();
 const rock=result.sites.find(s=>s.key==='S21_NEAR_TRAIL_CLEARING');
 const pine=result.sites.find(s=>s.key==='S24_WESTERN_SLOPE');
 for(const s of [rock,pine]) {
  assert.deepEqual(s.exactAabbCenterlineCrossings,[]);
  assert.deepEqual(s.nominalRoadRibbonReviewIds,[]);
  assert.ok(s.provisionalExtraBufferReviewIds.length>0);
  assert.equal(s.maximumRingCrossingM,0);
 }
});
test('farther study sites clear sampled source 2m planning rectangles without approval',()=>{
 const result=study();
 const rock=result.sites.find(s=>s.key==='S21_EASTERN_CLEARING');
 const pine=result.sites.find(s=>s.key==='S24_UPHILL_PINE');
 for(const s of [rock,pine]) {
  assert.deepEqual(s.exactAabbCenterlineCrossings,[]);
  assert.deepEqual(s.nominalRoadRibbonReviewIds,[]);
  assert.deepEqual(s.provisionalExtraBufferReviewIds,[]);
  assert.deepEqual(s.profileRoutesWithCrossings,[]);
  assert.equal(s.proposedBaseYmm,null);
  assert.equal(s.terrainRaycastVerified,false);
  assert.equal(s.geometryCreated,false);
  assert.equal(s.approved,false);
 }
});
test('original nature reference positions and main road fixture do not mutate',()=>{
 const before=JSON.stringify({TARGETS,roads,NATURE_SITE_ALTERNATIVES});
 const result=study();
 assert.equal(JSON.stringify({TARGETS,roads,NATURE_SITE_ALTERNATIVES}),before);
 const rockOriginal=TARGETS.find(t=>t.sourceId==='S21-MOSS_BOULDER');
 const pineOriginal=TARGETS.find(t=>t.sourceId==='S24-BLACK_PINE');
 assert.deepEqual([rockOriginal.xMm,rockOriginal.zMm,pineOriginal.xMm,pineOriginal.zMm],
  [-310000,56000,-72000,375000]);
 assert.equal(result.status,'REFERENCE_PRESERVING_SITE_STUDY_ONLY');
});
test('forged original relocation, excessive shift, unknown profile and duplicate key fail closed',()=>{
 const a=NATURE_SITE_ALTERNATIVES;
 assert.throws(()=>studyNatureSiteAlternatives({routes:roads,
  sites:[{...a[0],xMm:-309000}]}),/Original reference anchor was changed/);
 assert.throws(()=>studyNatureSiteAlternatives({routes:roads,
  sites:[{...a[1],zMm:126000}]}),/exceeds 20m/);
 assert.throws(()=>studyNatureSiteAlternatives({routes:roads,
  sites:[a[0],a[0]]}),/Duplicate\/missing site key/);
 assert.throws(()=>studyNatureSiteAlternatives({routes:roads,
  sites:[{...a[0],sourceId:'INVALID'}]}),/Unreviewed reference/);
 assert.throws(()=>studyNatureSiteAlternatives({routes:[]}),/Existing routes/);
});
