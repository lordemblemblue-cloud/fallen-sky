// An original expedition attached to the expanded remaster, not the licensed campaign.
import { KEJIM_POST } from './kejimPost.js';
import { layoutKit } from '../level/kit.js';
export const DISTRICTS = [
 ['freight','Freight Exchange',[66,-30,144,34],[104,0,0]],
 ['gorge','Fracture Gorge',[164,-30,232,34],[196,0,0]],
 ['detention','Detention Wing',[252,-30,330,34],[290,0,0]],
 ['reactor','Reactor Works',[252,62,330,140],[290,0,100]],
 ['reservoir','Cooling Reservoir',[154,62,232,140],[192,0,100]],
 ['archive','Survey Archive',[66,62,134,140],[100,0,100]],
 ['ridge','Stormwatch Ridge',[66,170,144,248],[104,0,208]],
 ['relay','Orbital Relay',[174,170,252,248],[212,0,208]],
 ['evac','Northern Evacuation Apron',[282,170,360,248],[320,0,208]],
];
const old=structuredClone(KEJIM_POST), k=layoutKit('kejim_frontier',23719), L=k.L;
Object.assign(L,old.layout);
L.name='kejim_frontier'; L.detailedMaterials=true; L.rockForms=[]; L.tubes=[];
L.navBounds=[-34,-72,362,250];
L.env={sunDir:[-.4,.74,.46],sunCol:[.88,.79,.66],ambTop:[.47,.57,.66],ambBot:[.23,.22,.23],fogCol:[.37,.46,.54],fogD:.0028,skyDay:1};
// A real opening through both the hangar wall and backing cliff.
// The original Kejim remaster includes a closed saboteur-annex east wall at
// x=263, z=94..123. The expedition's Reactor -> Reservoir corridor crosses it.
// Cut an actual 8 m wide, 4.6 m tall east-side doorway in this mission only;
// retain the jambs/lintel and the original Kejim mission's intact enclosure.
const annexEastWall=L.solids.find(s=>s.min[0]===263&&s.max[0]===263.75&&s.min[2]===94&&s.max[2]===123&&s.min[1]===0);
if(annexEastWall){
 L.solids=L.solids.filter(s=>s!==annexEastWall);
 for(const [min,max] of [
   [[263,0,94],[263.75,6,96]],
   [[263,0,104],[263.75,6,123]],
   [[263,4.6,96],[263.75,6,104]],
 ]) L.solids.push({...annexEastWall,min,max});
}
L.solids=L.solids.filter(s=>!(s.min[0]===58&&s.max[0]===60) && !(s.min[0]===60&&s.max[0]===64));
L.clips=L.clips.filter(s=>!(s.min[0]===60&&s.max[0]===64));
k.wall({x0:58,z0:-16,x1:60,z1:16,h:9,mat:'metal',gaps:[{a:-4,b:4,top:6}]});
k.door('freight_exit',[58,0,-4],[60,6,4],false);
const tube=(a,b,r=.09)=>L.tubes.push({a,b,r,mat:'steelGloss'});
const rock=(x,y,z,sx,sy,sz,seed)=>L.rockForms.push({p:[x,y,z],scale:[sx,sy,sz],seed,mat:'rock'});
function grating(x0,z0,x1,z1){
 k.deco([x0,.01,z0],[x1,.025,z1],'metalDark');
 for(let x=x0;x<x1;x+=.24) k.deco([x,.03,z0],[x+.055,.075,z1],'steelGloss');
 for(let z=z0;z<z1;z+=.8) k.deco([x0,.025,z],[x1,.065,z+.07],'steelGloss');
}
function bridge(a,b,width=10,mat='metal'){
 k.span(a,b,width,1.2,mat);
 const dx=b[0]-a[0],dz=b[2]-a[2],len=Math.hypot(dx,dz),nx=-dz/len*width/2,nz=dx/len*width/2;
 for(const side of [-1,1]){
  const p=[a[0]+nx*side,1.15,a[2]+nz*side],q=[b[0]+nx*side,1.15,b[2]+nz*side];
  tube(p,q);tube([p[0],.55,p[2]],[q[0],.55,q[2]],.055);
  for(let t=0;t<=len;t+=3){const x=p[0]+dx*t/len,z=p[2]+dz*t/len;tube([x,0,z],[x,1.2,z],.075);}
 }
}
bridge([60,0,0],[66,0,0]);bridge([144,0,0],[164,0,0],12,'rock');bridge([232,0,0],[252,0,0],10,'rock');
bridge([290,0,34],[290,0,62]);bridge([232,0,100],[252,0,100]);bridge([134,0,100],[154,0,100]);
bridge([104,0,140],[104,0,170],12,'rock');bridge([144,0,208],[174,0,208],12,'rock');bridge([252,0,208],[282,0,208]);
for(const [i,[id,name,rect,at]] of DISTRICTS.entries()){
 const [x0,z0,x1,z1]=rect,[x,,z]=at;
 k.solid([x0,-1,z0],[x1,0,z1],['gorge','ridge'].includes(id)?'rock':'metal');
 for(let px=x0+3;px<x1;px+=6) k.deco([px,.006,z0],[px+.055,.025,z1],'metalDark');
 for(let pz=z0+3;pz<z1;pz+=6) k.deco([x0,.006,pz],[x1,.025,pz+.055],'metalDark');
 k.zone(id,...rect);
 for(const [px,pz] of [[x0+4,z0+4],[x1-4,z0+4],[x0+4,z1-4],[x1-4,z1-4]]) k.lampPost(px,pz,3.2,i%2?'blue':'orange');
 for(let j=0;j<9;j++) rock(x0+(x1-x0)*j/8,1,j%2?z0-7:z1+7,3+k.r(0,3),4+k.r(0,8),3+k.r(0,2),i*19+j);
 if(['gorge','ridge','reservoir'].includes(id)) continue;
 k.use(id+'_terminal',[x+10,0,z+18],2.8,'Operate '+name+' controls');
 k.solid([x+9,0,z+19],[x+12,1.2,z+20],'console');k.deco([x+9.1,1.2,z+19],[x+11.9,1.8,z+19.08],'blue');
}
// Freight: ribbed cargo containers and overhead crane; clear central loading lane.
for(const [x,z,h] of [[78,-18,4],[120,20,6],[122,-20,3],[80,20,3]]){
 k.solid([x,0,z],[x+12,h,z+6],'hullDark');
 for(let t=0;t<12;t+=.7) k.deco([x+t,.15,z-.08],[x+t+.09,h-.12,z],'steelGloss');
}
for(const x of [88,126]) k.pillar(x,10,.65,0,11,'steelGloss');tube([88,10,10],[126,10,10],.4);grating(94,-8,112,8);
// Gorge: fractured silhouettes around a wide, navigable stone spine.
for(let j=0;j<16;j++) rock(166+j*4,-1,j%2?20:-20,5,3+k.r(0,3),6,j+300);
// Detention: barred cells behind a broad combat aisle.
k.room({x0:258,z0:-26,x1:324,z1:28,ceil:8,mat:'panel',skip:['w','n'],strips:'blue'});
for(let j=0;j<5;j++){const x=263+j*11;k.solid([x,0,-26],[x+.4,4,-12],'panel');for(let q=0;q<8;q++)tube([x+1+q*1.1,0,-12],[x+1+q*1.1,3.8,-12],.07);}
grating(282,-8,298,8);
// Reactor: four turbines, suspended pipes, grating and multiple combat lanes.
for(const [x,z] of [[266,80],[316,80],[266,122],[316,122]]){
 k.pillar(x,z,3,0,8,'steelGloss');for(let h=1;h<8;h+=2)k.ring(x,z,3,3.3,h,.15,'metalDark',24,false);
 tube([x,7,z],[290,7,z],.24);
}
grating(282,66,298,88);
// Reservoir: two recessed basins alongside the central service causeway.
for(const z of [74,110]){k.deco([165,.02,z],[220,.06,z+18],'water');k.solid([165,0,z],[220,.45,z+.3],'metalDark');k.solid([165,0,z+17.7],[220,.45,z+18],'metalDark');}
bridge([154,0,100],[232,0,100],12);
// Archive: staggered server shelves and a perimeter route.
k.room({x0:70,z0:66,x1:130,z1:136,ceil:9,mat:'panel',skip:['e','n'],strips:'white'});
for(const x of [78,120])for(const z of [78,98,118]){k.solid([x,0,z],[x+3,4,z+8],'console');for(let y=.4;y<4;y+=.6)k.deco([x-.03,y,z+.2],[x,y+.12,z+7.8],'blue');}
for(const [x,z,s] of [[76,184,6],[132,230,9],[79,236,5]])rock(x,0,z,s,12,s+2,x);
k.disc(104,208,15,0,.8,'rock',48);
// Relay aerial and final landing beacon.
k.pillar(234,230,4,0,14,'metalDark');for(let j=0;j<8;j++){const a=j*Math.PI/4;tube([234,13,230],[234+Math.cos(a)*9,17,230+Math.sin(a)*9],.18);}
k.ring(234,230,4,9,17,.3,'steelGloss',48,false);k.ring(320,208,15,15.4,.04,.04,'hazard',64,false);
for(const x of [286,354])for(let z=180;z<242;z+=9)k.lamp([x,.2,z],'blue');
for(const x of [-31,31])tube([x,3,-18],[x,3,18],.18);
for(let z=-18;z<19;z+=3)for(const x of [-31.8,31.6])k.deco([x,.4,z],[x+.18,5.5,z+2.7],'panel');
grating(-8,-18,8,18);
k.use('reactor_redirect',[280,0,118],2.8,'Redirect power: fast upload, additional defenders');
k.solid([279,0,119],[282,1.2,120],'console');k.deco([279.1,1.2,119],[281.9,1.8,119.08],'orange');
L.interactables.find(i=>i.id==='reactor_terminal').prompt='Shut down safely: slower upload, no extra defenders';
// Keep outcrops clear of every connector, including its landing apron.
L.rockForms=L.rockForms.filter(r=>!L.spans.some(s=>{
 const dx=s.b[0]-s.a[0],dz=s.b[2]-s.a[2],len2=dx*dx+dz*dz;
 const t=Math.max(0,Math.min(1,((r.p[0]-s.a[0])*dx+(r.p[2]-s.a[2])*dz)/len2));
 return Math.hypot(r.p[0]-s.a[0]-dx*t,r.p[2]-s.a[2]-dz*t)<Math.max(r.scale[0],r.scale[2])*1.23+s.width/2+1;
}));
const foe=(a,x,z)=>({a,at:[x,0,z],yaw:Math.PI});
const groups={...old.groups,
 relay_reinforcements:[foe('stormtrooper',200,218),foe('stormtrooper',222,190),foe('officer',226,218)],
 freight_watch:[foe('officer',102,12),foe('stormtrooper',90,0),foe('stormtrooper',116,-6),foe('stormtrooper',116,12)],
 gorge_pair:[foe('acolyte',188,-4),foe('acolyte',204,5)],
 detention_watch:[foe('stormtrooper',278,0),foe('officer',304,12),foe('stormtrooper',310,-3)],
 reactor_pair:[foe('acolyte',280,100),foe('acolyte',300,108)],
 reservoir_watch:[foe('stormtrooper',181,100),foe('stormtrooper',206,101)],
 archive_watch:[foe('officer',112,110),foe('stormtrooper',88,91),foe('stormtrooper',110,90)],
 ridge_trio:[foe('acolyte',96,202),foe('acolyte',112,202),foe('acolyte',104,220)],
 relay_guard:[foe('acolyte',206,204),foe('acolyte',222,212)],
 evac_guard:[foe('stormtrooper',308,200),foe('stormtrooper',332,218)],
};
const say=text=>({say:[['JAN',text]]});
const reach=(id,text,spawn)=>({id:id+'_approach',text,until:{zone:id},onStart:[{spawn}],
 checkpoint:{pos:id==='freight'?[56,0,0]:DISTRICTS[DISTRICTS.findIndex(d=>d[0]===id)-1][3]},marker:DISTRICTS.find(d=>d[0]===id)[3]});
