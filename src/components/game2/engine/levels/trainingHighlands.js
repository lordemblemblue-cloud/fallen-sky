// A continuous sampled mountain apron: adjacent cells share exact edge heights.
export function highlandHeight(x,z){
 const smooth=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};
 const entry=smooth((z-64)/28),edge=smooth((Math.abs(x)-30)/55),back=smooth((z-180)/55);
 const crags=5+4*Math.sin(x*.071+z*.034)**2+3*Math.cos(z*.093-x*.05)**2;
 const trail=1-Math.exp(-(((x-10*Math.sin((z-64)*.035))/13)**2));
 return entry*(.22*(Math.sin(x*.14+z*.07)+1)*trail+edge*crags+back*(12+crags));
}
export function addTrainingHighlands(k){
 const L=k.L;L.detailedMaterials=true;L.terrainPatches=[{x0:-90,z0:64,x1:90,z1:240,step:2,height:highlandHeight,mat:'rock'}];
 // Preserve the existing east-side Training Grounds, lift and arena boundaries.
 L.navBounds=[-92,-48,322,242];
 // Broad open northern entrance, connected to the existing garden floor.
 L.solids=L.solids.filter(s=>!(s.min[0]===-28&&s.min[2]===63&&s.max[0]===28&&s.max[2]===64));
 k.wall({x0:-28,z0:63,x1:28,z1:64,h:9,mat:'rockDark',gaps:[{a:-5,b:5,top:6}]});
 k.deco([-5.4,6,62.8],[5.4,6.6,64.2],'rock');
 // Wayfinding and rest platforms, each with its own approach along the valley.
 for(const [x,z] of [[0,78],[5,116],[-6,155],[0,183]]){
  const y=highlandHeight(x,z);k.lamp([x-7,y+2.2,z],'orange');k.lamp([x+7,y+2.2,z],'orange');
 }
 k.zone('highland_trail',-30,65,30,184);
}
