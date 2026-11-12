// One cached Baby Wolf asset is the source for ALL faction mount locomotion.
// This loads the existing GLTF (+ its .bin and textures) once and extracts its
// idle/walk/run animation tracks without modifying the original Baby Wolf.
import * as THREE from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {FBXLoader} from 'three/examples/jsm/loaders/FBXLoader.js';
import {getCompanionById,createCompanionLoadingManager} from './companionData';
import {loadCompanionFolderClips} from './companionAnimationLoader';
import {extractBabyWolfMotions,retargetBabyWolfMotions} from './companionWolfMotionRetarget.mjs';

let cachedBabyWolf=null;
async function loadBabyWolf(){
  const def=getCompanionById('shadow_wolf');
  if(!def?.modelUrl)throw Error('Baby Wolf mount animation source unavailable');
  const manager=createCompanionLoadingManager(THREE,def);
  const loader=new GLTFLoader(manager||undefined);
  const gltf=await new Promise((resolve,reject)=>
    loader.load(def.modelUrl,resolve,undefined,reject));
  const root=gltf.scene||gltf.scenes?.[0];
  let clips=gltf.animations||[];
  let found=extractBabyWolfMotions(clips);
  if(Object.keys(found).length<3){
    // Some baby-wolf bundles store their idle/walk/run as three admin FBXs.
    // Use the existing companion admin library to fill any missing motions.
    try {
      const external=await loadCompanionFolderClips(new FBXLoader());
      const externalNamed=extractBabyWolfMotions(external);
      clips=clips.concat(['idle','walk','run']
        .filter(k=>!found[k]&&externalNamed[k]).map(k=>externalNamed[k]));
    }catch(error){
      console.warn('Baby Wolf external animation clips unavailable:',error);
    }
  }
  return {root,clips};
}
export async function getSharedBabyWolfAnimations(){
  if(!cachedBabyWolf){
    cachedBabyWolf=loadBabyWolf().catch(error=>{
      cachedBabyWolf=null;
      throw error;
    });
  }
  return cachedBabyWolf;
}
export async function loadWolfMotionsForMount(targetRoot,{sourceLoader=getSharedBabyWolfAnimations}={}){
  let source;
  try{source=await sourceLoader();}
  catch(error){
    console.warn('Baby Wolf source unavailable; using rig-local fallback gait:',error);
    source={root:null,clips:[]};
  }
  return retargetBabyWolfMotions(source.root,source.clips,targetRoot);
}
