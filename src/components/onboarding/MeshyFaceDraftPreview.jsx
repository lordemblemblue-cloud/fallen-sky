import {useEffect,useRef,useState} from 'react';
import * as THREE from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {OrbitControls} from 'three/examples/jsm/controls/OrbitControls.js';

/** Isolated preview. Generated topology is not silently swapped onto the
 * live skinned character: the neck seam, rig and facial blend shapes require
 * an explicit retarget/verification step to prevent broken characters. */
export default function MeshyFaceDraftPreview({url}) {
  const mount=useRef(null);
  const [message,setMessage]=useState('Loading generated 3D head…');
  useEffect(()=>{
    if(!url||!mount.current)return undefined;
    let alive=true,frame=0,model=null;
    const scene=new THREE.Scene();
    const camera=new THREE.PerspectiveCamera(36,1,.02,100);
    const renderer=new THREE.WebGLRenderer({alpha:true,antialias:true});
    renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.5));
    renderer.outputColorSpace=THREE.SRGBColorSpace;
    renderer.setClearColor(0x000000,0);
    renderer.domElement.style.cssText='width:100%;height:100%;display:block';
    mount.current.appendChild(renderer.domElement);
    scene.add(new THREE.HemisphereLight(0xe5f7ff,0x29334a,2.3));
    const key=new THREE.DirectionalLight(0xffffff,2.6);key.position.set(2,4,3);scene.add(key);
    const fill=new THREE.DirectionalLight(0x88cafa,1.4);fill.position.set(-3,1,-2);scene.add(fill);
    camera.position.set(0,.22,3.3);
    const controls=new OrbitControls(camera,renderer.domElement);
    controls.enablePan=false;controls.enableDamping=true;controls.minDistance=.7;controls.maxDistance=7;
    let observer;
    const resize=()=>{
      if(!alive||!mount.current)return;
      const w=Math.max(1,mount.current.clientWidth),h=Math.max(1,mount.current.clientHeight);
      camera.aspect=w/h;camera.updateProjectionMatrix();renderer.setSize(w,h,false);
    };
    observer=new ResizeObserver(resize);observer.observe(mount.current);resize();
    new GLTFLoader().load(url,gltf=>{
      if(!alive)return;
      model=gltf.scene;
      const bounds=new THREE.Box3().setFromObject(model);
      const dimensions=bounds.getSize(new THREE.Vector3());
      const center=bounds.getCenter(new THREE.Vector3());
      const max=Math.max(dimensions.x,dimensions.y,dimensions.z);
      if(!Number.isFinite(max)||max<.001){setMessage('The generated model is empty.');return}
      model.position.sub(center);
      const scale=1.8/max;model.scale.multiplyScalar(scale);
      scene.add(model);
      controls.target.set(0,0,0);
      camera.position.set(0,.08,Math.max(2.4,3.2*max/Math.max(max,.1)));
      controls.update();setMessage('');
    },undefined,()=>{if(alive)setMessage('Could not load the 3D draft. Use its thumbnail instead.');});
    const tick=()=>{if(!alive)return;frame=requestAnimationFrame(tick);controls.update();renderer.render(scene,camera);};
    tick();
    return()=>{
      alive=false;cancelAnimationFrame(frame);observer?.disconnect();controls.dispose();
      model?.traverse(node=>{
        node.geometry?.dispose?.();
        const materials=Array.isArray(node.material)?node.material:[node.material];
        materials.forEach(mat=>{
          if(!mat)return;
          for(const value of Object.values(mat))if(value?.isTexture)value.dispose?.();
          mat.dispose?.();
        });
      });
      renderer.dispose();renderer.domElement.remove();
    };
  },[url]);
  return <div className="genesis-meshy-head-stage" aria-label="Orbitable Meshy three-dimensional face draft" role="img">
    <div ref={mount} className="genesis-meshy-head-stage-canvas"/>
    {message&&<p role="status">{message}</p>}
  </div>;
}
