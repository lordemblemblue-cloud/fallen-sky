import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createSceneRenderer, destroySceneRenderer, sceneRendererApi } from '../../../lib/webgpuSceneRenderer.js';
import { createDuelistControlPointArena } from '../client/maps/controlPointArena.mjs';

// Staging-only inspector: the exact imported map, not the live public room.
export default function ImportedControlPointPreview() {
  const host = useRef(null);
  const [status, setStatus] = useState('Loading imported map…');
  useEffect(() => {
    const mount=host.current;
    if (!mount) return;
    let active=true, renderer, controls, observer, frame=0, map;
    const scene=new THREE.Scene();
    scene.background=new THREE.Color(0x080b10);
    const camera=new THREE.PerspectiveCamera(48,1,0.5,900);
    camera.position.set(0,205,245);
    const hemi=new THREE.HemisphereLight(0xdbeafe,0x1e293b,1.35);
    const sun=new THREE.DirectionalLight(0xfffbeb,1.45);
    sun.position.set(95,185,110);scene.add(hemi,sun);
    const resize=()=>{if(!active||!renderer)return;const w=Math.max(1,mount.clientWidth),h=Math.max(1,mount.clientHeight);camera.aspect=w/h;camera.updateProjectionMatrix();renderer.setSize(w,h,false);};
    const fail=()=>{if(active)setStatus('Imported preview unavailable on this device.');};
    try {
      map=createDuelistControlPointArena(THREE);
      // Same default low preset as the supplied preview; no architecture redesign.
      map.setLayerVisibility('trusses',false);
      scene.add(map.root);
      const created=createSceneRenderer('duelist-adventure',{antialias:false,powerPreference:'high-performance'});
      renderer=created.renderer;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2)*0.75);
      renderer.domElement.style.cssText='display:block;width:100%;height:100%;touch-action:none';
      mount.appendChild(renderer.domElement);
      controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.dampingFactor=0.07;controls.target.set(0,4,-5);controls.maxPolarAngle=Math.PI*0.495;controls.update();
      Promise.resolve(created.ready).then(()=>{
        if(!active)return;
        resize();if(typeof ResizeObserver!=='undefined'){observer=new ResizeObserver(resize);observer.observe(mount);}
        setStatus(`Imported map · ${sceneRendererApi(renderer)||'renderer ready'} · visual inspection only`);
        const draw=()=>{if(!active)return;try{controls.update();renderer.render(scene,camera);frame=requestAnimationFrame(draw);}catch{fail();}};draw();
      }).catch(fail);
    }catch{fail();}
    return()=>{active=false;cancelAnimationFrame(frame);observer?.disconnect();controls?.dispose();map?.dispose();if(renderer){renderer.domElement.remove();destroySceneRenderer(renderer);}};
  },[]);
  return <div className="space-y-2"><p className="text-xs text-amber-200" role="status">{status}</p><div ref={host} className="overflow-hidden rounded border border-white/20 bg-slate-950" style={{height:'clamp(220px,55vh,600px)'}}/><p className="text-xs text-white/60">Drag to orbit, scroll or pinch to zoom. This is not a multiplayer match.</p></div>;
}
