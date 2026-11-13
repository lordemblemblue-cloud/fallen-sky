// Stretches where a back-country trail is washed out or overgrown. The dirt
// ribbon stops, rough stony ground takes over, and the trail resumes further
// on. Distances are metres along the route's own polyline (unshifted layout
// coordinates). Purely visual: the ground stays walkable, no collider changes.
export const WOLFVEIL_TRAIL_BREAKS=Object.freeze([
  Object.freeze({route:'west_woodland_fork',from:150,to:172}),
  Object.freeze({route:'west_woodland_fork',from:300,to:318}),
  Object.freeze({route:'training_forest',from:160,to:178}),
  Object.freeze({route:'quarry_approach',from:95,to:112}),
  Object.freeze({route:'quarry_approach',from:205,to:225}),
  Object.freeze({route:'ridge_path',from:100,to:120}),
  Object.freeze({route:'ridge_path',from:230,to:255}),
]);

export function wolfveilTrailBreakAt(routeId,along){
  return WOLFVEIL_TRAIL_BREAKS.some(b=>b.route===routeId&&along>=b.from&&along<=b.to);
}

// Position, travel direction and remaining length at a distance along a route.
export function wolfveilRoutePointAt(route,along){
  const pts=route.points;let walked=0;
  for(let i=0;i<pts.length-1;i++){
    const [ax,az]=pts[i],[bx,bz]=pts[i+1],length=Math.hypot(bx-ax,bz-az);
    if(along<=walked+length||i===pts.length-2){
      const t=Math.max(0,Math.min(1,(along-walked)/(length||1)));
      return {x:ax+(bx-ax)*t,z:az+(bz-az)*t,dx:(bx-ax)/(length||1),dz:(bz-az)/(length||1)};
    }
    walked+=length;
  }
  return null;
}

export function wolfveilRouteLength(route){
  let total=0;
  for(let i=0;i<route.points.length-1;i++)
    total+=Math.hypot(route.points[i+1][0]-route.points[i][0],
      route.points[i+1][1]-route.points[i][1]);
  return total;
}