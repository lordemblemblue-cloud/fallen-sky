import { appendExpeditionDetail } from './expeditionDetail.js';
// Level builder: plain-data layout -> collision triangles (BSPCollision format), ray-test boxes and render geometry.
// Units are metres, +X east, +Y up, +Z north (Game 2 / glTF axes). No WebGL here; World uploads the meshes.
//
// Layout primitives (all optional):
//   ground   {x0, z0, x1, z1, y, mat, tile}            walkable ground, tiled (BSPCollision ignores triangles > 100 m)
//   solids   [{min:[x,y,z], max:[x,y,z], mat, walk}]   boxes you collide with; top face walkable unless walk === false
//   clips    [{min, max}]                              invisible walls that keep the player inside the play area
//   ramps    [{x0, z0, x1, z1, y0, y1, dir, mat}]      sloped floors; dir = '+z' | '-z' | '+x' | '-x' (uphill)
//   deco     [{min, max, mat | glow}]                  render-only boxes (light strips, railings, antennas)
//   doors    [{id, min, max, mat, open}]               sliding (upwards) doors
//   interiors[{x0, z0, x1, z1, ceil}]                  rooms with a ceiling: no jumping through it
//   zones    [{id, x0, z0, x1, z1}]                    trigger areas for the mission director
//   lamps    [{p, c}]                                  point light candidates + glowing fittings
//   props    [{kind: 'crate' | 'barrel', x, z}]        physics props for Force Push / Pull
//   interactables [{id, p, r, prompt}]                 'E' use points
//   playerSpawn [x, y, z], playerYaw, navBounds [x0, z0, x1, z1], env {sun / ambient / fog}
//   navProbe  y                                         highest floor the navigation grid looks for (default 3.2 m)
//   bridges  [{id, label, x0, z0, x1, z1, y}]          energy bridges that consoles switch off (LevelSpace.dropBridge)
//   killY, teamHomes {blue, red}, teamYaw {blue, red}, ffaSpawns [[x, y, z]]   arena settings for the skirmish modes
//   duelSpawns {player, enemy}                         where Duel Practice puts you and the Reborn
//   music    'id'                                      a generated score from music.js SCORES

export const MATERIALS = {
  ground: [0.30, 0.28, 0.27], rock: [0.50, 0.44, 0.39], rockDark: [0.36, 0.32, 0.30], sand: [0.42, 0.37, 0.31],
  gratedSteel: [0.24, 0.31, 0.37], rivetedSteel: [0.34, 0.39, 0.44],
  sumiTrialSteel: [0.38, 0.41, 0.44], // Stronghold upper-gallery ONE wall/floor trial
  // Map-scoped architectural material zoning: neutral silver walls,
  // graphite galvanized walking surfaces and muted titanium ceilings.
  sumiWallSilver: [0.60, 0.596, 0.584],
  sumiFloorGunmetal: [0.235, 0.244, 0.250],
  sumiCeilingTitanium: [0.325, 0.335, 0.342],
  strataRock: [0.42, 0.38, 0.33],
  bannerRed: [0.46, 0.065, 0.075], // matte crimson fabric, not an emissive red alarm
  metal: [0.42, 0.44, 0.49], metalDark: [0.21, 0.22, 0.26], panel: [0.55, 0.57, 0.61], floor: [0.29, 0.30, 0.33],
  grate: [0.18, 0.19, 0.21], crate: [0.44, 0.37, 0.26], hazard: [0.78, 0.62, 0.16], pad: [0.33, 0.34, 0.37],
  console: [0.16, 0.18, 0.24], water: [0.12, 0.31, 0.41], glass: [0.43, 0.66, 0.75], steelGloss: [0.53, 0.61, 0.67], hull: [0.62, 0.61, 0.57], hullDark: [0.30, 0.30, 0.31], white: [0.86, 0.87, 0.9], door: [0.36, 0.39, 0.45],
};
export const GLOWS = { orange: [1, 0.6, 0.24], blue: [0.32, 0.68, 1], red: [1, 0.22, 0.16], green: [0.35, 1, 0.55], white: [0.95, 0.96, 1] };

const hash = (x, y, z) => { const s = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453; return s - Math.floor(s); };

