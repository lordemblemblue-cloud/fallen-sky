import { useCallback, useEffect, useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { partyStore } from './socialStores';
import { WORLD_CHAT_CHANNEL, fetchChatHistory, partyChatChannel, sendChatMessage } from './worldChat';
import { listGame3DBlockedPlayers } from './game3dWorldInteractions';
import {getGame3DCombatLog,subscribeGame3DCombatLog,describeGame3DCombatEvent}
  from '../combat/Game3DCombatLog.mjs';
import {nextChatEnterState,isIncomingChatMessage} from './chatVisibilityModel.mjs';
import './Game3DChatChannels.css';

/**
 * WorldChatPanel — the world's chat box, docked above the left Jade HUD skill diamond.
 *
 * World chat reaches everyone in the world; party chat only the party. Enter opens the
 * input and sends; Esc closes it. While typing, keys never reach the game: the input
 * stops them, so WASD, skill numbers or F do nothing until the chat closes.
 * Messages go through worldChat (server rules); new ones arrive live.
 */
const MAX_LINES = 80;
const CHANNEL_STYLE = {
  world: { label: 'World', tag: 'text-amber-200/80', name: 'text-amber-100' },
  party: { label: 'Party', tag: 'text-cyan-200/80', name: 'text-cyan-100' },
  combat: { label: 'Combat', tag: 'text-amber-200/80', name: 'text-white/85' },
};

export default function WorldChatPanel({ userId, suppressed = false, showDock = true, alwaysVisible = false, onOpenClan }) {
  const [party, setParty] = useState(partyStore.get());
  const [tab, setTab] = useState('world');
  const [lines, setLines] = useState({ world: [], party: [] });
  const [typing, setTyping] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [activity, setActivity] = useState(0);
  const [draft, setDraft] = useState('');
  const [notice, setNotice] = useState('');
  const [blockedIds, setBlockedIds] = useState(() => new Set());
  const [combatEvents,setCombatEvents]=useState(getGame3DCombatLog);
  useEffect(()=>subscribeGame3DCombatLog(setCombatEvents),[]);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  useEffect(() => partyStore.subscribe(setParty), []);
  useEffect(() => {
    if (!userId) { setBlockedIds(new Set()); return undefined; }
    let live = true;
    const reload = async () => {
      try {
        const result = await listGame3DBlockedPlayers();
        if (live) setBlockedIds(new Set(result.blockedUserIds || []));
      } catch { /* private chat server still enforces blocks if the HUD is offline */ }
    };
    void reload();
    window.addEventListener('game3dBlockedListChanged', reload);
    return () => { live = false; window.removeEventListener('game3dBlockedListChanged', reload); };
  }, [userId]);
  const partyChannel = party.partyId ? partyChatChannel(party.partyId) : null;
  const inParty = !!party.partyId && (party.members || []).length > 1;
  useEffect(() => { if (!inParty && tab === 'party') setTab('world'); }, [inParty, tab]);

  const addLines = useCallback((channel, messages) => {
    setLines((prev) => {
      const seen = new Set(prev[channel].map((m) => m.id));
      const merged = [...prev[channel], ...messages.filter((m) => m && !m.is_deleted && !seen.has(m.id))];
      return { ...prev, [channel]: merged.slice(-MAX_LINES) };
    });
  }, []);

  // history for the world, and for the party while in one
  useEffect(() => {
    if (!userId) return;
    fetchChatHistory('world').then((r) => addLines('world', r.messages || [])).catch(() => {});
  }, [userId, addLines]);
  useEffect(() => {
    setLines((prev) => ({ ...prev, party: [] }));
    if (!userId || !inParty) return;
    fetchChatHistory('party').then((r) => addLines('party', r.messages || [])).catch(() => {});
  }, [userId, inParty, partyChannel, addLines]);

  // New messages reveal the actual chat, including while the dock is idle.
  // Do not gate the *attempt* to subscribe on an account id: guest-only world
  // entry has no Base44 user, but authenticated servers may still permit reads.
  // The server's RLS remains authoritative and is never bypassed here.
  useEffect(() => {
    try {
      const unsubscribe = base44.entities.ChatMessage.subscribe((event) => {
        const message = event?.data;
        if (!message || event.type === 'delete') return;
        const channel = message.channel_id === WORLD_CHAT_CHANNEL ? 'world'
          : partyChannel && message.channel_id === partyChannel ? 'party' : null;
        if (!channel) return;
        addLines(channel, [message]);
        if (isIncomingChatMessage(message,userId)) {
          setExpanded(true);
          if (!typing) setTab(channel);
          setActivity(value => value + 1);
        }
      });
      return () => { if (typeof unsubscribe === 'function') unsubscribe(); };
    } catch {
      // Permission-denied guest subscriptions must not crash the HUD or Enter.
      return undefined;
    }
  }, [userId, partyChannel, addLines, typing]);

  // Opening chat from Settings uses the exact same real world/party channel.
  useEffect(() => {
    const open = () => { if (!suppressed) { setExpanded(true); setTyping(true); } };
    window.addEventListener('game3dOpenWorldChat',open);
    return () => window.removeEventListener('game3dOpenWorldChat',open);
  },[suppressed]);
  // Enter focuses the existing translucent dock on the first press. Run in
  // capture so gameplay's bubbling hotkeys cannot consume the activation.
  // Never hijack Enter when another text field or menu owns keyboard input.
  useEffect(() => {
    const onKey = (event) => {
      if (event.key !== 'Enter') return;
      const next = nextChatEnterState({
        expanded, typing, tab,
        suppressed:suppressed || window.__axeServiceModeOpen ||
          window.__axePauseMenuOpen || window.__axeDialogueOpen,
        editable:!!event.target?.closest?.(
          'input, textarea, select, button, a, [role="button"], [contenteditable="true"]'
        ),
        composing:event.isComposing,
        repeat:event.repeat,
      });
      if (!next) return;
      event.preventDefault();
      event.stopImmediatePropagation?.();
      setTab(next.tab);
      setExpanded(next.expanded);
      setTyping(next.typing);
      setActivity(value => value + 1);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [typing, expanded, suppressed, tab]);
  useEffect(() => {
    if (typing || !expanded || alwaysVisible) return undefined;
    const timeout = window.setTimeout(() => setExpanded(false), 9000);
    return () => window.clearTimeout(timeout);
  }, [typing, expanded, activity, alwaysVisible]);
  useEffect(() => {
    if (suppressed) inputRef.current?.blur();
    else if (typing) inputRef.current?.focus();
  }, [typing, suppressed]);
  useEffect(() => { listRef.current?.scrollTo?.({ top: listRef.current.scrollHeight }); }, [lines, combatEvents, tab]);

  const close = () => { setTyping(false); setExpanded(false); setDraft(''); inputRef.current?.blur(); };
  const send = async () => {
    const text = draft.trim();
    if (tab==='combat') return;
    if (!text) { close(); return; }
    if (!userId) {
      // Existing worldChat server requires auth.me() before granting writes.
      // Keep the message intact; do not fabricate a successful multiplayer send.
      setNotice('World chat messaging needs server support for guest characters.');
      setExpanded(true);
      return;
    }
    try {
      const { message } = await sendChatMessage(tab, text);
      if (message) addLines(tab, [message]);
      setNotice('');
      setDraft('');
      setTyping(false);
      inputRef.current?.blur();
      // Keep the submitted message visible long enough to read before fading.
      setExpanded(true);
      setActivity(value => value + 1);
    } catch (e) {
      setNotice(e?.code === 'rate_limit' ? 'Slow down a little.' : e?.code === 'conflict' ? 'You just said that.' : e?.message || 'Message not sent.');
    }
  };
  // keys typed into the chat never reach the game's hotkeys
  const onInputKey = (e) => {
    e.stopPropagation();
    if (e.key === 'Enter' && !e.nativeEvent?.isComposing) { e.preventDefault(); void send(); }
    else if (e.key === 'Escape') { e.preventDefault(); close(); }
  };

  if (!showDock && !typing && !expanded && !alwaysVisible) return null;
  const shown = tab==='combat'?combatEvents:(lines[tab] || []).filter(line => !blockedIds.has(line.sender_id));
  const style = CHANNEL_STYLE[tab]||CHANNEL_STYLE.world;
  return (
    <div
      className={`game3d-world-chat fixed z-[40] ${typing ? 'is-typing' : expanded ? 'is-expanded' : 'is-idle'} ${alwaysVisible ? 'is-pinned' : ''}`}
      aria-label="World chat" data-chat-visible={typing||expanded||alwaysVisible ? 'true' : 'false'}
    >
      <div className="game3d-chat-surface">
      {showDock&&combatEvents.length>0&&<aside className="game3d-chat-combat-strip" aria-label="Most recent combat result">
        <strong>COMBAT</strong>
        <div>{combatEvents.slice(-1).map(event=><span key={event.id}
          data-damage-type={event.type}>{describeGame3DCombatEvent(event)}</span>)}
        </div>
      </aside>}
      <div ref={listRef} className="game3d-chat-messages max-h-[88px] overflow-y-auto px-2 py-1 text-[11px] leading-snug">
        {shown.length===0&&<div className="text-white/40">{tab==='combat'?'No combat events yet.':'No messages yet.'}</div>}
        {tab==='combat' ? shown.map(event=><div key={event.id} className="game3d-chat-combat-event"
          data-damage-type={event.type}>{describeGame3DCombatEvent(event)}</div>) :
          shown.map(m=><div key={m.id} className="break-words text-white/80">
            <span className={`${style.tag} mr-1`}>[{style.label}]</span>
            <span className={`${style.name} font-semibold`}>{m.sender_id===userId?'You':(m.sender_name||'Player')}:</span>{' '}
            <span>{m.content}</span>
          </div>)}
      </div>
      {typing&&tab!=='combat' && (
        <div className="border-t border-white/10 px-2 py-1.5">
          <input
            ref={inputRef}
            value={draft}
            maxLength={200}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onInputKey}
            onKeyUp={(e) => e.stopPropagation()}
            onBlur={() => { if (!draft.trim()) setTyping(false); }}
            placeholder={`Message ${style.label.toLowerCase()} chat`}
            className="w-full rounded bg-black/30 px-2 py-1 text-[11px] text-white placeholder:text-white/30 focus:outline-none"
          />
          {!userId && !notice &&
            <div className="mt-1 text-[10px] text-amber-200/80" role="status">
              Guest chat is waiting for a server-enabled messaging session.
            </div>}
          {notice && <div className="mt-1 text-[10px] text-amber-200/80" role="status">{notice}</div>}
        </div>
      )}
      </div>
      <div className="game3d-chat-channel-row pointer-events-auto" role="group" aria-label="Chat channels">
        <button type="button" disabled title="Regular nearby chat needs server proximity messaging">Regular</button>
        <button type="button" aria-pressed={tab==='world'} onClick={()=>{setTab('world');setExpanded(true);setTyping(true);}}
          className={tab==='world'?'is-active':''}>World</button>
        {inParty&&<button type="button" aria-pressed={tab==='party'} onClick={()=>{setTab('party');setExpanded(true);setTyping(true);}}
          className={tab==='party'?'is-active':''}>Party</button>}
        <button type="button" onClick={()=>{setTyping(false);onOpenClan?.();}}
          title="Open your existing guild chat">Clan</button>
        <button type="button" disabled title="Faction broadcast requires verified leader or vice-leader status">Faction Call</button>
        <button type="button" aria-pressed={tab==='combat'} onClick={()=>{setTab('combat');setExpanded(true);setTyping(false);setActivity(v=>v+1);}}
          className={tab==='combat'?'is-active':''}>Combat</button>
       </div>
    </div>
  );
}
