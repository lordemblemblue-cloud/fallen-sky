// Environment-only extraction from the supplied Gemini revision (8).
// Arena geometry, navigation and animation remain in their previously verified modules.
import * as THREE from 'three';
const smooth=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};
const mix=(a,b,t)=>a+(b-a)*t;
function rgbaTexture(w,h,fn,repeat=false){
  const data=new Uint8Array(w*h*4);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++)data.set(fn(x,y,w,h),(y*w+x)*4);
  const texture=new THREE.DataTexture(data,w,h,THREE.RGBAFormat);
  texture.magFilter=THREE.LinearFilter;texture.minFilter=THREE.LinearFilter;
  if(repeat){texture.wrapS=texture.wrapT=THREE.RepeatWrapping;}
  texture.generateMipmaps=false;texture.needsUpdate=true;return texture;
}
export function createControlPointSkyTexture(){
  // Source palette remapped to a full sphere: top blue, warm horizon, muted blue below.
  const stops=[[0,[205,187,168]],[.5,[223,205,184]],[.63,[159,196,222]],[.8,[74,133,184]],[1,[30,78,121]]];
  const t=rgbaTexture(256,128,(x,y,w,h)=>{
    const v=y/(h-1),a=x/w*Math.PI*2;
    let i=1;while(i<stops.length-1&&v>stops[i][0])i++;
    const [lo,c0]=stops[i-1],[hi,c1]=stops[i];
    const k=(v-lo)/(hi-lo);
    const cloud=smooth(.5,.85,.5+.23*Math.sin(a*5+v*17)+.13*Math.sin(a*11-v*29))*smooth(.56,.66,v)*(1-smooth(.73,.85,v))*.14;
    return [...c0.map((c,j)=>Math.round(mix(mix(c,c1[j],k),250,cloud))),255];
  });
  t.colorSpace=THREE.SRGBColorSpace;t.wrapS=THREE.RepeatWrapping;return t;
}
function softMask(size,halo){
  const t=rgbaTexture(size,size,(x,y,w,h)=>{
    const u=(x+.5)/w*2-1,v=(y+.5)/h*2-1,r=Math.hypot(u,v);
    const alpha=(1-smooth(halo?.22:.0,1,r))*(halo?1:.7+.3*Math.cos(v*19+u*3)**2);
    return [255,255,255,Math.round(255*alpha)];
  });
  t.colorSpace=THREE.SRGBColorSpace;return t;
}
function createRippleTexture(){
  const t=rgbaTexture(128,128,(x,y,w,h)=>{
    const u=x/w*Math.PI*2,v=y/h*Math.PI*2;
    const nx=.15*Math.cos(3*u+5*v)+.09*Math.cos(7*u-2*v);
    const ny=.18*Math.cos(3*u+5*v)-.08*Math.cos(7*u-2*v);
    return [Math.round(127.5+127.5*nx),Math.round(127.5+127.5*ny),Math.round(127.5+127.5*Math.sqrt(1-nx*nx-ny*ny)),255];
  },true);
  t.repeat.set(24,24);return t;
}
export function createMountainLakeEnvironment(){
      const environmentGroup = new THREE.Group();
      environmentGroup.name = 'Stylized_Mountain_Environment';


      const skyTexture = createControlPointSkyTexture();
      const skyMat = new THREE.MeshBasicMaterial({
        map: skyTexture,
        side: THREE.BackSide,
        depthWrite: false,
        fog: false, toneMapped: false
      });
      // Full low-poly sky dome, including downward views.
      const skyDome = new THREE.Mesh(
        new THREE.SphereGeometry(860, 24, 12),
        skyMat
      );
      skyDome.name = 'Sky_Dome';
      skyDome.renderOrder = -10;
      environmentGroup.add(skyDome);

      /**
       * Builds a static, angular, low-poly mountain ring using a single shared material.
       */
      function createLowPolyMountainRing({
        name,
        segments,
        innerRadius,
        outerRadius,
        baseY,
        minPeakY,
        maxPeakY,
        seed,
        material
      }) {
        const positions = [];
        const seededNoise = (i) => {
          const s = Math.sin(i * 12.9898 + seed * 78.233) * 43758.5453;
          return s - Math.floor(s);
        };

        const ridgePts = [];
        const innerPts = [];
        const outerPts = [];

        for (let i = 0; i < segments; i++) {
          const ang = (i / segments) * Math.PI * 2;
          const cos = Math.cos(ang);
          const sin = Math.sin(ang);

          // Harmonic + deterministic angular variation for stylized mountain peaks
          const wave =
            0.55 +
            0.25 * Math.sin(ang * 3.0 + seed) +
            0.2 * Math.cos(ang * 5.0 - seed * 1.7);
          const jitter = seededNoise(i);
          const peakH = minPeakY + (maxPeakY - minPeakY) * Math.min(1, Math.max(0, wave * 0.65 + jitter * 0.35));
          const ridgeR = innerRadius + (outerRadius - innerRadius) * (0.42 + 0.16 * seededNoise(i + 41));

          innerPts.push([cos * innerRadius, baseY, sin * innerRadius]);
          ridgePts.push([cos * ridgeR, peakH, sin * ridgeR]);
          outerPts.push([cos * outerRadius, baseY - 25, sin * outerRadius]);
        }

        const pushTri = (a, b, c) => {
          positions.push(a[0], a[1], a[2], c[0], c[1], c[2], b[0], b[1], b[2]);
        };

        for (let i = 0; i < segments; i++) {
          const next = (i + 1) % segments;
          // Inner slope facing the arena
          pushTri(innerPts[i], ridgePts[i], innerPts[next]);
          pushTri(innerPts[next], ridgePts[i], ridgePts[next]);
          // Outer back-slope
          pushTri(ridgePts[i], outerPts[i], ridgePts[next]);
          pushTri(ridgePts[next], outerPts[i], outerPts[next]);
        }

        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geo.computeVertexNormals();

        const mesh = new THREE.Mesh(geo, material);
        mesh.name = name;
        mesh.frustumCulled = false;
        return mesh;
      }

      // Closer near mountain layer: crisp slate blue-gray peaks outside the 300x300m playable zone
      const nearMountainMat = new THREE.MeshStandardMaterial({
        color: 0x33475e,
        roughness: 0.9,
        metalness: 0.05,
        flatShading: true
      });
      const nearMountains = createLowPolyMountainRing({
        name: 'Mountain_Ring_Near',
        segments: 40,
        innerRadius: 215,
        outerRadius: 345,
        baseY: -82,
        minPeakY: 16,
        maxPeakY: 78,
        seed: 1.4,
        material: nearMountainMat
      });
      environmentGroup.add(nearMountains);

      // Farther background mountain layer: lighter desaturated blue-slate silhouettes for depth
      const farMountainMat = new THREE.MeshStandardMaterial({
        color: 0x6783a1,
        roughness: 0.94,
        metalness: 0.02,
        flatShading: true
      });
      const farMountains = createLowPolyMountainRing({
        name: 'Mountain_Ring_Far',
        segments: 36,
        innerRadius: 325,
        outerRadius: 520,
        baseY: -92,
        minPeakY: 46,
        maxPeakY: 138,
        seed: 4.9,
        material: farMountainMat
      });
      environmentGroup.add(farMountains);

      // Visible golden daylight sun positioned ~36 degrees above the horizon
      const sunElevationRad = THREE.MathUtils.degToRad(36);
      const sunAzimuthRad = THREE.MathUtils.degToRad(34);
      const sunRadius = 610;
      const sunHoriz = Math.cos(sunElevationRad) * sunRadius;
      const sunPosition = new THREE.Vector3(
        Math.sin(sunAzimuthRad) * sunHoriz,
        Math.sin(sunElevationRad) * sunRadius,
        -Math.cos(sunAzimuthRad) * sunHoriz
      );

      const sunMat = new THREE.MeshBasicMaterial({
        color: 0xffe49e,
        fog: false, toneMapped: false
      });
      const sunDisc = new THREE.Mesh(new THREE.CircleGeometry(24, 16), sunMat);
      sunDisc.position.copy(sunPosition);
      sunDisc.lookAt(0, 0, 0);
      sunDisc.name = 'Golden_Sun_Disc';
      environmentGroup.add(sunDisc);

      const haloTexture = softMask(64, true);
      const sunHaloMat = new THREE.MeshBasicMaterial({
        map: haloTexture, toneMapped: false,
        color: 0xffcf75,
        transparent: true,
        opacity: 0.2,
        depthWrite: false,
        fog: false
      });
      const sunHalo = new THREE.Mesh(new THREE.CircleGeometry(46, 16), sunHaloMat);
      sunHalo.position.copy(sunPosition).multiplyScalar(0.996);
      sunHalo.lookAt(0, 0, 0);
      sunHalo.name = 'Golden_Sun_Halo';
      environmentGroup.add(sunHalo);

      // Stylized animated low-poly mountain lake at Y = -80m (vertex-wave ripples + teal/blue depth)
      const lakeGeo = new THREE.RingGeometry(0.01, 520, 36, 10);
      lakeGeo.rotateX(-Math.PI / 2);
      const lakePos = lakeGeo.attributes.position;
      const lakePhase = new Float32Array(lakePos.count);
      const lakeColors = new Float32Array(lakePos.count * 3);
      const cShallow = new THREE.Color(0x14859e);
      const cMid = new THREE.Color(0x0d5c80);
      const cDeep = new THREE.Color(0x083857);
      const tmpLakeColor = new THREE.Color();

      for (let i = 0; i < lakePos.count; i++) {
        const vx = lakePos.getX(i);
        const vz = lakePos.getZ(i);
        const dist = Math.hypot(vx, vz);
        const normDist = Math.min(1, dist / 330);
        // Subtle low-poly bathymetry & angular wave phase per vertex
        lakePhase[i] = vx * 0.045 + vz * 0.038 + Math.sin(dist * 0.04) * 1.4;
        lakePos.setY(i, -80 + Math.sin(lakePhase[i]) * 0.55);

        if (normDist < 0.45) {
          tmpLakeColor.copy(cMid).lerp(cShallow, normDist / 0.45);
        } else {
          tmpLakeColor.copy(cShallow).lerp(cDeep, (normDist - 0.45) / 0.55);
        }
        lakeColors[i * 3] = tmpLakeColor.r;
        lakeColors[i * 3 + 1] = tmpLakeColor.g;
        lakeColors[i * 3 + 2] = tmpLakeColor.b;
      }
      lakeGeo.setAttribute('color', new THREE.BufferAttribute(lakeColors, 3));
      lakeGeo.computeVertexNormals();

      const rippleTexture = createRippleTexture();
      const mountainLakeMat = new THREE.MeshStandardMaterial({
        normalMap: rippleTexture, normalScale: new THREE.Vector2(0.4,0.4),
        vertexColors: true,
        emissive: 0x062c43,
        emissiveIntensity: 0.35,
        roughness: 0.24,
        metalness: 0.42,
        flatShading: false
      });
      const mountainLake = new THREE.Mesh(lakeGeo, mountainLakeMat);
      mountainLake.name = 'Mountain_Lake_Surface';
      environmentGroup.add(mountainLake);

      // Gentle animated sunlight shimmer planes across the water surface
      const glintTexture = softMask(64, false);
      const sunGlintMat = new THREE.MeshBasicMaterial({
        map: glintTexture,
        color: 0xfef08a,
        transparent: true,
        opacity: 0.16,
        depthWrite: false
      });
      const sunGlintGroup = new THREE.Group();
      sunGlintGroup.rotation.y = -sunAzimuthRad;
      const glintStrips = [];
      [
        { z: -95, w: 34, d: 18, baseOp: 0.22, speed: 1.7, phase: 0.0 },
        { z: -145, w: 46, d: 22, baseOp: 0.26, speed: 1.4, phase: 1.3 },
        { z: -200, w: 56, d: 26, baseOp: 0.24, speed: 1.9, phase: 2.6 },
        { z: -260, w: 64, d: 30, baseOp: 0.18, speed: 1.5, phase: 3.9 }
      ].forEach((cfg) => {
        const mat = sunGlintMat.clone();
        mat.opacity = cfg.baseOp;
        const m = new THREE.Mesh(new THREE.PlaneGeometry(cfg.w, cfg.d), mat);
        m.rotation.x = -Math.PI / 2;
        m.position.set(0, -79.2, cfg.z);
        sunGlintGroup.add(m);
        glintStrips.push({ mesh: m, mat, cfg });
      });
      environmentGroup.add(sunGlintGroup);
      sunGlintMat.dispose();

      let lakeAnimTime = 0;
      let lakeFrameSkip = 0;
      function updateEnvironment(dt) {
        if (!environmentGroup.visible) return;
        lakeAnimTime += Math.max(0,Math.min(dt,0.1));
        rippleTexture.offset.set((lakeAnimTime*0.015)%1,(lakeAnimTime*0.009)%1);
        // Update low-poly vertex wave motion every 2nd frame for ultra-light mobile/WebGPU cost
        lakeFrameSkip = (lakeFrameSkip + 1) & 1;
        if (lakeFrameSkip === 0) {
          for (let i = 0; i < lakePos.count; i++) {
            lakePos.setY(i, -80 + Math.sin(lakeAnimTime * 1.45 + lakePhase[i]) * 0.62);
          }
          lakePos.needsUpdate = true;
          lakeGeo.computeVertexNormals();
        }
        for (let i = 0; i < glintStrips.length; i++) {
          const g = glintStrips[i];
          const pulse = Math.sin(lakeAnimTime * g.cfg.speed + g.cfg.phase);
          g.mat.opacity = g.cfg.baseOp * 0.65 * (0.85 + 0.15 * pulse);
          g.mesh.scale.x = 0.92 + 0.1 * pulse;
        }
      }

  const resources=new Set();
  environmentGroup.traverse(o=>{if(o.isMesh){resources.add(o.geometry);resources.add(o.material);}});
  [skyTexture,haloTexture,glintTexture,rippleTexture].forEach(t=>resources.add(t));
  let disposed=false;
  return {group:environmentGroup,sky:skyDome,sunPosition,update(dt){if(!disposed&&Number.isFinite(dt))updateEnvironment(dt);},dispose(){
    if(disposed)return;disposed=true;environmentGroup.removeFromParent();for(const r of resources)r.dispose();
  }};
}

