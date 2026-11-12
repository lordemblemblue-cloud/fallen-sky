import {AvatarCustomizationRuntime} from './customizationRuntime';
import * as THREE from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {FBXLoader} from 'three/examples/jsm/loaders/FBXLoader.js';
import {companionModel,applyCompanionAppearance} from './genesisAssets';
import {creatorBody} from './avatarCustomization';
import {characterBodyBounds,FUSED_FEMALE_CHARACTER_MODEL_URL,FUSED_MALE_CHARACTER_MODEL_URL} from '@/lib/characterModelOverrides';
const customizations=new WeakMap();
// Fused Eve/Adam creator bodies are painted and recoloured by the creator
// runtime. Do NOT run them through applyCompanionAppearance: that older
// platform-avatar pass adds a second colour/style shader (including saturation,
// posterisation and global material tints) which the creator preview does not
// apply. It can make the same saved complexion bright orange/red in Game 3D.
//
// Keep the world-only scale controls without rewriting those skin materials.
export function applyFusedWorldProportions(model, appearance={}) {
 if(!model?.scale || !model?.userData)return;
 const base=model.userData.game3dFusedBaseScale ||
   (model.userData.game3dFusedBaseScale=model.scale.clone());
 const clamp=THREE.MathUtils.clamp;
 const number=(value,fallback)=>value == null || value === '' || !Number.isFinite(Number(value)) ? fallback : Number(value);
 const width=number(appearance.body_proportions?.width,1);
 const depth=number(appearance.body_proportions?.depth,1);
 const height=number(appearance.height_scale,1);
 model.scale.set(
   base.x*clamp(width,.88,1.12),
   base.y*clamp(height,.84,1.18),
   base.z*clamp(depth,.90,1.10),
 );
}

export async function loadAvatarModel(config={},height=1.8,game3dModelUrl=null){
 // The shared platform model stays canonical. Game 3D can explicitly request
 // only the allowlisted fused body matching this character's saved selection.
 const localBody=typeof config==='string'?null:creatorBody(config);
 const allowedWorldUrl=localBody?.gender==='female'?FUSED_FEMALE_CHARACTER_MODEL_URL:localBody?.gender==='male'?FUSED_MALE_CHARACTER_MODEL_URL:null;
 const fusedWorldBody=Boolean(allowedWorldUrl && game3dModelUrl===allowedWorldUrl && typeof config!=='string');
 const url=typeof config==='string'?config:fusedWorldBody?game3dModelUrl:companionModel(config);
 const asset=/\.fbx(?:\?|$)/i.test(url)?await new FBXLoader().loadAsync(url):await new GLTFLoader().loadAsync(url);
 const model=asset.scene||asset;model.animations=asset.animations||[];
 // glTF animation extras (clip speed, events) and the file's rig id; GLTFLoader keeps neither on its own.
 const json=asset.parser?.json;if(json){model.animations.forEach((clip,i)=>{const extras=json.animations?.[i]?.extras;if(extras&&typeof extras==='object')clip.userData={...clip.userData,...extras};});const rigId=json.extras?.rigId;if(typeof rigId==='string'){model.userData.rigId=rigId;model.userData.fusedCharacter=/^fused-/.test(rigId);}}
 let box=characterBodyBounds(model);
 model.scale.multiplyScalar(height/(box.max.y-box.min.y||1));box=characterBodyBounds(model);const center=box.getCenter(new THREE.Vector3());model.position.set(-center.x,-box.min.y,-center.z);
 model.traverse(n=>{if(n.isSkinnedMesh)n.frustumCulled=false;});
 // The in-world fused body must match the creator-stage pigment pipeline.
 // Shared platform avatars still use their original styling path.
 model.userData.game3dFusedCreatorBody=fusedWorldBody;
 if(fusedWorldBody)applyFusedWorldProportions(model,config);
 else applyCompanionAppearance(model,typeof config==='string'?{}:config);
 if(typeof config!=='string'){const customization=new AvatarCustomizationRuntime(model,{gender:config.gender,rigId:localBody?.rig_id||model.userData.rigId});customizations.set(model,customization);await customization.update(config);}
 return model;
}
export function disposeAvatarModel(model){customizations.get(model)?.dispose();customizations.delete(model);const textures=new Set(),materials=new Set(),geometries=new Set();model?.traverse(n=>{if(n.geometry)geometries.add(n.geometry);if(n.material)(Array.isArray(n.material)?n.material:[n.material]).forEach(m=>materials.add(m));n.skeleton?.dispose();});for(const m of materials){Object.values(m).forEach(t=>{if(t?.isTexture)textures.add(t);});m.dispose();}textures.forEach(t=>t.dispose());geometries.forEach(g=>g.dispose());}
export function applyPlayerAppearance(model,appearance){
 if(model?.userData?.game3dFusedCreatorBody)applyFusedWorldProportions(model,appearance);
 else applyCompanionAppearance(model,appearance);
 customizations.get(model)?.update(appearance);
}