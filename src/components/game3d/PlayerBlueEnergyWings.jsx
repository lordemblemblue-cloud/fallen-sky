// Game 3D's shared blue-energy wing skin. Cosmetic only: the canonical
// Wings store still owns equip/levels/stat calculations for every faction.
import {useEffect} from 'react';
import * as THREE from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader';
import {subscribeWings} from './progression/wingsStore';
import {getPlayerPosition} from './playerPositionStore';
import {GAME3D_SHARED_SPIRITUAL_ASSETS} from './axe/factions/AXEFactionMountAssets.mjs';

export const BLUE_ANGEL_WING_SCALE = 2.8; // uploaded mesh is 1.0 unit wide
const BACK_OFFSET = 0.34;
const BACK_Y = 1.02;

export default function PlayerBlueEnergyWings() {
  useEffect(()=>{
    let alive=true,scene=null,group=null,model=null,loading=false,failed=false;
    let frame=null,enabled=false,elapsed=0,requestVersion=0;
    const disposeModel=object=>{
      object?.traverse?.(node=>{
        node.geometry?.dispose?.();
        const mats=node.material?(Array.isArray(node.material)?node.material:[node.material]):[];
        mats.forEach(material=>{
          for(const key of ['map','normalMap','emissiveMap','metalnessMap','roughnessMap','aoMap']) material[key]?.dispose?.();
          material.dispose?.();
        });
      });
    };
    const attach=()=>{
      const nextScene=window.__gw3dScene;
      if(!nextScene)return false;
      if(group?.parent===nextScene)return true;
      if(group?.parent)group.parent.remove(group);
      scene=nextScene;
      if(!group){group=new THREE.Group();group.name='PlayerBlueAngelWingsGLB';}
      scene.add(group);
      return true;
    };
    const load=()=>{
      if(!alive||model||loading||failed||!enabled||!attach())return;
      loading=true;
      const version=++requestVersion;
      new GLTFLoader().load(GAME3D_SHARED_SPIRITUAL_ASSETS.blueEnergyWings,gltf=>{
        loading=false;
        const root=gltf.scene||gltf.scenes?.[0];
        if(!root)return;
        if(!alive||version!==requestVersion){disposeModel(root);return;}
        // Y-up source is a genuine energy-feather mesh; preserve its proportions.
        root.name='BlueAngelEnergyFeathers';
        root.scale.setScalar(BLUE_ANGEL_WING_SCALE);
        root.position.set(0,-0.14,0);
        root.traverse(node=>{
          if(!node.isMesh)return;
          node.castShadow=false;
          node.receiveShadow=false;
          node.frustumCulled=true;
        });
        model=root;
        group.add(root);
      },undefined,error=>{
        if(!alive||version!==requestVersion)return;
        loading=false;failed=true;
        console.warn('[Game 3D Wings] Blue GLB unavailable; select Classic Energy Wings in Spirituality.',error);
      });
    };
    const unsub=subscribeWings(state=>{
      const id=state.equippedPathId;
      const level=id?Number(state.paths[id]?.level||0):0;
      enabled=state.visualStyle==='blue_energy'&&Boolean(id)&&level>0;
      if(group)group.visible=enabled&&Boolean(model);
      if(enabled)load();
    });
    const onSceneReady=()=>{attach();if(enabled)load();};
    window.addEventListener('gw3dSceneReady',onSceneReady);
    onSceneReady();
    let last=performance.now();
    const tick=()=>{
      if(!alive)return;
      frame=requestAnimationFrame(tick);
      const now=performance.now();
      const delta=Math.min(.1,Math.max(0,(now-last)/1000));
      last=now;
      if(!group||!enabled||!model){if(group)group.visible=false;return;}
      if(window.__gw3dScene&&group.parent!==window.__gw3dScene)attach();
      const pos=window.__localPlayerPos;
      if(!pos){group.visible=false;return;}
      group.visible=true;
      const yaw=Number(getPlayerPosition().yaw)||0;
      group.position.set(pos.x-Math.sin(yaw)*BACK_OFFSET,pos.y+BACK_Y,pos.z-Math.cos(yaw)*BACK_OFFSET);
      group.rotation.y=yaw;
      elapsed+=delta;
      // Small movement of the whole energy structure; no fake animation rig.
      model.position.y=-.14+Math.sin(elapsed*1.4)*.015;
    };
    frame=requestAnimationFrame(tick);
    return ()=>{
      alive=false;requestVersion++;
      if(frame!==null)cancelAnimationFrame(frame);
      window.removeEventListener('gw3dSceneReady',onSceneReady);
      unsub();
      if(group?.parent)group.parent.remove(group);
      disposeModel(group);
    };
  },[]);
  return null;
}