export function meshBuilder() {
  const pos = [], nrm = [], col = [], idx = [];
  const c8 = c => [Math.round(Math.min(1, c[0]) * 255), Math.round(Math.min(1, c[1]) * 255), Math.round(Math.min(1, c[2]) * 255), 255];
  const v = (p, n, c) => { pos.push(p[0], p[1], p[2]); nrm.push(n[0], n[1], n[2]); col.push(...c8(c)); return pos.length / 3 - 1; };
  const api = {
    // p0..p3: a closed loop; winding is fixed so the face points along n. cs: one colour or one per corner
    quad(p0, p1, p2, p3, n, cs) {
      const C = Array.isArray(cs[0]) ? cs : [cs, cs, cs, cs];
      const a = v(p0, n, C[0]), b = v(p1, n, C[1]), c = v(p2, n, C[2]), d = v(p3, n, C[3]);
      const e1 = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]], e2 = [p2[0] - p1[0], p2[1] - p1[1], p2[2] - p1[2]];
      const cr = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
      if (cr[0] * n[0] + cr[1] * n[1] + cr[2] * n[2] > 0) idx.push(a, b, c, a, c, d); else idx.push(a, c, b, a, d, c);
      return api;
    },
    triangle(a,b,c,n,color){const x=v(a,n,color),y=v(b,n,color),z=v(c,n,color);idx.push(x,y,z);return api;},
    // axis-aligned box; side faces get a darker foot (cheap ambient occlusion)
    box(mn, mx, c, o = {}) {
      const [x0, y0, z0] = mn, [x1, y1, z1] = mx, foot = c.map(k => k * (o.foot ?? 0.72)), top = c.map(k => k * 1.06);
      const side = (a, b, cc, d, n) => api.quad(a, b, cc, d, n, [foot, foot, c, c]);
      api.quad([x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1], [0, 1, 0], top);
      if (!o.noBottom) api.quad([x0, y0, z0], [x0, y0, z1], [x1, y0, z1], [x1, y0, z0], [0, -1, 0], foot);
      side([x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0], [1, 0, 0]);
      side([x0, y0, z1], [x0, y0, z0], [x0, y1, z0], [x0, y1, z1], [-1, 0, 0]);
      side([x1, y0, z1], [x0, y0, z1], [x0, y1, z1], [x1, y1, z1], [0, 0, 1]);
      side([x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [0, 0, -1]);
      return api;
    },
    get count() { return idx.length; },
    build() { return { pos: new Float32Array(pos), nrm: new Float32Array(nrm), col: new Uint8Array(col), idx: new Uint32Array(idx) }; },
  };
  return api;
}

const tint = (mat, mn) => { const c = MATERIALS[mat] || MATERIALS.metal; const j = 0.93 + 0.14 * hash(mn[0], mn[1], mn[2]); return [c[0] * j, c[1] * j, c[2] * j]; };

