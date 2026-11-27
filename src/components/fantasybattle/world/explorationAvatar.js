import * as THREE from 'three';
// Low-poly articulated exploration prototype; not the final painted combat puppet.
// Reuse geometry/materials within this avatar; world disposal traverses every mesh.
export function makeExplorationAvatar(tint=0xffffff){
 const root=new THREE.Group(),facing=new THREE.Group(),hips=new THREE.Group(),torso=new THREE.Group();
 root.name='FantasyBattle_ExplorationAvatar';root.add(facing);facing.add(hips);hips.position.y=.79;hips.add(torso);
 const cloth=new THREE.MeshStandardMaterial({color:tint,roughness:.85}),dark=new THREE.MeshStandardMaterial({color:0x23354e,roughness:.9}),gold=new THREE.MeshStandardMaterial({color:0xbda274,roughness:.6}),skin=new THREE.MeshStandardMaterial({color:0xd5b197,roughness:.92}),hair=new THREE.MeshStandardMaterial({color:0x34445b,roughness:1});
 const boxGeo=new THREE.BoxGeometry(1,1,1),sphere=new THREE.SphereGeometry(1,8,6),taper=new THREE.CylinderGeometry(.8,1,1,7);
 const part=(parent,geo,mat,x,y,z,sx,sy,sz)=>{const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);m.scale.set(sx,sy,sz);parent.add(m);return m;};
 part(torso,taper,cloth,0,.29,0,.25,.57,.19);
 part(torso,boxGeo,gold,0,.06,0,.46,.065,.32);
 part(torso,sphere,skin,0,.72,0,.17,.19,.15);
 part(torso,sphere,hair,0,.79,-.036,.18,.13,.16);
 part(torso,boxGeo,dark,0,.60,-.13,.20,.24,.09);
 const joint=(parent,x,y,z)=>{const g=new THREE.Group();g.position.set(x,y,z);parent.add(g);return g;};
 const limbs={};
 for(const [side,sign] of [['L',-1],['R',1]]){
  const thigh=joint(hips,sign*.125,0,0),knee=joint(thigh,0,-.37,0);
  part(thigh,taper,cloth,0,-.18,0,.105,.37,.105);
  part(knee,taper,dark,0,-.17,0,.085,.35,.085);
  part(knee,boxGeo,dark,0,-.37,.055,.17,.11,.27);
  const arm=joint(torso,sign*.29,.48,0),elbow=joint(arm,0,-.27,0);
  part(arm,sphere,cloth,0,-.045,0,.13,.13,.12);
  part(arm,taper,cloth,0,-.15,0,.076,.24,.076);
  part(elbow,taper,dark,0,-.12,0,.07,.24,.07);
  part(elbow,sphere,skin,0,-.265,0,.075,.08,.07);
  limbs['thigh'+side]=thigh;limbs['knee'+side]=knee;limbs['arm'+side]=arm;limbs['elbow'+side]=elbow;
 }
 const cape=joint(torso,0,.48,-.19);part(cape,boxGeo,dark,0,-.29,-.02,.48,.61,.045);
 // Simple stowed bow: local geometry, not a projectile or an extra gameplay weapon.
 const bow=new THREE.Mesh(new THREE.TorusGeometry(.28,.021,4,12,Math.PI*1.25),gold);bow.rotation.z=-.45;bow.position.set(.19,.22,-.24);torso.add(bow);
 const light=new THREE.PointLight(0xfff0cc,2.4,15,1.4);light.position.set(0,1.8,1.2);root.add(light);
 root.userData.setAppearance=value=>cloth.color.setHex(value);
 root.userData.applyPose=(s)=>{const p=s.pose;facing.rotation.y=s.heading;hips.position.y=.79+p.hipY;torso.rotation.x=p.lean;cape.rotation.x=-p.cape;
  for(const [name,g] of Object.entries(limbs))g.rotation.x=p[name]||0;};
 return root;
}
