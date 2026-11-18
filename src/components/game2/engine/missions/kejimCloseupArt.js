// Kejim opening/evacuation art pass.
// Everything in this module is non-colliding trim over verified physical decks,
// except cliff cylinders deliberately outside the traversable route. A geometry
// pass rather than a blanket pixel-grid shader: the player sees actual raised
// seams, fasteners, pipes, supports, struts, rough rock and distinct floor zones.
export function addKejimCloseupDetail(k) {
  const R=(n)=>Math.round(n*1000)/1000;
  const plate=(x0,z0,x1,z1,y=.31,mat='rivetedSteel')=>
    k.deco([x0,y,z0],[x1,y+.035,z1],mat);
  const bolt=(x,y,z,r=.075)=>k.deco([x-r,y,z-r],[x+r,y+.042,z+r],'steelGloss');

  // === Landing pad: layered hull plating with narrow, separate drain slots.
  // The deck stays clear at the player's start (0,-61). The Raven's Claw
  // occupies the western portion, and must not be covered by floor details.
  // Four structural hull seams form panels; actual screw heads sit proud.
  for(const z of [-69.2,-65.2,-61.2,-57.2,-53.2]){
    plate(-8.9,z,8.9,z+.095,.308,'metalDark');
    for(const x of [-8.2,-3.9,0.9,5.4,8.1])bolt(x,.36,z+.04,.062);
  }
  for(const x of [0.2,4.3,8.0]){
    plate(x,-69.5,x+.07,-52.8,.309,'metalDark');
  }
  // Hand-tightened rivet courses on narrow deck ribs, instead of only a
  // procedural shader. They remain visible in close-up at the spawn point.
  for(let j=0;j<16;j++){
    const z=-69.1+j*1.01;
    bolt(4.35,.351,z,.050);
    bolt(8.03,.351,z+.14,.056);
  }
  // Narrow perforated maintenance trenches, not a single 80m-wide wire grid.
  for(const x of [1.0,7.15]){
    plate(x,-68.4,x+0.64,-53.9,.35,'gratedSteel');
    plate(x-.1,-68.4,x-.045,-53.9,.36,'steelGloss');
    plate(x+.685,-68.4,x+.74,-53.9,.36,'steelGloss');
    for(let z=-68;z<-53.8;z+=1.7)
      k.deco([x-.18,.35,z],[x+.85,.39,z+.10],'rivetedSteel');
  }
  // Pad perimeter, bolt-on curb/impact guards, graded hazard strips.
  for(const z of [-69.8,-52.1]){
    plate(-9,z,9,z+.19,.37,'hazard');
    for(let x=-8;x<9;x+=2.4)bolt(x,.405,z+.08,.11);
  }
  for(const x of [-8.95,8.75]){
    k.deco([x,.32,-69.7],[x+.2,.63,-52.5],'rivetedSteel');
    for(const z of [-67.5,-62.5,-57.5,-53.5]){
      k.pipe([x+.1,.65,z],[x+.1,1.85,z],.075,'steelGloss');
      k.deco([x-.12,1.84,z-.15],[x+.3,1.93,z+.15],'hazard');
    }
  }
  // Ground-service hardware and a broad hydraulic jack under the craft.
  // The west craft geometry is never removed or replaced.
  k.deco([-7.8,.305,-68.3],[-6.0,.47,-67.4],'metalDark');
  k.pipe([-7.3,.47,-67.8],[-4.2,2.4,-66.1],.12,'steelGloss');
  k.deco([-8.4,.3,-54.1],[-6.2,.61,-53.6],'rivetedSteel');
  for(const z of [-65.5,-59.5]){
    k.pipe([8.4,.7,z],[8.4,3.6,z],.085,'steelGloss');
    k.pipe([8.4,3.6,z],[7.75,3.6,z],.10,'steelGloss');
    k.lamp([7.75,3.5,z],'orange');
  }

  // === Canyon: existing invisible/cliff collision remains unchanged, while
  // actual faceted rock masses conceal the axis-aligned original rock boxes.
  // Each rock has a different footprint, strata, erosion and height. These
  // live behind the canyon side walls to avoid narrowing the walkable route.
  const cliffs=[
    [-10.8,-50.1,3.8,9.1],[-11.3,-43.8,3.6,12.4],
    [-10.7,-37.2,3.8,10.7],[-10.3,-28.3,3.2,8.9],
    [10.8,-49.3,4.2,10.2],[11.0,-41.2,3.7,11.8],
    [10.6,-33.8,3.2,9.6],[10.8,-26.1,4.1,13.2],
    [-13.0,-64.5,5.5,12.2],[12.8,-64.0,4.5,8.6],
    [-20,-57.3,6.1,12.8],[20,-58,7.1,17],
  ];
  for(const [x,z,r,h] of cliffs)k.crag(x,z,r,h,'strataRock',17);

  // Broken strata / rock chips alongside the path, each a distinct polygon,
  // with small physically separated fragments next to existing boulders.
  for(const [x,z,r,h] of [
    [-6.5,-47.6,.8,.44],[-5.8,-37.8,1.12,.63],
    [6.4,-45.0,.9,.52],[5.9,-29.3,1.2,.73],
    [-6.7,-24.7,.74,.45],[6.6,-51.6,.65,.36],
  ])k.crag(x,z,r,h,'strataRock',9);
  // Cantilevered observation structures with round supports. These are above
  // the established sniper ledges, so enemies retain their original footholds.
  for(const [x,z,sgn] of [[-6,-30,1],[6,-38,-1]]){
    k.pipe([x,2.62,z],[x,5.15,z],.13,'steelGloss');
    k.pipe([x,5.15,z],[x+sgn*2.4,5.15,z],.15,'steelGloss');
    k.deco([Math.min(x,x+sgn*2.4)-.2,5.1,z-.3],
      [Math.max(x,x+sgn*2.4)+.2,5.26,z+.3],'rivetedSteel');
    k.lamp([x,4.97,z],'red');
  }

  // === Evacuation / final screenshot area: individual armored decking
  // panels replace the endless identical steel mesh. Only narrow utility
  // slots contain open-looking grating; bolts, vents and rails have depth.
  for(let x=198;x<238;x+=5.15){
    const right=Math.min(238.9,x+4.95);
    for(let z=199;z<219;z+=5){
      const end=Math.min(219,z+4.8);
      plate(x,z,right,end,.33,'rivetedSteel');
      for(const px of [x+.25,right-.25])
        for(const pz of [z+.25,end-.25])bolt(px,.369,pz,.095);
    }
  }
  for(const z of [203,211,216]){
    plate(198,z,238,z+1.05,.38,'gratedSteel');
    plate(198,z-.1,238,z-.045,.39,'steelGloss');
    plate(198,z+1.1,238,z+1.15,.39,'steelGloss');
    for(let x=200;x<237;x+=2.4)
      k.deco([x,.38,z-.12],[x+.17,.45,z+1.17],'metalDark');
  }
  // Rail beyond the two sides; broken entries remain at the south approach.
  for(const x of [197,239]){
    for(const z of [199,205,211,217]){
      k.pipe([x,.33,z],[x,1.72,z],.12,'steelGloss');
      k.deco([x-.24,.33,z-.26],[x+.24,.4,z+.26],'hazard');
    }
    for(const z of [199,205,211])
      k.pipe([x,1.6,z],[x,1.6,z+6],.085,'steelGloss');
  }
  // Broad framed floodlights cast real engine light in addition to emissive
  // glow geometry; cable ducting and vents are not arranged in a uniform grid.
  const lamps=[[199,200,5.6],[236,219,6.6]];
  for(const [x,z,h] of lamps){
    k.pipe([x,.4,z],[x,h,z],.20,'steelGloss');
    k.deco([x-.37,h-.18,z-.28],[x+.37,h+.15,z+.30],'rivetedSteel');
    k.deco([x-.23,h-.10,z-.32],[x+.23,h+.09,z-.29],'white');
    k.lamp([x,h,z],'white');
  }
  // Extraction beacon itself, kept separate from its interactable at (217,214).
  k.pipe([217,1.6,218.8],[217,4.2,218.8],.17,'steelGloss');
  k.deco([216.52,4.0,218.5],[217.48,4.4,219.2],'rivetedSteel');
  k.lamp([217,4.3,218.8],'green');
  // Human-scale asymmetry around the frame.
  for(const [x,z,h] of [[200,223,2.1],[208,225,1.2],
    [227,225,3.3],[242,204,4.5],[187,202,5.6],
    [243,224,6.8]])k.crag(x,z,h*1.1,h*2,'strataRock',15);
  // Small hardware and custom vent housings along the service border.
  for(const [x,z,w,h] of [
    [204,223,2.2,.7],[231,223,3.8,1.5],[237,196,1.9,1.1],
  ]){
    k.deco([x,0,z],[x+w,h,z+1.15],'rivetedSteel');
    k.deco([x+.12,h,z+.2],[x+w-.12,h+.14,z+.95],'gratedSteel');
    k.pipe([x+.16,.2,z+.06],[x+w-.16,.2,z+.06],.11,'steelGloss');
  }
}
