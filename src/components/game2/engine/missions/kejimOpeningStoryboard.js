// Mission 1 / Kejim Post: opening 00:00–00:30 storyboard translated into
// actual metres-wide 3D level primitives, NOT images pasted in the sky.
// Stage 1 is named and separately callable; Stage 2 uses the existing
// material-aware Game 2 builder and the photographic Kejim canyon atlas.
// The real perimeter_gate collider, reachable override and mission triggers
// stay authoritative in kejimPost.js. The centre lane x=-3..3 stays clear.
//
// These 11 beats correspond to the original 00:00 panel plus ten additional
// 3-second pictures. Every frame specifies its own architectural focus and
// its own authored structural/material geometry. The shot list is also
// inspectable for subsequent camera/cinematic work; no scripted cutscene yet.

export const KEJIM_OPENING_STORYBOARD = Object.freeze([
  {second:0,  id:'landing',       z:-66.5, camera:[0,3,-70],  feature:'landing dock',       finish:'wet pad edging and dock lamps'},
  {second:3,  id:'departure',     z:-61.0, camera:[1,2,-66],  feature:'cargo approach',     finish:'painted hull panels and fasteners'},
  {second:6,  id:'bridge-reveal', z:-55.0, camera:[0,3,-60],  feature:'canyon skybridge',   finish:'grated catwalk and guard rails'},
  {second:9,  id:'patrol',        z:-51.0, camera:[-1,2,-55], feature:'sentry observation', finish:'guard-post vents and beacons'},
  {second:12, id:'first-contact', z:-47.0, camera:[0,2,-51],  feature:'combat cover',       finish:'riveted cover and hazard caps'},
  {second:15, id:'counterstrike', z:-43.0, camera:[1,2,-47],  feature:'combat gantry',      finish:'gunmetal conduit and warm light'},
  {second:18, id:'push-forward',  z:-39.0, camera:[0,2,-43],  feature:'upper parapet',      finish:'vertical steel seams and grating'},
  {second:21, id:'approach',      z:-35.0, camera:[0,2,-40],  feature:'service causeway',   finish:'service conduits and warning stripes'},
  {second:24, id:'gate-view',     z:-31.0, camera:[0,2,-35],  feature:'western utility bay',finish:'lit maintenance piping and rock detail'},
  {second:27, id:'gate-esplanade',z:-26.0, camera:[0,2,-31],  feature:'security forecourt', finish:'gate-edge brass and illuminated panels'},
  {second:30, id:'sealed-gate',   z:-23.2, camera:[0,3,-28],  feature:'closed fortress gate',finish:'red banners, steel lintel and lamps'},
].map(Object.freeze));

const bound=(a,b)=>[Math.min(a,b),Math.max(a,b)];
const block=(k,x0,y0,z0,x1,y1,z1,material='rivetedSteel',solid=false)=>{
  const [ax,bx]=bound(x0,x1),[ay,by]=bound(y0,y1),[az,bz]=bound(z0,z1);
  // A non-colliding mesh is still solid 3D geometry, not a billboard. Small
  // waist-high combat cover is collidable so laser/fire line cover is real.
  const write=solid?k.solid:k.deco;
  write([ax,ay,az],[bx,by,bz],material);
};
const tube=(k,a,b,r=.085)=>k.pipe(a,b,r,'steelGloss',12);

