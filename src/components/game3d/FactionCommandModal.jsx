import {useEffect,useRef} from 'react';
import {X} from 'lucide-react';
import FactionOverview from './axe/factions/FactionOverview';
import './FactionCommandModal.css';

/** Standalone faction comparison: never a submenu inside Escape / Settings. */
export default function FactionCommandModal({onClose}) {
  const panelRef=useRef(null);
  const closeRef=useRef(null);
  useEffect(()=>{
    const previous=document.activeElement;
    const previousModal=window.__axeUiModalOpen;
    // Reuse the world's existing input guard so movement and attacks pause.
    window.__axeUiModalOpen=true;
    closeRef.current?.focus();
    const onKey=event=>{
      if(event.key==='Escape'){
        event.preventDefault();event.stopImmediatePropagation?.();onClose();
        return;
      }
      if(event.key!=='Tab')return;
      const focusable=[...panelRef.current?.querySelectorAll('button:not([disabled]),[href],[tabindex]:not([tabindex="-1"])')||[]]
        .filter(node=>node.getClientRects().length);
      if(!focusable.length)return;
      const first=focusable[0],last=focusable[focusable.length-1];
      if(event.shiftKey && document.activeElement===first){event.preventDefault();last.focus();}
      else if(!event.shiftKey && document.activeElement===last){event.preventDefault();first.focus();}
    };
    window.addEventListener('keydown',onKey,true);
    return ()=>{
      window.removeEventListener('keydown',onKey,true);
      window.__axeUiModalOpen=previousModal;
      previous?.isConnected&&previous?.focus?.();
    };
  },[onClose]);
  return <div className="axe-faction-modal-backdrop" onMouseDown={event=>{
    if(event.target===event.currentTarget)onClose();
  }}>
    <section ref={panelRef} role="dialog" aria-modal="true" aria-labelledby="axe-faction-modal-title"
      className="axe-faction-modal-panel">
      <header className="axe-faction-modal-header">
        <div><span>FALLEN SKY / WORLD BALANCE</span>
          <h2 id="axe-faction-modal-title">The Three Factions</h2>
          <p>Compare leadership, population, treasury and maximum-level strength.</p></div>
        <button type="button" ref={closeRef} onClick={onClose} aria-label="Close faction overview"
          title="Return to world"><X size={22}/></button>
      </header>
      <div className="axe-faction-modal-content"><FactionOverview/></div>
    </section>
  </div>;
}
