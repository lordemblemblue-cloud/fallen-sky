import * as THREE from 'three';

const FAMILIES = new Set(['sword', 'bow', 'dual_blades', 'sky']);
const key = name => String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '').replace(/^mixamorig/, '');
const WEAPON_NAME = /weapon|sword|saber|blade|bow|rifle|staff|spear|axe/i;

function findHand(player, side) {
  // Exact aliases prevent LeftHandIndex3 from being mistaken for the wrist.
  const aliases = [`${side}HandSocket`, `${side}Hand`, `hand_${side === 'Left' ? 'l' : 'r'}`, `Bip01_${side[0]}_Hand`].map(key);
  const nodes = [];
  player?.traverse(node => { if (aliases.includes(key(node.name))) nodes.push(node); });
  return aliases.map(alias => nodes.find(node => key(node.name) === alias)).find(Boolean) || null;
}

function hasAuthoredWeapon(hands) {
  let found = false;
  for (const hand of hands) hand?.traverse(node => {
    if (found || node.isBone || node.isSkinnedMesh) return;
    for (let parent = node; parent && parent !== hand; parent = parent.parent) {
      if (parent.userData?.isMountedWeaponPresentation) return;
    }
    if (!node.userData?.isWeapon && !node.userData?.weapon && !WEAPON_NAME.test(node.name)) return;
    // Empty gameplay sockets are not visible weapons.
    node.traverse(child => {
      if (child.isMesh && child.geometry && !child.isSkinnedMesh) found = true;
    });
  });
  return found;
}

function buildWeapon(family, item) {
  const group = new THREE.Group();
  group.name = 'MountedEquippedWeapon';
  group.userData.isMountedWeaponPresentation = true;
  group.userData.isWeapon = true;
  group.userData.weaponInstanceId = item.instanceId || item.id;
  group.userData.weaponFamily = family;
  group.matrixAutoUpdate = false;
  const steel = new THREE.MeshStandardMaterial({ color:0xc5d5df, metalness:.88, roughness:.25 });
  const gold = new THREE.MeshStandardMaterial({ color:0xc4a25c, metalness:.8, roughness:.32 });
  const grip = new THREE.MeshStandardMaterial({ color:0x263944, metalness:.15, roughness:.76 });
  const resources = { geometries:new Set(), materials:new Set([steel,gold,grip]) };
  const add = (geometry, material, x=0,y=0,z=0, parent=group) => {
    const mesh = new THREE.Mesh(geometry,material);
    mesh.position.set(x,y,z); mesh.castShadow=true; mesh.receiveShadow=true;
    resources.geometries.add(geometry); resources.materials.add(material); parent.add(mesh);
    return mesh;
  };
  const shaft = (from,to,radius,material,parent=group) => {
    const direction = to.clone().sub(from);
    const mesh=add(new THREE.CylinderGeometry(radius,radius,direction.length(),8),material,0,0,0,parent);
    mesh.position.copy(from).add(to).multiplyScalar(.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),direction.normalize());
    return mesh;
  };
  const blade = (length, width, parent=group) => {
    const shape = new THREE.Shape();
    shape.moveTo(-width*.42,.12); shape.lineTo(-width*.5,.21);
    shape.lineTo(-width*.24,length*.82); shape.lineTo(0,length);
    shape.lineTo(width*.24,length*.82); shape.lineTo(width*.5,.21); shape.lineTo(width*.42,.12); shape.closePath();
    add(new THREE.ExtrudeGeometry(shape,{depth:.012,bevelEnabled:true,bevelSize:.003,bevelThickness:.003,bevelSegments:1,steps:1}),steel,0,0,-.006,parent);
    add(new THREE.CylinderGeometry(.018,.023,.2,10),grip,0,0,0,parent);
    add(new THREE.BoxGeometry(width*2.8,.028,.04),gold,0,.112,0,parent);
    add(new THREE.SphereGeometry(.027,10,6),gold,0,-.13,0,parent);
  };
  if (family==='sword') blade(1.02,.075);
  else if (family==='dual_blades') {
    // Both short blades are carried together in the free left hand while
    // riding; the right hand remains available for the mount's grip.
    for (const side of [-1,1]) {
      const knife=new THREE.Group(); knife.position.x=side*.024; knife.rotation.z=side*.11;
      group.add(knife); blade(.53,.06,knife);
    }
  } else if (family==='bow') {
    const curve=new THREE.CatmullRomCurve3([
      new THREE.Vector3(.13,-.59,0), new THREE.Vector3(-.04,-.37,0),
      new THREE.Vector3(0,0,0), new THREE.Vector3(-.04,.37,0), new THREE.Vector3(.13,.59,0),
    ]);
    add(new THREE.TubeGeometry(curve,28,.018,8,false),gold);
    add(new THREE.CylinderGeometry(.023,.023,.19,10),grip);
    shaft(new THREE.Vector3(.13,-.59,0),new THREE.Vector3(.13,.59,0),.0025,steel);
  } else if (/orb/i.test(`${item.name || ''} ${item.type || ''}`)) {
    const crystal=new THREE.MeshStandardMaterial({color:0x69c8df,emissive:0x186c8c,emissiveIntensity:.45,metalness:.45,roughness:.22});
    add(new THREE.IcosahedronGeometry(.13,1),crystal,0,.19,0);
    const halo=add(new THREE.TorusGeometry(.18,.009,6,32),gold,0,.19,0);
    halo.rotation.x=.7;
    add(new THREE.CylinderGeometry(.018,.025,.13,8),grip,0,-.03,0);
  } else {
    // The existing sky starter is the Painted Fan. This is a small family
    // presentation for the equipped item, not an authored item GLB or grant.
    const silk=new THREE.MeshStandardMaterial({color:0x397f91,side:THREE.DoubleSide,metalness:.18,roughness:.58});
    const vertices=[];
    const radius=.43, halfAngle=1.1, divisions=12;
    for(let i=0;i<divisions;i++) {
      const a=-halfAngle+2*halfAngle*i/divisions, b=-halfAngle+2*halfAngle*(i+1)/divisions;
      vertices.push(0,0,0,Math.sin(a)*radius,Math.cos(a)*radius,0,Math.sin(b)*radius,Math.cos(b)*radius,0);
    }
    const panel=new THREE.BufferGeometry(); panel.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3)); panel.computeVertexNormals();
    add(panel,silk);
    for(let i=0;i<=6;i++) {
      const angle=-halfAngle+2*halfAngle*i/6;
      shaft(new THREE.Vector3(),new THREE.Vector3(Math.sin(angle)*radius,Math.cos(angle)*radius,.003),.004,gold);
    }
    add(new THREE.CylinderGeometry(.018,.022,.14,8),grip,0,-.05,0);
  }
  return { group, resources };
}

