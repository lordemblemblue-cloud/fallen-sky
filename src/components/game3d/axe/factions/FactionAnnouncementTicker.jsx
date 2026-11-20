import {useEffect,useRef,useState} from 'react';
import {Megaphone} from 'lucide-react';
import {getActiveCharacter,subscribeCharacters} from '../../characterStore';
import {callGameServer} from '../../social/socialServer';
import {normalizeVerifiedFactionAnnouncement} from './factionAnnouncementModel.mjs';
import './FactionAnnouncementTicker.css';

// Feature-gated until factionSystem implements server-authenticated leadership,
// rate limits and faction membership filtering. Never trust local event payloads.
const ENABLED=import.meta.env?.VITE_GAME3D_FACTION_ANNOUNCEMENTS==='true';
const POLL_INTERVAL_MS=20000;

function chime(){
  // Short nonverbal notification; browsers may suspend audio without a user
  // gesture. Sound is best-effort and must never prevent reading the message.
  try{
    const Context=window.AudioContext||window.webkitAudioContext;
    if(!Context)return;
    const audio=new Context();
    if(audio.state==='suspended'){void audio.close();return;}
    const oscillator=audio.createOscillator();
    const gain=audio.createGain();
    oscillator.type='sine';
    oscillator.frequency.setValueAtTime(680,audio.currentTime);
    oscillator.frequency.setValueAtTime(920,audio.currentTime+.13);
    gain.gain.setValueAtTime(.045,audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(.001,audio.currentTime+.28);
    oscillator.connect(gain);gain.connect(audio.destination);
    oscillator.start();oscillator.stop(audio.currentTime+.3);
    oscillator.onended=()=>void audio.close();
  }catch{/* muted device or blocked Web Audio */}
}

export default function FactionAnnouncementTicker(){
  const [factionId,setFactionId]=useState(()=>getActiveCharacter()?.factionId||null);
  const [announcement,setAnnouncement]=useState(null);
  const lastId=useRef(null);
  useEffect(()=>subscribeCharacters(()=>setFactionId(getActiveCharacter()?.factionId||null)),[]);
  useEffect(()=>{
    if(!ENABLED||!factionId){setAnnouncement(null);return undefined;}
    let active=true, busy=false;
    const reload=async()=>{
      if(busy)return;
      busy=true;
      try{
        const response=await callGameServer('factionSystem','latest_announcement',{});
        const item=normalizeVerifiedFactionAnnouncement(response?.announcement,factionId);
        if(!active)return;
        setAnnouncement(item);
        if(item&&item.id!==lastId.current){
          lastId.current=item.id;
          chime();
        }
      }catch{if(active)setAnnouncement(null);}
      finally{busy=false;}
    };
    void reload();
    const interval=window.setInterval(()=>void reload(),POLL_INTERVAL_MS);
    return ()=>{active=false;window.clearInterval(interval);};
  },[factionId]);
  if(!ENABLED||!announcement)return null;
  return <div className="axe-faction-announcement" role="status" aria-live="polite"
    aria-label={'Faction command message from '+announcement.senderName}>
    <div className="axe-faction-announcement__title"><Megaphone size={16} aria-hidden="true"/>
      FACTION CALL <span>{announcement.senderName}</span>
    </div>
    <div className="axe-faction-announcement__marquee"><span>{announcement.text}</span></div>
  </div>;
}
