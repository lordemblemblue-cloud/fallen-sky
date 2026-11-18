/* eslint-disable */
// Small WebGL2 renderer: skinned characters (vertex-colour), static meshes, additive/alpha FX batches.
import { m4 } from './math.js';
import { partitionStaticMesh, visibleStaticRanges } from './staticVisibility.js';

const LIGHTING = `
uniform vec3 uSunDir; uniform vec3 uSunCol; uniform vec3 uAmbTop; uniform vec3 uAmbBot;
uniform vec4 uLP[4]; uniform vec3 uLC[4]; uniform vec3 uCam; uniform vec3 uFogCol; uniform float uFogD;
uniform float uHasShadow; uniform mat4 uShadowVP; uniform sampler2D uShadowMap;
uniform float uHasAbyssShadow; uniform mat4 uAbyssShadowVP; uniform sampler2D uAbyssShadowMap;
float shadowAt(vec3 wp,vec3 n){
  bool abyss=wp.x>86.0 && uHasAbyssShadow>0.5;
  if(!abyss && uHasShadow<0.5)return 1.0;
  vec4 q=(abyss?uAbyssShadowVP:uShadowVP)*vec4(wp+n*0.036,1.0);
  vec3 p=q.xyz/q.w*0.5+0.5;
  if(any(lessThan(p,vec3(0.0)))||any(greaterThan(p,vec3(1.0))))return 1.0;
  float lit=0.0;
  for(int x=-1;x<=1;x++)for(int y=-1;y<=1;y++){
    vec2 sampleUV=p.xy+vec2(float(x),float(y))/2048.0;
    float depth=abyss?texture(uAbyssShadowMap,sampleUV).r:
      texture(uShadowMap,sampleUV).r;
    lit+=p.z-0.0013<depth?1.0:0.0;
  }
  return mix(0.16,1.0,lit/9.0);
}
vec3 lightIt(vec3 base, vec3 n, vec3 wp, float spec){
  n = normalize(n);
  float hemi = 0.5 + 0.5 * n.y;
  vec3 c = base * (mix(uAmbBot, uAmbTop, hemi) + uSunCol * max(dot(n, uSunDir), 0.0) * shadowAt(wp,n));
  for (int i = 0; i < 4; i++) {
    vec3 d = uLP[i].xyz - wp; float dist = length(d); float r = uLP[i].w;
    if (r > 0.0) { float a = clamp(1.0 - dist / r, 0.0, 1.0); a *= a; c += base * uLC[i] * a * (0.35 + 0.65 * max(dot(n, d / max(dist, 1e-3)), 0.0)); }
  }
  vec3 v = normalize(uCam - wp);
  float rim = pow(1.0 - max(dot(n, v), 0.0), 3.0);
  c += rim * 0.10 * uAmbTop;
  c += spec * pow(max(dot(n, normalize(uSunDir + v)), 0.0), 40.0) * uSunCol * 0.35;
  float f = 1.0 - exp(-length(uCam - wp) * uFogD);
  return mix(c, uFogCol, clamp(f, 0.0, 1.0));
}`;

const SKIN_VS = `#version 300 es
precision highp float; precision highp int;
in vec3 aPos; in vec3 aNrm; in vec4 aCol; in uvec4 aJ; in vec4 aW;
uniform mat4 uVP; uniform mat4 uModel; uniform mat4 uPost; uniform highp sampler2D uJT;
uniform float uOutlineWidth;
out vec3 vN; out vec4 vC; out vec3 vW; out vec3 vPre;
mat4 jm(uint j){ int b = int(j) * 4; return mat4(texelFetch(uJT, ivec2(b, 0), 0), texelFetch(uJT, ivec2(b + 1, 0), 0), texelFetch(uJT, ivec2(b + 2, 0), 0), texelFetch(uJT, ivec2(b + 3, 0), 0)); }
void main(){
  mat4 s = jm(aJ.x) * aW.x + jm(aJ.y) * aW.y + jm(aJ.z) * aW.z + jm(aJ.w) * aW.w;
  vec4 p = s * vec4(aPos + aNrm * uOutlineWidth, 1.0); vec4 wp = uModel * p; vPre = wp.xyz; wp = uPost * wp; // uPost: moves a cut-off part (executions)
  vN = mat3(uPost) * mat3(uModel) * (mat3(s) * aNrm); vC = aCol; vW = wp.xyz;
  gl_Position = uVP * wp;
}`;
const SKIN_FS = `#version 300 es
precision highp float;
in vec3 vN; in vec4 vC; in vec3 vW; in vec3 vPre; out vec4 o;
uniform vec3 uTint; uniform float uTintAmt; uniform float uAlpha; uniform float uGlow; uniform vec4 uClip;
uniform float uOutline; uniform vec3 uOutlineColor;
${LIGHTING}
void main(){
  // Second skinned inverted-hull pass: a thin team-color border around the
  // actual character silhouette. The first pass keeps original model colors.
  if(uOutline > 0.5){ o=vec4(uOutlineColor,1.);return; }
  // uClip (a plane in world space before uPost; 0 = off): only the side the plane faces is drawn; the inside of the cut
  // shows as a cauterized wound
  bool clipped = uClip.x != 0.0 || uClip.y != 0.0 || uClip.z != 0.0;
  if (clipped && dot(vec4(vPre, 1.0), uClip) < 0.0) discard;
  if (clipped && !gl_FrontFacing) { o = vec4(0.45, 0.08, 0.03, uAlpha); return; }
  vec3 base = vC.rgb; base = mix(base, uTint, uTintAmt);
  vec3 c = lightIt(base, vN, vW, 0.25);
  c += uGlow * uTint;
  o = vec4(c, uAlpha);
}`;
const MESH_VS = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos; layout(location=1) in vec3 aNrm; layout(location=2) in vec4 aCol; layout(location=3) in vec2 aUV;
uniform mat4 uVP; uniform mat4 uModel; uniform float uTime; uniform float uTorchFlame;
uniform float uFoliageMotion; uniform vec4 uGrassActor;
uniform float uWaterSim; uniform float uAbyssWater; uniform sampler2D uWaveHeight;
uniform vec4 uWaterBounds; uniform vec2 uWaterGrid;
out vec3 vN; out vec4 vC; out vec3 vW; out vec2 vUV;
// The radial mesh vertices are independent of the simulation texel centers.
// Bilinear displacement prevents angular facets/stairsteps in large swells.
float waterHeightVertex(vec2 world){
  vec2 uv=clamp((world-uWaterBounds.xy)/uWaterBounds.zw,0.,1.);
  vec2 cell=uv*(uWaterGrid-1.);
  ivec2 a=ivec2(floor(cell));
  ivec2 b=min(a+ivec2(1),ivec2(uWaterGrid)-ivec2(1));
  vec2 w=fract(cell);
  return mix(mix(texelFetch(uWaveHeight,a,0).r,
                 texelFetch(uWaveHeight,ivec2(b.x,a.y),0).r,w.x),
             mix(texelFetch(uWaveHeight,ivec2(a.x,b.y),0).r,
                 texelFetch(uWaveHeight,b,0).r,w.x),w.y);
}
void main(){ vec3 p=aPos;
  if(uFoliageMotion>.5){
    // Roots stay attached to the mesh while leaves bend in wind and move
    // away from the actual player capsule. This avoids a CPU vertex rebuild.
    float tip=smoothstep(.025,.49,p.y);
    vec2 relative=p.xz-uGrassActor.xz;
    float d=length(relative);
    vec2 away=relative/max(d,.05);
    float presence=(1.-smoothstep(.42,2.45,d))*clamp(uGrassActor.w,0.,1.);
    vec2 air=vec2(sin(uTime*1.35+p.z*.31),cos(uTime*.98+p.x*.29));
    p.xz+=tip*(air*.092+away*.30*presence);
  }
  if(uTorchFlame>0.5){
    float tip=clamp((p.y-4.45)/1.08,0.0,1.0);
    p.x+=sin(uTime*9.7+p.y*5.1+p.z*2.3)*0.085*tip;
    p.z+=cos(uTime*7.1+p.y*6.8+p.x*2.2)*0.065*tip;
  }
  if(uWaterSim>0.5){
    // Triple the previous 1.80 rendered swell amplitude; simulated mass/physics stay unchanged.
    p.y+=5.40*waterHeightVertex(p.xz);
  } else if(uAbyssWater>0.5) {
    // Mobile/unsupported float-texture fallback still has actual 3D moving
    // wave crests, not a flat blue plane.
    p.y+=1.26*sin(p.x*.31+p.z*.16+uTime*.80)
        +.72*sin(p.x*.20-p.z*.39-uTime*1.16)
        +.39*cos(p.x*.73+p.z*.48+uTime*1.70);
  }
  vec4 wp = uModel * vec4(p, 1.0); vN = mat3(uModel) * aNrm; vC = aCol; vUV = aUV; vW = wp.xyz; gl_Position = uVP * wp; }`;
const MESH_FS = `#version 300 es
precision highp float;
in vec3 vN; in vec4 vC; in vec3 vW; in vec2 vUV; out vec4 o;
uniform float uSurfaceDetail; uniform float uAlphaCutoff; uniform float uTerrain; uniform float uMoss;
uniform float uSpec; uniform vec3 uEmis; uniform float uUseTex; uniform sampler2D uDiffuse;
uniform float uPolishedStone; uniform float uHallLights; uniform float uAnnexLights;
uniform float uWetStone; uniform float uCourtyardLights;
uniform float uKejimCliff; uniform float uKejimLights; uniform float uKejimWet; uniform float uKejimFlow;
uniform float uAbyssWater; uniform float uAbyssLights; uniform float uWaterfall; uniform float uRiverFlow;
uniform float uMountainRock; uniform float uSeaBed; uniform float uSumiInk; uniform vec2 uFallOutlets[3];
uniform float uTerrainMaps; uniform sampler2D uRockMap; uniform sampler2D uMossMap; uniform sampler2D uDirtMap;
uniform float uMountainDetailLevel;
uniform float uFallType;
uniform float uWaterSim; uniform sampler2D uWaveHeight;
uniform vec4 uWaterBounds; uniform vec2 uWaterGrid;
uniform float uPondDetail; uniform sampler2D uPondDetailMap;
uniform float uWaterDetailStrength;
uniform sampler2D uWaterContact; uniform float uWaterContactReady;
uniform float uGlass; uniform float uSteel; uniform float uWater; uniform float uMeshAlpha; uniform float uSurfaceKind; uniform float uReferenceMetal;
uniform float uTime;
${LIGHTING}
// Bilinear manual filtering permits portable R32F NEAREST wave textures
// even on WebGL2 devices without float-linear extension support.
float waveHeight(vec2 p){
  vec2 uv=clamp((p-uWaterBounds.xy)/uWaterBounds.zw,0.0,1.0);
  vec2 cell=uv*(uWaterGrid-1.0);
  ivec2 a=ivec2(floor(cell));
  ivec2 b=min(a+ivec2(1),ivec2(uWaterGrid)-ivec2(1));
  vec2 t=fract(cell);
  float h00=texelFetch(uWaveHeight,a,0).r;
  float h10=texelFetch(uWaveHeight,ivec2(b.x,a.y),0).r;
  float h01=texelFetch(uWaveHeight,ivec2(a.x,b.y),0).r;
  float h11=texelFetch(uWaveHeight,b,0).r;
  return mix(mix(h00,h10,t.x),mix(h01,h11,t.x),t.y);
}
// Normal-map detail is resolved from *world* coordinates, so a nearby 4K
// display reveals millimetre-scale flow instead of magnifying a 256px bitmap.
// Phase-warped ripples move in two directions, without adding fake energy to
// the damped wave solver or altering player/world collision.
vec2 waterMicroSlope(vec2 p,float time,float detail){
  vec2 warped=p+vec2(
    .19*sin(p.y*.38+time*.24),.16*cos(p.x*.43-time*.32));
  float a=warped.x*1.81+warped.y*.91+time*2.1;
  float b=warped.x*-2.74+warped.y*1.31-time*3.05;
  float c=warped.x*5.9+warped.y*-3.4+time*5.2;
  float d=warped.x*-12.6+warped.y*8.1-time*8.0;
  return detail*vec2(
    .075*cos(a)-.052*cos(b)+.025*cos(c)-.013*cos(d),
    .060*cos(a)+.042*cos(b)-.019*cos(c)+.009*cos(d));
}
float waterContactDistance(vec2 p){
  if(uWaterContactReady<0.5)return 1.0;
  return texture(uWaterContact,
    clamp((p-uWaterBounds.xy)/uWaterBounds.zw,0.0,1.0)).r;
}

