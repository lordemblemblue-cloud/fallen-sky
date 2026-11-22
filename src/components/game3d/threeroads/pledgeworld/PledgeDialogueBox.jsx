import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollText, Check, X, ChevronRight } from 'lucide-react';
import { getQuestState } from '../../useQuestStore';
import { playPledgeLine, stopPledgeLine } from '../../pledges/voice/pledgeVoice.mjs';
import { buildPledgeDialogueView } from './pledgeDialogueView.mjs';

/**
 * The dialogue box for a pledge. QuestDialogueBox hands a pledge here and
 * draws every other quest itself, unchanged.
 *
 * offer:       the giver's lines one at a time, then who it is sworn to, why
 *              it is asked and what keeping it costs, and a button that has to
 *              be held for a second to swear.
 * in_progress: the step the pledge is at.
 * turn_in:     the lines of the ending, one at a time; the last one closes it.
 *
 * Keys (the game reads none while a dialogue is open): F, Enter, Space or E
 * for the next line; hold F or Enter to swear; R or Esc to walk away.
 */
const NEXT_KEYS = ['f', 'enter', ' ', 'e'];
const SWEAR_KEYS = ['f', 'enter'];

export default function PledgeDialogueBox({
  npcName, quest, mode = 'offer', objectiveProgress = {},
  onAccept, onDecline, onClose, onClaim,
}) {
  const view = useMemo(
    () => buildPledgeDialogueView(quest, { mode, objectiveProgress, questState: getQuestState() }),
    [quest, mode, objectiveProgress],
  );
  const [pageIndex, setPageIndex] = useState(0);
  const [hold, setHold] = useState(0); // 0..1 while the swear button is held
  const holdRef = useRef({ timer: null, start: 0, done: false });
  const live = useRef({});
  const pageCount = view?.pages.length || 1;
  const page = view?.pages[Math.min(pageIndex, pageCount - 1)] || null;
  const lastPage = pageIndex >= pageCount - 1;

  const stopHold = () => {
    const state = holdRef.current;
    if (state.timer) { clearInterval(state.timer); state.timer = null; }
    if (!state.done) setHold(0);
  };
  const startHold = () => {
    const state = holdRef.current;
    if (state.timer || state.done || !view) return;
    state.start = performance.now();
    state.timer = setInterval(() => {
      const part = Math.min(1, (performance.now() - state.start) / (view.holdSeconds * 1000));
      setHold(part);
      if (part >= 1) {
        clearInterval(state.timer);
        state.timer = null;
        state.done = true;
        live.current.onAccept?.();
      }
    }, 40);
  };
  const next = () => setPageIndex(index => Math.min(index + 1, pageCount - 1));
  live.current = { onAccept, onDecline, onClose, onClaim, page, lastPage, mode, next, startHold, stopHold };

  // A new pledge or a new mode starts from the first line.
  useEffect(() => {
    setPageIndex(0);
    setHold(0);
    holdRef.current.done = false;
    return () => { const state = holdRef.current; if (state.timer) { clearInterval(state.timer); state.timer = null; } };
  }, [quest?.id, mode]);

  useEffect(() => {
    if (!view) return undefined;
    if (document.pointerLockElement) document.exitPointerLock?.();
    const typing = event => event.target?.closest?.('input,textarea,select,[contenteditable="true"]');
    const onKeyDown = event => {
      if (event.altKey || event.ctrlKey || event.metaKey || typing(event)) return;
      const key = event.key.toLowerCase();
      const now = live.current;
      const take = () => { event.preventDefault(); event.stopImmediatePropagation(); };
      if (key === 'escape' || (key === 'r' && now.mode === 'offer')) {
        take();
        if (!event.repeat) (now.mode === 'offer' ? now.onDecline : now.onClose)?.();
      } else if (now.page?.kind === 'oath') {
        if (SWEAR_KEYS.includes(key)) { take(); now.startHold(); }
        else if (NEXT_KEYS.includes(key)) take();
      } else if (NEXT_KEYS.includes(key)) {
        take();
        if (event.repeat) return;
        if (!now.lastPage) now.next();
        else if (now.mode === 'turn_in') now.onClaim?.();
        else if (now.mode === 'in_progress') now.onClose?.();
      }
    };
    const onKeyUp = event => {
      if (SWEAR_KEYS.includes(event.key.toLowerCase())) live.current.stopHold();
    };
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('keyup', onKeyUp, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('keyup', onKeyUp, true);
    };
  }, [view?.id, mode]);

  // Each line is voiced as it is shown, if a recording exists.
  const lineId = page?.kind === 'line' ? page.line.lineId : null;
  useEffect(() => {
    if (!lineId) return undefined;
    playPledgeLine(lineId, { caption: page.line.text }).catch(() => {});
    return () => stopPledgeLine();
  }, [lineId]);

  if (!view || !page) return null;

  const speaker = page.kind === 'line' ? (page.line.speakerName || npcName) : npcName;
  const glassButton = 'px-4 py-2.5 rounded-lg text-xs font-bold tracking-wider uppercase transition-all flex items-center gap-1.5';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${npcName}: ${view.title}`}
      data-pledge-dialogue={view.mode}
      className="fixed left-3 right-3 top-20 sm:left-6 sm:right-auto sm:top-24 sm:w-[480px] sm:max-w-[60vw] rounded-2xl p-5 sm:p-6 z-[9999] max-h-[78vh] overflow-y-auto"
      style={{
        background: 'rgba(10, 14, 22, 0.78)',
        backdropFilter: 'blur(28px) saturate(180%)',
        WebkitBackdropFilter: 'blur(28px) saturate(180%)',
        border: '1px solid rgba(250, 204, 21, 0.35)',
        boxShadow: '0 12px 48px rgba(0, 0, 0, 0.55), 0 0 40px rgba(250, 204, 21, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.08)',
      }}
    >
      <div className="flex items-center gap-2.5 mb-3">
        <div
          className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: 'rgba(250, 204, 21, 0.15)', border: '1px solid rgba(250, 204, 21, 0.4)' }}
        >
          <ScrollText className="w-4 h-4 text-yellow-300" />
        </div>
        <div className="min-w-0">
          <div className="text-[10px] font-bold tracking-[0.25em] uppercase text-yellow-300/80 truncate">{speaker}</div>
          <div className="text-lg font-bold text-white tracking-wide">{view.title}</div>
        </div>
      </div>

      {page.kind === 'line' && (
        <button
          type="button"
          onClick={() => { if (!lastPage) next(); }}
          className="block w-full text-left text-[15px] text-white/90 leading-relaxed mb-4 min-h-[5.5rem] bg-transparent"
          data-pledge-line={page.line.lineId}
        >
          {page.line.text}
        </button>
      )}

      {page.kind === 'oath' && (
        <div className="space-y-2 mb-4" data-pledge-oath>
          {[['Sworn to', view.swornTo], ['Why it is asked', view.cause], ['What keeping it costs', view.cost]].map(([label, text]) => (
            <div
              key={label}
              className="px-3 py-2 rounded-lg"
              style={{ background: 'rgba(255, 255, 255, 0.04)', border: '1px solid rgba(255, 255, 255, 0.08)' }}
            >
              <div className="text-[9px] font-bold tracking-[0.2em] uppercase text-yellow-300/60 mb-0.5">{label}</div>
              <div className="text-sm text-white/90 leading-snug">{text}</div>
            </div>
          ))}
        </div>
      )}

      {(page.kind === 'step' || page.kind === 'kept') && (
        <div
          className="px-3 py-2 rounded-lg mb-4"
          style={{ background: 'rgba(255, 255, 255, 0.04)', border: '1px solid rgba(255, 255, 255, 0.08)' }}
          data-pledge-step={view.step?.id || 'done'}
        >
          <div className="text-[9px] font-bold tracking-[0.2em] uppercase text-white/40 mb-1">
            {view.step ? `Step ${view.stepNumber} of ${view.stepCount}` : 'Every step is done'}
          </div>
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="text-white/90">{view.step ? view.step.text : `Sworn to ${view.swornTo}`}</span>
            {view.step && view.step.required > 1 && (
              <span className="font-mono text-xs text-yellow-300 shrink-0">{view.step.current} of {view.step.required}</span>
            )}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        <div className="text-[10px] text-white/45">
          {pageCount > 1 ? `${Math.min(pageIndex + 1, pageCount)} / ${pageCount}` : ''}
        </div>
        <div className="flex justify-end gap-2 flex-wrap">
          {mode === 'offer' && (
            <button type="button" onClick={onDecline} className={`${glassButton} bg-white/[0.05] hover:bg-white/[0.1] border border-white/10 text-white/70`}>
              <X className="w-3.5 h-3.5" /> Not now
            </button>
          )}
          {page.kind === 'line' && !lastPage && (
            <button type="button" onClick={next} className={`${glassButton} bg-yellow-500/20 hover:bg-yellow-500/30 border border-yellow-400/50 text-yellow-200`}>
              Next <ChevronRight className="w-3.5 h-3.5" />
            </button>
          )}
          {page.kind === 'oath' && (
            <button
              type="button"
              onPointerDown={event => { event.preventDefault(); startHold(); }}
              onPointerUp={stopHold}
              onPointerLeave={stopHold}
              onPointerCancel={stopHold}
              onContextMenu={event => event.preventDefault()}
              className={`${glassButton} relative overflow-hidden bg-yellow-500/20 border border-yellow-300/70 text-yellow-100 select-none`}
              style={{ boxShadow: '0 0 16px rgba(250, 204, 21, 0.2)', touchAction: 'none' }}
              data-pledge-swear
            >
              <span
                aria-hidden="true"
                className="absolute inset-y-0 left-0 bg-yellow-400/40"
                style={{ width: `${Math.round(hold * 100)}%` }}
              />
              <span className="relative flex items-center gap-1.5"><Check className="w-3.5 h-3.5" /> Hold to swear</span>
            </button>
          )}
          {mode === 'in_progress' && (
            <button type="button" onClick={onClose} className={`${glassButton} bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/40 text-cyan-200`}>
              Keep going
            </button>
          )}
          {mode === 'turn_in' && lastPage && (
            <button
              type="button"
              onClick={onClaim}
              className={`${glassButton} bg-green-500/25 hover:bg-green-500/40 border border-green-400/50 text-green-200`}
              style={{ boxShadow: '0 0 18px rgba(74, 222, 128, 0.25)' }}
              data-pledge-kept
            >
              <Check className="w-3.5 h-3.5" /> Pledge kept
            </button>
          )}
        </div>
      </div>
      <div className="text-[10px] text-white/40 mt-2 text-right hidden sm:block">
        {page.kind === 'oath' ? 'Hold F to swear · R walk away' : mode === 'offer' ? 'F next · R walk away' : 'F next · Esc close'}
      </div>
    </div>
  );
}
