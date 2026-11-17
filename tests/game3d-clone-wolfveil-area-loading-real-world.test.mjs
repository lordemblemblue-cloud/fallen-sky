// The five-area loader against the REAL Wolfveil valley and real Three.js
// objects (no browser, no GPU). The other loader tests use small stand-in
// objects; this one proves the same rules hold on the scene the game builds.
// Skipped where Three.js is not installed.
import test from 'node:test';
import assert from 'node:assert/strict';

let missing=null;
try{await import('three');await import('three-mesh-bvh');}
catch(error){missing='Three.js is not installed in this checkout ('+error.code+')';}

test('real valley: every area and every portal, nothing lost, duplicated or wrongly hidden',
  {skip:missing||false,timeout:300000},async()=>{
    const {runWolfveilAreaLoadingReport,formatWolfveilAreaLoadingReport}=
      await import('../scripts/report-wolfveil-area-loading.mjs');
    const result=await runWolfveilAreaLoadingReport({withTown:false});
    const text=formatWolfveilAreaLoadingReport(result);
    assert.deepEqual(result.failures,[],text);
    // The valley really does contain map-wide batches and single-area scenery.
    assert.ok(result.loader.batches.split>0,'no map-wide batch was split per area\n'+text);
    assert.ok(result.loader.units.total>0,'no single-area scenery was found\n'+text);
    assert.equal(result.portals.length,11);
    assert.ok(result.portals.every(portal=>portal.ok),text);
    // From the same spot, one loaded area always costs less than the whole valley.
    for(const [id,area] of Object.entries(result.areas)){
      assert.ok(area.triangles<area.wholeValleyHere.triangles,id+' saves no triangles\n'+text);
      assert.ok(area.drawCalls<=area.wholeValleyHere.drawCalls,id+' adds draw calls\n'+text);
    }
    // Every area loaded again adds up to exactly the valley.
    assert.ok(Math.abs(result.allAreasLoaded.triangles-result.loaderOff.triangles)<=2,text);
  });