export function buildLevel(L) {
  const tris = [], solids = [], clips = [];
  const base = meshBuilder(), glows = new Map(), surfaces = new Map();
  const surface = mat => { if(!surfaces.has(mat)) surfaces.set(mat,meshBuilder()); return surfaces.get(mat); };
  // Retexture the *original* Kejim chapter as well as the expansion;
  // keep base material tints and unchanged physics while adding real grating,
  // riveted Imperial wall panels and layered stone to otherwise flat boxes.
  const visualMaterial = mat => ['kejim_post','kejim_frontier'].includes(L.name)
    ? ({ground:'strataRock',rock:'strataRock',rockDark:'strataRock',
       metal:'rivetedSteel',metalDark:'rivetedSteel',panel:'rivetedSteel',
       grate:'gratedSteel',hull:'rivetedSteel',hullDark:'rivetedSteel',pad:'rivetedSteel'}[mat] || mat)
    : (L.detailedMaterials && ['rock','rockDark'].includes(mat) ? 'strataRock' : mat);
  const materialMesh = mat => {
    const actual=visualMaterial(mat);
    return ['glass','steelGloss','water','gratedSteel','rivetedSteel','strataRock','sumiTrialSteel','sumiWallSilver','sumiFloorGunmetal','sumiCeilingTitanium','sumiGLBWallFallback','sumiOwnerWallFallback'].includes(actual) ? surface(actual) : base;
  };
  const glowMesh = name => { if (!glows.has(name)) glows.set(name, meshBuilder()); return glows.get(name); };
  const floorTri = (a, b, c) => tris.push({ a, b, c, normal: [0, 1, 0] });
  // in tiles of at most 4 m: the floor probe's edge tolerance grows with the triangle, and a sheer edge (a chasm) must be exact
  const floorRect = (x0, z0, x1, z1, y, tile = 4) => {
    for (let x = x0; x < x1 - 1e-6; x += tile) for (let z = z0; z < z1 - 1e-6; z += tile) { const xa = Math.min(x1, x + tile), za = Math.min(z1, z + tile); floorTri([x, y, z], [xa, y, z], [xa, y, za]); floorTri([x, y, z], [xa, y, za], [x, y, za]); }
  };
  const wallRect = (p, q, yb, yt, n) => { tris.push({ a: [p[0], yb, p[1]], b: [q[0], yb, q[1]], c: [q[0], yt, q[1]], normal: n }); tris.push({ a: [p[0], yb, p[1]], b: [q[0], yt, q[1]], c: [p[0], yt, p[1]], normal: n }); };
  // collision for a box: walkable top + four wall faces. Low boxes (<= 0.5 m) are steps: no walls, you walk up them.
  // Wall tops sit 0.2 m below the real top so someone standing on the box is not shoved off its edge.
  const boxCollision = (mn, mx, walk) => {
    const [x0, y0, z0] = mn, [x1, y1, z1] = mx;
    if (walk !== false) floorRect(x0, z0, x1, z1, y1);
    if (y1 - y0 <= 0.5) return;
    const yt = y1 - 0.2;
    wallRect([x0, z0], [x1, z0], y0, yt, [0, 0, -1]); wallRect([x1, z1], [x0, z1], y0, yt, [0, 0, 1]);
    wallRect([x0, z1], [x0, z0], y0, yt, [-1, 0, 0]); wallRect([x1, z0], [x1, z1], y0, yt, [1, 0, 0]);
  };

  // New expedition/highland heightfield, tubes and closed rock formations.
  // Collision and rendering go through the same deterministic authored pass.
  appendExpeditionDetail(L, materialMesh, tint, tris, solids);

  // ground
  const G = L.ground;
  if (G) {
    const tile = G.tile || 26, y = G.y ?? 0;
    for (let x = G.x0; x < G.x1 - 1e-6; x += tile) for (let z = G.z0; z < G.z1 - 1e-6; z += tile) {
      const x1 = Math.min(G.x1, x + tile), z1 = Math.min(G.z1, z + tile); floorRect(x, z, x1, z1, y);
      const c = tint(G.mat || 'ground', [x, y, z]); materialMesh(G.mat || 'ground').quad([x, y, z], [x1, y, z], [x1, y, z1], [x, y, z1], [0, 1, 0], c);
    }
  }
  // Expanded chapters use isolated physical islands, not a blanket floor
  // over a ravine. Material stays in its own batch for shader texturing.
  for(const patch of L.groundPatches || []){
    const {x0,z0,x1,z1,y=0,tile=5,mat='ground'}=patch;
    for(let x=x0;x<x1-1e-6;x+=tile)for(let z=z0;z<z1-1e-6;z+=tile){
      const xa=Math.min(x1,x+tile),za=Math.min(z1,z+tile);
      floorRect(x,z,xa,za,y,tile);
      materialMesh(mat).quad([x,y,z],[xa,y,z],[xa,y,za],[x,y,za],[0,1,0],tint(mat,[x,y,z]));
    }
  }
  for (const s of L.solids || []) {
    boxCollision(s.min, s.max, s.walk);
    solids.push({ min: s.min, max: s.max });
    // Original hall-wall solids remain authoritative for navigation and
    // collision, but their VISUAL triangles enter an isolated fallback batch.
    // The actual enlarged GLB replaces that entire render batch on success.
    const modelMesh=s.ownerWallFallback?surface('sumiOwnerWallFallback'):
      s.glbHallFallback?surface('sumiGLBWallFallback'):materialMesh(s.mat);
    modelMesh.box(s.min, s.max, tint(s.mat, s.min), { noBottom: s.min[1] <= 0.01 });
  }
  for (const s of L.clips || []) { boxCollision(s.min, s.max, false); clips.push({ min: s.min, max: s.max }); }
  for (const r of L.ramps || []) {
    const { x0, z0, x1, z1, y0, y1 } = r, dir = r.dir || '+z';
    const h = (x, z) => { const k = dir === '+z' ? (z - z0) / (z1 - z0) : dir === '-z' ? (z1 - z) / (z1 - z0) : dir === '+x' ? (x - x0) / (x1 - x0) : (x1 - x) / (x1 - x0); return y0 + (y1 - y0) * k; };
    const P = [[x0, z0], [x1, z0], [x1, z1], [x0, z1]].map(([x, z]) => [x, h(x, z), z]);
    const e1 = [P[1][0] - P[0][0], P[1][1] - P[0][1], P[1][2] - P[0][2]], e2 = [P[3][0] - P[0][0], P[3][1] - P[0][1], P[3][2] - P[0][2]];
    let n = [e2[1] * e1[2] - e2[2] * e1[1], e2[2] * e1[0] - e2[0] * e1[2], e2[0] * e1[1] - e2[1] * e1[0]]; const nl = Math.hypot(...n); n = n.map(k => k / nl); if (n[1] < 0) n = n.map(k => -k);
    tris.push({ a: P[0], b: P[1], c: P[2], normal: n }); tris.push({ a: P[0], b: P[2], c: P[3], normal: n });
    const c = tint(r.mat || 'metal', [x0, y0, z0]); base.quad(P[0], P[1], P[2], P[3], n, c);
    // side skirts (rendered both ways round so they show from either side)
    const along = dir === '+z' || dir === '-z';
    const sides = along ? [[P[0], P[3], -1], [P[1], P[2], 1]] : [[P[0], P[1], -1], [P[3], P[2], 1]];
    for (const [a, b, sgn] of sides) {
      const nn = along ? [sgn, 0, 0] : [0, 0, sgn]; const foot = c.map(k => k * 0.7);
      base.quad([a[0], y0, a[2]], [b[0], y0, b[2]], b, a, nn, [foot, foot, c, c]);
      base.quad([a[0], y0, a[2]], a, b, [b[0], y0, b[2]], nn.map(k => -k), [foot, c, c, foot]);
    }
  }
  // Radial, load-bearing geometry for the new open-sky arena. Each disc
  // sector has real triangle floor collision and relief-mesh stone courses.
  // The ring geometry intentionally has no floor across its inner void.
  const polar = (cx,cz,r,a,y) => [cx+Math.cos(a)*r,y,cz+Math.sin(a)*r];
  const radialFloor = ({cx,cz,inner=0,outer,y,depth,mat,segments=64,walk=true}) => {
    const count=Math.max(16,Math.min(128,segments|0));
    const rings=Math.max(1,Math.ceil((outer-inner)/3.15));
    const m=materialMesh(mat),color=MATERIALS[mat]||MATERIALS.rock;
    for(let j=0;j<rings;j++){
      const r0=inner+(outer-inner)*j/rings,r1=inner+(outer-inner)*(j+1)/rings;
      for(let i=0;i<count;i++){
        const a0=i*2*Math.PI/count,a1=(i+1)*2*Math.PI/count;
        const p0=polar(cx,cz,r0,a0,y),p1=polar(cx,cz,r1,a0,y),
              p2=polar(cx,cz,r1,a1,y),p3=polar(cx,cz,r0,a1,y);
        if(walk){
          floorTri(p0,p1,p2); floorTri(p0,p2,p3);
        }
        m.quad(p0,p1,p2,p3,[0,1,0],color.map(k=>k*0.67));
        // Raised inset cut stone courses + mortar recesses; always decorative
        // so footsteps encounter an unbroken y-level collision plane.
        const edge=Math.min(0.13,(r1-r0)*0.18);
        const angleInset=Math.min(0.013,(a1-a0)*0.2);
        const tile=[
          polar(cx,cz,r0+edge,a0+angleInset,y+0.027),
          polar(cx,cz,r1-edge,a0+angleInset,y+0.027),
          polar(cx,cz,r1-edge,a1-angleInset,y+0.027),
          polar(cx,cz,r0+edge,a1-angleInset,y+0.027),
        ];
        const variation=0.85+0.15*Math.sin(i*5.71+j*2.37)**2;
        m.quad(...tile,[0,1,0],color.map(k=>k*variation));
        if((i+j)%5===0){
          const edgeTile=[
            polar(cx,cz,r0+edge*2,a0+angleInset*1.4,y+0.042),
            polar(cx,cz,r1-edge*2,a0+angleInset*1.4,y+0.042),
            polar(cx,cz,r1-edge*2,a0+angleInset*1.8,y+0.042),
            polar(cx,cz,r0+edge*2,a0+angleInset*1.8,y+0.042),
          ];
          m.quad(...edgeTile,[0,1,0],color.map(k=>k*0.55));
        }
      }
    }
    for(const radius of [outer,...(inner>0?[inner]:[])])
      for(let i=0;i<count;i++){
        const a0=i*2*Math.PI/count,a1=(i+1)*2*Math.PI/count;
        const normal=(radius===outer?1:-1);
        const n=[Math.cos((a0+a1)/2)*normal,0,Math.sin((a0+a1)/2)*normal];
        m.quad(polar(cx,cz,radius,a0,y-depth),
          polar(cx,cz,radius,a1,y-depth),
          polar(cx,cz,radius,a1,y),
          polar(cx,cz,radius,a0,y),n,color.map(k=>k*0.57));
      }
  };
  for(const d of L.discs || [])
    radialFloor({cx:d.cx,cz:d.cz,inner:0,outer:d.radius,y:d.y,
      depth:d.depth,mat:d.mat,segments:d.segments});
  for(const d of L.rings || [])
    radialFloor({...d,outer:d.outer});
  // Arbitrary-angle slabs: arrival bridge, arena-to-pillar connectors and
  // square-canopy steel anchors all use one consistent extruded primitive.
  for(const s of L.spans || []){
    const dx=s.b[0]-s.a[0],dz=s.b[2]-s.a[2],len=Math.hypot(dx,dz);
    if(len<=0.001)continue;
    const px=-dz/len*s.width/2,pz=dx/len*s.width/2;
    const P=[[-px,-pz],[px,pz]];
    const a=[s.a[0]+P[0][0],s.a[1],s.a[2]+P[0][1]];
    const b=[s.b[0]+P[0][0],s.b[1],s.b[2]+P[0][1]];
    const c=[s.b[0]+P[1][0],s.b[1],s.b[2]+P[1][1]];
    const d=[s.a[0]+P[1][0],s.a[1],s.a[2]+P[1][1]];
    const m=materialMesh(s.mat),col=tint(s.mat,a);
    m.quad(a,b,c,d,[0,1,0],col);
    const lower=p=>[p[0],p[1]-s.depth,p[2]];
    // A span's top and side panels alone leave the whole underside INVISIBLE
    // with WebGL back-face culling. Close the lower face on the Stronghold
    // bridge/duct/overpass, so looking up from the medical room sees an
    // actual supported steel soffit, never the sky through the deck.
    if(L.name==='sumi_stronghold')
      m.quad(lower(a),lower(d),lower(c),lower(b),[0,-1,0],
        col.map(value=>value*.62));
    for(const [p,q,n] of [[a,b,[-pz/Math.max(s.width/2,0.01),0,px/Math.max(s.width/2,0.01)]],
      [c,d,[pz/Math.max(s.width/2,0.01),0,-px/Math.max(s.width/2,0.01)]],
      [b,c,[dx/len,0,dz/len]],[d,a,[-dx/len,0,-dz/len]]])
      m.quad(lower(p),lower(q),q,p,n,col.map(x=>x*0.65));
    if(s.walk!==false){floorTri(a,b,c);floorTri(a,c,d);}
    // Underslung ribs and edge bands visibly support the walkway rather than
    // making an unsupported paper-thin rectangle.
    const trim=(u,v)=>[s.a[0]+dx*u+px*v,s.a[1]+0.035,s.a[2]+dz*u+pz*v];
    for(const side of [-0.91,0.91]){
      const x=trim(0,side),y=trim(1,side);
      m.quad(x,y,[y[0],y[1]+0.04,y[2]],[x[0],x[1]+0.04,x[2]],
        [0,1,0],col.map(k=>k*1.17));
    }
  }
  const pillarCylinders=[];
  for(const p of L.pillars || []){
    const count=Math.max(12,Math.min(64,p.segments|0));
    const m=materialMesh(p.mat),baseColor=MATERIALS[p.mat]||MATERIALS.rockDark;
    pillarCylinders.push({cx:p.cx,cz:p.cz,radius:p.radius,y0:p.y0,y1:p.y1});
    for(let i=0;i<count;i++){
      const a=i*2*Math.PI/count,b=(i+1)*2*Math.PI/count;
      const mid=(a+b)/2,n=[Math.cos(mid),0,Math.sin(mid)];
      // Seal the tower top rather than leaving a visibly hollow cylinder.
      // Cap is render-only when above combat height; the annular gallery
      // remains the only intended traverse-able support in this level.
      m.quad([p.cx,p.y1,p.cz],
        polar(p.cx,p.cz,p.radius,a,p.y1),
        polar(p.cx,p.cz,p.radius,b,p.y1),
        [p.cx,p.y1,p.cz],[0,1,0],
        baseColor.map(k=>k*(0.83+0.06*(i%3))));
      const xz0=polar(p.cx,p.cz,p.radius,a,0),
        xz1=polar(p.cx,p.cz,p.radius,b,0);
      wallRect([xz0[0],xz0[2]],[xz1[0],xz1[2]],p.y0,p.y1,n);
      const courses=Math.ceil((p.y1-p.y0)/2.8);
      for(let row=0;row<courses;row++){
        const y0=p.y0+(p.y1-p.y0)*row/courses;
        const y1=p.y0+(p.y1-p.y0)*(row+1)/courses;
        const raised=(i+row)%3===0?0.13:0.05;
        const q0=polar(p.cx,p.cz,p.radius+raised,a+0.001,y0+0.06),
              q1=polar(p.cx,p.cz,p.radius+raised,b-0.001,y0+0.06),
              q2=polar(p.cx,p.cz,p.radius+raised,b-0.001,y1-0.06),
              q3=polar(p.cx,p.cz,p.radius+raised,a+0.001,y1-0.06);
        const tintK=0.82+0.14*Math.sin(i*7.1+row*2.2)**2;
        m.quad(q0,q1,q2,q3,n,baseColor.map(k=>k*tintK));
        m.quad(polar(p.cx,p.cz,p.radius,a,y0),polar(p.cx,p.cz,p.radius,b,y0),
          polar(p.cx,p.cz,p.radius,b,y1),polar(p.cx,p.cz,p.radius,a,y1),n,
          baseColor.map(k=>k*0.58));
      }
    }
  }
  // Non-repeated, faceted eroded rock spires: fractured radial rings and
  // per-face striation shading. These stay decorative beside walkable routes.
  for(const rock of L.crags || []){
    const {x,z,radius,height,segments=11,seed=1,mat='strataRock'}=rock;
    const m=materialMesh(mat),color=MATERIALS[mat]||MATERIALS.rock;
    const angleShift=seed*0.00001;
    const vary=(i,k)=>hash(i+seed*0.017,k+seed*0.019,seed*0.003);
    const n=Math.max(7,Math.min(19,segments|0));
    // Real-world crags are eroded shelves with broad staggered shoulders,
    // not skyscraper-like cones with one pointed pixel at the top. Different
    // angular samples, several radial rings and irregular heights create
    // visible fractured strata. All mesh triangles use face normals.
    const rings=[0,.20,.47,.72,.88];
    const shoulders=[1.24,1.15,.96,.76,.44];
    const vertex=(i,j)=>{
      const t=i*2*Math.PI/n+angleShift+(.03*j)*Math.sin(i*2.41+seed*.001);
      const v=rings[j],rad=radius*shoulders[j]*(.79+.38*vary(i,j));
      const ridge=(vary(i,j+7)-.5)*(.10+.095*j);
      return [x+Math.cos(t)*rad,height*Math.max(0,v+ridge),
        z+Math.sin(t)*rad];
    };
    const normal=(a,b,c)=>{
      const e=b.map((v,i)=>v-a[i]),f=c.map((v,i)=>v-a[i]);
      const q=[e[1]*f[2]-e[2]*f[1],e[2]*f[0]-e[0]*f[2],e[0]*f[1]-e[1]*f[0]];
      const l=Math.hypot(...q)||1;return q.map(v=>v/l);
    };
    for(let j=0;j<4;j++)for(let i=0;i<n;i++){
      const a=vertex(i,j),b=vertex(i+1,j),c=vertex(i+1,j+1),d=vertex(i,j+1);
      const shade=.66+.29*vary(i,j+11);
      const tintColor=color.map(v=>v*shade);
      m.triangle(a,b,c,normal(a,b,c),tintColor);
      m.triangle(a,c,d,normal(a,c,d),color.map(v=>v*(shade*.83)));
    }
    // Cap the summit with broad, irregular broken shelves. Avoid pin-point
    // tips and the visibly open holes in the original crag generator.
    const top=[x,height*.89,z];
    for(let i=0;i<n;i++){
      const a=vertex(i,4),b=vertex(i+1,4);
      const shade=.71+.19*vary(i,15);
      m.triangle(top,a,b,normal(top,a,b),color.map(v=>v*shade));
    }
  }
  // True round 3D tubes: perpendicular basis works for vertical, horizontal
  // and diagonal pipes. Their curved surface catches metallic highlights.
  for(const pipe of L.pipes || []){
    const {a,b,radius,mat='steelGloss',segments=12}=pipe;
    const axis=b.map((v,i)=>v-a[i]),len=Math.hypot(...axis);
    if(len<.001)continue;
    const d=axis.map(v=>v/len),ref=Math.abs(d[1])<.85?[0,1,0]:[0,0,1];
    let v=[d[1]*ref[2]-d[2]*ref[1],d[2]*ref[0]-d[0]*ref[2],d[0]*ref[1]-d[1]*ref[0]];
    const vl=Math.hypot(...v)||1;v=v.map(q=>q/vl);
    const w=[d[1]*v[2]-d[2]*v[1],d[2]*v[0]-d[0]*v[2],d[0]*v[1]-d[1]*v[0]];
    const ring=(pt,angle)=>pt.map((q,i)=>q+radius*(Math.cos(angle)*v[i]+Math.sin(angle)*w[i]));
    const c=MATERIALS[mat]||MATERIALS.steelGloss,
      m=pipe.ownerWallFallback?surface('sumiOwnerWallFallback'):
        pipe.glbHallFallback?surface('sumiGLBWallFallback'):materialMesh(mat),
      n=Math.max(8,Math.min(28,segments|0));
    for(let i=0;i<n;i++){
      const theta=i*2*Math.PI/n,phi=(i+1)*2*Math.PI/n,mid=(theta+phi)/2;
      const norm=v.map((q,j)=>q*Math.cos(mid)+w[j]*Math.sin(mid));
      m.quad(ring(a,theta),ring(a,phi),ring(b,phi),ring(b,theta),norm,c);
    }
  }
  for (const d of L.deco || []) {
    if(d.glbHallFallback || d.ownerWallFallback){
      // Corridor and owner-chamber originals have independent fallback
      // batches. One successful download must never blank the other area.
      const color=d.glow?(GLOWS[d.glow]||[1,1,1]):tint(d.mat,d.min);
      surface(d.ownerWallFallback?'sumiOwnerWallFallback':'sumiGLBWallFallback')
        .box(d.min,d.max,color,{noBottom:d.min[1]<=.01});
    } else if (d.glow) glowMesh(d.glow).box(d.min, d.max, GLOWS[d.glow].map(k => k * 0.85), { foot: 1 });
    else materialMesh(d.mat).box(d.min, d.max, tint(d.mat, d.min), { noBottom: d.min[1] <= 0.01 });
  }
  const doorMeshes = (L.doors || []).map(d => {
    const m = meshBuilder(), w = [d.max[0] - d.min[0], d.max[1] - d.min[1], d.max[2] - d.min[2]], c = MATERIALS[d.mat || 'door'];
    m.box([0, 0, 0], w, c, { foot: 0.8 });
    // hazard stripe + status light on both faces
    const thinX = w[0] < w[2], s = 0.02;
    const stripe = thinX ? [[-s, w[1] * 0.08, 0], [w[0] + s, w[1] * 0.16, w[2]]] : [[0, w[1] * 0.08, -s], [w[0], w[1] * 0.16, w[2] + s]];
    m.box(stripe[0], stripe[1], MATERIALS.hazard, { foot: 1 });
    return { id: d.id, mesh: m.build(), origin: d.min.slice() };
  });
  for (const l of L.lamps || []) glowMesh(l.glow || 'orange').box([l.p[0] - 0.14, l.p[1] - 0.1, l.p[2] - 0.14], [l.p[0] + 0.14, l.p[1] + 0.1, l.p[2] + 0.14], GLOWS[l.glow || 'orange'], { foot: 1 });
  // energy bridges: no collision triangles (LevelSpace.floorAt carries you while one is on); a hard-light deck with
  // bright edges and cross bars, drawn only while it is on
  const bridgeMeshes = (L.bridges || []).map(b => {
    const m = meshBuilder(), deck = [0.42, 0.78, 1], edge = [0.85, 0.96, 1], alongX = b.x1 - b.x0 >= b.z1 - b.z0;
    m.box([b.x0, b.y - 0.1, b.z0], [b.x1, b.y, b.z1], deck, { foot: 0.8 });
    if (alongX) { m.box([b.x0, b.y, b.z0], [b.x1, b.y + 0.03, b.z0 + 0.1], edge, { foot: 1 }); m.box([b.x0, b.y, b.z1 - 0.1], [b.x1, b.y + 0.03, b.z1], edge, { foot: 1 }); for (let x = b.x0 + 1.5; x < b.x1 - 0.5; x += 2) m.box([x, b.y, b.z0], [x + 0.08, b.y + 0.02, b.z1], edge, { foot: 1 }); }
    else { m.box([b.x0, b.y, b.z0], [b.x0 + 0.1, b.y + 0.03, b.z1], edge, { foot: 1 }); m.box([b.x1 - 0.1, b.y, b.z0], [b.x1, b.y + 0.03, b.z1], edge, { foot: 1 }); for (let z = b.z0 + 1.5; z < b.z1 - 0.5; z += 2) m.box([b.x0, b.y, z], [b.x1, b.y + 0.02, z + 0.08], edge, { foot: 1 }); }
    return { id: b.id, mesh: m.build() };
  });

  return {
    name: L.name || 'level', detailedMaterials: !!L.detailedMaterials, tris, solids, clips, pillarCylinders,
    doors: (L.doors || []).map(d => ({ id: d.id, min: d.min, max: d.max, open: !!d.open })),
    interiors: L.interiors || [], zones: L.zones || [], props: L.props || [], interactables: L.interactables || [],
    lamps: (L.lamps || []).map(l => ({ p: l.p, c: l.c || GLOWS[l.glow || 'orange'] })),
    // High-detail decorative GLB placements: NEVER added to collision solids.
    wallPanelInstances: L.wallPanelInstances || [],
    ownerWallInstances: L.ownerWallInstances || [],
    playerSpawn: L.playerSpawn || [0, 0, 0], playerYaw: L.playerYaw || 0, navBounds: L.navBounds, navProbe: L.navProbe ?? null, env: L.env || null,
    render: { base: base.build(), glows: [...glows].map(([name, m]) => ({ glow: GLOWS[name], mesh: m.build() })),
      surfaces: [...surfaces].map(([material,m])=>({material,mesh:m.build()})) }, doorMeshes,
    // arenas: switchable bridges, kill height, where each team starts (and faces) and the free-for-all spawn points
    bridges: (L.bridges || []).map(b => ({ id: b.id, label: b.label || b.id, x0: b.x0, z0: b.z0, x1: b.x1, z1: b.z1, y: b.y ?? 0 })), bridgeMeshes,
    killY: L.killY ?? null, teamHomes: L.teamHomes || null, teamYaw: L.teamYaw || null, ffaSpawns: L.ffaSpawns || null, duelSpawns: L.duelSpawns || null, music: L.music || null,
  };
}