// Cyan triangulated, 256-cells-per-100m reference detail. This is optical;
// the preexisting radial shoreline, simulation, kill-plane and collisions stay.
float cyanWaterTriangleGrid(vec2 p){
  vec2 cell=fract(p*(256.0/100.0));
  float edges=min(min(cell.x,1.0-cell.x),min(cell.y,1.0-cell.y));
  float diagonal=abs(cell.x-cell.y)*.7071068;
  return 1.0-smoothstep(.013,.056,min(edges,diagonal));
}
void main(){
  vec3 albedo = uUseTex > 0.5 && uSurfaceDetail < 0.5 && uSurfaceKind < 0.5 ? texture(uDiffuse, vUV).rgb * vC.rgb : vC.rgb;
  vec3 normal = normalize(vN);
  float rockWetness=0.0;
  if(uAlphaCutoff>0.0){
    vec4 leaf=texture(uDiffuse,vUV);if(leaf.a<uAlphaCutoff)discard;
    albedo=leaf.rgb*vC.rgb;
    if(!gl_FrontFacing)normal=vec3(-normal.x,normal.y,-normal.z);
    if(uMoss>0.5){
      // Image-derived relief: alpha/color changes around each tiny foliage
      // clump perturb the surface normal in the wall's Y/Z tangent plane.
      // Combined with three nested card depths this reads as dimensional
      // moss rather than flat triangular geometry with a green tint.
      float left=texture(uDiffuse,vUV-vec2(.006,0.)).a;
      float right=texture(uDiffuse,vUV+vec2(.006,0.)).a;
      float down=texture(uDiffuse,vUV-vec2(0.,.006)).a;
      float up=texture(uDiffuse,vUV+vec2(0.,.006)).a;
      normal=normalize(normal+vec3(0.,(up-down)*.72,(right-left)*.72));
      float cavities=clamp(leaf.a*.62+dot(leaf.rgb,vec3(.15,.7,.15))*.38,0.,1.);
      albedo*=.71+.29*cavities;
    }
  }
  if(uTerrain>0.5 && uUseTex>0.5){
    vec2 uv=vUV;
    vec3 dirtA=texture(uDiffuse,uv).rgb;
    vec3 dirtB=texture(uDiffuse,vec2(-uv.y,uv.x)*0.63+vec2(0.31,0.67)).rgb;
    albedo=mix(dirtA,dirtB,0.35)*vC.rgb;
    float h=dot(albedo,vec3(0.299,0.587,0.114))*0.018;
    vec3 dx=dFdx(vW),dy=dFdy(vW),a=cross(dy,normal),b=cross(normal,dx);
    float det=dot(dx,a);if(abs(det)>0.000001)normal=normalize(abs(det)*normal-sign(det)*(dFdx(h)*a+dFdy(h)*b));
  }
  if (uSurfaceDetail > 0.5) {
    // World-space mineral grain and damp growth; derivative bump works without tangent attributes.
    vec3 weights=pow(abs(normal),vec3(4.0));weights/=max(dot(weights,vec3(1.0)),0.0001);
    vec3 tx=texture(uDiffuse,vW.zy*0.7).rgb,ty=texture(uDiffuse,vW.xz*0.7).rgb,tz=texture(uDiffuse,vW.xy*0.7).rgb;
    vec3 mineral=tx*weights.x+ty*weights.y+tz*weights.z;
    vec3 p=vW*14.0;
    float grain=sin(p.x+sin(p.z*0.7))*sin(p.y*1.3+p.z)*0.5+0.5;
    float fine=sin(p.x*3.1+p.z*2.4)*sin(p.y*4.7-p.z*1.7)*0.5+0.5;
    float height=uUseTex>0.5?dot(mineral,vec3(0.299,0.587,0.114))*0.022:grain*0.0004;
    vec3 dx=dFdx(vW),dy=dFdy(vW),r1=cross(dy,normal),r2=cross(normal,dx);
    float det=dot(dx,r1);
    if(abs(det)>0.000001)normal=normalize(abs(det)*normal-sign(det)*(dFdx(height)*r1+dFdy(height)*r2));
    float damp=sin(vW.x*0.41+sin(vW.z*0.27))*sin(vW.z*0.39+vW.y*0.3)*0.5+0.5;
    float moss=smoothstep(0.62,0.84,damp)*(1.0-smoothstep(0.3,3.4,vW.y))*0.65;
    if(uUseTex>0.5)albedo=mineral*vC.rgb*2.5;
    albedo=mix(albedo,vec3(0.10,0.17,0.045),moss);
  }
  // Three genuinely different world-space materials. World coordinates keep
  // micro-detail the same scale across ceilings, floors and elongated rails.
  if(uSurfaceKind>0.5 && uSurfaceKind<1.5) {
    // A fine fabricated mesh with anti-aliased sub-centimeter slats rather
    // than huge dark square "pixels". At distance, the grating resolves to
    // a believable darker steel surface.
    vec2 uv=fract(vW.xz/.215),e=min(uv,1.-uv);
    float aa=max(fwidth(vW.x/.215),fwidth(vW.z/.215))*.7;
    float rib=1.-smoothstep(.064-aa,.100+aa,min(e.x,e.y));
    float brace=1.-smoothstep(.018,.039,abs(fract(vW.x/1.29)-.5));
    float grime=fract(sin(dot(floor(vW.xz*9.),vec2(23.71,91.17)))*43758.5453);
    vec3 raised=vC.rgb*(1.05+sin(vW.x*58.)*.028);
    albedo=mix(raised*.35,raised,rib);
    albedo+=vec3(.038,.048,.052)*brace;
    albedo=mix(albedo,vec3(.23,.12,.068),smoothstep(.82,.99,grime)*.18);
  }
  if(uSurfaceKind>1.5 && uSurfaceKind<2.5) {
    vec3 axis=abs(normal);
    vec2 uv=axis.y>max(axis.x,axis.z)?vW.xz:axis.x>axis.z?vW.zy:vW.xy;
    vec2 t=fract(uv/2.25),e=min(t,1.-t);
    float seam=1.-smoothstep(.014,.035,min(e.x,e.y));
    float rivet=1.-smoothstep(.020,.045,length(e-vec2(.083)));
    float scratch=sin(uv.x*117.+sin(uv.y*7.))*.035;
    albedo=vC.rgb*(.94+scratch);
    albedo=mix(albedo,albedo*.36,seam*.82);
    albedo=mix(albedo,vec3(.65,.70,.74),rivet*.75);
  }
  if(uSurfaceKind>4.5 && uSurfaceKind<5.5){
    // Close-up industrial sample on ONE upper-Stronghold wall + floor tile:
    // analytic sub-millimetre machining and roughness breakup without tiled
    // photo repetition. Not a claim of loaded 8192px PBR image maps.
    vec3 axis=abs(normal);
    vec2 uv=axis.y>max(axis.x,axis.z)?vW.xz:vW.zy;
    float aax=1.-smoothstep(.7,2.4,fwidth(uv.x*231.));
    float aay=1.-smoothstep(.7,2.4,fwidth(uv.y*354.));
    float grain=sin(uv.x*231.+sin(uv.y*11.)*.83)*aax;
    float crossGrain=sin(uv.y*354.+sin(uv.x*19.)*.71)*aay;
    float wear=sin(uv.x*5.2+uv.y*1.61)*cos(uv.y*7.1-uv.x*.84);
    float oxide=smoothstep(.42,.88,wear*.5+.5);
    albedo*=.83+.057*grain+.049*crossGrain+.064*wear;
    albedo=mix(albedo,albedo*vec3(.70,.78,.83),oxide*.17);
    // The owner asked for a PICTURE mapped onto the steel face.
    // Vertex UVs are absent from the authored box builder, so project the
    // painted atlas in exact world coordinates onto the selected panel
    // and its ONE adjoining floor plate (2 halves of the image). Only
    // uSurfaceKind=5 can reach this path; adjacent walls stay unchanged.
    if(uUseTex>.5){
      vec2 wallUV=clamp(vec2((vW.z-61.40)/2.42,
                            (vW.y-5.10)/2.45),vec2(.004),vec2(.996));
      vec2 floorUV=clamp(vec2((vW.x-18.32)/2.15,
                             (vW.z-61.49)/2.15),vec2(.004),vec2(.996));
      bool faceFloor=normal.y>.7;
      vec2 photoUV=faceFloor?vec2(.5+.5*floorUV.x,floorUV.y):
        vec2(.5*wallUV.x,wallUV.y);
      vec3 metalPhoto=texture(uDiffuse,photoUV).rgb;
      // Keep physical lighting dynamic: the texture is a surface-color
      // image, never a screenshot unresponsive to changing lights.
      albedo=mix(albedo,metalPhoto,.94);
    }
    float height=.00063*grain+.00049*crossGrain+.0014*wear;
    vec3 dx=dFdx(vW),dy=dFdy(vW);
    vec3 v1=cross(dy,normal),v2=cross(normal,dx);
    float det=dot(dx,v1);
    if(abs(det)>.000001)normal=normalize(
      abs(det)*normal-sign(det)*(dFdx(height)*v1+dFdy(height)*v2));
  }
  if(uSurfaceKind>3.5 && uSurfaceKind<4.5) {
    // Stronghold polished alloy: high-density brushed grain, subtle oil tint,
    // pressed seams and derivative-filtered micro normals. World projection
    // avoids stretching even on ceiling frames, pipes and broad floor plates.
    // This is analytic detail, NOT a claim that 8192px texture maps exist.
    vec3 axis=abs(normal);
    vec2 uv=axis.y>max(axis.x,axis.z)?vW.xz:axis.x>axis.z?vW.zy:vW.xy;
    float antiAlias=1.0-smoothstep(0.8,2.6,fwidth(uv.x*160.0));
    float brush=sin(uv.x*160.0+sin(uv.y*7.0)*1.2)*.032*antiAlias;
    float broad=sin(uv.y*1.7+sin(uv.x*.73))*0.055;
    float wear=sin(uv.x*9.3+uv.y*4.8)*sin(uv.y*13.4-uv.x*2.0)*.018;
    vec2 grid=fract(uv/3.5);
    vec2 toEdge=min(grid,1.0-grid);
    float seam=1.0-smoothstep(.004,.016,min(toEdge.x,toEdge.y));
    albedo=vC.rgb*(.98+brush+broad+wear);
    albedo=mix(albedo,albedo*.70,seam*.28);
    // Keep the tiny normal variation nearly tangential; raking lights now
    // reveal engraved grain without creating a noisy brushed-plastic surface.
    normal=normalize(normal+antiAlias*.007*vec3(
      sin(vW.y*69.0+vW.z*36.0),0.0,cos(vW.x*61.0-vW.y*22.0)));
  }
  // Sumi-e Stronghold's three architectural finishes intentionally use
  // different neutral metal grain, panel scale and reflection behaviour.
  // World-space mapping works on the authored box meshes without UVs.
  // Derivative filtering keeps close-up machining from shimmering at distance.
  if(uSurfaceKind>5.5 && uSurfaceKind<6.5){
    // Satin silver wall: tall stamped plates, brushed vertical grain,
    // dark rubber-sealed seams and occasional understated handling marks.
    vec2 uv=abs(normal.x)>abs(normal.z)?vW.zy:vW.xy;
    vec2 cell=fract(uv/3.1);
    float border=min(min(cell.x,1.-cell.x),min(cell.y,1.-cell.y));
    float seam=1.-smoothstep(.008,.025+fwidth(uv.x)*.12,border);
    float aa=1.-smoothstep(.7,2.3,fwidth(uv.y*145.));
    float brush=sin(uv.y*145.+sin(uv.x*8.)*.8)*aa;
    float smudge=sin(uv.x*1.83+uv.y*.27)*sin(uv.y*2.9-uv.x*.54);
    albedo=vC.rgb*(.976+.031*brush+.045*smudge);
    albedo=mix(albedo,albedo*.44,seam*.77);
    normal=normalize(normal+aa*.004*vec3(
      sin(vW.y*67.),sin(vW.x*47.+vW.z*19.),cos(vW.y*61.)));
  }
  if(uSurfaceKind>6.5 && uSurfaceKind<7.5){
    // Gunmetal galvanized floor: compact mottled zinc-like spangle,
    // parallel rolling marks and low-contrast plate expansion joints.
    vec2 uv=vW.xz;
    vec2 grid=fract(uv/3.5);
    float edge=min(min(grid.x,1.-grid.x),min(grid.y,1.-grid.y));
    float joint=1.-smoothstep(.003,.016+fwidth(uv.x)*.09,edge);
    float macro=sin(uv.x*3.3+sin(uv.y*1.6))*
                cos(uv.y*4.1-sin(uv.x*2.4));
    float spangle=sin(uv.x*19.3+uv.y*13.7)*
                  sin(uv.x*15.1-uv.y*24.7);
    float aa=1.-smoothstep(.75,2.5,fwidth(uv.x*82.));
    float rolled=sin(uv.x*82.+sin(uv.y*5.)*.8)*aa;
    albedo=vC.rgb*(.95+.062*macro+.044*spangle+.025*rolled);
    albedo=mix(albedo,albedo*.53,joint*.7);
    normal=normalize(normal+aa*.003*vec3(
      sin(vW.z*57.),0.,cos(vW.x*63.)));
  }
  if(uSurfaceKind>7.5 && uSurfaceKind<8.5){
    // Ceiling is neither blue-lit wall nor glossy deck: dark titanium
    // cassette sheets with narrow recessed machine-direction ribs.
    vec2 uv=abs(normal.y)>.55?vW.xz:vW.xy;
    float cassette=fract(uv.x/2.8);
    float channel=1.-smoothstep(.012,.040,
      min(cassette,1.-cassette));
    float aa=1.-smoothstep(.7,2.5,fwidth(uv.y*71.));
    float satin=sin(uv.y*71.+sin(uv.x*3.)*.7)*aa;
    albedo=vC.rgb*(.965+.024*satin+.033*sin(uv.x*.83+uv.y*.24));
    albedo=mix(albedo,albedo*.51,channel*.76);
  }
  if(uSurfaceKind>2.5 && uSurfaceKind<3.5) {
    vec3 p=vW*1.9;
    float a=sin(p.x*3.7+p.z*1.9+sin(p.y*2.7)*.8);
    float b=sin(p.x*9.9-p.z*7.3+p.y*10.1);
    float c=sin(p.x*21.5+p.z*13.8-p.y*17.3);
    float strata=sin((vW.y*.73+vW.x*.16+vW.z*.09)*9.+a*.32);
    float rough=a*.19+b*.09+c*.042+strata*.14;
    albedo=vC.rgb*(.76+rough*.68);
    float stoneHeight=rough*.018;
    if(uUseTex>.5){
      // Existing bundled Kejim stone image: world-space tri-planar
      // projection prevents cliff texture stretching on steep rock faces.
      vec3 blend=pow(abs(normal),vec3(5.));
      blend/=max(dot(blend,vec3(1.)),.0001);
      vec3 tx=texture(uDiffuse,vW.zy*.48).rgb;
      vec3 ty=texture(uDiffuse,vW.xz*.48).rgb;
      vec3 tz=texture(uDiffuse,vW.xy*.48).rgb;
      vec3 rockImage=tx*blend.x+ty*blend.y+tz*blend.z;
      float luma=dot(rockImage,vec3(.299,.587,.114));
      albedo*=mix(.64,1.44,luma);
      albedo=mix(albedo,rockImage*vC.rgb*2.0,.55);
      stoneHeight+=luma*.03;
    }
    float moss=smoothstep(.72,1.,a*.32+b*.12+sin(vW.z*.27+vW.x*.43)*.67);
    albedo=mix(albedo,vec3(.15,.20,.11),moss*.22);
    float h=stoneHeight;
    vec3 dx=dFdx(vW),dy=dFdy(vW),r1=cross(dy,normal),r2=cross(normal,dx);
    float det=dot(dx,r1);
    if(abs(det)>.000001)normal=normalize(abs(det)*normal-sign(det)*(dFdx(h)*r1+dFdy(h)*r2));
  }
  if(uKejimCliff>.5){
    // Photographic Kejim stone plus geologic bedding, sharp fractures,
    // moss in the deep cracks and relief that catches the sunset light.
    // Normal details follow actual world scale across enormous cliff faces.
    vec3 p=vW;
    float strata=sin(p.y*1.35+p.z*.17+sin(p.x*.39)*.55);
    float crack=abs(sin(p.z*2.7+p.y*.63)
      *cos(p.x*3.3-p.y*1.16));
    float chips=sin(p.x*17.9+p.z*12.3)*cos(p.y*24.1);
    float crevice=1.-smoothstep(.035,.16,crack);
    vec3 rock=albedo*(.76+.18*strata+.095*chips);
    if(uUseTex>.5){
      vec3 axis=pow(abs(normal),vec3(5.));
      axis/=max(dot(axis,vec3(1.)),.0001);
      vec3 pic=texture(uDiffuse,p.zy*.29).rgb*axis.x
        +texture(uDiffuse,p.xz*.29).rgb*axis.y
        +texture(uDiffuse,p.xy*.29).rgb*axis.z;
      rock=mix(rock,rock*(.58+pic*1.12),.58);
    }
    rock*=1.-.27*crevice;
    float damp=.5+.28*sin(p.z*.38+p.y*.15)+.24*cos(p.x*.49+p.z*.24);
    float moss=smoothstep(.48,.78,damp)*(.3+.70*max(normal.y,0.))
      *smoothstep(.7,3.3,p.y)*(1.-smoothstep(17.,26.,p.y));
    albedo=mix(rock,vec3(.12,.22,.07),moss*.74);
    float height=.036*strata+.012*chips-.015*crevice;
    vec3 dx=dFdx(p),dy=dFdy(p),aa=cross(dy,normal),
      bb=cross(normal,dx);
    float d=dot(dx,aa);
    if(abs(d)>.000001)normal=normalize(abs(d)*normal-
      sign(d)*(dFdx(height)*aa+dFdy(height)*bb));
  }
  if(uMountainRock>0.5 || uSeaBed>0.5){
    // Fully authored tileable rock / moss / dirt images, projected in world
    // space so near-vertical cliffs have no stretched UVs.
    vec3 p=vW, n=normalize(normal);
    vec3 weights=pow(abs(n),vec3(5.));
    weights/=max(weights.x+weights.y+weights.z,.0001);
    vec3 rock=albedo, moss=vec3(.115,.22,.075), dirt=vec3(.31,.23,.17);
    float relief=0.5;
    if(uTerrainMaps>.5){
      vec2 yz=p.zy*.118, xz=p.xz*.118, xy=p.xy*.118;
      vec4 rx=texture(uRockMap,yz),ry=texture(uRockMap,xz),
        rz=texture(uRockMap,xy);
      vec4 rockTex=rx*weights.x+ry*weights.y+rz*weights.z;
      vec3 mossTex=texture(uMossMap,yz*.84).rgb*weights.x
        +texture(uMossMap,xz*.84).rgb*weights.y
        +texture(uMossMap,xy*.84).rgb*weights.z;
      vec3 dirtTex=texture(uDirtMap,yz*.71).rgb*weights.x
        +texture(uDirtMap,xz*.71).rgb*weights.y
        +texture(uDirtMap,xy*.71).rgb*weights.z;
      rock=rockTex.rgb*.88+albedo*.12;
      moss=mossTex*.82+vec3(.022,.037,.018);
      dirt=dirtTex*.84+vec3(.015,.009,.005);
      relief=rockTex.a;
      if(uMountainDetailLevel>1.5){
        // Independent fine-scale triplanar octave breaks up the visibly
        // repeating, metre-scale rock image at near camera distances.
        // Far rock uses normal mipmaps and the lower-cost coarse material.
        vec3 fine=texture(uRockMap,p.zy*.43+vec2(.17,.41)).rgb*weights.x
          +texture(uRockMap,p.xz*.43+vec2(.17,.41)).rgb*weights.y
          +texture(uRockMap,p.xy*.43+vec2(.17,.41)).rgb*weights.z;
        float nearLod=1.-smoothstep(48.,190.,length(uCam-p));
        rock=mix(rock,rock*(.54+fine*1.24),nearLod*.53);
        // Preserve broad strata while micro-grain changes the bump response.
        relief=mix(relief,dot(fine,vec3(.3,.58,.12)),nearLod*.35);
      }
    }else{
      // Distinct nontextured fallback if image upload is not available.
      rock=albedo*(.83+.10*sin(p.y*.63+p.z*.12));
      relief=.5+.21*sin(p.x*3.5+p.y*5.6+p.z*1.4);
    }
    float stripes=.5+.5*sin(p.y*.38+p.x*.067+sin(p.z*.16)*1.4);
    float fractures=1.-smoothstep(.035,.13,
      abs(sin(p.x*.51+p.y*.24)*cos(p.z*.49-p.y*.14)));
    rock*=.82+.22*stripes-.16*fractures;
    float crag=1.-clamp(n.y,0.,1.);
    float crevice=.5+.27*sin(p.x*.23+p.z*.29)
      +.17*sin(p.z*.53-p.y*.11);
    float moist=smoothstep(.31,.72,crevice)*
      smoothstep(-13.,11.,p.y)*(1.-smoothstep(73.,129.,p.y));
    float growth=(.10+.82*max(n.y,0.)) * moist;
    float scree=smoothstep(.36,.81,max(n.y,0.))*
      (1.-smoothstep(40.,112.,p.y))*
      (.45+.55*smoothstep(.29,.69,stripes));
    if(uSeaBed>.5){growth=.035; scree=.42;}
    albedo=mix(rock,dirt,scree*.34);
    albedo=mix(albedo,moss,growth*.81);
    // Moisture collects in low fractures and the rock shelf around the
    // waterline; shadows and sunlight reveal dark wet cuts, not uniform gloss.
    float shoreDamp=1.-smoothstep(-10.5,15.0,p.y);
    float cavityDamp=(1.-smoothstep(.16,.73,relief))*moist;
    rockWetness=clamp(shoreDamp*.76+cavityDamp*.30,0.,1.);
    albedo*=1.-rockWetness*.23;
    // Real image alpha is packed micro-height for a compact normal relief
    // map. Derivatives act in world space, not camera UV coordinates.
    float h=relief*.045+stripes*.013-fractures*.018;
    vec3 dpx=dFdx(p),dpy=dFdy(p);
    vec3 tangent=cross(dpy,n),bitangent=cross(n,dpx);
    float den=dot(dpx,tangent);
    if(abs(den)>.000001)
      normal=normalize(abs(den)*n-
        sign(den)*(dFdx(h)*tangent+dFdy(h)*bitangent));
    normal=normalize(mix(n,normal,crag*.72+.28));
  }
  if(uSumiInk>0.5 && uMountainRock>0.5){
    // Selective coloured sumi-e glaze only over shaded exposed cliff faces.
    // Keep the underlying mineral / triplanar texture and physical lightIt.
    vec3 baseNormal=normalize(vN);
    float cliff=1.0-smoothstep(.18,.68,max(baseNormal.y,0.0));
    float shade=1.0-smoothstep(.14,.88,max(dot(baseNormal,normalize(uSunDir)),0.0));
    vec2 paper=vW.xz*.11+vW.y*.023;
    float bleed=sin(paper.x*2.31+sin(paper.y*1.13)*2.6)
      *sin(paper.y*3.17+sin(paper.x*1.79)*1.9);
    float broken=1.-smoothstep(.08,.38,abs(bleed));
    float brush=pow(max(0.,sin(vW.y*2.71+vW.x*.37+
      sin(vW.z*.82+vW.x*.13)*1.5)),12.);
    float mask=cliff*(.26+.74*shade)*(.36+.64*broken)*
      (.55+.45*brush);
    vec3 ink=mix(vec3(.045,.066,.086),vec3(.078,.114,.115),
      smoothstep(.22,.67,bleed*.5+.5));
    albedo=mix(albedo,ink,clamp(mask*.43,0.,.42));
    normal=normalize(mix(normal,baseNormal,mask*.085));
  }
  if(uSeaBed>0.5){
    // Animated sun caustics on the physically rendered submerged stone.
    vec2 q=vW.xz;
    float caustic1=sin(q.x*.64+uTime*.78+sin(q.y*.37));
    float caustic2=sin(q.y*.71-uTime*.99+sin(q.x*.41));
    float caustic=pow(clamp(.5+.27*caustic1+.24*caustic2,0.,1.),6.);
    float light=max(dot(normal,normalize(uSunDir)),0.);
    albedo*=.77+caustic*(.55+.45*light);
    albedo=mix(albedo,albedo*vec3(.78,1.12,1.24),.24);
  }
  if(uReferenceMetal>0.5){
    // ONLY this wall/floor test: anisotropic machining, fine scratches,
    // and derivative micro-normals. All other materials remain unchanged.
    vec2 uv=abs(normal.y)>.65?vW.xz:vW.zy;
    float broad=sin(uv.x*29.0+sin(uv.y*2.6)*.6)*.5+.5;
    float brush=sin(uv.y*370.0+sin(uv.x*9.0)*.75);
    float crossGrain=sin(uv.x*175.0+uv.y*14.0);
    float aa=clamp(.22/max(fwidth(uv.y*370.0),.22),0.,1.);
    float wear=sin(uv.x*4.9+sin(uv.y*7.1)*2.3)*.5+.5;
    albedo*=.83+.12*broad+.055*brush*aa+.038*crossGrain+.045*wear;
    float microHeight=.00065*brush*aa+.0012*crossGrain+.0017*broad;
    vec3 dx=dFdx(vW),dy=dFdy(vW),r1=cross(dy,normal),r2=cross(normal,dx);
    float det=dot(dx,r1);
    if(abs(det)>.000001)normal=normalize(abs(det)*normal-
      sign(det)*(dFdx(microHeight)*r1+dFdy(microHeight)*r2));
  }
  if(uSteel>0.5) {
    // Fine directional brushed-metal variation over physically raised panel
    // geometry; world-space grain avoids stretched UVs on long bridge beams.
    float brush=sin(vW.x*91.0+vW.z*8.0)*sin(vW.y*17.0+vW.z*19.0);
    float etch=sin(vW.z*4.7+vW.y*2.2)*sin(vW.x*7.1);
    albedo*=0.92+0.055*brush+0.045*etch;
  }
  if(uWater>0.5 && uAbyssWater<0.5 && uWaterfall<0.5){
    // Water sits below the fatal fall boundary. Animated intersecting wavelets
    // displace its normal and refract a dark cyan/sky tint without adding
    // collision or requiring a GPU reflection probe.
    vec2 q=vW.xz;
    float w1=sin(q.x*0.38+q.y*0.22+uTime*1.18);
    float w2=sin(q.x*0.17-q.y*0.49-uTime*0.86);
    float w3=cos(q.x*1.2+q.y*0.91+uTime*2.5);
    normal=normalize(vec3(
      -(0.033*0.38*cos(q.x*0.38+q.y*0.22+uTime*1.18)
        +0.018*0.17*cos(q.x*0.17-q.y*0.49-uTime*0.86)),
      1.0,
      -(0.033*0.22*cos(q.x*0.38+q.y*0.22+uTime*1.18)
        -0.018*0.49*cos(q.x*0.17-q.y*0.49-uTime*0.86))
    ));
    float foam=smoothstep(0.82,0.99,0.5+0.27*w1+0.18*w2+0.05*w3);
    albedo=mix(vec3(0.055,0.18,0.25),vec3(0.12,0.37,0.44),
      0.46+0.24*w1+0.14*w2);
    albedo+=vec3(0.08,0.12,0.13)*foam;
  }
  if(uAbyssWater>0.5){
    if(uWaterSim>0.5){
      // Real damped wave propagation gives long, colliding swells and
      // reflected/split fronts around the actual rock and tower obstacles.
      // Four additional directional ripple octaves sharpen the silhouette
      // without flattening the physically propagated waves.
      vec2 p=vW.xz;
      vec2 stepXZ=uWaterBounds.zw/(uWaterGrid-1.0);
      float hl=waveHeight(p-vec2(stepXZ.x,0.0));
      float hr=waveHeight(p+vec2(stepXZ.x,0.0));
      float hd=waveHeight(p-vec2(0.0,stepXZ.y));
      float hu=waveHeight(p+vec2(0.0,stepXZ.y));
      vec2 slope=5.40*vec2((hr-hl)/(2.0*stepXZ.x),
                           (hu-hd)/(2.0*stepXZ.y));
      vec2 micro=vec2(
        .045*cos(p.x*.79+p.y*.33+uTime*1.34)
        +.028*cos(p.x*1.75-p.y*.48-uTime*2.5)
        +.014*cos(p.x*3.8+p.y*2.13+uTime*4.9)
        +.007*cos(p.x*7.3-p.y*4.6-uTime*7.6),
        .036*cos(p.y*.84-p.x*.23-uTime*1.15)
        +.027*sin(p.y*1.44+p.x*.61+uTime*2.3)
        +.013*sin(p.y*3.4-p.x*1.95-uTime*4.5)
        +.009*sin(p.y*6.7+p.x*3.8+uTime*8.1)
      );
      micro+=waterMicroSlope(p,uTime,uWaterDetailStrength);
      normal=normalize(vec3(-slope.x-micro.x,1.0,-slope.y-micro.y));
      float rise=5.40*waveHeight(p);
      float hue=clamp(.53+rise*.42+length(slope)*.58
        +.08*sin(p.x*.37+p.y*.19+uTime*.85),0.,1.);
      // Translucent mineral-teal water: the submerged real rock bed remains
      // visible through it. Avoid the former opaque uniform dark rectangle.
      albedo=mix(vec3(.060,.285,.40),vec3(.225,.62,.78),hue);
      float breaking=smoothstep(.09,.29,length(slope+micro));
      albedo=mix(albedo,vec3(.74,.91,.98),breaking*.075);
    }else{
    // Analytic normals are the exact derivatives of the 3D fallback
    // Gerstner-style height waves in MESH_VS, so highlights follow crests.
    vec2 p=vW.xz;
    float a=p.x*.31+p.y*.16+uTime*.80;
    float b=p.x*.20-p.y*.39-uTime*1.16;
    float d=p.x*.73+p.y*.48+uTime*1.70;
    vec2 grad=vec2(1.26*.31*cos(a)+.72*.20*cos(b)-.39*.73*sin(d),
                   1.26*.16*cos(a)-.72*.39*cos(b)-.39*.48*sin(d));
    grad+=vec2(.022*cos(p.x*2.6+p.y*1.4+uTime*3.2),
               .023*sin(p.y*2.4-p.x*.9-uTime*2.8));
    grad+=waterMicroSlope(p,uTime,uWaterDetailStrength);
    normal=normalize(vec3(-grad.x,1.0,-grad.y));
    float depths=.52+.19*sin(a)+.13*sin(b)+.075*cos(d);
    albedo=mix(vec3(.070,.295,.42),vec3(.215,.61,.77),clamp(depths,0.,1.));
    }
    // Bed-sampled optical depth is carried in the green vertex channel.
    // The blue/emerald transmission favors green-blue light because the
    // red spectrum attenuates faster through the existing submerged bed.
    float opticalDepth=clamp(vC.g,0.0,1.0)*8.0;
    vec3 transmission=exp(-vec3(.52,.23,.095)*opticalDepth);
    vec3 shallowWater=vec3(.18,.67,.72);
    vec3 deepWater=vec3(.022,.17,.32);
    albedo=mix(albedo,deepWater+
      (shallowWater-deepWater)*transmission,.81);
    // Two independently advected/rotated world-space normal layers give
    // fine detail without an enormous 8K texture or visible UV tiling.
    // The water-height solver still controls the large real wave geometry.
    if(uPondDetail>0.5){
      vec2 uvA=vW.xz*.107+vec2(uTime*.012,-uTime*.008);
      vec2 uvB=mat2(.8,-.6,.6,.8)*(vW.xz*.233)
        +vec2(-uTime*.018,uTime*.014);
      vec4 fineA=texture(uPondDetailMap,uvA);
      vec4 fineB=texture(uPondDetailMap,uvB);
      vec2 rippleSlope=(fineA.rg*2.0-1.0)*.22+
        (fineB.rg*2.0-1.0)*.10;
      normal=normalize(normal+vec3(-rippleSlope.x,0.0,-rippleSlope.y));
      // Mild roughness and mineral tint variation keeps the water from
      // looking like a single unbroken polished blue sheet.
      albedo*=.93+.12*mix(fineA.a,fineB.a,.37);
      float nearBank=smoothstep(.20,.95,vC.r);
      albedo=mix(albedo,vec3(.19,.53,.55),nearBank*.18);
      // Fine caustic glimmer in the shallow water, no invented ocean surf.
      float caustic=pow(max(.0,.5+.5*sin(vW.x*.64+uTime*.6)*
        sin(vW.z*.75-uTime*.52)),3.0);
      albedo+=vec3(.026,.049,.054)*nearBank*caustic;
    }
  }
  if(uRiverFlow>0.5){
    // River ribbon, separate from aerated waterfall impact and spray. This
    // translucent film uses the rock-derived G-depth and B-bank channels.
    // Beer-Lambert preferentially absorbs red as actual channel depth grows.
    float depthMeters=clamp(vC.g,0.0,1.0)*1.2;
    vec3 transmitted=exp(-vec3(1.8,.65,.28)*depthMeters);
    vec3 shallow=vec3(.20,.68,.70),deep=vec3(.025,.21,.35);
    albedo=deep+(shallow-deep)*transmitted;
    vec2 currentDir=normalize(vec2(140.,37.)-vW.xz);
    // Flow-advection is directed toward the true receiving pond, not a
    // static screen-space animation or one global scroll direction.
    normal=normalize(normal+vec3(
      -.045*sin(vW.x*.78+uTime*1.30+vW.y*.28),0.,
      -.050*cos(vW.z*.82+uTime*1.17+vW.y*.31)));
    if(uPondDetail>0.5){
      vec2 riverUvA=vW.xz*.20+currentDir*uTime*.105;
      vec2 riverUvB=mat2(.8,-.6,.6,.8)*(vW.xz*.57)
        +currentDir*uTime*.16;
      vec2 rippleSlope=(texture(uPondDetailMap,riverUvA).rg*2.-1.)*.12
        +(texture(uPondDetailMap,riverUvB).rg*2.-1.)*.055;
      normal=normalize(normal+vec3(-rippleSlope.x,0.,-rippleSlope.y));
    }
    // Broken, advected contact foam only where the actual ribbon nears
    // the banks. Separate whitewater ledge geometry is left untouched.
    float bank=smoothstep(.58,.96,vC.b);
    float turbulence=sin(vW.y*7.1+vW.x*2.6-uTime*8.4)*
      sin(vW.z*5.7-vW.y*2.2-uTime*3.8);
    float froth=bank*smoothstep(.12,.65,turbulence)*.54;
    albedo=mix(albedo,vec3(.68,.93,.91),froth);
  }
  if(uWaterfall>0.5){
    // DISTINCT cascade, white foam and fine spray materials. No pond-water
    // Fresnel/color logic is reused on this vertically falling surface.
    // World-Y streaks accelerate downhill across source-derived gullies.
    float stream=sin(vW.y*17.6-vW.x*4.7+vW.z*3.2-uTime*18.2);
    float filaments=sin(vW.y*61.0+vW.x*24.0-vW.z*11.0-uTime*46.0);
    float drops=sin(vW.y*104.+vW.z*31.-uTime*77.);
    float ribbon=smoothstep(.35,.91,.48+.23*stream+
      .21*filaments+.08*drops);
    if(uFallType<.5){
      // Mostly transparent, luminous pale-blue clear flow; cold linear
      // highlights ride the downward streaks rather than the wave crests.
      albedo=mix(vec3(.135,.47,.66),vec3(.74,.92,1.00),
        clamp(.22+.52*ribbon+.12*stream,0.,1.));
    }else if(uFallType<1.5){
      // Fractured white impact cushions localized to actual rock ledges.
      albedo=mix(vec3(.48,.78,.91),vec3(.95,.99,1.),.68+.3*ribbon);
    }else{
      // Airy atomized spray: bright specks, low opacity, near-white.
      albedo=mix(vec3(.54,.80,.94),vec3(1.,1.,1.),.68+.26*filaments);
    }
    normal=normalize(normal+vec3(
      .08*cos(vW.z*13.+uTime*9.),
      .03*sin(vW.y*29.-uTime*21.),
      .09*sin(vW.x*16.-uTime*8.)));
  }
  if(uKejimWet>.5){
    // Wet mineral film uses restrained copper/gold sunlight glints and
    // cooler teal patches. Only the shallow floor puddles receive this
    // finish; ordinary Kejim floors still use their old roughness.
    vec2 uv=vW.xz;
    float ring=sin(uv.x*2.2+uTime*.33)*cos(uv.y*1.76-uTime*.42);
    float grit=sin(uv.x*28.+uv.y*12.)*sin(uv.y*33.-uv.x*8.);
    albedo=mix(albedo,vec3(.085,.17,.19),.38+.16*ring);
    normal=normalize(normal+vec3(.019*cos(uv.x*3.+uTime*.35),
      0.,.021*sin(uv.y*2.5-uTime*.34)));
    albedo*=.94+.04*grit;
  }
  if(uKejimFlow>.5){
    // Rock-fed cascading water is thin turquoise glass with aerated
    // foam where the torrent strikes modeled natural stone shelves.
    float stream=sin(vW.y*11.0+vW.z*5.4-uTime*13.5);
    float droplets=sin(vW.x*25.7-vW.y*20.2+uTime*27.);
    float foam=smoothstep(.47,.79,.5+.29*stream+.21*droplets);
    albedo=mix(vec3(.11,.37,.43),vec3(.67,.88,.88),
      clamp(.23+.26*stream+.39*foam,0.,1.));
    albedo=mix(albedo,vec3(.92,.98,.96),
      smoothstep(.55,.78,vC.r)*foam*.48);
    normal=normalize(normal+vec3(.085*sin(vW.z*13.+uTime*9.),
      .02,.08*cos(vW.y*12.-uTime*8.)));
  }
  if(uWetStone>0.5) {
    // Wet mineral roughness / puddles: fragment derivatives produce fine
    // surface normals that glint under real view and light movement. No
    // static screen-space fake reflection is pasted onto the arena.
    float coarse=sin(vW.x*1.71+sin(vW.z*2.43))*
      sin(vW.z*1.87-cos(vW.x*2.16));
    float grain=sin(vW.x*48.3+sin(vW.z*7.4))*sin(vW.z*55.1);
    float film=smoothstep(-.28,.55,coarse*.60+grain*.10);
    albedo*=mix(.81,.65,film);
    normal=normalize(normal+vec3(
      dFdx(grain)*.00025,0.0,dFdy(grain)*.00025)*(1.0-film*.65));
  }
  vec3 c = lightIt(albedo, normal, vW, uSpec+rockWetness*.24) + uEmis;
  if(uSurfaceKind>4.5 && uSurfaceKind<5.5){
    // Position-matched amber marker on the one panel and subtle cool ceiling
    // reflection on its corresponding floor tile. Highlights move with view.
    vec3 V=normalize(uCam-vW);
    for(int p=0;p<2;p++){
      vec3 pos=p==0?vec3(20.48,6.32,61.48):vec3(18.0,9.16,63.0);
      vec3 tint=p==0?vec3(1.0,.71,.38):vec3(.50,.74,1.0);
      vec3 d=pos-vW;
      float distance=max(length(d),.001);
      vec3 L=d/distance;
      float fall=pow(max(1.-distance/(p==0?5.8:7.4),0.),2.);
      float lambert=max(dot(normal,L),0.);
      float gloss=max(dot(normal,normalize(V+L)),0.);
      c+=albedo*tint*fall*(.10+.65*lambert);
      c+=tint*fall*(pow(gloss,38.)*.23+pow(gloss,155.)*.98);
    }
    // Three protruding red indicators cast constrained moving glints.
    // They do not become a global Stronghold light or modify all steel.
    for(int pilot=0;pilot<3;pilot++){
      vec3 redPos=vec3(20.24,7.08,61.485+float(pilot)*.091);
      vec3 delta=redPos-vW;
      float dist=max(length(delta),.001);
      vec3 L=delta/dist;
      float fall=pow(max(1.-dist/1.8,0.),2.);
      float diffuse=max(dot(normal,L),0.);
      float specular=pow(max(dot(normal,normalize(L+V)),0.),96.);
      c+=vec3(1.0,.055,.025)*fall*(albedo*.25*diffuse+specular*.65);
    }
    float f=pow(1.-max(dot(normal,V),0.),5.);
    c+=mix(vec3(.018,.029,.041),uAmbTop*.27,f)*(.12+.40*f);
  }
  if(uReferenceMetal>0.5){
    // Yellow wall/floor lamps match actual modeled emissive fixtures.
    // Specular lobes react to camera position, light direction and normals.
    vec3 V=normalize(uCam-vW);
    float fresnel=pow(1.0-max(dot(normal,V),0.),5.);
    for(int trialLight=0;trialLight<2;trialLight++){
      vec3 lightPos=trialLight==0?vec3(12.96,4.18,-2.46):
        vec3(11.27,.23,-2.65);
      vec3 d=lightPos-vW;
      float dist=max(length(d),.001);
      vec3 L=d/dist;
      float fall=pow(max(1.0-dist/(trialLight==0?8.5:4.8),0.),2.);
      vec3 hue=trialLight==0?vec3(1.00,.70,.36):vec3(1.0,.68,.21);
      float ndl=max(dot(normal,L),0.);
      vec3 H=normalize(L+V);
      float shine=max(dot(normal,H),0.);
      c+=albedo*hue*fall*(.10+.49*ndl);
      c+=hue*fall*(pow(shine,29.)*.19+pow(shine,165.)*1.33);
    }
    // Environment Fresnel is approximate, not ray-traced scene reflection.
    c+=mix(vec3(.04,.063,.083),uAmbTop*.49,fresnel)*
      (.075+.16*fresnel);
  }
  if(rockWetness>.001){
    vec3 viewDir=normalize(uCam-vW);
    vec3 halfDir=normalize(viewDir+normalize(uSunDir));
    float wetGlint=pow(max(dot(normal,halfDir),0.),108.);
    float wetFresnel=pow(1.-max(dot(normal,viewDir),0.),5.);
    c+=uSunCol*wetGlint*rockWetness*.65
      +uAmbTop*wetFresnel*rockWetness*.07;
  }
  if(uAbyssLights>0.5){
    // 8 architectural fire bowls at the disk edge, 8 along the original
    // entrance bridge, and four gallery sconces; no fake unmotivated lights.
    // Bounded distance makes the additional shaded surface cost manageable.
    vec3 V=normalize(uCam-vW);
    for(int i=0;i<20;i++){
      vec3 p;
      if(i<8){
        float a=float(i)*.7853981634;
        p=vec3(140.+cos(a)*53.1,4.47,37.+sin(a)*53.1);
      } else if(i<16){
        int ix=(i-8)/2;
        float bx=ix==0?56.:ix==1?68.:ix==2?80.:86.5;
        float bz=(i%2==0)?33.6:40.4;
        p=vec3(bx,4.47,bz);
      } else {
        float a=(-3.+float(i-16)*2.)*.7853981634;
        p=vec3(140.+cos(a)*69.-2.62,4.47,37.+sin(a)*69.);
      }
      vec3 d=p-vW;
      float dist=length(d);
      if(dist<23.0){
        float fade=pow(1.-dist/23.,2.);
        vec3 L=d/max(dist,.001);
        float flicker=.94+.06*sin(uTime*(8.1+float(i)*.17)+float(i)*2.6);
        float ndl=max(dot(normal,L),0.);
        c+=albedo*vec3(1.4,.59,.21)*fade*flicker*(.21+.79*ndl);
        float specPower=uSteel>.5?89.:uWetStone>.5?94.:36.;
        float specular=pow(max(dot(normal,normalize(V+L)),0.),specPower);
        c+=vec3(1.0,.58,.24)*specular*fade*flicker*
          (uSteel>.5?1.42:uWetStone>.5?1.24:.25);
      }
    }
  }
  if(uCourtyardLights>0.5){
    // Every light is physically attached to a modeled bronze brazier in
    // trainingCourtyardFinish.js. Keep these local, not global, so no other
    // maps inherit torch glow or reflective color shifts.
    vec3 V=normalize(uCam-vW);
    for(int i=0;i<8;i++){
      int iz=i%4;
      float sx=i<4?-26.38:26.38;
      float sz=iz==0?19.5:iz==1?29.5:iz==2?49.5:59.0;
      vec3 L=vec3(sx,4.72,sz)-vW;
      float dist=max(length(L),.001);
      vec3 dir=L/dist;
      float fall=pow(max(1.0-dist/17.0,0.0),2.0);
      float flutter=.94+.06*sin(uTime*(11.0+float(iz)) + float(i)*3.71);
      float diffuse=max(dot(normal,dir),0.0);
      c+=albedo*vec3(1.37,.57,.24)*fall*flutter*(.18+.82*diffuse);
      float power=uWetStone>.5?92.0:uSteel>.5?64.0:34.0;
      float specular=pow(max(dot(normal,normalize(V+dir)),0.0),power);
      float reflectance=uWetStone>.5?1.55:uSteel>.5?1.12:.25;
      c+=vec3(1.0,.57,.24)*specular*fall*reflectance*flutter;
    }
  }
  if(uAnnexLights>0.5){
    // Four real inset ceiling luminaires in the screenshot-matched Handbook
    // annex. These are deliberately local to annex render batches; no new
    // gameplay lights, mutable dynamic slots or other arena shaders.
    vec3 V=normalize(uCam-vW);
    for(int i=0;i<4;i++){
      float px=i<2?33.0:44.0;
      float pz=(i==0 || i==2)?29.0:43.0;
      vec3 d=vec3(px,9.0,pz)-vW;
      float dist=max(length(d),0.001);
      float fall=pow(max(1.0-dist/14.5,0.0),2.0);
      vec3 L=d/dist;
      float nDotL=max(dot(normal,L),0.0);
      // Mixed 3000K warm stone bounce / restrained cyan screen fill.
      vec3 warm=vec3(1.19,.75,.47);
      vec3 cool=vec3(.36,.63,.78);
      vec3 lamp=mix(warm,cool,i==1||i==2?.40:.23);
      c+=albedo*lamp*fall*(.24+.76*nDotL);
      float power=uPolishedStone>.5?116.0:uSteel>.5?84.0:42.0;
      float specular=pow(max(dot(normal,normalize(V+L)),0.0),power);
      float gloss=uPolishedStone>.5?1.20:uSteel>.5?.82:.28;
      c+=lamp*specular*gloss*fall;
    }
  }
  if(uKejimLights>.5){
    // Light is motivated by real outpost warning fixtures and the override
    // terminal at the corresponding authored gameplay coordinates.
    vec3 V=normalize(uCam-vW);
    for(int i=0;i<3;i++){
      vec3 p=i==0?vec3(-3.7,8.4,-23.4):
        i==1?vec3(3.7,8.4,-23.4):vec3(-3.6,1.9,-29.15);
      vec3 L=p-vW;float dist=max(length(L),.001);
      float fall=pow(max(1.-dist/(i==2?9.:18.),0.),2.);
      vec3 color=i==2?vec3(.21,.57,.97):vec3(1.,.24,.095);
      float diffuse=max(dot(normal,L/dist),0.);
      c+=albedo*color*fall*(.24+.76*diffuse);
      float specular=pow(max(dot(normal,normalize(V+L/dist)),0.),
        uKejimWet>.5?115.:uSteel>.5?80.:37.);
      c+=color*specular*fall*(uKejimWet>.5?1.15:.36);
    }
  }
  if(uKejimWet>.5){
    vec3 V=normalize(uCam-vW);
    vec3 H=normalize(V+normalize(uSunDir));
    float reflect=pow(max(dot(normal,H),0.),145.);
    float broad=pow(max(dot(normal,H),0.),27.);
    float fresnel=pow(1.-max(dot(normal,V),0.),5.);
    c+=uSunCol*(2.30*reflect+.26*broad)+uAmbTop*fresnel*.22;
  }
  if(uKejimFlow>.5){
    // Clear falling water catches warm rays without becoming opaque blue.
    vec3 V=normalize(uCam-vW);
    c+=uSunCol*pow(max(dot(normal,normalize(uSunDir+V)),0.),95.)*.63;
  }
  if(uHallLights>0.5){
    // Four stable practical wall-torch lights; the gameplay renderer's four
    // dynamic slots remain untouched for actors, sabers and moving attacks.
    for(int i=0;i<4;i++){
      float sx=i<2?-12.88:12.88;
      float sz=(i==0 || i==2)?-11.1:8.2;
      vec3 d=vec3(sx,4.72,sz)-vW;
      float dist=max(length(d),0.001);
      float range=pow(max(1.0-dist/13.5,0.0),2.0);
      float flutter=0.96+0.04*sin(uTime*13.0+float(i)*3.9);
      float NdotL=max(dot(normal,d/dist),0.0);
      c+=albedo*vec3(1.40,0.62,0.24)*range*flutter*(0.19+0.81*NdotL);
      vec3 V=normalize(uCam-vW);
      float shine=pow(max(dot(normal,normalize(V+d/dist)),0.0),
        uPolishedStone>0.5?87.0:46.0);
      c+=vec3(1.0,0.63,0.34)*shine*range*flutter*(uPolishedStone>0.5?1.1:0.3);
    }
  }
  if(uAbyssWater>0.5){
    // Generic distance fog washes out the pond and hides the rock bottom.
    // Replace most of that fog with clean, sky-lit blue glass.
    c=mix(c,albedo*(uAmbTop*.46+uSunCol*.64),.96);
  }
  if(uRiverFlow>0.5){
    // Schlick Fresnel: clear rock-visible river when looking downward,
    // analytic sky reflection at grazing angles. No fake full-scene mirror.
    vec3 V=normalize(uCam-vW);
    float f=.02+.98*pow(1.-clamp(dot(normal,V),0.,1.),5.);
    vec3 reflected=reflect(-V,normal);
    vec3 sky=mix(vec3(.09,.19,.27),vec3(.44,.63,.74),
      smoothstep(-.15,.82,reflected.y));
    c=mix(c,sky,clamp(.09+f*.76,0.,.88));
    float crest=.5+.5*sin(vW.y*5.5+vW.x*1.4-uTime*4.0);
    float forwardScatter=pow(max(dot(V,-normalize(uSunDir)),0.),2.);
    // Thin bright crests transmit a small amount of directional sun
    // light, a bounded real-time approximation of subsurface scattering.
    c+=vec3(.11,.37,.27)*forwardScatter*(1.-vC.g)*
      (.12+.50*crest);
    c+=uSunCol*pow(max(dot(normal,
      normalize(V+normalize(uSunDir))),0.),84.)*.42;
  }
  if(uWaterfall>0.5){
    // Keep the waterfall white-blue over long camera distances: it is
    // aerated flowing water, not the foggy horizontal pond material.
    c=mix(c,albedo*(uAmbTop*.38+uSunCol*.76)
      +vec3(.10,.15,.19)*(uFallType>0.5?1.0:.4),.91);
  }
  if(uAbyssWater>0.5){
    vec3 V=normalize(uCam-vW);
    // Fresnel blends golden sky and darker teal water at grazing angles.
    float f=pow(1.0-max(dot(normal,V),0.0),5.);
    float microRoughness=.45;
    if(uPondDetail>0.5){
      microRoughness=texture(uPondDetailMap,
        vW.xz*.107+vec2(uTime*.012,-uTime*.008)).a;
    }
    float skyGlint=pow(max(dot(normal,normalize(uSunDir+V)),0.0),
      mix(180.,85.,microRoughness));
    float broad=pow(max(dot(normal,normalize(uSunDir+V)),0.0),
      mix(34.,19.,microRoughness));
    c=mix(c,uAmbTop*.96+uSunCol*.40,f*.64);
    // Additional angular sky reflection complements the prior Fresnel glint.
    // The previous translucent mineral-blue color and submerged rock remain.
    vec3 reflected=reflect(-V,normal);
    float skyHeight=smoothstep(-.12,.85,reflected.y);
    vec3 reflectedSky=mix(vec3(.085,.17,.245),vec3(.42,.58,.73),skyHeight);
    float cloudLight=.5+.5*sin(reflected.x*6.7+reflected.z*4.2+uTime*.008);
    reflectedSky+=uAmbTop*.075*cloudLight;
    c=mix(c,reflectedSky,clamp(.04+.67*f,0.,.80));
    float glimmer=pow(max(dot(normal,normalize(uSunDir+V)),0.0),72.);
    c+=uSunCol*(2.85*skyGlint+.29*broad+.14*glimmer);
    // Foam rings cling to the actual support shafts, not random islands.
    float foam=0.;
    for(int i=0;i<8;i++){
      float a=float(i)*.7853981634;
      vec2 t=vec2(140.+cos(a)*34.,37.+sin(a)*34.);
      float d=length(vW.xz-t);
      foam=max(foam,exp(-pow((d-1.7)*.95,2.)));
    }
    for(int i=0;i<4;i++){
      float a=(-3.+float(i)*2.)*.7853981634;
      vec2 t=vec2(140.+cos(a)*69.,37.+sin(a)*69.);
      float d=length(vW.xz-t);
      foam=max(foam,exp(-pow((d-3.0)*.85,2.)));
    }
    for(int i=0;i<3;i++){
      float px=i==0?59.:i==1?73.:86.;
      float d=length(vW.xz-vec2(px,37.));
      foam=max(foam,exp(-pow((d-1.3)*1.2,2.)));
    }
    // Waterfall impact zones at the far shore produce pale, moving froth.
    for(int i=0;i<3;i++){
      vec2 shore=uFallOutlets[i];
      float impact=length((vW.xz-shore)/vec2(11.,7.));
      foam=max(foam,(1.-smoothstep(.33,1.2,impact))*.8);
    }
    // Static R8 distance from the real irregular rock wall, tower feet
    // and bridge pillars complements the previous shoreline-vertex mask.
    float contact=waterContactDistance(vW.xz);
    float beachLine=1.0-smoothstep(.04,.34,contact);
    float wrack=.53+.27*sin(vW.x*1.68-vW.z*1.32+uTime*2.45)
               +.20*sin(vW.z*4.4+vW.x*2.7-uTime*4.9);
    float shoreFoam=beachLine*smoothstep(.24,.72,wrack);
    foam=max(foam,shoreFoam*.72);
    float foamTexture=.55+.45*sin(vW.x*2.65+vW.z*4.11+uTime*2.8);
    if(uPondDetail>0.5){
      vec2 foamUV=vW.xz*.125+vec2(uTime*.009,-uTime*.014);
      foamTexture=mix(foamTexture,texture(uPondDetailMap,foamUV).b,.72);
    }
    // The red vertex channel is the signed curved-bank proximity, not a
    // generic radial ring. Break it with the animated foam texture.
    float bankFroth=smoothstep(.38,.93,vC.r)*
      smoothstep(.30,.81,foamTexture)*.47;
    foam=max(foam,bankFroth);
    c=mix(c,vec3(.80,.94,.98),foam*foamTexture*.38);
    // Physically motivated elongated orange torch reflections on wave peaks.
    for(int i=0;i<8;i++){
      float a=float(i)*.7853981634;
      vec2 t=vec2(140.+cos(a)*53.1,37.+sin(a)*53.1);
      vec2 delta=vW.xz-t;
      float dx=length(delta);
      float streak=exp(-abs(delta.x)*.25-abs(delta.y)*.18)*exp(-dx*.045);
      float shimmer=.5+.5*sin(vW.x*5.1+vW.z*8.7+uTime*7.3);
      c+=vec3(1.,.47,.15)*streak*shimmer*.12;
    }
    // Camera-scaled triangle net creates glowing cyan water facets without
    // replacing the physically simulated pond with a rectangular plane.
    float gridFade=1.0-smoothstep(30.0,145.0,length(uCam-vW));
    float cyanGrid=cyanWaterTriangleGrid(vW.xz)*gridFade;
    c=mix(c,vec3(.31,.78,.96),cyanGrid*.35);
    c=max(c,vec3(0.0));
  }
  if(uWaterfall>0.5){
    c+=mix(vec3(.09,.18,.26),vec3(.21,.37,.44),
      uFallType>1.5?.72:.35)*(.5+.5*sin(vW.y*31.-uTime*27.));
  }
  if(uWetStone>0.5){
    // Clearcoat Fresnel and two-scale specular response across wet paving.
    // Actual animated shading from directional and local scene lights; this
    // is glossy reflected illumination, not mirror-accurate planar SSR.
    vec3 V=normalize(uCam-vW);
    vec3 H=normalize(V+normalize(uSunDir));
    float sunDot=max(dot(normal,H),0.0);
    float sheen=pow(sunDot,95.0)*.95+pow(sunDot,19.0)*.085;
    float fresnel=.035+.31*pow(1.0-max(dot(normal,V),0.0),5.0);
    c+=(uSunCol*sheen+uAmbTop*fresnel*.22)*(uCourtyardLights>.5?1.0:.7);
  }
  if(uCourtyardLights>.5 && uSteel>.5){
    // Polished blackened steel has a dimmer diffuse body and a sharper
    // grazing-angle light response than painted concrete.
    vec3 V=normalize(uCam-vW);
    float rim=pow(1.0-max(dot(normal,V),0.0),4.0);
    float highlight=pow(max(dot(normal,normalize(uSunDir+V)),0.0),110.0);
    c+=uSunCol*highlight*.58 + uAmbTop*rim*.14;
  }
  if(uSurfaceKind>3.5 && uSurfaceKind<4.5){
    // Dedicated coat for the stronghold alloy. Reflections respond to camera
    // and real in-game lights, with no fabricated mirror image of the scene.
    vec3 V=normalize(uCam-vW);
    float rim=pow(1.0-max(dot(normal,V),0.0),4.0);
    c+=uAmbTop*rim*.16;
    float direct=pow(max(dot(normal,normalize(V+normalize(uSunDir))),0.0),108.0);
    c+=uSunCol*direct*.48;
    for(int i=0;i<4;i++){
      vec3 delta=uLP[i].xyz-vW;
      float distanceToLight=max(length(delta),.001);
      float attenuation=pow(max(1.0-distanceToLight/max(uLP[i].w,.001),0.0),2.0);
      vec3 H=normalize(V+delta/distanceToLight);
      float glint=pow(max(dot(normal,H),0.0),95.0);
      c+=uLC[i]*glint*attenuation*.85;
    }
  }
  if(uSurfaceKind>5.5 && uSurfaceKind<8.5){
    // Differentiated analytic metallic glints, not faked scene reflections.
    // The floor remains satin and the ceiling receives the faintest highlight.
    vec3 V=normalize(uCam-vW);
    float wall=uSurfaceKind<6.5?1.:0.;
    float floorMetal=uSurfaceKind>6.5 && uSurfaceKind<7.5?1.:0.;
    float power=mix(125.,92.,floorMetal);
    float highlight=pow(max(dot(normal,normalize(V+normalize(uSunDir))),0.),power);
    float rim=pow(1.-max(dot(normal,V),0.),4.);
    c+=uSunCol*highlight*(.25*wall+.16*floorMetal+.08*(1.-wall-floorMetal));
    c+=uAmbTop*rim*(.085*wall+.055*floorMetal+.035*(1.-wall-floorMetal));
  }
  if(uPolishedStone>0.5){
    // Energy-conserving-ish clearcoat approximation: bright sun and sconce
    // highlights on the raised stone faces, never a fake full-scene reflection.
    vec3 V=normalize(uCam-vW);
    vec3 coat=uSunCol*pow(max(dot(normal,normalize(V+normalize(uSunDir))),0.0),115.0)*0.72;
    for(int i=0;i<4;i++){
      float radius=uLP[i].w;
      if(radius>0.0){
        vec3 L=uLP[i].xyz-vW;
        float d=max(length(L),0.001);
        float fade=pow(max(1.0-d/radius,0.0),1.5);
        float shine=pow(max(dot(normal,normalize(V+L/d)),0.0),92.0);
        coat+=uLC[i]*shine*fade*0.75;
      }
    }
    float micro=sin(vW.x*65.0+sin(vW.z*11.0))*sin(vW.z*73.0)*0.035;
    c+=coat*(0.92+micro);
    c+=uAmbTop*pow(1.0-max(dot(normal,V),0.0),4.0)*0.042;
  }
  if(uWater>0.5 && uAbyssWater<0.5 && uWaterfall<0.5){
    vec3 V=normalize(uCam-vW);
    float f=pow(1.0-max(dot(normal,V),0.0),4.0);
    c=mix(c,mix(uAmbTop,uSunCol,0.42)+vec3(0.05,0.14,0.17),
      0.10+f*0.48);
    c+=0.23*pow(max(dot(normal,normalize(uSunDir+V)),0.0),110.0)*uSunCol;
    float gridFade=1.0-smoothstep(26.0,135.0,length(uCam-vW));
    float cyanGrid=cyanWaterTriangleGrid(vW.xz)*gridFade;
    c=mix(c,vec3(.31,.78,.96),cyanGrid*.28);
  }
  if(uGlass>0.5) {
    // Inexpensive sky-hue Fresnel approximation, not an environment-cubemap:
    // reflective edges, bright sun glints and visible material thickness.
    vec3 V=normalize(uCam-vW);
    float fresnel=pow(1.0-abs(dot(normal,V)),3.0);
    c=mix(c,mix(uAmbTop,uSunCol,0.28)+vec3(0.18,0.22,0.27),
      0.15+fresnel*0.52);
    c+=uSunCol*pow(max(dot(normal,normalize(uSunDir+V)),0.0),76.0)*0.65;
  }
  // Clear shallow-angle view reveals submerged rock; grazing views retain
  // a glossy reflective skin. No expensive screen-space refraction required.
  float surfaceAlpha=uMeshAlpha;
  if(uAbyssWater>0.5){
    float grazing=pow(1.0-clamp(dot(normal,normalize(uCam-vW)),0.,1.),5.);
    float depthOpacity=1.0-exp(-.20*clamp(vC.g,0.,1.)*8.);
    surfaceAlpha=mix(.11+.55*depthOpacity,.86,grazing);
    // Preserve clear face-on water; a restrained film only at rock contacts.
    if(uWaterContactReady>.5){
      float shoreline=1.0-smoothstep(.015,.25,waterContactDistance(vW.xz));
      surfaceAlpha=clamp(surfaceAlpha+shoreline*.13,.12,.79);
    }
  }
  if(uRiverFlow>0.5){
    float facing=clamp(dot(normal,normalize(uCam-vW)),0.,1.);
    float fresnel=pow(1.-facing,5.);
    float depthOpacity=1.-exp(-2.2*clamp(vC.g,0.,1.)*1.2);
    surfaceAlpha=mix(.12+.44*depthOpacity,.86,fresnel);
  }
  o = vec4(c, vC.a * surfaceAlpha);
}`;
const GROUND_FS = `#version 300 es
precision highp float;
in vec3 vN; in vec4 vC; in vec3 vW; out vec4 o;
uniform float uTime;
${LIGHTING}
float line(float x, float w){ float d = abs(fract(x - 0.5) - 0.5) / fwidth(x); return 1.0 - clamp(d / w, 0.0, 1.0); }
void main(){
  vec2 p = vW.xz; float r = length(p);
  vec3 base = vec3(0.09, 0.10, 0.12);
  float g1 = max(line(p.x, 1.2), line(p.y, 1.2)); float g2 = max(line(p.x * 0.2, 1.4), line(p.y * 0.2, 1.4));
  base += vec3(0.05, 0.06, 0.08) * g1 * 0.5 + vec3(0.10, 0.12, 0.16) * g2;
  float ring = max(line(r * 0.25, 1.5), 0.0) * 0.6;
  base += vec3(0.05, 0.12, 0.20) * ring * smoothstep(40.0, 10.0, r);
  float checker = mod(floor(p.x * 0.5) + floor(p.y * 0.5), 2.0);
  base *= 0.9 + 0.12 * checker;
  float edge = smoothstep(26.0, 24.0, r); // arena platform
  base = mix(vec3(0.03, 0.035, 0.05), base, edge);
  vec3 c = lightIt(base, vec3(0.0, 1.0, 0.0), vW, 0.15);
  o = vec4(c, 1.0);
}`;
const SKY_VS = `#version 300 es
in vec2 aP; out vec2 vP; void main(){ vP = aP; gl_Position = vec4(aP, 0.9999, 1.0); }`;
const SKY_FS = `#version 300 es
precision highp float;
in vec2 vP; out vec4 o; uniform mat4 uInvVP; uniform vec3 uCam; uniform float uTime; uniform float uSkyDay; uniform float uSkyKejim;
uniform float uSkyTraining; uniform vec3 uSkySunDir; uniform vec3 uSkySunCol;
float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float kejimNoise(vec2 p){
  vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
  return mix(mix(h(i),h(i+vec2(1.,0.)),f.x),
             mix(h(i+vec2(0.,1.)),h(i+vec2(1.,1.)),f.x),f.y);
}
float kejimFbm(vec2 p){
  float result=0.,amp=.54;
  for(int octave=0;octave<4;octave++){
    result+=amp*kejimNoise(p);
    p=p*2.02+vec2(14.31,9.17);amp*=.51;
  }
  return result;
}
void main(){
  vec4 a = uInvVP * vec4(vP, 1.0, 1.0); vec3 d = normalize(a.xyz / a.w - uCam);
  if(uSkyKejim>0.5 && uSkyTraining<0.5){
    // Kejim is a particulate-rich canyon under atmospheric high cloud.
    // Multiple curved noise bands, a warm horizon and irregular distant
    // escarpments keep the sky from being a flat two-color gradient.
    float elevation=clamp(d.y,0.,1.);
    float angle=atan(d.z,d.x);
    vec3 col=mix(vec3(.51,.32,.21),vec3(.08,.115,.24),pow(elevation,.64));
    vec2 cp=vec2(angle*3.8,d.y*8.9);
    float sheet=kejimFbm(cp*2.6+vec2(uTime*.0015,-uTime*.0006));
    float wisps=kejimFbm(cp*5.8+vec2(-uTime*.002,.19));
    float formation=smoothstep(.45,.69,sheet*.76+wisps*.31);
    formation*=smoothstep(.06,.27,elevation);
    col=mix(col,vec3(.25,.20,.32),formation*.76);
    float cloudEdge=clamp((sheet-.48)*3.5,0.,1.);
    col+=vec3(.14,.09,.12)*cloudEdge*(1.-elevation)*.32;
    float ridge=.055+.038*kejimNoise(vec2(angle*23.,1.4))
      +.019*kejimNoise(vec2(angle*56.,3.7));
    float mountains=1.-smoothstep(ridge-.012,ridge+.015,d.y);
    vec3 mountainColor=mix(vec3(.15,.11,.12),vec3(.045,.055,.085),
      clamp(elevation*7.,0.,1.));
    col=mix(col,mountainColor,mountains);
    float dotSun=max(dot(d,normalize(vec3(.48,.22,-.84))),0.);
    col+=vec3(.94,.66,.34)*pow(dotSun,380.)*.96;
    col+=vec3(.54,.28,.21)*pow(dotSun,12.)*.24;
    // Thin gold dust fades mountain bases into distant haze.
    float haze=exp(-abs(d.y)*28.)*.21;
    col=mix(col,vec3(.41,.28,.24),haze*(1.-mountains*.45));
    o=vec4(col,1.);return;
  }
  if(uSkyDay>0.5){
    if(uSkyTraining>0.5){
      // The zenith and horizon match the directional light that actually
      // illuminates the Game 2 garden and circular water arena. Clouds live
      // in the sky, rather than being flat grey-green fog over everything.
      float elev=clamp(d.y,0.,1.);
      float azimuth=atan(d.z,d.x);
      vec3 horizon=mix(vec3(.49,.65,.74),vec3(.82,.58,.35),
        smoothstep(.1,.9,1.-elev));
      vec3 col=mix(horizon,vec3(.12,.31,.55),pow(elev,.61));
      vec2 q=vec2(azimuth*3.45,d.y*8.1);
      float clouds=kejimFbm(q*2.4+vec2(uTime*.0005,0.14));
      float wisps=kejimFbm(q*5.5+vec2(-uTime*.0008,.4));
      float puff=smoothstep(.45,.66,clouds*.8+wisps*.23);
      float cloudBand=smoothstep(.07,.23,elev)*(1.-smoothstep(.67,.97,elev));
      col=mix(col,vec3(.88,.82,.72),puff*cloudBand*.60);
      float sd=max(dot(d,normalize(uSkySunDir)),0.);
      col+=uSkySunCol*(pow(sd,650.)*.95+pow(sd,26.)*.21);
      float warmHaze=exp(-max(d.y,0.)*18.)*.26;
      col=mix(col,vec3(.73,.60,.49),warmHaze);
      o=vec4(col,1.);return;
    }
    float h=clamp(d.y,0.0,1.0);vec3 col=mix(vec3(0.69,0.74,0.70),vec3(0.24,0.43,0.57),pow(h,0.55));
    float sun=pow(max(dot(d,normalize(vec3(0.36,0.82,-0.44))),0.0),180.0);
    col+=vec3(0.8,0.65,0.37)*sun; o=vec4(col,1.0);return;
  }
  float t = clamp(d.y * 0.5 + 0.5, 0.0, 1.0);
  vec3 hor = vec3(0.30, 0.20, 0.34), mid = vec3(0.07, 0.07, 0.17), top = vec3(0.015, 0.02, 0.06);
  vec3 c = mix(hor, mid, smoothstep(0.45, 0.62, t)); c = mix(c, top, smoothstep(0.62, 0.95, t));
  c = mix(vec3(0.05, 0.04, 0.08), c, smoothstep(0.44, 0.50, t));
  vec2 g = vec2(atan(d.z, d.x) * 60.0, d.y * 120.0); vec2 id = floor(g); float st = step(0.985, h(id)) * smoothstep(0.1, 0.4, d.y);
  c += vec3(0.8, 0.85, 1.0) * st * (0.5 + 0.5 * sin(uTime * 2.0 + h(id) * 30.0));
  vec3 pd = normalize(vec3(-0.45, 0.30, -0.80)); float pl = smoothstep(0.972, 0.975, dot(d, pd)); // planet
  c = mix(c, vec3(0.55, 0.33, 0.26) * (0.4 + 0.8 * clamp(dot(d, normalize(pd + vec3(0.6, 0.3, 0.2))) * 8.0 - 6.4, 0.0, 1.0)), pl);
  c += vec3(0.5, 0.35, 0.6) * pow(max(dot(d, pd), 0.0), 18.0) * 0.25;
  o = vec4(c, 1.0);
}`;
const FX_VS = `#version 300 es
precision highp float;
in vec3 aPos; in vec2 aUV; in vec4 aCol; uniform mat4 uVP; out vec2 vUV; out vec4 vC;
void main(){ vUV = aUV; vC = aCol; gl_Position = uVP * vec4(aPos, 1.0); }`;
const FX_FS = `#version 300 es
precision highp float;
in vec2 vUV; in vec4 vC; out vec4 o; uniform float uMode;
void main(){
  float r2 = dot(vUV, vUV); float a;
  if (uMode > 0.5) { a = clamp(1.0 - r2, 0.0, 1.0); a *= a; }       // soft round
  else { a = clamp(1.0 - r2, 0.0, 1.0); a = a * a * (3.0 - 2.0 * a); }
  if (vUV.x > 1.5) { a = 1.0; }                                       // solid (uv.x = 2)
  o = vec4(vC.rgb * (vC.a * a), vC.a * a);                            // premultiplied-ish; blend func decides
}`;

function compile(gl, type, src) { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) + '\n' + src.split('\n').map((l, i) => (i + 1) + ': ' + l).join('\n')); return s; }
function program(gl, vs, fs) {
  const p = gl.createProgram(); gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs)); gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p); if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  const u = {}; const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) { const info = gl.getActiveUniform(p, i); const nm = info.name.replace(/\[0\]$/, ''); u[nm] = gl.getUniformLocation(p, info.name); }
  return { p, u };
}

const SHADOW_VS = `#version 300 es
precision highp float;layout(location=0) in vec3 aPos;uniform mat4 uVP;
void main(){gl_Position=uVP*vec4(aPos,1.0);}`;
const SHADOW_FS = `#version 300 es
precision highp float;void main(){}`;
const IDENTITY = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]), NO_CLIP = new Float32Array(4);
export class Renderer {
  constructor(canvas) {
    const gl = this.gl = canvas.getContext('webgl2', { antialias: true, alpha: false, stencil: true, powerPreference: 'high-performance', preserveDrawingBuffer: true });
    if (!gl) throw new Error('WebGL2 not available');
    this.canvas = canvas;
    this.canStencilOutline = !!gl.getContextAttributes?.()?.stencil;
    this.progs = { skin: program(gl, SKIN_VS, SKIN_FS), mesh: program(gl, MESH_VS, MESH_FS), ground: program(gl, MESH_VS, GROUND_FS), sky: program(gl, SKY_VS, SKY_FS), fx: program(gl, FX_VS, FX_FS) };
    // joint texture
    this.jt = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, this.jt);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, 256, 1, 0, gl.RGBA, gl.FLOAT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    // sky quad
    this.skyVao = gl.createVertexArray(); gl.bindVertexArray(this.skyVao); const sb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, sb);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW); const al = gl.getAttribLocation(this.progs.sky.p, 'aP'); gl.enableVertexAttribArray(al); gl.vertexAttribPointer(al, 2, gl.FLOAT, false, 0, 0);
    // fx dynamic batches
    this.fxCap = 60000; this.fx = [0, 1].map(() => { const vao = gl.createVertexArray(); gl.bindVertexArray(vao); const vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb);
      gl.bufferData(gl.ARRAY_BUFFER, this.fxCap * 9 * 4, gl.DYNAMIC_DRAW); const P = this.progs.fx.p; const st = 36;
      const a = n => gl.getAttribLocation(P, n); gl.enableVertexAttribArray(a('aPos')); gl.vertexAttribPointer(a('aPos'), 3, gl.FLOAT, false, st, 0);
      gl.enableVertexAttribArray(a('aUV')); gl.vertexAttribPointer(a('aUV'), 2, gl.FLOAT, false, st, 12); gl.enableVertexAttribArray(a('aCol')); gl.vertexAttribPointer(a('aCol'), 4, gl.FLOAT, false, st, 20);
      return { vao, vb, data: new Float32Array(this.fxCap * 9), n: 0 }; });
    this.view = m4.ident(); this.proj = m4.ident(); this.vp = m4.ident(); this.cam = [0, 2, 5]; this.time = 0;
    this.env = { sunDir: [0.4, 0.8, 0.45], sunCol: [0.55, 0.52, 0.62], ambTop: [0.30, 0.34, 0.46], ambBot: [0.10, 0.09, 0.12], fogCol: [0.05, 0.05, 0.10], fogD: 0.012 };
    this.lights = Array.from({ length: 4 }, () => ({ p: [0, 0, 0], r: 0, c: [0, 0, 0] }));
    this.jbuf = new Float32Array(256 * 4);
  }
  bakeTrainingShadows(meshes, {target=[0,0,23],radius=65,slot='training'}={}) {
    const gl=this.gl,size=2048;
    const tex=gl.createTexture();gl.activeTexture(gl.TEXTURE2);gl.bindTexture(gl.TEXTURE_2D,tex);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.DEPTH_COMPONENT24,size,size,0,gl.DEPTH_COMPONENT,gl.UNSIGNED_INT,null);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    const framebuffer=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.TEXTURE_2D,tex,0);gl.drawBuffers([gl.NONE]);gl.readBuffer(gl.NONE);
    if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw Error('Training shadow framebuffer incomplete');
    const sun=this.env.sunDir,len=Math.hypot(...sun),eye=target.map((v,i)=>v+sun[i]/len*100);
    const view=m4.lookAt(eye,target,[0,1,0]),ortho=new Float32Array(16);
    ortho[0]=ortho[5]=1/radius;ortho[10]=-2/220;ortho[14]=-1;ortho[15]=1;
    const vp=m4.mul(ortho,view),P=program(gl,SHADOW_VS,SHADOW_FS);
    gl.useProgram(P.p);gl.uniformMatrix4fv(P.u.uVP,false,vp);gl.viewport(0,0,size,size);
    gl.enable(gl.DEPTH_TEST);gl.depthMask(true);gl.disable(gl.CULL_FACE);gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.POLYGON_OFFSET_FILL);gl.polygonOffset(1,1);
    for(const mesh of meshes){gl.bindVertexArray(mesh.vao);gl.drawElements(gl.TRIANGLES,mesh.count,mesh.type,0);}
    gl.disable(gl.POLYGON_OFFSET_FILL);gl.enable(gl.CULL_FACE);gl.bindFramebuffer(gl.FRAMEBUFFER,null);
    gl.viewport(0,0,this.canvas.width,this.canvas.height);gl.deleteFramebuffer(framebuffer);gl.deleteProgram(P.p);
    if(slot==='abyss')this.abyssShadow={tex,vp};
    else this.trainingShadow={tex,vp};
  }
  resize() {
    const cw = Math.max(1, this.canvas.clientWidth), ch = Math.max(1, this.canvas.clientHeight);
    const maxBuffer = this.gl.getParameter?.(this.gl.MAX_RENDERBUFFER_SIZE) || 4096;
    // 4K intentionally supersamples displays below 4K. Other presets cap DPR.
    const target = ['4k','8k'].includes(this.renderQuality)
      ? Math.min(this.maxDpr || 4, 3840 / cw, 2160 / ch, maxBuffer / cw, maxBuffer / ch)
      : Math.min(window.devicePixelRatio || 1, this.maxDpr || 1.35, maxBuffer / cw, maxBuffer / ch);
    const dpr = Math.max(.1, target);
    const w = Math.max(1, Math.floor(cw * dpr)), h = Math.max(1, Math.floor(ch * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; }
    this.gl.viewport(0, 0, w, h); this.aspect = w / h;
  }
  setCamera(eye, target, fov = 62 * Math.PI / 180) {
    this.cam = eye; m4.lookAt(eye, target, [0, 1, 0], this.view); m4.perspective(fov, this.aspect || 1, 0.05, this.farClip || 400, this.proj); m4.mul(this.proj, this.view, this.vp);
    this.camR = [this.view[0], this.view[4], this.view[8]]; this.camU = [this.view[1], this.view[5], this.view[9]]; this.camF = [-this.view[2], -this.view[6], -this.view[10]];
  }
  begin() {
    const gl = this.gl;
    this.staticStats = { triangles: 0, candidateTriangles: 0, draws: 0, culledTriangles: 0 };
    // One stencil clear for the entire frame, NOT 30 clears per CTF team.
    // Each outlined fighter gets its own 8-bit reference in the mask.
    gl.stencilMask(0xff); gl.clearStencil(0); this.outlineStencilRef = 0;
    gl.clearColor(0.03, 0.03, 0.07, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT | gl.STENCIL_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK); gl.disable(gl.BLEND);
    // sky
    const S = this.progs.sky; gl.useProgram(S.p); const inv = invert(this.vp); gl.uniformMatrix4fv(S.u.uInvVP, false, inv); gl.uniform3fv(S.u.uCam, this.cam); gl.uniform1f(S.u.uTime, this.time);
    gl.uniform1f(S.u.uSkyDay,this.env.skyDay || 0);
    if(S.u.uSkyKejim)gl.uniform1f(S.u.uSkyKejim,this.env.skyKejim || 0);
    if(S.u.uSkyTraining){
      gl.uniform1f(S.u.uSkyTraining,this.env.skyTraining || 0);
      gl.uniform3fv(S.u.uSkySunDir,this.env.sunDir);
      gl.uniform3fv(S.u.uSkySunCol,this.env.sunCol);
    }
    gl.disable(gl.DEPTH_TEST); gl.bindVertexArray(this.skyVao); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); gl.enable(gl.DEPTH_TEST);
    for (const f of this.fx) f.n = 0; this.fxMode = 0;
  }
  _commonUniforms(P) {
    const gl = this.gl, u = P.u, e = this.env;
    if (u.uHasShadow) {
      gl.uniform1f(u.uHasShadow,this.trainingShadow?1:0);
      if(this.trainingShadow){gl.uniformMatrix4fv(u.uShadowVP,false,this.trainingShadow.vp);gl.activeTexture(gl.TEXTURE2);gl.bindTexture(gl.TEXTURE_2D,this.trainingShadow.tex);gl.uniform1i(u.uShadowMap,2);}
    }
    if(u.uHasAbyssShadow){
      gl.uniform1f(u.uHasAbyssShadow,this.abyssShadow?1:0);
      if(this.abyssShadow){
        gl.uniformMatrix4fv(u.uAbyssShadowVP,false,this.abyssShadow.vp);
        gl.activeTexture(gl.TEXTURE3);gl.bindTexture(gl.TEXTURE_2D,this.abyssShadow.tex);
        gl.uniform1i(u.uAbyssShadowMap,3);
      }
    }
    if (u.uVP) gl.uniformMatrix4fv(u.uVP, false, this.vp);
    if (u.uSunDir) { gl.uniform3fv(u.uSunDir, e.sunDir); gl.uniform3fv(u.uSunCol, e.sunCol); gl.uniform3fv(u.uAmbTop, e.ambTop); gl.uniform3fv(u.uAmbBot, e.ambBot); gl.uniform3fv(u.uCam, this.cam); gl.uniform3fv(u.uFogCol, e.fogCol); gl.uniform1f(u.uFogD, e.fogD); }
    if (u.uLP) { const lp = new Float32Array(16), lc = new Float32Array(12); this.lights.forEach((l, i) => { lp.set(l.p, i * 4); lp[i * 4 + 3] = l.r; lc.set(l.c, i * 3); }); gl.uniform4fv(u.uLP, lp); gl.uniform3fv(u.uLC, lc); }
    if (u.uTime) gl.uniform1f(u.uTime, this.time);
  }
  // ---- meshes
  uploadSkinned(att) { // att: {pos,nrm,col,joints,weights,idx}
    const gl = this.gl, P = this.progs.skin.p; const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
    const buf = (data, target = gl.ARRAY_BUFFER) => { const b = gl.createBuffer(); gl.bindBuffer(target, b); gl.bufferData(target, data, gl.STATIC_DRAW); return b; };
    const al = n => gl.getAttribLocation(P, n);
    buf(att.pos); gl.enableVertexAttribArray(al('aPos')); gl.vertexAttribPointer(al('aPos'), 3, gl.FLOAT, false, 0, 0);
    buf(att.nrm); gl.enableVertexAttribArray(al('aNrm')); gl.vertexAttribPointer(al('aNrm'), 3, gl.FLOAT, false, 0, 0);
    buf(att.col); gl.enableVertexAttribArray(al('aCol')); gl.vertexAttribPointer(al('aCol'), 4, gl.UNSIGNED_BYTE, true, 0, 0);
    buf(att.joints); gl.enableVertexAttribArray(al('aJ')); gl.vertexAttribIPointer(al('aJ'), 4, gl.UNSIGNED_BYTE, 0, 0);
    buf(att.weights); gl.enableVertexAttribArray(al('aW')); gl.vertexAttribPointer(al('aW'), 4, gl.UNSIGNED_BYTE, true, 0, 0);
    buf(att.idx, gl.ELEMENT_ARRAY_BUFFER);
    return { vao, count: att.idx.length };
  }
  uploadStatic(m, { spatialCellSize = 0 } = {}) { // {pos,nrm,col(Float32 or Uint8 rgba),idx}
    const partition = spatialCellSize && m.idx.length >= 1536
      ? partitionStaticMesh(m, spatialCellSize) : null;
    const indices = partition ? partition.indices : m.idx;
    const gl = this.gl, P = this.progs.mesh.p; const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
    const buf = (data, target = gl.ARRAY_BUFFER) => { const b = gl.createBuffer(); gl.bindBuffer(target, b); gl.bufferData(target, data, gl.STATIC_DRAW); return b; };
    const al = n => gl.getAttribLocation(P, n);
    buf(m.pos); gl.enableVertexAttribArray(al('aPos')); gl.vertexAttribPointer(al('aPos'), 3, gl.FLOAT, false, 0, 0);
    buf(m.nrm); gl.enableVertexAttribArray(al('aNrm')); gl.vertexAttribPointer(al('aNrm'), 3, gl.FLOAT, false, 0, 0);
    buf(m.col); gl.enableVertexAttribArray(al('aCol')); gl.vertexAttribPointer(al('aCol'), 4, gl.UNSIGNED_BYTE, true, 0, 0);
    if (m.uv) {
      buf(m.uv); gl.enableVertexAttribArray(al('aUV')); gl.vertexAttribPointer(al('aUV'), 2, gl.FLOAT, false, 0, 0);
    }
    buf(indices, gl.ELEMENT_ARRAY_BUFFER);
    // same layout works for the ground program (same attribute names)
    return { vao, count: indices.length, type: indices instanceof Uint32Array ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT,
      ranges: partition?.ranges, bytesPerIndex: indices.BYTES_PER_ELEMENT };
  }
  drawSkinned(mesh, actor, o = {}) {
    const gl = this.gl, P = this.progs.skin; gl.useProgram(P.p); this._commonUniforms(P);
    gl.uniformMatrix4fv(P.u.uModel, false, actor.model);
    const nb = actor.nBones; const jb = this.jbuf; jb.set(actor.skin.subarray(0, nb * 16));
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.jt); gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, nb * 4, 1, gl.RGBA, gl.FLOAT, jb.subarray(0, nb * 16)); gl.uniform1i(P.u.uJT, 0);
    gl.uniform3fv(P.u.uTint, o.tint || actor.tint); gl.uniform1f(P.u.uTintAmt, o.tintAmt ?? actor.tintAmt); gl.uniform1f(P.u.uAlpha, o.alpha ?? 1); gl.uniform1f(P.u.uGlow, o.glow || 0);
    gl.uniform1f(P.u.uOutline, o.outline ? 1 : 0);
    gl.uniform1f(P.u.uOutlineWidth, o.outline ? .028 : 0);
    gl.uniform3fv(P.u.uOutlineColor, o.outlineColor || [1, 1, 1]);
    // o.clip: draw only one side of a plane [nx, ny, nz, d] (both faces, so the cut shows); o.post: a matrix applied after the model
    gl.uniformMatrix4fv(P.u.uPost, false, o.post || IDENTITY); gl.uniform4fv(P.u.uClip, o.clip || NO_CLIP); if (o.clip) gl.disable(gl.CULL_FACE);
    if (o.outline) { gl.cullFace(gl.FRONT); gl.depthMask(false); }
    gl.bindVertexArray(mesh.vao); gl.drawElements(gl.TRIANGLES, mesh.count, gl.UNSIGNED_INT, 0);
    if (o.outline) { gl.depthMask(true); gl.cullFace(gl.BACK); }
    if (o.clip) gl.enable(gl.CULL_FACE);
  }
  // Manga-style single contour, never a flat team-colored character.
  // A naive expanded back-face shell can overwrite the model on meshes with
  // mixed winding/overlapping clothing. Stencil out the actual visible body
  // first, so the second shell may draw ONLY *outside* the model pixels.
  // Distinct per-fighter stencil IDs keep crowded 15v15 silhouettes separate
  // without repeatedly clearing the entire GPU stencil buffer.
  drawTeamOutlined(mesh, actor, baseOptions, outlineColor) {
    if (!this.canStencilOutline) {
      // If a browser denies stencil, keep the native model unobscured rather
      // than risk reverting to an all-blue/all-red character.
      this.drawSkinned(mesh, actor, baseOptions);
      return;
    }
    const gl = this.gl;
    const maskId = ++this.outlineStencilRef;
    if (maskId >= 255) { this.drawSkinned(mesh, actor, baseOptions); return; }
    gl.stencilMask(0xff);
    gl.enable(gl.STENCIL_TEST);
    gl.stencilFunc(gl.ALWAYS, maskId, 0xff);
    gl.stencilOp(gl.KEEP, gl.KEEP, gl.REPLACE);
    this.drawSkinned(mesh, actor, baseOptions);

    // Outside the visible body only. Leave existing map depth untouched.
    gl.stencilFunc(gl.NOTEQUAL, maskId, 0xff);
    gl.stencilMask(0);
    gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP);
    this.drawSkinned(mesh, actor, { outline: true, outlineColor });

    gl.stencilMask(0xff);
    gl.disable(gl.STENCIL_TEST);
  }
  createWaterContactTexture(sim) {
    if(!sim?.contactMap||sim.contactMap.length!==sim.width*sim.height)
      throw Error('Invalid water shoreline/support field');
    const gl=this.gl,tex=gl.createTexture();
    gl.activeTexture(gl.TEXTURE0+9);
    gl.bindTexture(gl.TEXTURE_2D,tex);
    // Mountain-material DOM images flip Y; scalar world-space grids must NOT.
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT,1);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.R8,sim.width,sim.height,0,
      gl.RED,gl.UNSIGNED_BYTE,sim.contactMap);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT,4);
    return tex;
  }
  createWaterHeightTexture(sim) {
    const gl=this.gl, tex=gl.createTexture();
    gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D,tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.R32F,sim.width,sim.height,0,
      gl.RED,gl.FLOAT,sim.heights);
    return tex;
  }
  updateWaterHeightTexture(tex,sim) {
    const gl=this.gl;
    gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D,tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);
    gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,sim.width,sim.height,
      gl.RED,gl.FLOAT,sim.heights);
  }
  uploadTexture(image, { anisotropy = 1 } = {}) {
    const gl = this.gl, tex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.generateMipmap(gl.TEXTURE_2D);
    // Preserve detail on floors and mountain faces viewed at grazing angles.
    // Optional extension: unsupported GPUs retain trilinear mip filtering.
    if (anisotropy > 1) {
      if (this.textureAnisotropy === undefined) this.textureAnisotropy =
        gl.getExtension('EXT_texture_filter_anisotropic');
      const extension = this.textureAnisotropy;
      if (extension) gl.texParameterf(gl.TEXTURE_2D,
        extension.TEXTURE_MAX_ANISOTROPY_EXT,
        Math.min(anisotropy, gl.getParameter(extension.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
    }
    return tex;
  }
  drawMesh(mesh, model, o = {}) {
    let visibleRanges = null;
    const stats = this.staticStats;
    if (stats) stats.candidateTriangles += mesh.count / 3;
    if (mesh.ranges && this.staticCulling !== false) {
      const clip = m4.mul(this.vp, model, this.staticClipMatrix ??= new Float32Array(16));
      visibleRanges = visibleStaticRanges(mesh.ranges, clip, mesh.bytesPerIndex);
      const visibleCount = visibleRanges.reduce((n, range) => n + range.count, 0);
      if (stats) stats.culledTriangles += (mesh.count - visibleCount) / 3;
      if (!visibleCount) return;
    }
    const gl = this.gl, P = this.progs[o.ground ? 'ground' : 'mesh']; gl.useProgram(P.p); this._commonUniforms(P);
    gl.uniformMatrix4fv(P.u.uModel, false, model); if (P.u.uSpec) gl.uniform1f(P.u.uSpec, o.spec ?? 0.2); if (P.u.uEmis) gl.uniform3fv(P.u.uEmis, o.emis || [0, 0, 0]);
    if (P.u.uSurfaceDetail) gl.uniform1f(P.u.uSurfaceDetail, o.detail ? 1 : 0);
    if (P.u.uAlphaCutoff) gl.uniform1f(P.u.uAlphaCutoff, o.alphaCutoff || 0);
    if (P.u.uMoss) gl.uniform1f(P.u.uMoss, o.moss ? 1 : 0);
    if (P.u.uGlass) gl.uniform1f(P.u.uGlass, o.glass ? 1 : 0);
    if (P.u.uSteel) gl.uniform1f(P.u.uSteel, o.steel ? 1 : 0);
    if (P.u.uReferenceMetal) gl.uniform1f(P.u.uReferenceMetal, o.referenceMetal ? 1 : 0);
    if (P.u.uSurfaceKind) gl.uniform1f(P.u.uSurfaceKind, o.surfaceKind || 0);
    if (P.u.uFoliageMotion) gl.uniform1f(P.u.uFoliageMotion,o.foliageMotion ? 1 : 0);
    if (P.u.uGrassActor) gl.uniform4fv(P.u.uGrassActor,this.trainingGrassActor || [9999,0,9999,0]);
    if (P.u.uWater) gl.uniform1f(P.u.uWater, o.water ? 1 : 0);
    if (P.u.uWaterSim) gl.uniform1f(P.u.uWaterSim, o.wave ? 1 : 0);
    if (P.u.uMountainRock) gl.uniform1f(P.u.uMountainRock,o.mountainRock?1:0);
    if (P.u.uSumiInk) gl.uniform1f(P.u.uSumiInk,o.sumiInk?1:0);
    if (P.u.uTerrainMaps) gl.uniform1f(P.u.uTerrainMaps,o.mountainMaps?1:0);
    if (P.u.uMountainDetailLevel) gl.uniform1f(P.u.uMountainDetailLevel,
      ['4k','8k'].includes(this.renderQuality) ? 3 : this.renderQuality === 'high' ? 2 :
      this.renderQuality === 'medium' ? 1 : 0);
    if (o.mountainMaps) {
      for(const [name,slot,uniform] of [['rock',5,'uRockMap'],
        ['moss',6,'uMossMap'],['dirt',7,'uDirtMap']]){
        gl.activeTexture(gl.TEXTURE0+slot);
        gl.bindTexture(gl.TEXTURE_2D,o.mountainMaps[name]);
        if(P.u[uniform])gl.uniform1i(P.u[uniform],slot);
      }
    }
    if (P.u.uSeaBed) gl.uniform1f(P.u.uSeaBed,o.seaBed?1:0);
    if (P.u.uFallOutlets && o.fallOutlets)
      gl.uniform2fv(P.u.uFallOutlets,new Float32Array(o.fallOutlets.flat()));
    if (o.wave && P.u.uWaveHeight) {
      // Reserve unit 3 for the far-arena shadow depth map.
      gl.activeTexture(gl.TEXTURE4);
      gl.bindTexture(gl.TEXTURE_2D,o.wave.texture);
      gl.uniform1i(P.u.uWaveHeight,4);
      gl.uniform4f(P.u.uWaterBounds,o.wave.bounds.x0,o.wave.bounds.z0,
        o.wave.bounds.x1-o.wave.bounds.x0,o.wave.bounds.z1-o.wave.bounds.z0);
      gl.uniform2f(P.u.uWaterGrid,o.wave.width,o.wave.height);
    }
    if (P.u.uWaterDetailStrength)
      gl.uniform1f(P.u.uWaterDetailStrength,o.abyssWater?(o.waterDetailStrength??1):0);
    if (P.u.uWaterContactReady)
      gl.uniform1f(P.u.uWaterContactReady,o.abyssWater && o.contact?.texture?1:0);
    if (o.abyssWater && o.contact?.texture && P.u.uWaterContact) {
      // Water atlas occupies texture unit 8; foam contact map uses 9.
      gl.activeTexture(gl.TEXTURE0+9);
      gl.bindTexture(gl.TEXTURE_2D,o.contact.texture);
      gl.uniform1i(P.u.uWaterContact,9);
      if(!o.wave && P.u.uWaterBounds){
        gl.uniform4f(P.u.uWaterBounds,o.contact.bounds.x0,o.contact.bounds.z0,
          o.contact.bounds.x1-o.contact.bounds.x0,
          o.contact.bounds.z1-o.contact.bounds.z0);
      }
    }
    if (P.u.uPondDetail) gl.uniform1f(P.u.uPondDetail,(o.abyssWater || o.riverFlow) && o.waterDetail ? 1 : 0);
    if ((o.abyssWater || o.riverFlow) && o.waterDetail && P.u.uPondDetailMap) {
      // WebGL2 guarantees >=16 fragment samplers. Units 0-7 are already
      // reserved for scene textures, water height and shadow/terrain maps.
      gl.activeTexture(gl.TEXTURE0+8);
      gl.bindTexture(gl.TEXTURE_2D,o.waterDetail);
      gl.uniform1i(P.u.uPondDetailMap,8);
    }
    if (P.u.uAbyssWater) gl.uniform1f(P.u.uAbyssWater,o.abyssWater?1:0);
    if (P.u.uAbyssLights) gl.uniform1f(P.u.uAbyssLights,o.abyssLights?1:0);
    if (P.u.uWaterfall) gl.uniform1f(P.u.uWaterfall,o.waterfall?1:0);
    if (P.u.uRiverFlow) gl.uniform1f(P.u.uRiverFlow,o.riverFlow?1:0);
    if (P.u.uFallType) gl.uniform1f(P.u.uFallType,o.fallType ?? 0);
    if (P.u.uMeshAlpha) gl.uniform1f(P.u.uMeshAlpha, o.alpha ?? 1);
    if (P.u.uTerrain) gl.uniform1f(P.u.uTerrain, o.terrain ? 1 : 0);
    if (P.u.uPolishedStone) gl.uniform1f(P.u.uPolishedStone, o.polishedStone ? 1 : 0);
    if (P.u.uHallLights) gl.uniform1f(P.u.uHallLights, o.hallLights ? 1 : 0);
    if (P.u.uAnnexLights) gl.uniform1f(P.u.uAnnexLights, o.annexLights ? 1 : 0);
    if (P.u.uCourtyardLights) gl.uniform1f(P.u.uCourtyardLights, o.courtyardLights ? 1 : 0);
    if (P.u.uWetStone) gl.uniform1f(P.u.uWetStone, o.wetStone ? 1 : 0);
    if (P.u.uKejimCliff) gl.uniform1f(P.u.uKejimCliff,o.kejimCliff?1:0);
    if (P.u.uKejimLights) gl.uniform1f(P.u.uKejimLights,o.kejimLights?1:0);
    if (P.u.uKejimWet) gl.uniform1f(P.u.uKejimWet,o.kejimWet?1:0);
    if (P.u.uKejimFlow) gl.uniform1f(P.u.uKejimFlow,o.kejimFlow?1:0);
    if (P.u.uTorchFlame) gl.uniform1f(P.u.uTorchFlame, o.torchFlame ? 1 : 0);
    if (!o.ground && P.u.uUseTex) {
      gl.uniform1f(P.u.uUseTex, o.tex ? 1 : 0);
      if (o.tex) { gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, o.tex); gl.uniform1i(P.u.uDiffuse, 1); }
    }
    const translucent = o.alpha != null && o.alpha < 1;
    if (translucent) {
      gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
      gl.depthMask(false);
    }
    if (o.doubleSided) gl.disable(gl.CULL_FACE);
    gl.bindVertexArray(mesh.vao);
    if (visibleRanges) {
      for (const range of visibleRanges) {
        gl.drawElements(gl.TRIANGLES, range.count, mesh.type, range.byteOffset);
        if (stats) { stats.draws++; stats.triangles += range.count / 3; }
      }
    } else {
      gl.drawElements(gl.TRIANGLES, mesh.count, mesh.type, 0);
      if (stats) { stats.draws++; stats.triangles += mesh.count / 3; }
    }
    if (o.doubleSided) gl.enable(gl.CULL_FACE);
    if (translucent) { gl.depthMask(true); gl.disable(gl.BLEND); }
  }
  // ---- fx batch (mode 0 = additive, 1 = alpha)
  _push(b, x, y, z, u, v, r, g, bl, a) { const f = this.fx[b]; if (f.n >= this.fxCap) return; const d = f.data, o = f.n * 9; d[o] = x; d[o + 1] = y; d[o + 2] = z; d[o + 3] = u; d[o + 4] = v; d[o + 5] = r; d[o + 6] = g; d[o + 7] = bl; d[o + 8] = a; f.n++; }
  billboard(p, size, c, mode = 0, rot = 0) {
    const R = this.camR, U = this.camU, s = size, cs = Math.cos(rot) * s, sn = Math.sin(rot) * s;
    const ax = R[0] * cs + U[0] * sn, ay = R[1] * cs + U[1] * sn, az = R[2] * cs + U[2] * sn, bx = -R[0] * sn + U[0] * cs, by = -R[1] * sn + U[1] * cs, bz = -R[2] * sn + U[2] * cs;
    const P = [[-1, -1], [1, -1], [1, 1], [-1, -1], [1, 1], [-1, 1]];
    for (const [u, v] of P) this._push(mode, p[0] + ax * u + bx * v, p[1] + ay * u + by * v, p[2] + az * u + bz * v, u, v, c[0], c[1], c[2], c[3]);
  }
  beam(a, b, w, c0, c1 = c0, mode = 0) { // camera-facing quad from a to b
    const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2]; const f = this.camF || [0, 0, -1];
    let sx = dy * f[2] - dz * f[1], sy = dz * f[0] - dx * f[2], sz = dx * f[1] - dy * f[0]; const l = Math.hypot(sx, sy, sz) || 1; sx *= w / l; sy *= w / l; sz *= w / l;
    this._push(mode, a[0] - sx, a[1] - sy, a[2] - sz, 0, -1, ...c0); this._push(mode, a[0] + sx, a[1] + sy, a[2] + sz, 0, 1, ...c0); this._push(mode, b[0] + sx, b[1] + sy, b[2] + sz, 0, 1, ...c1);
    this._push(mode, a[0] - sx, a[1] - sy, a[2] - sz, 0, -1, ...c0); this._push(mode, b[0] + sx, b[1] + sy, b[2] + sz, 0, 1, ...c1); this._push(mode, b[0] - sx, b[1] - sy, b[2] - sz, 0, -1, ...c1);
  }
  quad(p0, p1, p2, p3, c, mode = 0, solid = false) { // arbitrary quad (world), uv gradient
    const u = solid ? 2 : 0; const V = [[p0, -1], [p1, -1], [p2, 1], [p0, -1], [p2, 1], [p3, 1]];
    for (const [p, v] of V) this._push(mode, p[0], p[1], p[2], u, v, ...c);
  }
  tri(p0, p1, p2, c0, c1, c2, mode = 0) { this._push(mode, ...p0, 2, 0, ...c0); this._push(mode, ...p1, 2, 0, ...c1); this._push(mode, ...p2, 2, 0, ...c2); }
  flushFx() {
    const gl = this.gl, P = this.progs.fx; gl.useProgram(P.p); gl.uniformMatrix4fv(P.u.uVP, false, this.vp);
    gl.enable(gl.BLEND); gl.depthMask(false); gl.disable(gl.CULL_FACE);
    const draw = (i, mode) => { const f = this.fx[i]; if (!f.n) return; gl.uniform1f(P.u.uMode, mode); gl.bindVertexArray(f.vao); gl.bindBuffer(gl.ARRAY_BUFFER, f.vb); gl.bufferSubData(gl.ARRAY_BUFFER, 0, f.data, 0, f.n * 9); gl.drawArrays(gl.TRIANGLES, 0, f.n); };
    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA); gl.uniform1f(P.u.uMode, 0);
    // alpha batch: shadows etc. (rgb already multiplied by alpha in shader -> use premultiplied blend)
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); draw(1, 1);
    gl.blendFunc(gl.ONE, gl.ONE); draw(0, 1);
    gl.depthMask(true); gl.disable(gl.BLEND); gl.enable(gl.CULL_FACE);
  }
}
export function invert(m) {
  const a = m, o = new Float32Array(16);
  const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3], a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7], a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11], a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];
  const b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10, b02 = a00 * a13 - a03 * a10, b03 = a01 * a12 - a02 * a11, b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12;
  const b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30, b08 = a20 * a33 - a23 * a30, b09 = a21 * a32 - a22 * a31, b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32;
  let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06; det = 1 / det;
  o[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det; o[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det; o[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det; o[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
  o[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det; o[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det; o[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det; o[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
  o[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det; o[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det; o[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det; o[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
  o[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det; o[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det; o[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det; o[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;
  return o;
}

// ---- procedural static geometry
export function geo() {
  const G = { pos: [], nrm: [], col: [], idx: [] };
  const col8 = c => [Math.round(c[0] * 255), Math.round(c[1] * 255), Math.round(c[2] * 255), Math.round((c[3] ?? 1) * 255)];
  function vtx(p, n, c) { G.pos.push(...p); G.nrm.push(...n); G.col.push(...col8(c)); return G.pos.length / 3 - 1; }
  const api = {
    box(cx, cy, cz, sx, sy, sz, c) {
      const faces = [[[1, 0, 0], [0, 1, 0], [0, 0, 1]], [[-1, 0, 0], [0, 1, 0], [0, 0, -1]], [[0, 1, 0], [0, 0, 1], [1, 0, 0]], [[0, -1, 0], [0, 0, -1], [1, 0, 0]], [[0, 0, 1], [0, 1, 0], [-1, 0, 0]], [[0, 0, -1], [0, 1, 0], [1, 0, 0]]];
      for (const [n, u, v] of faces) {
        const cc = [0, 1, 2].map(k => [cx + (n[0] + (-u[0] - v[0])) * sx / 2, cy + (n[1] + (-u[1] - v[1])) * sy / 2, cz + (n[2] + (-u[2] - v[2])) * sz / 2]);
        const P = (a, b) => [cx + (n[0] + a * u[0] + b * v[0]) * sx / 2, cy + (n[1] + a * u[1] + b * v[1]) * sy / 2, cz + (n[2] + a * u[2] + b * v[2]) * sz / 2];
        const i0 = vtx(P(-1, -1), n, c), i1 = vtx(P(1, -1), n, c), i2 = vtx(P(1, 1), n, c), i3 = vtx(P(-1, 1), n, c);
        // winding: ensure outward
        const e1 = [P(1, -1)[0] - P(-1, -1)[0], P(1, -1)[1] - P(-1, -1)[1], P(1, -1)[2] - P(-1, -1)[2]], e2 = [P(1, 1)[0] - P(1, -1)[0], P(1, 1)[1] - P(1, -1)[1], P(1, 1)[2] - P(1, -1)[2]];
        const cr = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]]; const d = cr[0] * n[0] + cr[1] * n[1] + cr[2] * n[2];
        if (d > 0) G.idx.push(i0, i1, i2, i0, i2, i3); else G.idx.push(i0, i2, i1, i0, i3, i2);
      }
      return api;
    },
    cyl(cx, y0, cz, r, h, c, seg = 20, cap = true) {
      const base = G.pos.length / 3;
      for (let i = 0; i <= seg; i++) { const a = i / seg * Math.PI * 2, x = Math.cos(a), z = Math.sin(a); vtx([cx + x * r, y0, cz + z * r], [x, 0, z], c); vtx([cx + x * r, y0 + h, cz + z * r], [x, 0, z], c); }
      for (let i = 0; i < seg; i++) { const a = base + i * 2; G.idx.push(a, a + 1, a + 3, a, a + 3, a + 2); }
      if (cap) { const t = vtx([cx, y0 + h, cz], [0, 1, 0], c); const s0 = G.pos.length / 3; for (let i = 0; i <= seg; i++) { const a = i / seg * Math.PI * 2; vtx([cx + Math.cos(a) * r, y0 + h, cz + Math.sin(a) * r], [0, 1, 0], c); } for (let i = 0; i < seg; i++) G.idx.push(t, s0 + i + 1, s0 + i); }
      return api;
    },
    sphere(cx, cy, cz, r, c, seg = 16) {
      const base = G.pos.length / 3;
      for (let j = 0; j <= seg; j++) { const t = j / seg * Math.PI; for (let i = 0; i <= seg * 2; i++) { const a = i / (seg * 2) * Math.PI * 2; const n = [Math.sin(t) * Math.cos(a), Math.cos(t), Math.sin(t) * Math.sin(a)]; vtx([cx + n[0] * r, cy + n[1] * r, cz + n[2] * r], n, c); } }
      const w = seg * 2 + 1; for (let j = 0; j < seg; j++) for (let i = 0; i < seg * 2; i++) { const a = base + j * w + i; G.idx.push(a, a + w, a + 1, a + 1, a + w, a + w + 1); }
      return api;
    },
    plane(cx, cy, cz, sx, sz, c) { const n = [0, 1, 0]; const a = vtx([cx - sx, cy, cz - sz], n, c), b = vtx([cx + sx, cy, cz - sz], n, c), d = vtx([cx + sx, cy, cz + sz], n, c), e = vtx([cx - sx, cy, cz + sz], n, c); G.idx.push(a, e, d, a, d, b); return api; },
    build() { return { pos: new Float32Array(G.pos), nrm: new Float32Array(G.nrm), col: new Uint8Array(G.col), idx: new Uint32Array(G.idx) }; },
  };
  return api;
}
