// Procedural decorative 3D models for the Sumi-e army stronghold.
// These are original modular assemblages (meshed cylinders, frames, fins,
// rings and lenses) rendered through Game 2's real steel specular shaders.
// No downloaded GLB, retail game asset or texture-scan dependency.
const STEEL='steelGloss', DARK='metalDark', BRUSH='hullDark', PLATE='rivetedSteel';
const cylinder=(k,a,b,r=.1,mat=STEEL)=>k.pipe(a,b,r,mat,12);

// Guardian standard: monumental articulated sci-fi crest at a wall or alcove.
// Mostly visual: very little extra collision introduced into walking routes.
function guardian(k,x,z,baseY=0,side=1){
  const y=baseY;
  k.deco([x-.60,y+.05,z-.50],[x+.60,y+.28,z+.50],DARK);
  k.deco([x-.46,y+.29,z-.39],[x+.46,y+.49,z+.39],STEEL);
  k.deco([x-.31,y+.52,z-.24],[x+.31,y+2.02,z+.24],PLATE);
  k.deco([x-.48,y+1.48,z-.21],[x+.48,y+1.70,z+.21],BRUSH);
  k.deco([x-.18,y+2.12,z-.20],[x+.18,y+2.55,z+.2],DARK);
  k.deco([x-.21,y+2.29,z+.20],[x+.21,y+2.39,z+.26],'glass');
  for(const s of [-1,1]){
    cylinder(k,[x+s*.38,y+1.65,z],[x+s*.67,y+.62,z+.10],.11,STEEL);
    cylinder(k,[x+s*.16,y+.50,z],[x+s*.39,y+.18,z],.11,DARK);
    cylinder(k,[x+s*.46,y+1.85,z-.15],[x+s*.08,y+2.73,z-.28],.08,PLATE);
    cylinder(k,[x+s*.08,y+2.73,z-.28],[x+s*.60,y+2.31,z-.36],.05,STEEL);
  }
  // Off-centre sumi-e arc / blade fin around the emblem.
  cylinder(k,[x-.73,y+.63,z-side*.12],[x-.83,y+1.91,z-side*.15],.05,BRUSH);
  cylinder(k,[x-.83,y+1.91,z-side*.15],[x-.24,y+2.82,z-side*.24],.06,STEEL);
}

// Hanging surveillance / sensor drone model. Non-collidable by design.
function drone(k,x,y,z){
  k.deco([x-.22,y-.15,z-.22],[x+.22,y+.15,z+.22],BRUSH);
  for(const side of [-1,1]){
    cylinder(k,[x,y,z],[x+side*.65,y,z],.08,STEEL);
    cylinder(k,[x+side*.65,y-.1,z],[x+side*.65,y+.12,z],.19,DARK);
    k.deco([x+side*.62-.13,y-.08,z-.16],[x+side*.62+.13,y+.09,z+.16],'glass');
    cylinder(k,[x,y,z],[x,y,z+side*.6],.07,PLATE);
    k.deco([x-.14,y-.08,z+side*.6-.13],[x+.14,y+.08,z+side*.6+.13],STEEL);
  }
  k.deco([x-.12,y-.31,z-.12],[x+.12,y-.23,z+.12],'blue');
}

// Floating circular tactical data display above a pedestal, using the
// real level-kit radial mesh surfaces instead of a 2D billboard.
function tacticalTable(k,x,y,z){
  // Support the sculptural hologram pedestal from the actual ground/deck.
  const floorY=y<2?0:4.2;
  if(y>floorY)k.deco([x-.22,floorY,z-.22],[x+.22,y,z+.22],PLATE);
  k.deco([x-.58,y,z-.58],[x+.58,y+.10,z+.58],DARK);
  k.deco([x-.43,y+.12,z-.43],[x+.43,y+.20,z+.43],PLATE);
  k.ring(x,z,.58,.82,y+.33,.08,STEEL,32,false);
  k.ring(x,z,.22,.54,y+.43,.06,'glass',32,false);
  for(let n=0;n<8;n++){
    const theta=n*Math.PI/4,dx=Math.cos(theta),dz=Math.sin(theta);
    cylinder(k,[x+dx*.17,y+.48,z+dz*.17],[x+dx*.83,y+.54,z+dz*.83],.029,n%3===0?'blue':STEEL);
  }
}

