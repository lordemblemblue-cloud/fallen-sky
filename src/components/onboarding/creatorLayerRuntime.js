import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { applyTattooLayer } from '@/components/onboarding/creatorSurfaceRuntime';
const valid=asset=>typeof asset?.file_url==='string'&&/^\/models\/characters\/fused\/(hair|tattoos)\/[a-zA-Z0-9_-]+\.(glb|png)$/.test(asset.file_url);
export class CreatorLayerRuntime {
 constructor(model){this.model=model;this.version=0;this.selected='';this.hair=null;this.pending=null;this.disposed=false;}
 async update(appearance){
  const chosen=(appearance.customization_assets||[]).find(a=>a.id===appearance.selected_assets?.hair&&a.slot==='hair');
  const key=valid(chosen)?chosen.id:'';
  if(this.selected!==key){
   this.selected=key;const version=++this.version;
   if(this.hair){this.model.remove(this.hair);disposeLayer(this.hair);this.hair=null;}
   this.model.traverse(n=>{if(n.name==='Hair_Default')n.visible=!key;});
   this.pending=key?new GLTFLoader().loadAsync(chosen.file_url).then(asset=>{
    if(this.disposed||version!==this.version){disposeLayer(asset.scene);return;}
    const layer=clone(asset.scene),bones=new Map();this.model.traverse(n=>{if(n.isBone)bones.set(n.name,n);});
    layer.traverse(n=>{if(!n.isSkinnedMesh)return;const source=n.skeleton.bones;const targets=source.map(b=>bones.get(b.name));if(targets.some(b=>!b))throw new Error('This hair layer does not match the selected body.');n.bind(new THREE.Skeleton(targets,n.skeleton.boneInverses),n.bindMatrix);n.frustumCulled=false;});
    this.model.add(layer);this.hair=layer;
   }):null;
  }
  if(this.pending)await this.pending;
  if(this.disposed)return;
  const tattoo=(appearance.customization_assets||[]).find(a=>a.id===appearance.selected_assets?.tattoo&&a.slot==='tattoo');
  await applyTattooLayer(this.model,valid(tattoo)?tattoo:null,appearance);
 }
 dispose(){this.disposed=true;++this.version;if(this.hair){this.model.remove(this.hair);disposeLayer(this.hair);}this.hair=null;}
}
function disposeLayer(root){root?.traverse(n=>{n.geometry?.dispose();(Array.isArray(n.material)?n.material:[n.material]).filter(Boolean).forEach(m=>m.dispose());});}