// FRAME-BY-FRAME STAGE 1: thick volumes, silhouettes and physically modeled
// cover. Outboard pylons are intentionally x>=8, outside the original 14m
// canyon and its NPC patrol footprints. All spans are OVER the player's head.
export function blockoutKejimOpening(k){
  const L=k.L;
  L.openingStoryboard=KEJIM_OPENING_STORYBOARD.map(s=>({...s}));
  // Principal reference: the landing ship is west of x=-1.5 at z=-68..-55.
  // Keep its collision geometry and the hero's central spawn undisturbed.
  for(const f of KEJIM_OPENING_STORYBOARD){
    const z=f.z,atGate=z>-29;
    const outerX=atGate?11.6:10.5;
    const high=atGate?12.5:8.7;
    for(const sign of [-1,1]){
      const x=sign*outerX;
      block(k,x-.58,0,z-.67,x+.58,high,z+.67,'rivetedSteel');
      block(k,x-.87,high-.25,z-1.02,x+.87,high+.42,z+1.02,'metalDark');
      block(k,x-.64,high+.4,z-.57,x+.64,high+.72,z+.57,'rivetedSteel');
      // Distinct freestanding square beacon pylons, not a row of wall cubes.
      if(f.second%6===0)block(k,x-.26,high+.72,z-.26,x+.26,high+1.18,z+.26,'metalDark');
    }
    // Alternating steel bridgework and cliff-hugging outlooks frame the lane.
    if(f.second===0){
      block(k,9.3,4.9,-69.3,14.2,5.48,-63.1,'rivetedSteel');
      block(k,12.5,0,-68.3,14.2,5.0,-65.2,'metalDark');
      block(k,8.8,4.8,-69.7,14.4,6.2,-69.35,'metalDark');
    }else if(f.second===3){
      block(k,8.5,0,-63.8,11.8,2.9,-62.1,'metalDark');
      block(k,11.9,0,-59.9,14.7,4.2,-58.3,'rivetedSteel');
    }else if(f.second===6){
      // Overhead bridge: clearance 7.5m, two separate catwalk tiers. This
      // is not a new playable shortcut through the otherwise gated mission.
      block(k,-10.8,7.5,-56.6,10.8,8.15,-54.5,'rivetedSteel');
      for(const x of [-10.5,10.5])block(k,x-.17,8.14,-56.7,x+.17,9.4,-54.45,'metalDark');
    }else if(f.second===9){
      block(k,-15,6.7,-53.1,-8.9,7.35,-49.9,'rivetedSteel');
      block(k,8.9,6.7,-52.9,15.2,7.35,-49.7,'rivetedSteel');
    }else if(f.second===12){
      // These two cover blocks are deliberately physical. The centre
      // x=-3..3 is fully traversable throughout all first-contact shots.
      block(k,-6.2,0,-48.3,-4.35,1.35,-46.55,'metalDark',true);
      block(k,4.35,0,-48.55,6.15,1.25,-46.9,'metalDark',true);
    }else if(f.second===15){
      block(k,8.6,5.7,-45.5,15.4,6.35,-41.5,'rivetedSteel');
      block(k,13.5,0,-45.5,15.2,5.7,-43.9,'metalDark');
    }else if(f.second===18){
      block(k,-15.5,6.6,-40.7,-8.8,7.25,-37.4,'rivetedSteel');
      block(k,-14.8,0,-39.8,-12.1,6.6,-38.3,'metalDark');
    }else if(f.second===21){
      block(k,-14.3,6.1,-37.3,-8.7,6.73,-33.0,'rivetedSteel');
      block(k,-14.7,6.1,-34.2,-8.4,6.69,-33.65,'metalDark');
    }else if(f.second===24){
      // Show the service routing ABOVE the real, ground-level control at
      // (-2.58,-29). Do not cover it with foundation or block interaction.
      block(k,-12.9,0,-32.8,-8.6,6.4,-29.6,'rivetedSteel');
      block(k,-13.2,6.4,-32.9,-8.2,7.0,-29.2,'metalDark');
      block(k,-8.35,5.7,-32.9,-7.9,6.95,-29.1,'metalDark');
    }else if(f.second===27){
      block(k,-15.2,0,-28.3,-9.3,9.7,-24.3,'rivetedSteel');
      block(k,9.3,0,-28.3,15.2,9.7,-24.3,'rivetedSteel');
    }else if(f.second===30){
      // Above the gate's highest walkable opening y=5. Never fill its door.
      block(k,-12.9,10.8,-24.1,12.9,12.7,-20.2,'rivetedSteel');
      block(k,-14.4,0,-24.0,-10.9,12.8,-19.8,'metalDark');
      block(k,10.9,0,-24.0,14.4,12.8,-19.8,'metalDark');
    }
  }
  return L;
}

