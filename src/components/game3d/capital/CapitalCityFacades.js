// Original decorative building facade planning for the preview-only capital city.
// Every element is a non-collidable box; dark panels are NOT openings.
// Pure geometry descriptions permit deterministic tests without Three.js.
const MATERIALS = new Set(['column','structure','roof','wall','water']);
const SKIP = new Set(['plots','arch']);

export function planCapitalCityFacades(buildings, {detailLevel='standard'}={}) {
  if (!Array.isArray(buildings)) throw Error('Capital facades require planned buildings');
  if (!['standard','low'].includes(detailLevel)) throw Error('Unsupported capital facade detail level');
  const details=[];
  for (const b of buildings) {
    if (!b || !['x','y','z','w','d','h'].every(k=>Number.isFinite(b[k])&& (['x','y','z'].includes(k) || b[k]>0)) || !b.id)
      throw Error('Invalid capital facade building');
    if (SKIP.has(b.kind)) continue;
    const front=b.z-b.d/2;
    const id=b.id;
    const add=(name,material,x,y,z,w,h,d)=>{
      if(!MATERIALS.has(material)||![x,y,z,w,h,d].every(Number.isFinite)||w<=0||h<=0||d<=0)
        throw Error('Invalid facade component: '+name);
      details.push(Object.freeze({name:id+'_'+name,buildingId:id,material,x,y,z,w,h,d,collidable:false,previewOnly:true}));
    };
    // Shallow positive-relief courses overlap the solid facade to avoid z-fighting.
    add('foundationCourse','column',b.x,b.y+.4,front-.09,b.w+.1,.7,.32);
    add('topCornice','column',b.x,b.y+b.h-.45,front-.15,b.w+.6,.9,.43);
    if (b.kind==='residence') {
      add('timberEaves','roof',b.x,b.y+b.h-.95,front-.23,b.w+.75,.3,.58);
    } else {
      add('architrave','column',b.x,b.y+b.h-1.8,front-.20,b.w+.3,.25,.52);
    }

    // Entrance panel is a solid visual marker, not a functional doorway.
    const doorW=Math.min(4.8,b.w*.25);
    const doorH=Math.min(6,b.h*.55);
    add('doorPanel','wall',b.x,b.y+doorH/2,front-.11,doorW,doorH,.20);
    for (const side of [-1,1])
      add('doorJamb_'+side,'column',b.x+side*(doorW/2+.23),b.y+(doorH+.35)/2,front-.25,.45,doorH+.35,.45);
    add('doorLintel','column',b.x,b.y+doorH+.29,front-.26,doorW+1.25,.58,.52);

    // Symmetrical dark recessed panels and stone surrounds. Central bays
    // are omitted so no window appears directly in front of the portal.
    const bays=Math.max(2,Math.min(detailLevel==='low'?3:6,Math.floor(b.w/6)));
    const windowW=Math.min(2.3,b.w/(bays+2)*.62);
    const windowH=Math.min(3.1,Math.max(1.8,b.h*.20));
    const rows=detailLevel==='low'||b.h<14?1:2;
    for (let row=0;row<rows;row++) {
      const cy=b.y+b.h*(rows===1?.66:row===0?.43:.73);
      if(cy-windowH/2<=b.y+doorH*.35||cy+windowH/2>=b.y+b.h-.9)continue;
      for(let bay=0;bay<bays;bay++) {
        const wx=b.x+(bay-(bays-1)/2)*b.w*.76/Math.max(1,bays-1);
        if(Math.abs(wx-b.x)<doorW/2+windowW*.62)continue;
        const prefix='window_'+row+'_'+bay;
        add(prefix+'_glass','wall',wx,cy,front-.11,windowW,windowH,.20);
        for(const side of [-1,1])
          add(prefix+'_jamb_'+side,'column',wx+side*(windowW/2+.10),cy,front-.22,.22,windowH+.28,.41);
        add(prefix+'_sill','column',wx,cy-windowH/2-.12,front-.25,windowW+.5,.24,.5);
        add(prefix+'_header','column',wx,cy+windowH/2+.11,front-.25,windowW+.5,.22,.49);
      }
    }
  }
  // Conservative instance budget protects preview performance.
  if(details.length>2000)throw Error('Capital facade detail budget exceeded');
  return Object.freeze(details);
}