/**
 * Read-only rendering of the caller's actual equipped weapon while riding.
 * Authored hand-attached meshes take precedence. Generated geometry has real
 * meter dimensions and is removed completely on item change or dismount.
 */
export function createMountedWeaponPresentation({ player } = {}) {
  const leftHand=findHand(player,'Left'), rightHand=findHand(player,'Right');
  let generated=null, identity=null, family=null, disposed=false;
  const clear = () => {
    if (!generated) return;
    generated.group.removeFromParent();
    generated.resources.geometries.forEach(geometry=>geometry.dispose());
    generated.resources.materials.forEach(material=>material.dispose());
    generated=null; identity=null; family=null;
  };
  const update = ({ item, family:nextFamily } = {}) => {
    const nextIdentity=item?.instanceId || item?.id;
    if (disposed || !leftHand || !nextIdentity || item?.equipped===false || !FAMILIES.has(nextFamily) ||
        hasAuthoredWeapon([leftHand,rightHand])) { clear(); return; }
    if (identity!==nextIdentity || family!==nextFamily) {
      clear(); generated=buildWeapon(nextFamily,item); identity=nextIdentity; family=nextFamily;
      leftHand.add(generated.group);
    }
    player.updateWorldMatrix(true,true);
    const determinant=leftHand.matrixWorld.determinant();
    if (!Number.isFinite(determinant) || Math.abs(determinant)<1e-12) { clear(); return; }
    const worldPosition=leftHand.getWorldPosition(new THREE.Vector3());
    const up=new THREE.Vector3(0,1,0);
    const forward=new THREE.Vector3(0,0,1).applyQuaternion(player.getWorldQuaternion(new THREE.Quaternion()));
    forward.y=0;
    if(forward.lengthSq()<1e-8) forward.set(0,0,1);
    forward.normalize();
    const right=up.clone().cross(forward).normalize();
    const worldOrientation=new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(right,up,forward));
    worldOrientation.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),.16));
    const worldMatrix=new THREE.Matrix4().compose(worldPosition,worldOrientation,new THREE.Vector3(1,1,1));
    // The full inverse also cancels nonuniform rig scales and shear. Wrist
    // bind axes cannot rotate or resize this meter-sized weapon in world space.
    generated.group.matrix.copy(leftHand.matrixWorld).invert().multiply(worldMatrix);
    generated.group.matrixWorldNeedsUpdate=true;
    generated.group.updateMatrixWorld(true);
  };
  const dispose = () => { clear(); disposed=true; };
  return {
    supported:!!leftHand,
    update,dispose,
    getStatus:()=>({leftHand,object:generated?.group || null,itemId:identity,family}),
  };
}
