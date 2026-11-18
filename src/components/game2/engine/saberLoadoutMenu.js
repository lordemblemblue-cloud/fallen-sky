export const SABER_LOADOUTS = Object.freeze([
  { id: 'single', label: 'Single saber', detail: 'Fast, Medium and Strong styles' },
  { id: 'dual', label: 'Dual sabers', detail: 'One lightsaber in each hand' },
  { id: 'staff', label: 'Double-bladed staff', detail: 'Two blades on one staff' },
]);

// Choosing equipment must not erase an attack, roll, wall exit or Force action.
// The simulation continues behind the menu, including in online matches.
export function saberLoadoutUnavailable(f, now, nextAllowedAt = 0) {
  if (!f?.hasSaber || f.hp <= 0 || f.status !== 'normal') return 'Available when your character is ready.';
  if (!f.onGround || f.wallTraversal || now < (f.wallPoseUntil || 0)) return 'Land before changing your lightsaber.';
  if (f.thrown || f.saber?.inFlight) return 'Recall your lightsaber first.';
  if (f.kata || f.kicking || f.dodge || f.executing || f.forceUntil > now ||
      f.saber?.weaponTime > 0 || f.saber?.isActiveSwing?.()) return 'Finish your current action to change lightsabers.';
  if (now < nextAllowedAt) return 'Lightsaber change is cooling down.';
  return '';
}

// A DOM overlay shared by every native Game 2 mount, including standalone
// review pages. It owns no simulation, skeleton or secondary player model.
export class SaberLoadoutMenu {
  constructor({ canvas, getState, onSelect, onOpenChange }) {
    this.canvas = canvas; this.getState = getState; this.onSelect = onSelect;
    this.onOpenChange = onOpenChange; this.isOpen = false;
    this.onKey = event => {
      if (!this.isOpen) return;
      if (event.code === 'Escape' || event.code === 'Backquote') {
        event.preventDefault(); event.stopImmediatePropagation();
        if (!event.repeat) this.close();
      } else if (event.code === 'Tab' && this.element) {
        const focusable = [...this.element.querySelectorAll('button:not(:disabled)')];
        const index = focusable.indexOf(document.activeElement);
        const next = (index + (event.shiftKey ? -1 : 1) + focusable.length) % focusable.length;
        event.preventDefault(); event.stopImmediatePropagation(); focusable[next]?.focus();
      }
    };
    if (typeof window !== 'undefined') window.addEventListener('keydown', this.onKey, { capture: true });
  }
  mount() {
    if (this.element || typeof document === 'undefined' || typeof document.createElement !== 'function') return;
    const root = document.createElement('div');
    root.setAttribute('data-game2-interface', ''); root.setAttribute('data-game2-saber-menu', '');
    root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-labelledby', 'game2-saber-menu-title');
    root.style.cssText = 'position:absolute;inset:0;z-index:60;display:grid;place-items:center;background:#030814bd;color:#eef4ff;font:15px system-ui;pointer-events:auto;padding:20px;box-sizing:border-box;';
    const panel = document.createElement('div');
    panel.style.cssText = 'width:min(440px,100%);padding:24px;border:1px solid #60758b;border-radius:14px;background:#101b29;box-shadow:0 18px 65px #000b;';
    const title = document.createElement('h2'); title.id = 'game2-saber-menu-title';
    title.textContent = 'Choose your lightsaber'; title.style.cssText = 'margin:0 0 8px;font-size:23px;';
    const help = document.createElement('p'); help.textContent = 'Choose a configuration. Tab changes single-saber style during play.';
    help.style.cssText = 'color:#bacbdb;line-height:1.5;';
    panel.append(title, help); this.buttons = new Map();
    for (const kit of SABER_LOADOUTS) {
      const button = document.createElement('button'); button.type = 'button';
      button.setAttribute('aria-label', kit.label);
      button.style.cssText = 'display:block;width:100%;text-align:left;margin:10px 0;padding:14px;border:1px solid #60758b;border-radius:8px;background:#213247;color:#eef4ff;font:600 16px system-ui;cursor:pointer;';
      const name = document.createElement('span'); name.textContent = kit.label;
      const detail = document.createElement('small'); detail.textContent = kit.detail;
      detail.style.cssText = 'display:block;font:13px system-ui;color:#bacbdb;margin-top:5px;';
      button.append(name, detail);
      button.onclick = () => { if (this.onSelect(kit.id)) this.close(); else this.update(); };
      panel.append(button); this.buttons.set(kit.id, button);
    }
    this.message = document.createElement('p'); this.message.setAttribute('role', 'status');
    this.message.style.cssText = 'min-height:38px;line-height:1.4;color:#c5d6e7;';
    const close = document.createElement('button'); close.type = 'button'; close.textContent = 'Return to game';
    close.style.cssText = 'padding:10px 16px;border:1px solid #60758b;border-radius:7px;background:#101b29;color:#eef4ff;font:14px system-ui;cursor:pointer;';
    close.onclick = () => this.close();
    const hint = document.createElement('p'); hint.textContent = 'Backtick (`) or Esc closes this menu. The match continues.';
    hint.style.cssText = 'margin-bottom:0;color:#91a7ba;font-size:12px;';
    panel.append(this.message, close, hint); root.append(panel);
    (this.canvas.parentElement || document.body).append(root); this.element = root; this.lastStateKey = null;
  }
  open() {
    if (this.isOpen) return;
    this.isOpen = true; this.onOpenChange(true); this.mount(); this.update();
    try { if (document.pointerLockElement === this.canvas) document.exitPointerLock(); } catch { /* embedded previews may restrict lock */ }
    const state = this.getState();
    (this.buttons?.get(state.kit) || this.buttons?.values().next().value)?.focus();
  }
  close() {
    if (!this.isOpen) return;
    this.isOpen = false; this.element?.remove(); this.element = null; this.buttons = null;
    this.onOpenChange(false);
    try { this.canvas.focus?.({ preventScroll: true }); } catch { this.canvas.focus?.(); }
  }
  toggle() { this.isOpen ? this.close() : this.open(); }
  update() {
    if (!this.isOpen || !this.element) return;
    const state = this.getState();
    const key = state.kit + '|' + state.unavailable;
    if (key === this.lastStateKey) return;
    this.lastStateKey = key;
    for (const [id, button] of this.buttons) {
      const selected = state.kit === id;
      button.setAttribute('aria-pressed', String(selected));
      button.disabled = !!state.unavailable && !selected;
      button.style.opacity = button.disabled ? '0.45' : '1';
      button.style.borderColor = selected ? '#68ceff' : '#60758b';
      button.style.background = selected ? '#244c65' : '#213247';
    }
    this.message.textContent = state.unavailable || 'Choose a lightsaber to return to the game.';
  }
  dispose() {
    this.close();
    if (typeof window !== 'undefined') window.removeEventListener('keydown', this.onKey, { capture: true });
  }
}
