/**
 * LAND-WS12 - optional, editor-only Wolfveil WV-R08-C06 dirt-road VISUAL.
 * This is NOT imported/mounted by the live scene. WS15 owns a preview-only
 * integration decision. The resulting mesh is exactly one draw call, visual
 * only, with no colliders, raycast targets or server-side positions.
 *
 * Coordinates are authored Wolfveil-local (including Z); parent the mesh under
 * the EXISTING Wolfveil mount transform (+70 Z). Never add another +70 here.
 */
import {WOLFVEIL_R08_C06, inWolfveilR08C06} from './WolfveilR08C06Declutter.mjs';

function validPoint(point) {
  return point && Number.isFinite(point.x) && Number.isFinite(point.y) &&
    Number.isFinite(point.z) && inWolfveilR08C06(point.x, point.z);
}
function colorAt(THREE, x, z, style) {
  // Low-frequency soil variation without extra meshes, materials or textures.
  const variation = .5 + .26*Math.sin(.11*x+.19*z) + .24*Math.sin(.031*x-.07*z);
  const index = variation < .38 ? 2 : variation < .63 ? 0 : 1;
  return new THREE.Color(style.dirtColors[index]);
}

/** Returns a single non-collidable Three.js mesh or null for no ribbons. */
export function createWolfveilR08C06PreviewDirt(THREE, plan) {
  if(!THREE?.BufferGeometry || !THREE?.Float32BufferAttribute ||
     !THREE?.Mesh || !THREE?.MeshStandardMaterial || !THREE?.Color)
    throw new TypeError('A complete THREE namespace is required');
  if(plan?.id !== WOLFVEIL_R08_C06.id || plan?.dirtPath?.sourceFrame !== true ||
     plan?.dirtPath?.playZOffsetApplied !== false ||
     plan?.dirtPath?.collisionsAdded !== 0)
    throw new Error('Only a local-frame, collision-free WV-R08-C06 plan is allowed');
  const ribbons=plan.dirtPath.ribbons;
  if(!Array.isArray(ribbons)) throw new TypeError('Dirt ribbons missing');
  if(!ribbons.length) return null;
  const style=plan.dirtPath.style;
  if(!Array.isArray(style?.dirtColors) || style.dirtColors.length < 3)
    throw new TypeError('Compacted dirt palette is missing');
  const positions=[], colors=[], uvs=[], indices=[];
  let triangleCount=0;
  for(const ribbon of ribbons) {
    const points=ribbon?.points;
    if(ribbon?.nonCollider !== true || ribbon?.decorativeOnly !== true ||
       !Array.isArray(points) || points.length < 2)
      throw new Error('Unsafe or malformed dirt ribbon');
    const startVertex=positions.length/3;
    let distance=0;
    for(let i=0;i<points.length;i++) {
      const {left,right}=points[i] || {};
      if(!validPoint(left)||!validPoint(right))
        throw new Error('Dirt ribbon has an invalid or out-of-square vertex');
      if(i>0) {
        const prev=points[i-1],cx=(left.x+right.x)*.5, cz=(left.z+right.z)*.5;
        const px=(prev.left.x+prev.right.x)*.5, pz=(prev.left.z+prev.right.z)*.5;
        distance+=Math.hypot(cx-px,cz-pz);
      }
      const soil=colorAt(THREE,(left.x+right.x)*.5,(left.z+right.z)*.5,style);
      for(const [u,p] of [[0,left],[1,right]]) {
        positions.push(p.x,p.y,p.z);
        colors.push(soil.r,soil.g,soil.b);
        uvs.push(u,distance/2.5);
      }
    }
    for(let i=0;i<points.length-1;i++) {
      const a=startVertex+2*i,b=a+1,c=a+2,d=a+3;
      const left=points[i].left,right=points[i].right,next=points[i+1].left;
      // Correctly orient the top-facing triangles in +Y, even on reversed roads.
      const signed=(right.x-left.x)*(next.z-left.z)-(right.z-left.z)*(next.x-left.x);
      if(signed>=0) indices.push(a,c,b,b,c,d);
      else indices.push(a,b,c,b,d,c);
      triangleCount+=2;
    }
  }
  if(triangleCount!==plan.dirtPath.triangles)
    throw new Error('Dirt surface triangle count does not match the audit plan');
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const material=new THREE.MeshStandardMaterial({
    vertexColors:true, roughness:style.roughness, metalness:style.metalness,
    side:THREE.DoubleSide, polygonOffset:true, polygonOffsetFactor:-1,
    polygonOffsetUnits:-1, depthWrite:true,
  });
  const mesh=new THREE.Mesh(geometry,material);
  mesh.name='EditorPreview_Wolfveil_WV-R08-C06_DirtRoad';
  mesh.userData={
    tile:'WV-R08-C06', origin:'wolfveil-local', previewOnly:true,
    decorativeOnly:true, nonCollider:true, collisionsAdded:0,
    serverCollisionChanged:false, triangles:triangleCount,
  };
  mesh.raycast=()=>{}; // Never intercept gameplay clicks or raycast targeting.
  return {mesh,drawCalls:1,triangles:triangleCount,collisionsAdded:0};
}
