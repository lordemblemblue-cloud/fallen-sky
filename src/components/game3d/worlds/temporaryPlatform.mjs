// Temporary staging world; switch off when the replacement map is ready.
export const FALLEN_SKY_PLATFORM_MODE=true;
export const PLATFORM_REGION='temporary-platform';
export const PLATFORM_SIZE=24;
export const PLATFORM_EDGE=PLATFORM_SIZE/2-.8;
export const isPlatformRegion=region=>region===PLATFORM_REGION;
export function clampPlatformPosition(x,z){
 const clamp=v=>Math.max(-PLATFORM_EDGE,Math.min(PLATFORM_EDGE,Number.isFinite(v)?v:0));
 return {x:clamp(x),z:clamp(z)};
}
export function insidePlatform(x,z){return Number.isFinite(x)&&Number.isFinite(z)&&Math.abs(x)<=PLATFORM_EDGE&&Math.abs(z)<=PLATFORM_EDGE;}
export function createTemporaryPlatform(THREE,scene){
 const mesh=new THREE.Mesh(new THREE.PlaneGeometry(PLATFORM_SIZE,PLATFORM_SIZE),new THREE.MeshStandardMaterial({color:0x777b80,roughness:.95,side:THREE.DoubleSide}));
 mesh.name='FallenSky_TemporaryPlatform';mesh.rotation.x=-Math.PI/2;mesh.receiveShadow=true;
 scene.add(mesh);mesh.updateMatrixWorld(true);return mesh;
}
