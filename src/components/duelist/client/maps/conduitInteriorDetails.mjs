// Conduit themed interior surface detailing. Renderer independent, local metres.
 // All relief stays on existing solid faces; no new floor obstacles, lights or textures.
export const INTERIOR_RELIEF_LIMIT=.04;
const THEMES=Object.freeze({
  armory:{accent:'amberGlow',name:'Equipment and inventory',cabinet:'gunmetal'},
  reactor:{accent:'cyanGlow',name:'Power and coolant monitoring',cabinet:'darkSteel'},
  medbay:{accent:'greenGlow',name:'Recovery and diagnostics',cabinet:'brushedSteel'},
  barracks:{accent:'amberGlow',name:'Personnel and readiness',cabinet:'paintedPanel'}
});
export function createConduitInteriorPlan(id){
  const theme=THEMES[id];if(!theme)throw new RangeError('Unknown Conduit building');
  const parts=[],anchors=[];
  // Each anchor defines a face of an existing wall/furnishing. No side-wall
  // panels: leave the planned T2 ventilation portal openings untouched.
  function anchor(key,level,axis,sign,plane,u,v,w,h,backing){
    const a={key,level,axis,sign,plane,u,v,w,h,backing};anchors.push(a);return a;
  }
  function piece(a,label,material,u,v,w,h,depth=.012,offset=.001){
    if(Math.abs(u)+w/2>a.w/2+1e-8||Math.abs(v)+h/2>a.h/2+1e-8||offset+depth>INTERIOR_RELIEF_LIMIT+1e-8)throw new RangeError('Interior detail outside anchor: '+label);
    const n=a.plane+a.sign*(offset+depth/2);
    const p=a.axis==='z'?{x:a.u+u,y:a.v+v,z:n,sx:w,sy:h,sz:depth}:{x:n,y:a.v+v,z:a.u+u,sx:depth,sy:h,sz:w};
    parts.push({id:id+'-'+a.key+'-'+label,anchor:a.key,level:a.level,material,...p,depth,offset});
  }
  function display(a){
    const put=(label,mat,u,v,w,h,foreground=false)=>piece(a,label,mat,u,v,w,h,.009,foreground ? .026 : .015);
    piece(a,'housing',theme.cabinet,0,0,a.w,a.h,.014,.001);
    put('header','brushedSteel',0,a.h/2-.11,a.w-.14,.08);
    put('status',theme.accent,-a.w/2+.13,a.h/2-.11,.09,.06,true);
    if(id==='armory'){
      for(let i=0;i<4;i++){
        const x=(i-1.5)*a.w*.205;
        put('rack-'+i,'darkSteel',x,0,a.w*.16,a.h*.57);
        put('item-'+i,'brushedSteel',x,.04,a.w*.047,a.h*.37,true);
        put('inventory-'+i,theme.accent,x,-a.h*.34,a.w*.12,.055);
      }
    }else if(id==='reactor'){
      for(let i=0;i<5;i++){
        const x=(i-2)*a.w*.16;
        put('gauge-bed-'+i,'gunmetal',x,-.02,a.w*.12,a.h*.55);
        put('gauge-'+i,i===4?'purpleGlow':theme.accent,x,-a.h*.15+(i%3)*.075,a.w*.07,a.h*.15+(i%3)*.15,true);
      }
      put('bus','copperPipe',0,-a.h*.36,a.w*.78,.06);
    }else if(id==='medbay'){
      put('cross-v',theme.accent,-a.w*.29,0,.12,a.h*.55);
      put('cross-h',theme.accent,-a.w*.29,0,a.h*.55,.12,true);
      for(let i=0;i<5;i++)put('vital-'+i,i===2?'greenGlow':'brushedSteel',a.w*.03+i*a.w*.083,(i%2)*.13-.03,a.w*.055,.07);
      put('diagnostic',theme.accent,a.w*.19,-a.h*.30,a.w*.42,.05);
    }else{
      for(let i=0;i<3;i++){
        const x=(i-1)*a.w*.26;
        put('roster-'+i,'darkSteel',x,0,a.w*.20,a.h*.57);
        put('portrait-'+i,'brushedSteel',x,.13,a.w*.08,.15,true);
        put('ready-'+i,i===1?'cyanGlow':theme.accent,x,-a.h*.23,a.w*.12,.06,true);
      }
    }
    put('footer','brushedSteel',0,-a.h/2+.08,a.w-.18,.055);
  }
  // Existing 0.6 m thick walls; interior surfaces at z=-5.30, +5.30,
  // and basement front-right z=-5.50. Keep panels clear of door and stair openings.
  display(anchor('ground-control','T1','z',1,-5.30,0,2.05,2.65,1.30,'Front C'));
  display(anchor('upper-control','T2','z',-1,5.30,-1.9,6.55,2.65,1.30,'Back Wall'));
  display(anchor('basement-control','T0','z',1,-5.50,4.65,2.15,2.65,1.30,'Bsmt Front R'));
  // Low wall detail on existing solid front panels, not new tactical cover.
  for(const level of ['T1','T0']){
    const a=level==='T1'?anchor('ground-service','T1','z',1,-5.30,0,.8,2.65,.35,'Front C'):
      anchor('basement-service','T0','z',1,-5.50,4.65,.8,2.65,.35,'Bsmt Front R');
    piece(a,'service-base','darkSteel',0,0,a.w,a.h,.014,.001);
    for(let i=0;i<5;i++)piece(a,'service-'+i,i%2===0?'ventGrille':'brushedSteel',(i-2)*.46,0,.34,.17,.01,.015);
  }
  // Furniture face plates are backed by existing collision shapes, with no
  // independent blocking volume. Avoid the Medical Bay recovery pod entirely:
  // the Stage 2 branch relocates that particular furnishing.
  if(id==='armory'){
    for(let k=-2;k<=2;k+=2){
      const a=anchor('locker-'+k,'T1','x',1,-7.65,k,1.25,1.18,1.55,'Armory Locker');
      piece(a,'door','paintedPanel',0,0,1.13,1.48,.014,.001);
      piece(a,'handle','brushedSteel',.43,0,.075,.26,.012,.016);
      for(let j=0;j<4;j++)piece(a,'slot-'+j,'darkSteel',0,.46-j*.095,.67,.045,.009,.016);
      piece(a,'lock',theme.accent,.41,-.25,.10,.08,.01,.016);
    }
  }else if(id==='medbay'||id==='barracks'){
    const a=anchor('storage','T1','x',1,-7.65,-.6,1.25,2.70,1.50,id==='medbay'?'Med-Bay Cabinet':'Barracks Lockers');
    for(let j=0;j<3;j++){
      const u=(j-1)*.86;
      piece(a,'door-'+j,id==='medbay'?'brushedSteel':'paintedPanel',u,0,.79,1.4,.014,.001);
      piece(a,'handle-'+j,'darkSteel',u+.28,0,.065,.27,.01,.016);
      piece(a,'status-'+j,theme.accent,u,.48,.32,.06,.009,.016);
    }
  }else{
    // Existing power cabinet end cap; the long face already has a glowing panel.
    const a=anchor('power-end','T0','z',1,-1.50,7.6,1.3,1.10,1.65,'Reactor Power Cabinet');
    piece(a,'end-cap','brushedSteel',0,0,1.05,1.58,.014,.001);
    for(let j=0;j<5;j++)piece(a,'vent-'+j,'darkSteel',0,.48-j*.15,.75,.065,.009,.016);
    piece(a,'power',theme.accent,0,-.52,.54,.08,.009,.016);
  }
  return {id,theme:theme.name,parts,anchors};
}
// Reuse the arena's existing instancing batches and shared materials. No new
// renderer or texture ownership, no collision modifications.
export function applyConduitInteriorDetails(id,upper,basement,materials,detailBox){
  const plan=createConduitInteriorPlan(id);
  for(const p of plan.parts){
    const mat=materials[p.material];
    if(!mat)throw new TypeError('Missing interior material '+p.material);
    detailBox(p.level==='T0'?basement:upper,mat,p.x,p.y,p.z,p.sx,p.sy,p.sz);
  }
  return {id,theme:plan.theme,instances:plan.parts.length,levels:['T0','T1','T2']};
}
