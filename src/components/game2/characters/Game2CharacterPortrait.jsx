// Portraits come from the SAME owner-uploaded GLBs as the playable Game 2 rigs.
// Render each requested thumbnail once with a single serialized WebGL pipeline;
// never substitute unrelated stock photos for the actual character.
// If an asset cannot be decoded/CORS-loaded, leave the visible neutral fallback.
import {useEffect,useRef,useState} from 'react';
import {UserRound} from 'lucide-react';
import {fetchGame2Binary} from '../engine/chunked.js';

const portraitPromises=new Map();
let renderQueue=Promise.resolve();

async function captureGLBPortrait(character){
  const THREE=await import('three');
  const {GLTFLoader}=await import('three/addons/loaders/GLTFLoader.js');
  const native=character?.id==='explorer';
  if(!native && (!character?.url || !character.url.startsWith('https://media.base44.com/files/public/6876751a602125f45f1861b9/')))return null;
  // The native Explorer is stored as 19 source chunks, not one public GLB URL.
  // Load the actual gameplay geometry through the same chunked-asset resolver.
  const nativeUrl=`${import.meta.env?.BASE_URL ?? '/'}game2/Explorer_G2_Game.glb`;
  const gltf=native
    ? await new GLTFLoader().parseAsync(await fetchGame2Binary(nativeUrl),nativeUrl)
    : await new GLTFLoader().loadAsync(character.url);
  const model=gltf.scene;
  model.updateMatrixWorld(true);
  const bounds=new THREE.Box3().setFromObject(model);
  const size=bounds.getSize(new THREE.Vector3());
  const center=bounds.getCenter(new THREE.Vector3());
  if(!Number.isFinite(size.y)||size.y<=.001)throw Error('Invalid preview model geometry');
  const canvas=document.createElement('canvas');
  let renderer;
  try{
    renderer=new THREE.WebGLRenderer({canvas,alpha:true,antialias:true,preserveDrawingBuffer:true,powerPreference:'low-power'});
    renderer.setPixelRatio(1);
    renderer.setSize(200,252,false);
    renderer.outputColorSpace=THREE.SRGBColorSpace;
    const scene=new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xdcefff,0x354354,2.5));
    const key=new THREE.DirectionalLight(0xffecd1,2.4);
    key.position.set(3,6,7);
    scene.add(key);
    const rim=new THREE.DirectionalLight(0x6acef3,1.2);
    rim.position.set(-4,3,-5);
    scene.add(rim);
    // Normalize only in this throwaway thumbnail scene, never the playable rig.
    const scale=2.4/size.y;
    model.scale.multiplyScalar(scale);
    model.position.x-=center.x*scale;
    model.position.y-=bounds.min.y*scale;
    model.position.z-=center.z*scale;
    scene.add(model);
    const camera=new THREE.PerspectiveCamera(39,200/252,.05,100);
    const fitWidth=Math.max(size.x,size.z)*scale;
    const distance=Math.max(3.45,fitWidth*1.45);
    camera.position.set(0,1.55,distance);
    camera.lookAt(0,1.39,0);
    camera.updateProjectionMatrix();
    renderer.render(scene,camera);
    return canvas.toDataURL('image/webp',.82);
  }finally{
    renderer?.dispose();
    renderer?.forceContextLoss?.();
    model.traverse(part=>{
      if(!part.isMesh)return;
      part.geometry?.dispose?.();
      for(const material of (Array.isArray(part.material)?part.material:[part.material])){
        if(!material)continue;
        for(const property of ['map','normalMap','roughnessMap','metalnessMap','emissiveMap','aoMap']){
          material[property]?.dispose?.();
        }
        material.dispose?.();
      }
    });
  }
}

function portraitFor(character){
  if(!character?.url && character?.id!=='explorer')return Promise.resolve(null);
  if(!portraitPromises.has(character.id)){
    // A single WebGL job at a time avoids four live WebGL contexts and four
    // simultaneous large skinned-GLB downloads on the deployment screen.
    const job=renderQueue.catch(()=>null).then(()=>captureGLBPortrait(character)).catch(()=>null);
    portraitPromises.set(character.id,job);
    renderQueue=job.then(()=>undefined);
  }
  return portraitPromises.get(character.id);
}

export default function Game2CharacterPortrait({character,nativeImage=null}){
  const ref=useRef(null);
  const [portrait,setPortrait]=useState(null);
  const [failed,setFailed]=useState(false);
  useEffect(()=>{
    let mounted=true,observer=null;
    setPortrait(null);setFailed(false);
    if(!character?.url && character?.id!=='explorer')return undefined;
    const fetchPortrait=()=>{
      portraitFor(character).then(image=>{
        if(!mounted)return;
        if(image)setPortrait(image);
        else setFailed(true);
      });
    };
    if(typeof IntersectionObserver==='undefined')fetchPortrait();
    else{
      observer=new IntersectionObserver(entries=>{
        if(!entries.some(entry=>entry.isIntersecting))return;
        observer.disconnect();
        fetchPortrait();
      },{rootMargin:'60px'});
      if(ref.current)observer.observe(ref.current);
    }
    return ()=>{mounted=false;observer?.disconnect();};
  },[character]);
  // Prefer the one-time native engine screenshot when available. The
  // newer current-main chunked Explorer GLB portrait remains the fallback.
  const image=character?.id==='explorer'&&nativeImage ? nativeImage : portrait;
  return <span ref={ref} className="g2-character-portrait" aria-label={character?.name+' model portrait'}>
    {image ? <img src={image} alt={character.name} draggable={false}/> :
      <span className="g2-character-portrait__fallback" aria-hidden="true">
        <UserRound size={39} strokeWidth={1.15}/>
        <small>{failed?'Preview unavailable':'3D portrait'}</small>
      </span>}
  </span>;
}
