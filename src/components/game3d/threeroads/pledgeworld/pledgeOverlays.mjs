// What a pledge shows on screen besides the dialogue box and the tracker:
// the prompt for a deed ("Hold E  Tie your ribbon"), the caption for a spoken
// line, the choice, and a short notice when a step has to be started again.
// Plain DOM, built on first use and taken away on dispose. Nothing here can
// take a click or a key while it is hidden: the layer ignores the pointer and
// each piece is display:none until it has something to show.
//
// The prompt copies the game's own "Speak with" prompt in GameWorld3D.jsx.

const GOLD = 'rgba(250, 204, 21, 0.5)';

function style(element, rules) {
  for (const key of Object.keys(rules)) element.style[key] = rules[key];
  return element;
}

const noOverlays = Object.freeze({
  setPrompt() {}, setCaption() {}, setChoice() {}, showNotice() {}, update() {}, dispose() {},
  choiceOpen: () => false,
});

export function createPledgeOverlays(win, {
  onChoose = () => {}, onDismissChoice = () => {}, onPromptDown = () => {}, onPromptUp = () => {},
} = {}) {
  const doc = win?.document;
  if (!doc?.createElement || !doc.body) return noOverlays;
  const make = (tag, rules, parent) => {
    const element = style(doc.createElement(tag), rules);
    if (parent) parent.appendChild(element);
    return element;
  };
  // A finger has no E key: the prompt itself is pressed instead.
  const touch = !!win.matchMedia?.('(pointer: coarse)')?.matches;

  const root = make('div', {
    position: 'fixed', inset: '0', pointerEvents: 'none', zIndex: '9000',
    fontFamily: 'inherit', color: '#fff',
  }, doc.body);
  root.setAttribute('data-three-roads-pledge-overlays', '');

  // ── Notice ──
  const notice = make('div', {
    display: 'none', position: 'absolute', left: '50%', top: 'min(7rem, 18vh)', transform: 'translateX(-50%)',
    maxWidth: 'min(560px, 92vw)', padding: '8px 16px', borderRadius: '10px', textAlign: 'center',
    background: 'rgba(40, 14, 14, 0.82)', border: '1px solid rgba(248, 113, 113, 0.5)',
    fontSize: '14px', lineHeight: '1.4',
  }, root);
  notice.setAttribute('role', 'status');
  let noticeUntil = 0;

  // ── Caption ──
  const caption = make('div', {
    display: 'none', position: 'absolute', left: '50%', bottom: 'min(17rem, 38vh)', transform: 'translateX(-50%)',
    width: 'max-content', maxWidth: 'min(680px, 92vw)', padding: '10px 18px', borderRadius: '14px',
    textAlign: 'center', background: 'rgba(10, 14, 22, 0.8)', backdropFilter: 'blur(14px) saturate(160%)',
    border: '1px solid rgba(255, 255, 255, 0.14)', boxShadow: '0 8px 28px rgba(0, 0, 0, 0.45)',
  }, root);
  caption.setAttribute('aria-live', 'polite');
  const captionName = make('div', {
    fontSize: '11px', fontWeight: '700', letterSpacing: '0.2em', textTransform: 'uppercase',
    color: '#fde047', marginBottom: '3px',
  }, caption);
  const captionText = make('div', { fontSize: '15px', lineHeight: '1.45' }, caption);

  // ── Prompt ──
  const prompt = make('div', {
    display: 'none', position: 'absolute', left: '50%', bottom: 'min(13rem, 27vh)', transform: 'translateX(-50%)',
    maxWidth: '92vw', padding: touch ? '14px 22px' : '10px 20px', borderRadius: '9999px', overflow: 'hidden',
    alignItems: 'center', gap: '8px', fontSize: '14px', whiteSpace: 'nowrap',
    background: 'rgba(15, 20, 30, 0.7)', backdropFilter: 'blur(14px) saturate(160%)',
    border: '1px solid ' + GOLD, boxShadow: '0 4px 18px rgba(250, 204, 21, 0.25)',
    pointerEvents: touch ? 'auto' : 'none', touchAction: 'none', userSelect: 'none',
  }, root);
  const promptVerb = make('span', { color: 'rgba(255,255,255,0.75)' }, prompt);
  const promptKey = make('span', {
    padding: '2px 8px', borderRadius: '4px', background: 'rgba(234, 179, 8, 0.25)',
    border: '1px solid rgba(250, 204, 21, 0.4)', fontFamily: 'ui-monospace, monospace', fontSize: '12px', color: '#fef08a',
  }, prompt);
  const promptLabel = make('span', { color: '#fde047', fontWeight: '600', overflow: 'hidden', textOverflow: 'ellipsis' }, prompt);
  const promptBar = make('span', {
    position: 'absolute', left: '0', bottom: '0', height: '3px', width: '0%',
    background: '#fde047', transition: 'width 80ms linear',
  }, prompt);
  const down = event => { event.preventDefault(); onPromptDown(); };
  const up = () => onPromptUp();
  if (touch) {
    prompt.addEventListener('pointerdown', down);
    prompt.addEventListener('pointerup', up);
    prompt.addEventListener('pointercancel', up);
    prompt.addEventListener('pointerleave', up);
  }
  let promptShown = '';

  // ── Choice ──
  const choice = make('div', {
    display: 'none', position: 'absolute', left: '50%', bottom: 'min(9rem, 20vh)', transform: 'translateX(-50%)',
    width: 'min(520px, 92vw)', boxSizing: 'border-box', padding: '16px', borderRadius: '16px', pointerEvents: 'auto',
    background: 'rgba(10, 14, 22, 0.88)', backdropFilter: 'blur(20px) saturate(170%)',
    border: '1px solid rgba(250, 204, 21, 0.4)', boxShadow: '0 12px 48px rgba(0, 0, 0, 0.55)',
  }, root);
  choice.setAttribute('role', 'dialog');
  let choiceShown = null;

  function buildChoice(shown) {
    while (choice.firstChild) choice.removeChild(choice.firstChild);
    choice.setAttribute('aria-label', shown.prompt);
    const head = make('div', { fontSize: '15px', fontStyle: 'italic', color: 'rgba(255,255,255,0.88)', marginBottom: '12px', lineHeight: '1.4' }, choice);
    head.textContent = shown.prompt;
    shown.options.forEach((option, index) => {
      const button = make('button', {
        display: 'flex', alignItems: 'center', gap: '10px', width: '100%', minHeight: '46px', marginBottom: '8px',
        padding: '10px 14px', borderRadius: '10px', cursor: 'pointer', textAlign: 'left', fontSize: '15px', color: '#fef9c3',
        background: 'rgba(234, 179, 8, 0.14)', border: '1px solid rgba(250, 204, 21, 0.45)',
      }, choice);
      button.type = 'button';
      const key = make('span', {
        flex: 'none', padding: '1px 7px', borderRadius: '4px', fontFamily: 'ui-monospace, monospace', fontSize: '12px',
        background: 'rgba(234, 179, 8, 0.25)', border: '1px solid rgba(250, 204, 21, 0.4)', color: '#fef08a',
      }, button);
      key.textContent = String(index + 1);
      const text = make('span', {}, button);
      text.textContent = option.text;
      button.addEventListener('click', () => onChoose(shown.pledgeId, option.id));
    });
    const later = make('button', {
      display: 'block', marginLeft: 'auto', minHeight: '36px', padding: '6px 12px', borderRadius: '8px', cursor: 'pointer',
      fontSize: '12px', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.7)',
      background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
    }, choice);
    later.type = 'button';
    later.textContent = touch ? 'Not yet' : 'Not yet (Esc)';
    later.addEventListener('click', () => onDismissChoice(shown.pledgeId));
  }

  return {
    // prompt: { key, hold, label, progress } | null
    setPrompt(next) {
      if (!next) {
        if (promptShown) { promptShown = ''; prompt.style.display = 'none'; }
        return;
      }
      const signature = (next.key || '') + '|' + (next.hold ? 'h' : 'p') + '|' + next.label;
      if (signature !== promptShown) {
        promptShown = signature;
        promptVerb.textContent = next.key ? (next.hold ? (touch ? 'Hold here' : 'Hold') : (touch ? 'Tap' : '')) : '';
        promptVerb.style.display = promptVerb.textContent ? '' : 'none';
        promptKey.textContent = next.key || '';
        promptKey.style.display = next.key && !touch ? '' : 'none';
        promptLabel.textContent = next.label;
        prompt.style.display = 'flex';
      }
      promptBar.style.width = next.progress > 0 ? Math.round(next.progress * 100) + '%' : '0%';
    },
    // caption: { name, text, stage } | null
    setCaption(next) {
      if (!next) { caption.style.display = 'none'; return; }
      captionName.textContent = next.name || '';
      captionName.style.display = next.name ? '' : 'none';
      captionText.textContent = next.text;
      captionText.style.fontStyle = next.stage ? 'italic' : 'normal';
      captionText.style.color = next.stage ? 'rgba(255,255,255,0.7)' : '#fff';
      caption.style.display = 'block';
    },
    // choice: { pledgeId, stepId, prompt, options: [{ id, text }] } | null
    setChoice(next) {
      if (next === choiceShown) return;
      choiceShown = next;
      if (!next) { choice.style.display = 'none'; return; }
      buildChoice(next);
      choice.style.display = 'block';
    },
    choiceOpen: () => !!choiceShown,
    showNotice(text, now, seconds = 6) {
      if (!text) return;
      notice.textContent = text;
      notice.style.display = 'block';
      noticeUntil = now + seconds;
    },
    update(now) {
      if (noticeUntil && now >= noticeUntil) { noticeUntil = 0; notice.style.display = 'none'; }
    },
    dispose() {
      if (touch) {
        prompt.removeEventListener('pointerdown', down);
        prompt.removeEventListener('pointerup', up);
        prompt.removeEventListener('pointercancel', up);
        prompt.removeEventListener('pointerleave', up);
      }
      root.parentNode?.removeChild(root);
      choiceShown = null;
      promptShown = '';
    },
  };
}