// STAGE 2: authored finish PER SHOT. Uses the scene's functioning metal,
// grating and geological materials already lit/textured in the WebGL shader.
// No 4K image is stretched across the scene. All finish is non-colliding,
// so you can replace it later without modifying combat or pathfinding.
export function finishKejimOpening(k){
  for(const f of KEJIM_OPENING_STORYBOARD){
    const z=f.z;
    const gate=z>-29;
    const X=gate?11.6:10.5;
    const Y=gate?12.5:8.7;
    for(const sign of [-1,1]){
      const x=sign*X;
      // Inset wall rails / machined ribs, actual raised volumes.
      for(const h of [1.4,3.1,4.9,6.7]){
        block(k,x-.65,h,z-.78,x+.65,h+.095,z-.64,'steelGloss');
        block(k,x-.65,h,z+.64,x+.65,h+.095,z+.78,'steelGloss');
      }
      for(const dx of [-.39,.39])for(const h of [1.85,3.9,6.05])
        block(k,x+dx-.065,h,z-.83,x+dx+.065,h+.14,z-.735,'steelGloss');
      tube(k,[x,Y+.7,z-.1],[x,Y+1.2,z-.1],.12);
      k.lamp([x,Y+1.21,z],'red');
      // Warm service luminaires anchored to their structural pylon.
      block(k,x-.27,Y-.65,z-.87,x+.27,Y-.1,z-.77,'orange');
    }
    // Individual shot surfaces: plated floor sections lie at grade .025.
    // On the ship pad they lie ABOVE the physical y=.3 spawn surface.
    const floorY=z<-52?.352:.024;
    const extent=z<-52?7.6:6.7;
    const x0=-extent,x1=extent;
    for(const x of [-extent,-3.55,3.45,extent-.28]){
      block(k,x,floorY,z-.42,x+.26,floorY+.024,z+.43,'rivetedSteel');
      for(const end of [-.29,.29])
        block(k,x+.085,floorY+.024,z+end-.045,
          x+.16,floorY+.059,z+end+.045,'steelGloss');
    }
    // Segmented anti-slip gratings and water runoff occupy only edge strips.
    // The centre never receives a raised invisible step.
    const edge=extent-1.05;
    for(const s of [-1,1]){
      const ex=s*edge;
      block(k,ex-.27,floorY,z-.62,ex+.27,floorY+.02,z+.62,'gratedSteel');
      block(k,ex-.29,floorY+.021,z-.71,ex+.29,floorY+.062,z-.64,'hazard');
    }
    if(f.second===0){
      for(const z0 of [-69,-65.7,-62.8]){
        block(k,9.65,5.5,z0,13.6,5.54,z0+.23,'gratedSteel');
        tube(k,[13.6,5.5,z0],[13.6,6.7,z0],.08);
      }
      k.lamp([12.9,6.75,-66],'orange');
    }else if(f.second===3){
      for(let y=.7;y<2.8;y+=.65)
        block(k,8.42,y,-63.9,8.55,y+.1,-62.1,'steelGloss');
      for(const x of [12.1,13.35,14.5])
        block(k,x,2.0,-59.96,x+.13,4.22,-59.86,'steelGloss');
    }else if(f.second===6){
      block(k,-10.1,8.16,-56.48,10.1,8.20,-54.66,'gratedSteel');
      for(const z0 of [-56.53,-54.6]){
        tube(k,[-10.5,9.32,z0],[10.5,9.32,z0],.10);
        for(let x=-10;x<11;x+=2.7)
          tube(k,[x,8.2,z0],[x,9.32,z0],.065);
      }
    }else if(f.second===9){
      for(const x of [-13.6,13.6]){
        tube(k,[x,7.4,-52.85],[x,8.5,-52.85],.09);
        k.lamp([x,8.6,-52.85],'blue');
      }
      for(const x of [-12.4,10.3])
        block(k,x,7.35,-52.5,x+1.6,7.41,-50.4,'gratedSteel');
    }else if(f.second===12){
      for(const x of [-6.2,4.35]){
        block(k,x,1.36,-48.4,x+1.85,1.45,-46.5,'hazard');
        for(const q of [0,.85,1.63])block(k,x+q,1.0,-48.52,x+q+.09,1.2,-48.42,'steelGloss');
      }
    }else if(f.second===15){
      block(k,9.0,6.37,-45.28,14.9,6.43,-41.72,'gratedSteel');
      tube(k,[9.1,7.6,-45.3],[14.8,7.6,-45.3],.10);
      tube(k,[9.1,7.6,-41.7],[14.8,7.6,-41.7],.10);
      k.lamp([13.4,6.9,-44.4],'orange');
    }else if(f.second===18){
      block(k,-15.1,7.27,-40.4,-9.2,7.32,-37.9,'gratedSteel');
      for(const x of [-15.3,-12,-8.9])
        tube(k,[x,7.25,-40.3],[x,8.4,-40.3],.08);
      tube(k,[-15.3,8.4,-40.3],[-8.9,8.4,-40.3],.12);
    }else if(f.second===21){
      for(const x of [-13.9,-11.9,-9.9])
        block(k,x,6.75,-37.25,x+.27,6.8,-33.3,'gratedSteel');
      tube(k,[-14.1,7.9,-37.3],[-8.7,7.9,-33.0],.12);
    }else if(f.second===24){
      // Mechanical pipework gives the control visible infrastructure.
      tube(k,[-9.6,5.6,-32.6],[-8.15,5.6,-29.2],.18);
      tube(k,[-8.15,5.6,-29.2],[-5.5,3.5,-29.2],.14);
      block(k,-12.5,2,-32.87,-9.05,3.1,-32.75,'gratedSteel');
      k.lamp([-8,5.8,-29.2],'blue');
      k.crag(-9.1,-30.5,1.05,2.7,'strataRock',13);
    }else if(f.second===27){
      for(const x of [-13.0,13.0]){
        for(let y=1.1;y<9.2;y+=1.3)
          block(k,x-.08,y,-28.38,x+.08,y+.7,-28.25,'steelGloss');
        k.lamp([x,9.9,-26.5],'orange');
      }
      for(const x of [-13.65,13.65])block(k,x-.85,8.9,-28.45,x+.85,9.25,-28.33,'hazard');
    }else if(f.second===30){
      // Banners are opaque red physical panel volumes, not red lights.
      for(const x of [-13.8,13.8]){
        block(k,x-.7,5.5,-24.16,x+.7,10.8,-24.11,'bannerRed');
        block(k,x-.8,10.7,-24.23,x+.8,10.9,-24.08,'steelGloss');
      }
      for(const x of [-9.3,9.3])
        tube(k,[x,11.1,-24.25],[x,12.5,-24.25],.14);
      for(const x of [-5.4,5.4])
        k.lamp([x,12.9,-24.3],'orange');
      block(k,-12.5,12.72,-24.22,12.5,12.83,-24.08,'steelGloss');
    }
  }
  return k.L;
}

export function addKejimOpeningStoryboard(k,{foundation=true,materials=true}={}){
  if(foundation)blockoutKejimOpening(k);
  if(materials)finishKejimOpening(k);
  return k.L;
}
