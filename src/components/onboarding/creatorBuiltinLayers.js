import { useEffect, useState } from 'react';
import { creatorBody, FUSED_MANIFESTS } from '@/components/onboarding/avatarCustomization';
export function useBuiltinLayers(config={}) {
 const body=creatorBody(config),[state,setState]=useState({hair:[],tattoo:[],outfit:[],loading:false,error:''});
 useEffect(()=>{let cancelled=false;if(!body){setState({hair:[],tattoo:[],outfit:[],loading:false,error:''});return;}
  setState({hair:[],tattoo:[],outfit:[],loading:true,error:''});
  Promise.all(Object.entries(FUSED_MANIFESTS).map(async([slot,url])=>{const response=await fetch(url);if(!response.ok)throw new Error('Character layers could not load.');const manifest=await response.json();return [slot,(manifest[body.gender]||[]).map(asset=>({...asset,name:asset.label,file_url:asset.url,published:true}))];})).then(entries=>{if(!cancelled)setState({...Object.fromEntries(entries),outfit:[],loading:false,error:''});}).catch(error=>{if(!cancelled)setState({hair:[],tattoo:[],outfit:[],loading:false,error:error.message});});
  return()=>{cancelled=true;};
 },[body?.id]);
 return state;
}
export default useBuiltinLayers;