import {lazy,Suspense,useEffect,useRef,useState} from 'react';
import {getAccessToken} from '@base44/sdk';

const Preview = lazy(()=>import('./MeshyFaceDraftPreview'));
const statusNames = {
  PENDING:'Waiting for Meshy to begin…',
  IN_PROGRESS:'Meshy is reconstructing the head and texture…',
  SUCCEEDED:'3D draft ready. Rotate it to inspect facial likeness.',
  FAILED:'Generation failed. Clear and try different photos.',
  CANCELED:'Generation was canceled.',
};
const problemText = {
  'face-draft-disabled-or-not-authorized':'The cloud face studio is not enabled for this test account.',
  'face-draft-daily-preview-limit':'You have used the two test generations allowed for today.',
  'photo-consent-required':'Consent is required before sending photographs to Meshy.',
  'provide-one-to-four-images':'Select a front photo and up to three other angles.',
  'invalid-photo-format-or-size':'Use JPG, PNG or WebP portraits under the size limit.',
  'meshy-provider-error':'Meshy could not accept this request. Check your API credits or try later.',
  'meshy-unavailable':'The Meshy service could not be reached.',
  'face-draft-ticket-invalid':'This preview has expired. Begin a new generation.',
};
const previewAvailable = import.meta.env.VITE_GAME3D_MESHY_FACE_PREVIEW === 'true';

async function uploadImageAsDataUrl(file) {
  if(!/^image\/(jpeg|png|webp)$/.test(file.type)||file.size>5_000_000)
    throw Error('Choose a JPG, PNG or WebP file under 5 MB.');
  const blobUrl=URL.createObjectURL(file),img=new Image();
  try{
    img.src=blobUrl;await img.decode();
    if(Math.min(img.naturalWidth,img.naturalHeight)<160)
      throw Error('Use a sharper photo at least 160 pixels wide and tall.');
    const max=768,ratio=Math.min(1,max/Math.max(img.naturalWidth,img.naturalHeight));
    const canvas=document.createElement('canvas');
    canvas.width=Math.round(img.naturalWidth*ratio);
    canvas.height=Math.round(img.naturalHeight*ratio);
    canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);
    const data=canvas.toDataURL('image/jpeg',.82);
    if(data.length>1_800_000)throw Error('The photo is too large after resizing.');
    return data;
  }finally{URL.revokeObjectURL(blobUrl)}
}

async function callFaceApi(method,ticket,payload,signal){
  const access=getAccessToken();
  if(!access)throw Error('Sign in to Game 3D to use the Meshy preview.');
  const response=await fetch('/api/game3d-face'+(ticket?'?ticket='+encodeURIComponent(ticket):''),{
    method,
    headers:{
      Authorization:'Bearer '+access,
      ...(payload?{'Content-Type':'application/json'}:{}),
    },
    ...(payload?{body:JSON.stringify(payload)}:{}),
    cache:'no-store',credentials:'same-origin',signal,
  });
  let data;try{data=await response.json()}catch{throw Error('The game server did not return a valid response.')}
  if(!response.ok||!data.ok)throw Error(problemText[data.code]||
    'Cloud 3D preview unavailable ('+(data.code||response.status)+').');
  return data;
}

/**
 * This is a separate OPT-IN cloud step, not the existing local face fitter.
 * It intentionally NEVER mutates config, character saves or model_url:
 * attaching a head-only GLB requires UV/neck/rig validation and a reviewed
 * body compatibility pipeline. Preview drafts are for quality evaluation.
 */