export function addStrongholdModels(k){
  // Hero guardian models: command entrance, high observation platform.
  guardian(k,-15.7,6.8);guardian(k,15.7,6.8);
  guardian(k,24.8,159,4.2,-1);guardian(k,12.3,150,4.2,1);
  // Military corridor wall sculptures and a pair of hanging service drones.
  for(const z of [-40,-52])guardian(k,-4.9,z,0,z< -45?-1:1);
  for(const [x,y,z,ceiling] of [[0,7.4,-15,10],[17.8,8.4,65,9.6],
    [17.8,8.4,125,9.6],[19.4,8.1,49,9]]){
    drone(k,x,y,z);
    // Previously the drones floated unsupported in the medical/command air.
    // A visible ceiling spindle and locking flange now hang each one from
    // a known solid roof, rather than leaving an unconnected body in space.
    cylinder(k,[x,y+.14,z],[x,ceiling-.14,z],.07,STEEL);
    k.deco([x-.27,ceiling-.20,z-.27],[x+.27,ceiling-.08,z+.27],DARK);
  }
  // First-class circular 3D console/art modules.
  tacticalTable(k,-11.8,1.05,-10);
  tacticalTable(k,17.2,4.2,158);
  // Medical scanner models: light gantries are directly fastened to bed
  // frames. Previous rods started at y=2.0 and left the transparent unit
  // hovering without supports. All four legs now begin on the bed at y=.78.
  for(const x of [13.1,26.1])for(const z of [37.4,48.4]){
    for(const off of [-1.6,1.6]){
      for(const dx of [-.95,.95]){
        cylinder(k,[x+dx,.79,z+off],[x+dx,3.8,z+off],.085,STEEL);
        k.deco([x+dx-.14,.78,z+off-.14],[x+dx+.14,.90,z+off+.14],DARK);
      }
      cylinder(k,[x-.95,3.8,z+off],[x+.95,3.8,z+off],.09,DARK);
    }
    for(const dx of [-.95,.95])
      cylinder(k,[x+dx,3.76,z-1.6],[x+dx,3.76,z+1.6],.075,STEEL);
    k.deco([x-.92,3.74,z-1.55],[x+.92,3.82,z+1.55],'glass');
    k.deco([x-.20,3.64,z-.23],[x+.20,3.70,z+.23],'blue');
  }
  // Elevated exterior defense pylons (outside the walkway width).
  for(const z of [70,82,119,132]){
    for(const x of [11.7,24.3]){
      // Exterior defense pylon bases now connect to the gallery structure
      // through two real steel braces rather than hanging just off its wall.
      const wallX=x<18?14.5:21.5;
      cylinder(k,[wallX,3.18,z-1.0],[x,4.12,z],.16,PLATE);
      cylinder(k,[wallX,3.18,z+1.0],[x,4.12,z],.16,STEEL);
      k.deco([wallX-.18,3.08,z-1.20],[wallX+.18,3.4,z+1.20],DARK);
      k.deco([x-.50,4.0,z-.50],[x+.50,4.20,z+.50],DARK);
      cylinder(k,[x,4.22,z],[x,6.70,z],.22,PLATE);
      k.ring(x,z,.35,.72,6.72,.12,STEEL,32,false);
      for(const sign of [-1,1]){
        cylinder(k,[x,6.72,z],[x+sign*.76,7.18,z],.07,DARK);
      }
      k.deco([x-.16,7.08,z-.16],[x+.16,7.22,z+.16],'blue');
    }
  }
}
