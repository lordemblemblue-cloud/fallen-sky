import {useEffect,useRef,useState} from 'react';
import {worldAnnouncementFromReceipt} from './WorldAnnouncementModel.mjs';
import './WorldAnnouncementFeed.css';

// The private world service emits this after verifying its own receipt.
// Treat it as presentation data only; browser events never award items,
// authorize strikes or create the server's PK tally.
export const WORLD_ANNOUNCEMENT_EVENT='game3dVerifiedWorldAnnouncement';
const TTL=8500;
export default function WorldAnnouncementFeed({suppressed=false}){
  const [items,setItems]=useState([]);
  const nextId=useRef(0);
  useEffect(()=>{
    const onAnnouncement=event=>{
      const detail=event?.detail;
      if(detail?.verified!==true||!detail.id)return;
      const display=worldAnnouncementFromReceipt(detail);
      if(!display)return;
      setItems(old=>{
        if(old.some(i=>i.id===detail.id))return old;
        return [...old,{id:String(detail.id).slice(0,90),...display,expires:Date.now()+TTL}].slice(-4);
      });
    };
    window.addEventListener(WORLD_ANNOUNCEMENT_EVENT,onAnnouncement);
    // Local gameplay notices must remain labeled LOCAL, not as global
    // authoritative loot/dungeon/PK announcements.
    const onLocalNotice=event=>{
      const message=typeof event?.detail?.message==='string'
        ?event.detail.message.replace(/[\u0000-\u001f\u007f<>]/g,'').slice(0,120):'';
      if(!message)return;
      setItems(old=>[...old,{id:'local-'+(++nextId.current),title:'WORLD STATUS',
        description:message,tone:'gold',expires:Date.now()+4500}].slice(-4));
    };
    window.addEventListener('game3dLocalWorldNotice',onLocalNotice);
    return ()=>{
      window.removeEventListener(WORLD_ANNOUNCEMENT_EVENT,onAnnouncement);
      window.removeEventListener('game3dLocalWorldNotice',onLocalNotice);
    };
  },[]);
  useEffect(()=>{
    if(!items.length)return undefined;
    const next=Math.max(0,Math.min(...items.map(i=>i.expires))-Date.now());
    const timeout=window.setTimeout(()=>setItems(old=>old.filter(i=>i.expires>Date.now())),next+10);
    return ()=>window.clearTimeout(timeout);
  },[items]);
  if(suppressed||!items.length)return null;
  return <aside className="game3d-world-announcements" aria-live="polite" aria-relevant="additions" aria-label="World announcements">
    {items.slice(-3).map(item=><div key={item.id} className={'game3d-world-announcement game3d-world-announcement--'+item.tone}>
      <span className="game3d-world-announcement-crest" aria-hidden="true">✦</span>
      <span className="game3d-world-announcement-content">
        <strong>{item.title}</strong>
        <span>{item.description}</span>
      </span>
      <span className="game3d-world-announcement-crest" aria-hidden="true">✦</span>
    </div>)}
  </aside>;
}
