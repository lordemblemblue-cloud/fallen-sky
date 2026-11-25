// Static high-altitude daylight environment: one small baked sky texture,
// one low-poly dome, existing lights. No real-time reflections or shadows.
import * as THREE from 'three';
const W=512,H=256, TAU=Math.PI*2;
const smooth=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};
const mix=(a,b,t)=>a+(b-a)*t;
const blend=(a,b,t)=>a.map((v,i)=>mix(v,b[i],t));

export function createControlPointSkyTexture(){
  const pixels=new Uint8Array(W*H*4);
  for(let y=0;y<H;y++){
    const v=y/(H-1),e=(v-.5)*Math.PI;
    for(let x=0;x<W;x++){
      const a=x/W*TAU;
      let rgb=blend([210,231,242],[76,146,211],smooth(0,1.2,e));
      if(e<0)rgb=blend([210,231,242],[131,173,204],smooth(0,1.3,-e));
      // Periodic baked cloud fields, concentrated at the distant horizon and below the deck.
      const noise=.5+.19*Math.sin(a*5+e*13)+.13*Math.cos(a*9-e*19)+.08*Math.sin(a*17+e*27)+.05*Math.cos(a*29-e*42);
      const lower=smooth(.28,.65,noise)*smooth(-.95,-.43,e)*(1-smooth(-.16,.10,e))*.92;
      const high=smooth(.55,.85,noise)*smooth(.07,.25,e)*(1-smooth(.55,.95,e))*.5;
      rgb=blend(rgb,[249,252,255],Math.max(lower,high));
      const sunDot=Math.sin(e)*Math.sin(.65)+Math.cos(e)*Math.cos(.65)*Math.cos(a-2.30);
      rgb=blend(rgb,[255,244,212],smooth(.93,.999,sunDot)*.52);
      rgb=blend(rgb,[255,255,241],smooth(.9975,.9995,sunDot));
      const i=(y*W+x)*4;for(let c=0;c<3;c++)pixels[i+c]=Math.round(rgb[c]);pixels[i+3]=255;
    }
  }
  const tex=new THREE.DataTexture(pixels,W,H,THREE.RGBAFormat);
  tex.name='Control Point daylight sky • baked';
  tex.colorSpace=THREE.SRGBColorSpace;tex.wrapS=THREE.RepeatWrapping;
  tex.magFilter=THREE.LinearFilter;tex.minFilter=THREE.LinearFilter;
  tex.generateMipmaps=false;tex.needsUpdate=true;return tex;
}

export function applyControlPointDaylight({scene,camera,renderer,lights,materials}){
  const before={background:scene.background,fog:scene.fog,far:camera.far,shadow:renderer.shadowMap.enabled,exposure:renderer.toneMappingExposure};
  const allLights=[lights.hemi,lights.sun,lights.rimLight,...(lights.fills||[])].filter(Boolean);
  const originals=allLights.map(l=>({l,color:l.color.clone(),ground:l.groundColor?.clone(),position:l.position.clone(),intensity:l.intensity,shadow:l.castShadow}));
  const texture=createControlPointSkyTexture();
  const geometry=new THREE.SphereGeometry(500,32,16);
  const material=new THREE.MeshBasicMaterial({map:texture,side:THREE.BackSide,depthWrite:false,fog:false,toneMapped:false});
  const sky=new THREE.Mesh(geometry,material);sky.name='Control Point high-altitude daylight sky';sky.renderOrder=-1000;sky.frustumCulled=false;
  scene.add(sky);scene.background=new THREE.Color(0xcde7f5);scene.fog=null;camera.far=1200;camera.updateProjectionMatrix();
  lights.hemi.color.setHex(0xe5f4ff);lights.hemi.groundColor.setHex(0xc5d5e5);lights.hemi.intensity=2.2;
  lights.sun.color.setHex(0xfff3da);lights.sun.intensity=2.7;lights.sun.position.set(95,185,110);lights.sun.castShadow=false;
  if(lights.rimLight){lights.rimLight.color.setHex(0xc5e3ff);lights.rimLight.intensity=.7;}
  for(const fill of lights.fills||[])fill.intensity=.4;
  renderer.shadowMap.enabled=false;renderer.toneMappingExposure=1.15;
  // The supplied metallic surfaces had almost no diffuse response, and no reflection environment.
  // Keep the exact hex/circuit textures while using a lighter satin alloy for visibility.
  for(const [key,color,metalness,roughness] of [
    ['hexDeck',0xffffff,.16,.66],['perimeterTrim',0xc6d4e3,.28,.62],
    ['foundationHull',0x46566b,.22,.70],['steelBeam',0x65768b,.30,.58],
    ['railingMetal',0x8899ac,.32,.55],['inlayAccent',0x42536a,.24,.66],
    ['cargoPanel',0xffffff,.22,.65],['ventUnit',0xffffff,.25,.65]
  ]){
    const m=materials[key];if(!m)continue;m.color.setHex(color);m.metalness=metalness;m.roughness=roughness;
  }
  return {sky,dispose(){
    sky.removeFromParent();geometry.dispose();material.dispose();texture.dispose();
    scene.background=before.background;scene.fog=before.fog;camera.far=before.far;camera.updateProjectionMatrix();renderer.shadowMap.enabled=before.shadow;renderer.toneMappingExposure=before.exposure;
    for(const {l,color,ground,position,intensity,shadow} of originals){l.color.copy(color);if(ground)l.groundColor.copy(ground);l.position.copy(position);l.intensity=intensity;l.castShadow=shadow;}
  }};
}
