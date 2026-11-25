import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { createSceneRenderer, destroySceneRenderer } from '../../../lib/webgpuSceneRenderer.js';
import { createArena } from '../client/arena.mjs';
import { getModeArenaLayout } from '../sim/modeArenaLayout.mjs';

// A lightweight orbiting map overview, not a spectator feed. The actual
// match runs on the authoritative server even when this browser leaves.
export default function OnlineArenaPreview({ mode }) {
  const mountRef = useRef(null);
  const [failed, setFailed] = useState(false);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    if (typeof IntersectionObserver === 'undefined') { setVisible(true); return; }
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: 0.01 });
    observer.observe(mount);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount || !visible) return;
    setFailed(false);
    let active = true, frame = 0, renderer, observer;
    const scene = new THREE.Scene();
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const materials = new Map();
    const material = color => {
      if (!materials.has(color)) materials.set(color, new THREE.MeshBasicMaterial({ color }));
      return materials.get(color);
    };
    const box = (x,y,z,w,h,d,color) => {
      const mesh = new THREE.Mesh(geometry, material(color));
      mesh.position.set(x,y,z); mesh.scale.set(w,h,d); scene.add(mesh);
    };
    const layout = getModeArenaLayout(mode);
    const radius = layout?.radius || (mode === 'duel' ? 12 : 18);
    scene.background = new THREE.Color(0x081422);
    const authoredFloor = layout?.footprint ? createArena({ radius, footprint: layout.footprint }) : null;
    if (authoredFloor) {
      scene.add(authoredFloor.group);
      scene.add(new THREE.HemisphereLight(0xb8d9ff, 0x334455, 2));
    } else {
    box(0,-0.3,0,radius*2,0.5,radius*2,0x192c40);
    for (const side of [-1,1]) {
      box(side*radius,0.3,0,0.3,0.6,radius*2,0x44657f);
      box(0,0.3,side*radius,radius*2,0.6,0.3,0x44657f);
    }
    }
    for (const p of layout?.parts || []) {
      box((p.x0+p.x1)/2,(p.y0+p.y1)/2,(p.z0+p.z1)/2,p.x1-p.x0,p.y1-p.y0,p.z1-p.z0,
        p.kind === 'deck' ? 0x53738e : p.kind === 'cover' ? 0x89734d : 0x36526c);
    }
    // Distinct objective glyphs for mode identification, not authoritative
    // objective coordinates. Layout geometry above is shared with simulation.
    const blue=0x4eb7ff, red=0xff7373, gold=0xe9c175;
    if(mode === 'control') for (const point of layout?.controlPoints || []) box(point.x,3.45,point.z,2.5,0.3,2.5,gold);
    else if(mode === 'escort') {
      box(0,0.05,0,2,0.1,radius*1.65,gold);
      box(0,0.8,0,2.5,1.6,4,blue);
    } else if(mode === 'ctf' || mode === 'football' || mode === 'tdm') {
      box(-radius*0.7,0.2,0,3,0.4,5,blue);
      box(radius*0.7,0.2,0,3,0.4,5,red);
    } else if(mode === 'duel') {
      box(-3,0.1,0,2,0.2,2,blue);box(3,0.1,0,2,0.2,2,red);
    } else {
      for(let i=0;i<6;i++) {
        const a=i*Math.PI/3;box(Math.cos(a)*7,0.1,Math.sin(a)*7,1.5,0.2,1.5,gold);
      }
    }
    const camera = new THREE.PerspectiveCamera(42,1,0.1,250);
    const resize = () => {
      if (!renderer || !active) return;
      const w=Math.max(1,mount.clientWidth), h=Math.max(1,mount.clientHeight);
      camera.aspect=w/h;camera.updateProjectionMatrix();renderer.setSize(w,h,false);
    };
    try {
      const created=createSceneRenderer('duelist-adventure',{antialias:false,powerPreference:'low-power'});
      renderer=created.renderer;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.25));
      renderer.domElement.style.cssText='display:block;width:100%;height:100%';
      renderer.domElement.setAttribute('aria-hidden','true');
      mount.appendChild(renderer.domElement);
      Promise.resolve(created.ready).then(()=>{
        if(!active)return;
        resize();
        if(typeof ResizeObserver !== 'undefined') {observer=new ResizeObserver(resize);observer.observe(mount);}
        let last=0;
        const draw=t=>{
          if(!active)return;
          frame=requestAnimationFrame(draw);
          if(document.hidden || t-last<66)return;
          last=t;
          const angle=window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0.7 : t*0.00012;
          camera.position.set(Math.sin(angle)*radius*2.5,radius*2.4,Math.cos(angle)*radius*2.5);
          camera.lookAt(0,0,0);
          try{renderer.render(scene,camera);}catch{setFailed(true);cancelAnimationFrame(frame);}
        };
        frame=requestAnimationFrame(draw);
      }).catch(()=>{if(active)setFailed(true);});
    } catch {setFailed(true);}
    return ()=>{
      active=false;cancelAnimationFrame(frame);observer?.disconnect();
      authoredFloor?.dispose();
      geometry.dispose();for(const m of materials.values())m.dispose();
      if(renderer){renderer.domElement.remove();destroySceneRenderer(renderer);}
    };
  },[mode, visible]);
  return <div className="relative overflow-hidden rounded border border-white/15 bg-slate-950" style={{height: 'clamp(130px, 28vh, 280px)'}}>
    <div ref={mountRef} className="absolute inset-0" />
    {failed && <div className="absolute inset-0 grid place-items-center text-sm text-white/65">3D preview unavailable. Server joining is unaffected.</div>}
    <span className="pointer-events-none absolute bottom-2 left-3 rounded bg-slate-950/80 px-2 py-1 text-xs text-white/75">3D arena overview · not live footage</span>
  </div>;
}