export function applyControlPointDaylight({scene,camera,renderer,lights,materials}){
  const before={background:scene.background,fog:scene.fog,far:camera.far,shadow:renderer.shadowMap.enabled,exposure:renderer.toneMappingExposure};
  const allLights=[lights.hemi,lights.sun,lights.rimLight,...(lights.fills||[])].filter(Boolean);
  const originals=allLights.map(l=>({l,color:l.color.clone(),ground:l.groundColor?.clone(),position:l.position.clone(),intensity:l.intensity,shadow:l.castShadow}));
  const env=createMountainLakeEnvironment();
  scene.add(env.group);scene.background=new THREE.Color(0x88b4d8);
  scene.fog=new THREE.Fog(0x9ec4e2,420,960);
  camera.far=1400;camera.updateProjectionMatrix();
  lights.hemi.color.setHex(0xc8e1f7);lights.hemi.groundColor.setHex(0xaac4d6);lights.hemi.intensity=1.85;
  lights.sun.color.setHex(0xffe7c2);lights.sun.intensity=1.95;lights.sun.position.copy(env.sunPosition).multiplyScalar(.5);lights.sun.castShadow=false;
  if(lights.rimLight){lights.rimLight.color.setHex(0x8bd3f7);lights.rimLight.position.set(-85,-60,-90);lights.rimLight.intensity=.65;}
  for(const fill of lights.fills||[])fill.intensity=.25;
  renderer.shadowMap.enabled=false;renderer.toneMappingExposure=1.05;
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
  return {sky:env.sky,group:env.group,update:env.update,dispose(){
    env.dispose();scene.background=before.background;scene.fog=before.fog;camera.far=before.far;camera.updateProjectionMatrix();renderer.shadowMap.enabled=before.shadow;renderer.toneMappingExposure=before.exposure;
    for(const {l,color,ground,position,intensity,shadow} of originals){l.color.copy(color);if(ground)l.groundColor.copy(ground);l.position.copy(position);l.intensity=intensity;l.castShadow=shadow;}
  }};
}
