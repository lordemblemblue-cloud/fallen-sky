// How much one loaded area may put on screen at its busiest view, per
// platform. An area that cannot stay inside its scenery share after batching
// and distance detail is the signal to split it off behind another portal.
//
// Browser figures follow the published norms for mid-range PCs (500 to 1,000
// draw calls and 1 to 2 million triangles a frame) taken at the low end,
// because every WebGL draw call also crosses JavaScript. Mobile follows
// standalone-headset class hardware. "Scenery" is the world itself; the rest
// is held back for players, enemies, companions and effects.
// Pure numbers: nothing here changes rendering.
export const GAME3D_AREA_BUDGETS=Object.freeze({
  browser:Object.freeze({targetFps:60,floorFps:30,drawCalls:500,sceneryDrawCalls:350,
    triangles:1_500_000,sceneryTriangles:1_000_000}),
  desktop:Object.freeze({targetFps:60,floorFps:30,drawCalls:1000,sceneryDrawCalls:700,
    triangles:2_000_000,sceneryTriangles:1_400_000}),
  mobile:Object.freeze({targetFps:30,floorFps:24,drawCalls:200,sceneryDrawCalls:140,
    triangles:750_000,sceneryTriangles:500_000}),
});
// Largest share of the 1,100 m valley one area may hold before its scenery
// alone passes the browser triangle budget (measured 2.86 M over the whole
// map against a 1.0 M scenery budget).
export const GAME3D_AREA_MAX_SQUARE_METERS=420_000;

export function game3dAreaBudget(platform='browser'){
  return GAME3D_AREA_BUDGETS[platform]||GAME3D_AREA_BUDGETS.browser;
}
// Compare one measured frame with the budget. `calls` and `triangles` are
// the renderer's own counters for the frame just drawn.
export function evaluateGame3DAreaBudget({platform='browser',calls=0,triangles=0,fps=null}={}){
  const budget=game3dAreaBudget(platform);
  const drawCalls=Math.max(0,Number(calls)||0);
  const tris=Math.max(0,Number(triangles)||0);
  const over=[];
  if(drawCalls>budget.drawCalls)over.push('drawCalls');
  if(tris>budget.triangles)over.push('triangles');
  if(Number.isFinite(fps)&&fps>0&&fps<budget.floorFps)over.push('fps');
  return Object.freeze({
    platform:GAME3D_AREA_BUDGETS[platform]?platform:'browser',budget,
    drawCalls,triangles:tris,
    drawCallShare:drawCalls/budget.drawCalls,triangleShare:tris/budget.triangles,
    within:over.length===0,over:Object.freeze(over),
  });
}
// One short line for the diagnostics overlay.
export function describeGame3DAreaBudget(result,areaLabel=''){
  if(!result)return '';
  const percent=share=>Math.round(share*100)+'%';
  const head=areaLabel?areaLabel+' · ':'';
  return head+result.platform+' budget: calls '+result.drawCalls+'/'+result.budget.drawCalls+
    ' ('+percent(result.drawCallShare)+')  tris '+result.triangles.toLocaleString('en-US')+'/'+
    result.budget.triangles.toLocaleString('en-US')+' ('+percent(result.triangleShare)+')'+
    (result.within?'':'  OVER: '+result.over.join(', '));
}
