import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { BookOpen, ChevronRight, Mail, Moon, Send, Sun, X } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { getPlayerHUD, subscribePlayerHUD } from '../playerHUDStore';
import { getQuestState, subscribeQuests } from '../useQuestStore';
import { getActiveId, subscribeCharacterChange } from '../characterStorage';
import { AXE_QUESTS } from '../axe/quests/AXEQuestFramework';
import { friendsStore } from '../social/socialStores';
import FriendMessengerPanel from '@/components/friends/FriendMessengerPanel';
import { incomingDirectMessage, levelMilestone, questMilestones } from './lunarNoticeModel.mjs';
import { LEVEL_UP_NOTICE_AUTO_CLOSE_MS, LEVEL_UP_NOTICE_ATTRIBUTES_SERVICE, shouldDismissLevelUpOnEscape } from './levelUpNoticeRules.mjs';
import './Game3DLunarNotifications.css';

const LIMIT = 8;
const PAUSE = {message:8500, level:LEVEL_UP_NOTICE_AUTO_CLOSE_MS, story:9500};
const trim = (value, limit=100) => typeof value === 'string' ? value.trim().slice(0,limit) : '';
const photoURL = value => typeof value === 'string' &&
  (/^https:\/\//i.test(value) || /^\/assets\/[\w./-]+\.(png|webp|jpe?g)$/i.test(value))
  ? value : '';

const SCENES = [
  {sky:'#2a3b68', hill:'#27395a', glow:'#ffb98e', shadow:'#14243e'},
  {sky:'#26485a', hill:'#31505b', glow:'#b8d2e6', shadow:'#172c3a'},
  {sky:'#3e315e', hill:'#473454', glow:'#f2c1ad', shadow:'#201c39'},
  {sky:'#27314b', hill:'#263e61', glow:'#aec7ff', shadow:'#171e36'},
  {sky:'#49324f', hill:'#4c4158', glow:'#e5ae8a', shadow:'#241d38'},
];

// Original, per-quest vector environment: bridge, distant shrines, moonlit water.
// The stable quest hash chooses the scene palette. A quest's own approved
// artwork URL, when supplied, replaces this illustration without fake images.
function QuestScene({variant=0, image=''}) {
  const rawId = useId().replace(/:/g,'');
  const id = 'axe-quest-sky-'+rawId;
  const scene = SCENES[Number(variant) % SCENES.length] || SCENES[0];
  if(image) return <div className="axe-lunar-scene axe-lunar-scene-photo" style={{backgroundImage:`url("${image}")`}} aria-hidden="true"/>;
  return <svg className="axe-lunar-scene" viewBox="0 0 520 210" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <defs><linearGradient id={id} x1="0" y1="0" x2=".6" y2="1">
      <stop offset="0" stopColor={scene.sky}/><stop offset=".65" stopColor={scene.hill}/>
      <stop offset="1" stopColor={scene.shadow}/>
    </linearGradient></defs>
    <rect width="520" height="210" fill={`url(#${id})`}/>
    <circle cx={390-(variant%3)*56} cy={40+(variant%2)*12} r="25" fill={scene.glow} opacity=".65"/>
    <circle cx={390-(variant%3)*56} cy={40+(variant%2)*12} r="37" fill={scene.glow} opacity=".1"/>
    <path d="M0 143 63 69 103 112 174 55 224 121 295 69 365 135 441 67 520 128V210H0Z" fill={scene.shadow} opacity=".78"/>
    <path d="M0 167Q112 134 231 162T520 156V210H0Z" fill="#091f32" opacity=".7"/>
    <path d="M0 187Q160 169 270 185T520 178V210H0Z" fill="#7cc3db" opacity=".17"/>
    {variant===0 && <g>
      {/* Moonlit shrine bridge: the original Chapter 1.4 first-echo road. */}
      <path d="M188 176Q267 117 370 169" fill="none" stroke="#d8b68d" strokeWidth="7"/>
      <path d="M188 177Q267 125 370 170" fill="none" stroke="#131b2e" strokeWidth="4"/>
      <path d="M204 177V202M238 156V202M277 150V202M315 157V202M352 171V202"
        stroke="#cba687" strokeWidth="4" opacity=".68"/>
      <path d="M409 129V98h52v31M400 99h70M418 98V76h30v22M409 77h48M426 76l6-14 7 14"
        fill="none" stroke="#f3d4aa" strokeWidth="4" opacity=".72"/>
    </g>}
    {variant===1 && <g>
      {/* Spirit crystal vein: fissures, hanging light and crystalline geometry. */}
      <path d="M140 202 210 135 244 182 310 109 371 203" fill="#355679" opacity=".76"/>
      <path d="M265 195 300 76 328 153 309 211Z" fill="#90d9f7" opacity=".70"/>
      <path d="M300 76 314 153 309 211Z" fill="#b7a3ec" opacity=".62"/>
      <path d="M190 201 215 138 237 202M379 208 398 154 417 210"
        fill="#74bddd" opacity=".56"/>
      <path d="M247 208 291 160 312 210" fill="#d3e5fa" opacity=".25"/>
      <path d="M157 201Q262 179 372 206" fill="none" stroke="#a9d9ff" strokeWidth="2" opacity=".48"/>
    </g>}
    {variant===2 && <g>
      {/* The crossroads: diverging trails, an ancient fork-marker and torii. */}
      <path d="M0 210Q169 138 292 169Q350 173 520 134" stroke="#bda58b"
        strokeWidth="13" opacity=".43" fill="none"/>
      <path d="M144 210Q260 129 289 168Q334 197 360 210"
        stroke="#e4b48e" strokeWidth="9" opacity=".36" fill="none"/>
      <path d="M287 183V89M259 100h57M273 89l14-19 14 19"
        fill="none" stroke="#e8c6a1" strokeWidth="6" opacity=".75"/>
      <path d="M391 155V111h49v44M384 111h65M402 111V84h29v27"
        fill="none" stroke="#b9c3db" strokeWidth="4" opacity=".70"/>
      <path d="M280 132h45M280 146h45" stroke="#d6b995" strokeWidth="2"/>
    </g>}
    {variant===3 && <g>
      {/* Aftershocks: broken arch and a restrained storm-sky fracture. */}
      <path d="M175 211 198 162 218 167 238 126 264 162 290 161 319 211"
        fill="#243c51" opacity=".88"/>
      <path d="M345 210V104h30M376 104V80h35V64h31M445 64v147M343 133h102"
        fill="none" stroke="#c5b7b3" strokeWidth="7" opacity=".64"/>
      <path d="M236 76 255 109 242 127 277 144" fill="none"
        stroke="#bfd8fa" strokeWidth="4" opacity=".84"/>
      <path d="M393 146 412 157 401 170 426 180" fill="none"
        stroke="#87abc6" strokeWidth="2" opacity=".54"/>
      <path d="M186 211 220 182 254 211" fill="#b3b1c0" opacity=".3"/>
    </g>}
    {variant===4 && <g>
      {/* Traces remain: distant moonlit citadel, cliffs and a final path. */}
      <path d="M168 211 210 146 256 168 303 112 346 168 412 211"
        fill="#3e4668" opacity=".82"/>
      <path d="M350 189V100h23V70l18-22 18 22v30h24v90Z"
        fill="#14283f" stroke="#cab79c" strokeWidth="3"/>
      <path d="M359 100h62M373 99V75M411 99V75M381 148v-28h19v28"
        stroke="#f0cba0" strokeWidth="3" opacity=".8"/>
      <path d="M242 211Q296 170 365 183T520 198" stroke="#b1c8dc"
        strokeWidth="9" opacity=".42" fill="none"/>
      <path d="M354 211Q409 176 490 188" stroke="#b9d6f7" strokeWidth="2"
        opacity=".52" fill="none"/>
    </g>}
    <path d="M65 187V49M65 69 3 30M66 81 119 27M65 59 144 11"
      stroke="#1a253d" strokeWidth="7" strokeLinecap="round" fill="none"/>
    {Array.from({length:12},(_,i)=><circle key={i}
      cx={35+(i*31)%115} cy={14+(i*23)%94}
      r={3+(i%3)} fill="#f5c9d8" opacity={.48+(i%3)*.12}/>)}
    <path d="M0 203Q142 180 291 200T520 193" stroke={scene.glow} strokeWidth="2" opacity=".29" fill="none"/>
  </svg>;
}

function DayCrest({day}) {
  return <div className={'axe-lunar-daycrest'+(day?' is-day':' is-night')} aria-hidden="true">
    {day ? <Sun className="axe-lunar-sun" size={26}/> : <Moon className="axe-lunar-moon" size={27}/>}
    {day && <Moon className="axe-lunar-crescent" size={20}/>}
  </div>;
}

function LevelNotice({notice, onClose, onAllocate}) {
  const earned = Math.max(0, Number(notice.pointsGained) || 0);
  const gains = (notice.stats || []).filter(stat => stat.gain > 0).map(stat =>
    `${stat.label} +${stat.gain}`).join(' · ');
  return <section className="axe-lunar-notice axe-lunar-level"
    aria-label={`Level up to level ${notice.level}`}
    onMouseDown={event => event.stopPropagation()}
    onPointerDown={event => event.stopPropagation()}>
    {/* Decorative metalwork is a vector, not a large opaque image or backdrop. */}
    <svg className="axe-lunar-level-filigree" viewBox="0 0 500 80" preserveAspectRatio="xMidYMid meet"
      aria-hidden="true" focusable="false">
      <g fill="none" stroke="#e9bf72" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10 48 Q65 48 91 31 Q118 10 166 35 Q189 48 218 32" strokeWidth="1.7"/>
        <path d="M490 48 Q435 48 409 31 Q382 10 334 35 Q311 48 282 32" strokeWidth="1.7"/>
        <path d="M45 56 Q97 56 118 40 Q138 27 172 43" strokeWidth=".9" opacity=".66"/>
        <path d="M455 56 Q403 56 382 40 Q362 27 328 43" strokeWidth=".9" opacity=".66"/>
        <path d="M216 32 Q236 26 250 10 Q264 26 284 32" strokeWidth="1.45"/>
        <path d="M250 8 L263 23 L250 39 L237 23 Z" strokeWidth="1.5"/>
        <path d="M250 14 L257 23 L250 32 L243 23 Z" strokeWidth=".8"/>
        <path d="M165 35 Q178 17 193 20 M335 35 Q322 17 307 20" strokeWidth=".9" opacity=".78"/>
      </g>
      <circle cx="250" cy="23" r="2.6" fill="#ffe5a5"/>
      <circle cx="216" cy="32" r="2" fill="#edc77e"/>
      <circle cx="284" cy="32" r="2" fill="#edc77e"/>
    </svg>
    <button type="button" className="axe-lunar-level-card" onClick={onAllocate}
      aria-label={`Level ${notice.level}. Open Character attributes to spend points`}
      title="Open Character attributes">
      <span className="axe-lunar-level-heading">LEVEL UP</span>
      <span className="axe-lunar-level-number">Level <strong>{notice.level}</strong></span>
      <span className="axe-lunar-level-award">
        {earned > 0 ? `✧ +${earned} Attribute Point${earned === 1 ? '' : 's'}`
          : '✧ Your character has grown stronger'}
      </span>
      {gains && <span className="axe-lunar-level-gains">{gains}</span>}
      <span className="axe-lunar-level-allocate">Open Attributes</span>
    </button>
    <button type="button" className="axe-lunar-close" aria-label="Dismiss level-up"
      onClick={onClose}><X size={14}/></button>
  </section>;
}

function StoryNotice({notice,onClose,day}) {
  return <section className="axe-lunar-notice axe-lunar-story" aria-label={notice.heading}>
    <QuestScene variant={notice.artVariant} image={notice.image}/>
    <div className="axe-lunar-story-fade" aria-hidden="true"/>
    <div className="axe-lunar-pennant" aria-hidden="true"><BookOpen size={22}/><span>✦</span></div>
    <div className="axe-lunar-story-crest" aria-hidden="true"><DayCrest day={day}/></div>
    <button type="button" className="axe-lunar-close" aria-label="Dismiss chapter notification" onClick={onClose}><X size={16}/></button>
    <div className="axe-lunar-story-copy">
      <p className="axe-lunar-story-heading"><BookOpen size={18}/>{notice.heading}</p>
      {notice.nextHeading
        ? <h2>{notice.nextHeading}</h2>
        : <h2>{notice.questTitle}</h2>}
      <p className="axe-lunar-story-caption">
        {notice.nextQuestTitle || (notice.nextHeading ? notice.questTitle : 'Quest recorded in your Chronicle')}
      </p>
    </div>
  </section>;
}

function MessageNotice({notice,onClose,onReply,day}) {
  const sender = notice.senderName || 'Player';
  const avatar = photoURL(notice.senderAvatar);
  return <section className="axe-lunar-notice axe-lunar-message" aria-label={`Message from ${sender}`}>
    <div className="axe-lunar-message-badge" aria-hidden="true"><DayCrest day={day}/></div>
    <div className="axe-lunar-face">
      {avatar?<img src={avatar} alt="" loading="lazy" />:<span>{sender.slice(0,1).toUpperCase()}</span>}
    </div>
    <div className="axe-lunar-message-copy">
      <div className="axe-lunar-message-meta"><Mail size={14}/><strong>MESSAGE</strong><span>Now</span></div>
      <h2>{sender}</h2>
      <p>{notice.text}</p>
    </div>
    <div className="axe-lunar-message-actions">
      <button type="button" className="axe-lunar-reply" onClick={()=>onReply(notice)}>
        <Send size={15}/> Reply <ChevronRight size={15}/>
      </button>
      <button type="button" className="axe-lunar-close" aria-label="Dismiss message" onClick={onClose}><X size={16}/></button>
    </div>
  </section>;
}

export default function Game3DLunarNotifications({environmentSystem}) {
  const [queue,setQueue] = useState([]);
  const [day,setDay] = useState(true);
  const [me,setMe] = useState(null);
  const [replyTo,setReplyTo] = useState(null);
  const increment = useRef(0);
  const seen = useRef(new Map());

  const enqueue = useCallback((notice, priority=false) => {
    if(!notice) return;
    setQueue(previous=>{
      const item={...notice,notificationId:`lunar-${++increment.current}`};
      const next=priority && previous.length ? [previous[0],item,...previous.slice(1)] : [...previous,item];
      return next.slice(0,LIMIT);
    });
  },[]);
  const dismiss = useCallback(()=>setQueue(previous=>previous.slice(1)),[]);
  const openLevelUpAttributes = useCallback(() => {
    dismiss();
    // GameView already routes this existing event to the actual Character
    // service. No duplicate attribute panel or client-side stat allocation.
    window.dispatchEvent(new CustomEvent('axeServiceRequested', {
      detail: { service: LEVEL_UP_NOTICE_ATTRIBUTES_SERVICE, source: 'level_up_notice' },
    }));
  }, [dismiss]);
  const active=queue[0] || null;

  useEffect(()=>{
    if(!active) return undefined;
    const timeout=setTimeout(dismiss, PAUSE[active.kind] || 8000);
    return ()=>clearTimeout(timeout);
  },[active?.notificationId,dismiss]);

  useEffect(() => {
    if (active?.kind !== 'level') return undefined;
    const onEscape = event => {
      if (!shouldDismissLevelUpOnEscape(active.kind, event)) return;
      // Capture before the in-world Escape handler, so dismissing the 1.5s
      // toast does not accidentally open the pause/settings screen.
      event.preventDefault();
      event.stopImmediatePropagation?.();
      dismiss();
    };
    window.addEventListener('keydown', onEscape, true);
    return () => window.removeEventListener('keydown', onEscape, true);
  }, [active?.notificationId, active?.kind, dismiss]);

  useEffect(()=>{
    if(!environmentSystem) return undefined;
    const refresh=()=>{
      const hour=Number(environmentSystem.getState?.()?.time);
      if(Number.isFinite(hour)) setDay(hour>=6 && hour<19);
    };
    refresh();
    const timer=setInterval(refresh,5000);
    return ()=>clearInterval(timer);
  },[environmentSystem]);

  useEffect(()=>{
    let prevHUD=getPlayerHUD(), prevQuest=getQuestState();
    let owner=getActiveId();
    const adoptOwner=()=>{
      const currentOwner=getActiveId();
      if(currentOwner===owner) return false;
      // The stores subscribe before this overlay. When a new character loads,
      // their rehydration callbacks may fire BEFORE our character-change handler.
      // Never interpret another save's levels or completed quests as new gains.
      owner=currentOwner;prevHUD=getPlayerHUD();prevQuest=getQuestState();
      seen.current.clear();setQueue([]);
      return true;
    };
    const onHUD=current=>{
      if(adoptOwner()) return;
      const milestone=levelMilestone(prevHUD,current);
      prevHUD=current;
      if(milestone) enqueue(milestone);
    };
    const onQuest=current=>{
      if(adoptOwner()) return;
      const notices=questMilestones(prevQuest,{
        ...current,level:getPlayerHUD().level,
      },AXE_QUESTS);
      prevQuest=current;
      notices.forEach(enqueue);
    };
    const reset=()=>{
      owner=getActiveId();prevHUD=getPlayerHUD();prevQuest=getQuestState();
      seen.current.clear();setQueue([]);
    };
    const offChar=subscribeCharacterChange(reset);
    const offHUD=subscribePlayerHUD(onHUD);
    const offQuest=subscribeQuests(onQuest);
    return ()=>{offChar?.();offHUD?.();offQuest?.();};
  },[enqueue]);

  useEffect(()=>{
    let mounted=true;
    base44.auth.me().then(user=>{if(mounted && user?.id)setMe(user);}).catch(()=>{});
    return ()=>{mounted=false;};
  },[]);

  useEffect(()=>{
    if(!me?.id) return undefined;
    let mounted=true;
    const show=async (event)=>{
      const item=incomingDirectMessage(event,me.id);
      if(!item) return;
      const now=Date.now();
      const fingerprint=`${item.senderId}|${item.conversationId}|${item.text}`;
      for(const [key,at] of seen.current) if(now-at>3000) seen.current.delete(key);
      const idKey=item.messageId ? `id:${item.messageId}` : '';
      const bodyKey=`body:${fingerprint}`;
      if((idKey && seen.current.has(idKey)) || seen.current.has(bodyKey)) return;
      if(idKey)seen.current.set(idKey,now);
      seen.current.set(bodyKey,now);
      const friend=friendsStore.get().friends.find(f=>String(f.id)===item.senderId);
      const sourceKey=`msg:${++increment.current}`;
      // Show the incoming message immediately. Server-owned User data can
      // enrich the portrait/name afterward without delaying the notification.
      enqueue({
        ...item,sourceKey,
        senderName:trim(friend?.name||friend?.friend_name||item.senderName||'Player',100),
        senderAvatar:photoURL(friend?.avatar_url||friend?.avatar||item.senderAvatar),
      },true);
      let user=null;
      try{
        const list=await base44.entities.User.filter({id:item.senderId});
        user=Array.isArray(list)?list[0]:null;
      }catch{}
      if(!mounted||!user)return;
      setQueue(previous=>previous.map(notice=>notice.sourceKey===sourceKey
        ? {
          ...notice,
          senderName:trim(user.full_name||user.username||user.display_name||
            notice.senderName,100),
          senderAvatar:photoURL(user.avatar_url||user.profile_picture||
            notice.senderAvatar),
        } : notice));
    };
    const onRTC=e=>{void show({type:'create',data:e.detail});};
    window.addEventListener('directMessageReceived',onRTC);
    let unsubscribe;
    try{unsubscribe=base44.entities.DirectMessage.subscribe(e=>{void show(e);});}catch{}
    return ()=>{
      mounted=false;window.removeEventListener('directMessageReceived',onRTC);
      if(typeof unsubscribe==='function')unsubscribe();
    };
  },[me?.id,enqueue]);

  const openReply = notice => {
    if(!me?.id || !notice?.senderId)return;
    setReplyTo({
      id:notice.senderId,
      friend_id:notice.senderId,
      friend_name:notice.senderName||'Player',
      avatar_url:photoURL(notice.senderAvatar),
    });
    dismiss();
  };

  return <>
    {active && <div className={`axe-lunar-notifications axe-lunar-notifications--${active.kind}`}
      data-daytime={day?'day':'night'} role="status" aria-live="polite" aria-atomic="true">
      {active.kind==='level' && <LevelNotice notice={active} onClose={dismiss} onAllocate={openLevelUpAttributes}/>}
      {active.kind==='story' && <StoryNotice notice={active} day={day} onClose={dismiss}/>}
      {active.kind==='message' && <MessageNotice notice={active} day={day}
        onClose={dismiss} onReply={openReply}/>}
    </div>}
    {replyTo && me?.id && <FriendMessengerPanel friend={replyTo}
      currentUserId={me.id} onClose={()=>setReplyTo(null)} />}
  </>;
}
