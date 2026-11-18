// Bespoke, grounded 3D utility models: each bay changes equipment and
// silhouette. Measured as real raised meshes, NOT one wall-panel cloned in
// a loop. Different assemblies inhabit different supported structural walls.
// These are decorative and cannot block the 1.85m player corridor clearance.
const STEEL='steelGloss',CAST='rivetedSteel',INK='metalDark',GLASS='glass',GRATE='gratedSteel';
const block=(k,a,b,mat)=>k.deco(a,b,mat);
const tube=(k,a,b,r=.055,mat=STEEL)=>k.pipe(a,b,r,mat,12);
export const STRONGHOLD_WALL_SYSTEMS=Object.freeze([
 {id:'vent_exchange',zone:'command',x:17.82,z:6,face:'east',floor:0},
 {id:'wiring_maintenance',zone:'armory',x:-75.79,z:9,face:'west',floor:0},
 {id:'power_distribution',zone:'east_corridor',x:54.08,z:-3.78,face:'south',floor:0},
 {id:'coolant_manifold',zone:'reactor',x:3.80,z:15.3,face:'east',floor:0},
 {id:'sterile_access',zone:'medical',x:29.78,z:51,face:'east',floor:0},
 {id:'data_distribution',zone:'upper_gallery',x:20.93,z:82,face:'east',floor:4.2},
 {id:'pressure_vent',zone:'upper_gallery',x:15.075,z:121,face:'west',floor:4.2},
 {id:'emergency_cabling',zone:'upper_gallery',x:20.93,z:137,face:'east',floor:4.2},
]);
// Compose in local panel u,v coordinates; the host west/east or south wall
// is physically behind the 3D relief. The frame is only 9 cm deep.
function panel(k,{x,z,face,floor},width=3.4,height=2.8){
 const y=floor+1.18,w=width/2;
 const alongX=face==='south'||face==='north';
 const box=(u0,v0,u1,v1,depth,thick,mat)=>{
   if(alongX){
     const towards=face==='south'?1:-1;
     const off=depth*towards,far=(depth+thick)*towards;
     block(k,[x+u0,y+v0,Math.min(z+off,z+far)],
       [x+u1,y+v1,Math.max(z+off,z+far)],mat);
   }else{
     const towards=face==='east'?-1:1;
     const off=depth*towards,far=(depth+thick)*towards;
     block(k,[Math.min(x+off,x+far),y+v0,z+u0],
       [Math.max(x+off,x+far),y+v1,z+u1],mat);
   }
 };
 const wire=(u0,v0,u1,v1,r,mat=STEEL)=>{
   if(alongX){
     const d=face==='south'?1:-1;
     tube(k,[x+u0,y+v0,z+d*.11],[x+u1,y+v1,z+d*.11],r,mat);
   }else{
     const d=face==='east'?-1:1;
     tube(k,[x+d*.11,y+v0,z+u0],[x+d*.11,y+v1,z+u1],r,mat);
   }
 };
 box(-w,0,w,height,.012,.045,INK);
 box(-w+.12,.13,w-.12,height-.13,.059,.044,CAST);
 // Unbroken machined frame with individually raised corner fasteners.
 for(const v of [.07,height-.10])box(-w,v,w,v+.045,.114,.023,STEEL);
 for(const u of [-w+.052,w-.088])box(u,.16,u+.037,height-.17,.116,.023,STEEL);
 for(const u of [-w+.19,w-.19])for(const v of [.23,height-.26]){
   const sign=(face==='east'||face==='north')?-1:1;
   if(alongX)tube(k,[x+u,y+v,z+sign*.14],[x+u,y+v,z+sign*.15],.052,INK);
   else tube(k,[x+sign*.14,y+v,z+u],[x+sign*.15,y+v,z+u],.052,INK);
 }
 return {box,wire,height,w};
}
function ventExchange(k,p){
 const {box,w,height}=panel(k,p,3.7,3);
 // Uneven large vertical intake, ribbed carbon louvers and offset filter door.
 box(-w+.28,.4,-w+1.07,height-.34,.12,.03,INK);
 for(let j=0;j<22;j++)box(-w+.35,.49+j*.101,-w+.98,.54+j*.101,.16,.025,j%4===0?STEEL:GRATE);
 box(-.55,.55,w-.3,height-.36,.12,.07,GLASS);
 for(const y of [.75,1.25,1.75,2.25])box(-.38,y,w-.45,y+.035,.22,.02,INK);
}
function wiringMaintenance(k,p){
 const {box,wire,w,height}=panel(k,p,4.4,3.1);
 box(-w+.30,.31,w-.30,height-.35,.13,.04,INK);
 // Actual exposed cable runs follow ducts then turn 90° into terminals.
 for(let i=0;i<8;i++){
  const x=-w+.47+i*.13,y=.58+(i%3)*.12;
  wire(x,y,x,2.15+i*.036,.026,i%3===0?'blue':STEEL);
  wire(x,2.15+i*.036,.15+i*.08,2.15+i*.036,.024,STEEL);
 }
 for(let j=0;j<5;j++){
  const u=.25+j*.29;
  box(u,1.87,u+.17,2.24,.20,.08,CAST);
  box(u+.035,2.04,u+.135,2.12,.30,.016,j%2?'orange':'blue');
 }
 box(-w+.18,.16,-w+.33,height-.17,.16,.13,STEEL);
}
function powerDistribution(k,p){
 const {box,wire,w,height}=panel(k,p,5,3.1);
 // Heavy stepped transformer housings, heat sinks and diagnostic gauge.
 for(let j=0;j<3;j++){
  const a=-w+.36+j*1.39;
  box(a,.36,a+1.08,2.68,.12,.24,j===1?INK:CAST);
  for(let n=0;n<10;n++)box(a+.16,.51+n*.197,a+.92,.54+n*.197,.385,.025,STEEL);
  box(a+.30,2.27,a+.78,2.44,.38,.026,j===1?'red':'blue');
 }
 wire(-w+.3,.20,w-.3,.20,.07,INK);
}
function coolantManifold(k,p){
 const {box,wire,w,height}=panel(k,p,4.0,3.3);
 box(-w+.22,.25,w-.20,height-.27,.12,.06,INK);
 for(let j=0;j<4;j++){
  const u=-w+.45+j*.89;
  wire(u,.35,u,2.87,.10,j%2?CAST:STEEL);
  wire(u,.72,u+.33,.72,.055,STEEL);
  box(u-.16,1.21,u+.19,1.75,.26,.08,'glass');
  box(u-.10,1.28,u+.14,1.58,.355,.018,j%2?'orange':'blue');
 }
 wire(-w+.3,2.97,w-.3,2.97,.08,STEEL);
}
function sterileAccess(k,p){
 const {box,w,height}=panel(k,p,4.0,2.9);
 // Recessed technical access hatch with gasket, hinges and privacy glass.
 box(-w+.2,.18,w-.2,height-.18,.10,.02,INK);
 box(-w+.28,.32,w-.28,height-.29,.135,.060,STEEL);
 box(-w+.4,.42,w-.4,height-.39,.215,.030,GLASS);
 for(let j=0;j<4;j++)box(-w+.50,.55+j*.44,w-.60,.60+j*.44,.270,.023,INK);
 for(let v of [.45,2.05])box(w-.52,v,w-.26,v+.20,.255,.08,INK);
 box(-w+.30,2.43,-w+.14,2.68,.24,.07,'blue');
}
function dataDistribution(k,p){
 const {box,wire,w,height}=panel(k,p,3.7,3.0);
 box(-w+.26,.24,w-.28,height-.27,.13,.028,INK);
 for(let i=0;i<5;i++){
  const h=.51+i*.39;
  box(-w+.35,h,-w+1.06,h+.21,.19,.06,CAST);
  box(-w+.22,h+.065,-w+.12,h+.11,.22,.02,'blue');
 }
 for(let i=0;i<8;i++)wire(-.31+i*.19,.43,-.31+i*.19,2.48,.020,STEEL);
 box(.6,1.16,w-.32,2.51,.21,.04,GLASS);
}
function pressureVent(k,p){
 const {box,wire,w,height}=panel(k,p,4.0,2.9);
 // Slanted piping/pressure gauge; lower grille doesn't hide an existing door.
 box(-w+.34,.4,w-.35,1.35,.14,.06,INK);
 for(let i=0;i<14;i++)box(-w+.47,.51+i*.05,w-.48,.527+i*.05,.225,.023,GRATE);
 for(let i=0;i<5;i++){
  const u=-1.38+i*.70;
  wire(u,1.46,u+.24,2.32,.045,STEEL);
  wire(u+.24,2.32,u+.45,2.32,.045,CAST);
 }
 box(.52,2.43,1.22,2.58,.185,.025,'orange');
}
function emergencyCabling(k,p){
 const {box,wire,w,height}=panel(k,p,4.2,3.1);
 box(-w+.24,.28,w-.23,height-.25,.115,.042,INK);
 for(let j=0;j<10;j++){
  const u=-w+.35+j*.34;
  wire(u,.52,u+(j%2?.17:-.13),1.48,.027,j%3===0?STEEL:CAST);
  wire(u+(j%2?.17:-.13),1.48,u+.06,2.58,.028,STEEL);
 }
 for(let i=0;i<4;i++)box(-w+.12+i*.94,2.63,-w+.35+i*.94,2.77,.17,.05,'red');
}
// Do not clone the owner's single premium photo-detail test tile; that stays
// precisely one bespoke upper gallery module in sumiStrongholdOnePanel.js.
export function addStrongholdWallSystems(k){
 for(const p of STRONGHOLD_WALL_SYSTEMS){
  if(p.id==='vent_exchange')ventExchange(k,p);
  if(p.id==='wiring_maintenance')wiringMaintenance(k,p);
  if(p.id==='power_distribution')powerDistribution(k,p);
  if(p.id==='coolant_manifold')coolantManifold(k,p);
  if(p.id==='sterile_access')sterileAccess(k,p);
  if(p.id==='data_distribution')dataDistribution(k,p);
  if(p.id==='pressure_vent')pressureVent(k,p);
  if(p.id==='emergency_cabling')emergencyCabling(k,p);
 }
}