export default function MeshyFaceDraftCreator(){
  const [photos,setPhotos]=useState([]);
  const [consent,setConsent]=useState(false);
  const [busy,setBusy]=useState(false);
  const [task,setTask]=useState(null);
  const [status,setStatus]=useState(null);
  const [error,setError]=useState('');
  const tasks=useRef(new Set());
  const alive=useRef(true);
  useEffect(()=>()=>{alive.current=false;for(const controller of tasks.current)controller.abort();tasks.current.clear();},[]);

  const request = async(method,ticket,payload)=>{
    const controller=new AbortController();tasks.current.add(controller);
    try{return await callFaceApi(method,ticket,payload,controller.signal)}
    finally{tasks.current.delete(controller)}
  };

  const select = async e => {
    const incoming=Array.from(e.target.files||[]).slice(0,4);e.target.value='';
    setTask(null);setStatus(null);setError('');setConsent(false);setPhotos([]);
    if(!incoming.length)return;
    setBusy(true);
    try{
      const resized=await Promise.all(incoming.map(uploadImageAsDataUrl));
      if(alive.current)setPhotos(resized);
    }catch(err){if(alive.current)setError(err.message)}
    finally{if(alive.current)setBusy(false)}
  };
  const start = async()=>{
    if(busy||!consent||!photos.length)return;
    setBusy(true);setError('');setTask(null);setStatus(null);
    try{
      const next=await request('POST',null,{images:photos,consent:true});
      if(!alive.current)return;
      setTask(next.ticket);setStatus({status:next.status,progress:0});
      // Release source selfies from browser state after the request.
      setPhotos([]);setConsent(false);
    }catch(e){if(alive.current)setError(e.message)}
    finally{if(alive.current)setBusy(false)}
  };
  useEffect(()=>{
    if(!task||status?.status==='SUCCEEDED'||status?.status==='FAILED'||status?.status==='CANCELED')
      return undefined;
    let open=true;
    let inFlight=false;
    const refresh=async()=>{
      if(!open||inFlight)return;
      inFlight=true;
      try{
        const info=await request('GET',task);
        if(open&&alive.current)setStatus(info);
      }catch(e){if(open&&alive.current){setError(e.message);open=false}}
      finally{inFlight=false}
    };
    refresh();
    const poll=window.setInterval(refresh,6500);
    return()=>{open=false;window.clearInterval(poll)};
    // Task ticket identifies one complete generation; status controls polling.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[task,status?.status]);

  const clear=async()=>{
    const old=task;
    setTask(null);setStatus(null);setPhotos([]);setConsent(false);setError('');
    if(old)try{await request('DELETE',old)}catch{
      // Meshy may reject deletion while a task is generating (409).
      // Local preview is still discarded and never becomes a character save.
    }
  };
  if(!previewAvailable)return null;
  return <section className="genesis-meshy-face-draft" aria-label="Meshy cloud 3D likeness draft">
    <h3>AI 3D Head Preview <span>Meshy · Test Only</span></h3>
    <p>Generate an optional textured 3D head from your own portraits. This cloud
      feature sends the selected photos to Meshy only when you choose Generate.
      It does not replace your playable character or save your photos.</p>
    <p className="genesis-note">Your existing local face scan stays private on your device.
      The Meshy option is separate and uses paid API credits. An AI likeness is
      approximate; matching the game character's neck, expressions, rig and
      equipment is still a separate compatibility step.</p>
    <label className="genesis-meshy-label">
      Face photos (first = front, optional others = side or three-quarter views)
      <input type="file" accept="image/jpeg,image/png,image/webp"
        multiple disabled={busy||Boolean(task)}
        onChange={select} aria-label="Upload one to four face photographs for Meshy"/>
    </label>
    {photos.length>0&&<div className="genesis-meshy-photos">
      {photos.map((src,i)=><img key={i} src={src}
        alt={i===0?'Your front view (not uploaded yet)':'Optional face view '+(i+1)}/>)}
    </div>}
    {photos.length>0&&<label className="genesis-meshy-consent">
      <input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/>
      I am the person pictured or have permission to use these photos. I consent
      to sending these photos to Meshy AI to generate a 3D likeness.
    </label>}
    <div className="genesis-meshy-actions">
      <button type="button" className="genesis-secondary"
        disabled={busy||!photos.length||!consent||Boolean(task)}
        onClick={start}>{busy?'Preparing…':'Generate 3D head (uses credits)'}</button>
      {(task||photos.length>0)&&<button type="button" className="genesis-secondary"
        onClick={clear}>Discard {task?'Meshy draft':'photos'}</button>}
    </div>
    {busy&&<p role="status">Preparing your images…</p>}
    {status&&<p role="status">
      {statusNames[status.status]||'Checking Meshy generation…'}
      {status.status==='IN_PROGRESS'?' '+Math.round(status.progress)+'%':''}
    </p>}
    {status?.thumbnail&&<img className="genesis-meshy-thumb"
      src={status.thumbnail} alt="AI-generated head thumbnail"/>}
    {status?.glb&&<Suspense fallback={<p>Loading 3D preview…</p>}>
      <Preview url={status.glb}/>
    </Suspense>}
    {status?.glb&&<p className="genesis-note">This is a generated head draft, not a
      rigged game avatar. Your current playable Eve, Adam or other character
      keeps its original head until a compatible head-binding system is verified.</p>}
    {error&&<p className="genesis-error" role="alert">{error}</p>}
  </section>;
}
