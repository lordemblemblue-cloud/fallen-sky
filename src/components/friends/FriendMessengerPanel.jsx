import { useEffect, useMemo, useState } from 'react';
import { MessageCircle, Send, X } from 'lucide-react';

// Direct messages with one friend. There is no messaging service connected in
// this build, so the thread is kept on this device and the panel says so.
const storageKey = (userId, friendId) => `atomxe.dm.${userId}.${friendId}`;

export default function FriendMessengerPanel({ friend, currentUserId, onClose }) {
  const [text, setText] = useState('');
  const [thread, setThread] = useState([]);
  const key = useMemo(() => storageKey(currentUserId, friend?.id), [currentUserId, friend?.id]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      setThread(raw ? JSON.parse(raw) : []);
    } catch {
      setThread([]);
    }
  }, [key]);

  const send = () => {
    const body = text.trim();
    if (!body) return;
    const next = [...thread, { id: `${Date.now()}`, body, at: new Date().toISOString(), mine: true }];
    setThread(next);
    setText('');
    try {
      localStorage.setItem(key, JSON.stringify(next));
    } catch {
      /* storage blocked */
    }
  };

  return (
    <aside className="fixed bottom-5 right-5 z-[9200] w-[320px] rounded-2xl border border-white/10 bg-[#080d16]/95 p-4 text-white shadow-2xl backdrop-blur">
      <header className="mb-3 flex items-center gap-2">
        <MessageCircle className="h-4 w-4 text-cyan-300" />
        <p className="flex-1 truncate text-sm font-semibold">{friend?.name || 'Friend'}</p>
        <button type="button" onClick={onClose} aria-label="Close message panel" className="text-white/50 hover:text-white">
          <X className="h-4 w-4" />
        </button>
      </header>

      <div className="max-h-52 space-y-2 overflow-y-auto pr-1">
        {thread.length === 0 ? (
          <p className="text-[11px] leading-relaxed text-white/40">
            No messages yet. Notes you send stay on this device until direct messaging is connected.
          </p>
        ) : (
          thread.map((message) => (
            <p key={message.id} className="ml-auto max-w-[85%] rounded-xl bg-cyan-400/15 px-3 py-2 text-xs text-white/85">
              {message.body}
            </p>
          ))
        )}
      </div>

      <div className="mt-3 flex items-center gap-2">
        <input
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') send();
          }}
          placeholder="Write a message"
          className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white outline-none placeholder:text-white/30 focus:border-cyan-300/50"
        />
        <button
          type="button"
          onClick={send}
          aria-label="Send message"
          className="grid h-8 w-8 place-items-center rounded-lg bg-cyan-400/20 text-cyan-200 hover:bg-cyan-400/30"
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
    </aside>
  );
}