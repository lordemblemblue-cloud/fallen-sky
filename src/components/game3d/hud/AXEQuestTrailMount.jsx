import { useEffect } from 'react';
import * as THREE from 'three';
import { getPlayerPosition } from '../playerPositionStore';
import { getQuestState, subscribeQuests } from '../useQuestStore';
import {verifiedQuestbookSession172} from '../axe/quests/AXEVerifiedQuestbookRuntime172';
import { getQuestNavigationTarget } from './worldMapData';

// A silver/blue glowing breadcrumb trail in the real Three.js world, not
// merely a line painted on the 2D HUD. This is a directional guide and not
// navmesh pathfinding: it avoids claiming routes around uncatalogued walls.
// Unknown/unloaded quest objectives never create a fabricated trail.
const TRAIL_DOTS=28;
const MAX_DISTANCE=64;
export default function AXEQuestTrailMount({ region='wolfveil', enabled=true }) {
  useEffect(()=>{
    if(!enabled || typeof window==='undefined')return undefined;
    let disposed=false;
    let scene=null,group=null,frame=null,refresh=null;
    const fromVerified = s => s.enabled
      ? (s.status === 'verified' ? s.view.questState : null)
      : getQuestState();
    let quests=fromVerified(verifiedQuestbookSession172.getSnapshot());
    const onQuest=s=>{if(!verifiedQuestbookSession172.enabled)quests=s;};
    const unsub=subscribeQuests(onQuest);
    const unsubVerified=verifiedQuestbookSession172.subscribe(s=>{
      // The silver/blue world trail uses ONLY verified counters while the
      // signed Questbook is enabled. Missing attestation hides the trail.
      quests=fromVerified(s);
    });
    const geometry=new THREE.CircleGeometry(.21,16);
    const core=new THREE.MeshBasicMaterial({color:0xd8f5ff,transparent:true,opacity:.82,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending});
    const halo=new THREE.MeshBasicMaterial({color:0x54a9e9,transparent:true,opacity:.22,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending});
    const haloGeometry=new THREE.CircleGeometry(.43,16);
    const dots=[];
    const attach=()=>{
      const next=window.__gw3dScene;
      if(!next||next===scene)return;
      if(group?.parent)group.parent.remove(group);
      scene=next;
      group=new THREE.Group();group.name='AXE_SilverBlueQuestTrail';
      dots.length=0;
      for(let i=0;i<TRAIL_DOTS;i++){
        const p=new THREE.Group();
        const a=new THREE.Mesh(haloGeometry,halo);
        const b=new THREE.Mesh(geometry,core);
        a.rotation.x=-Math.PI/2;b.rotation.x=-Math.PI/2;b.position.y=.018;
        p.add(a,b);p.visible=false;group.add(p);dots.push(p);
      }
      scene.add(group);
    };
    // Update topology at low frequency; animate material along it each frame.
    const update=()=>{
      if(disposed)return;
      attach();
      if(!group)return;
      if(!quests){dots.forEach(dot=>{dot.visible=false;});return;}
      const p=getPlayerPosition();
      const target=getQuestNavigationTarget(region,quests,p);
      const d=target?Math.hypot(target.x-p.x,target.z-p.z):0;
      if(!target || target.live === false || !Number.isFinite(d) || d < 2 || window.__axeServiceModeOpen || window.__axeWorldMapOpen){
        dots.forEach(dot=>{dot.visible=false;});return;
      }
      const view=Math.min(MAX_DISTANCE,Math.max(0,d-1));
      const count=Math.min(TRAIL_DOTS,Math.floor(view/2.15));
      const dx=(target.x-p.x)/d,dz=(target.z-p.z)/d;
      const py=Number(window.__localPlayerPos?.y)||0;
      // Only raycast against named map/terrain surfaces, never NPCs or
      // enemies; otherwise character models can lift breadcrumbs into midair.
      const ground=[];
      scene.traverse(o=>{
        if(o.isMesh && /terrain|ground|floor|landscape|heightfield|path|island|platform/i.test(o.name||''))
          ground.push(o);
      });
      const ray=new THREE.Raycaster();
      ray.far=280;
      for(let i=0;i<dots.length;i++){
        const dot=dots[i];
        if(i>=count){dot.visible=false;continue;}
        const s=2+(i+1)*(view-2)/Math.max(1,count);
        const x=p.x+dx*s,z=p.z+dz*s;
        let y=py-.82;
        if(ground.length){
          ray.set(new THREE.Vector3(x,Math.max(130,py+90),z),new THREE.Vector3(0,-1,0));
          const hit=ray.intersectObjects(ground,true)[0];
          if(hit)y=hit.point.y+.13;
        }
        dot.position.set(x,y,z);
        dot.visible=true;
      }
    };
    const animate=time=>{
      if(disposed)return;
      frame=window.requestAnimationFrame(animate);
      const t=time*.003;
      for(let i=0;i<dots.length;i++){
        if(!dots[i].visible)continue;
        const pulse=.77+.35*Math.sin(t-i*.61);
        dots[i].scale.setScalar(pulse);
      }
    };
    attach();
    refresh=window.setInterval(update,650);
    update();
    frame=window.requestAnimationFrame(animate);
    return()=>{
      disposed=true;unsub();unsubVerified();
      window.clearInterval(refresh);
      window.cancelAnimationFrame(frame);
      group?.parent?.remove(group);
      geometry.dispose();haloGeometry.dispose();core.dispose();halo.dispose();
    };
  },[region,enabled]);
  return null;
}