const clear=(id,group,text)=>({id:id+'_clear',text,until:{cleared:[group]}});
const interactObjective=(id,text)=>({id:id+'_use',text,until:{interact:id+'_terminal'}});
const opening=old.objectives.slice(0,6);
opening[5].onComplete=[{open:'hangar_door'},{open:'freight_exit'},{companion:'follow'},say('The manifests point beyond the east freight gate. We need the detention records and the orbital relay before extraction.')];
export const KEJIM_FRONTIER={...old,subtitle:'Expanded Remaster · Northern Expedition',layout:L,groups,objectives:[...opening,
 reach('freight','Reach the freight exchange through the east hangar exit','freight_watch'),clear('freight','freight_watch','Clear the loading lanes'),interactObjective('freight','Release the freight transit locks'),
 reach('gorge','Cross Fracture Gorge','gorge_pair'),clear('gorge','gorge_pair','Defeat both dark Jedi acolytes'),
 reach('detention','Infiltrate the detention wing','detention_watch'),clear('detention','detention_watch','Secure the cell corridor'),interactObjective('detention','Recover the prisoner transfer records'),
 reach('reactor','Reach the reactor works','reactor_pair'),clear('reactor','reactor_pair','Break the acolytes’ defense around the turbines'),{id:'reactor_choice',text:'Choose safe shutdown or redirect power for a faster transmission',until:{anyInteract:['reactor_terminal','reactor_redirect']},onComplete:[{ifUsed:'reactor_redirect',then:[say('Power diverted. The relay will transmit faster, but the surge has alerted a reserve squad.')],else:[say('Reactor isolated safely. The relay will have to use backup power.')]}]},
 reach('reservoir','Cross the cooling reservoir','reservoir_watch'),clear('reservoir','reservoir_watch','Clear the reservoir bridge'),
 reach('archive','Reach the survey archive','archive_watch'),clear('archive','archive_watch','Secure the records hall'),interactObjective('archive','Recover the survey records'),
 reach('ridge','Follow the stone causeway to Stormwatch Ridge','ridge_trio'),clear('ridge','ridge_trio','Defeat the three acolytes on the ridge'),
 reach('relay','Reach the orbital relay','relay_guard'),clear('relay','relay_guard','Secure the orbital transmitter'),
 {id:'relay_upload',text:'Transmit the evidence while holding the relay',until:{hold:'relay_terminal',seconds:35,secondsIfUsed:{id:'reactor_redirect',seconds:15},radius:12},checkpoint:{pos:[212,0,208]},holdText:'Transmitting evidence',onStart:[{ifUsed:'reactor_redirect',then:[{spawn:'relay_reinforcements'}]}],onComplete:[say('Transmission received. The shuttle is approaching the northern apron.')]},
 reach('evac','Reach the northern evacuation apron','evac_guard'),clear('evac','evac_guard','Secure the landing zone'),
 {...interactObjective('evac','Signal Jan for extraction'),onComplete:[{complete:true}]},
]};