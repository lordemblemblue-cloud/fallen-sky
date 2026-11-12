import { useEffect, useMemo, useState } from 'react';
import { MapPin, Navigation, Search, X } from 'lucide-react';
import { listWorkflowDestinations, resolveWorkflowDestination } from './workflowDestinations.mjs';
import './WorkflowTeleportPanel.css';

/** Character-select workflow dial: no world mutation until the user chooses a destination. */
export default function WorkflowTeleportPanel({ onSelect, onClose, busy = false }) {
  const [query, setQuery] = useState('');
  const [sizeFilter, setSizeFilter] = useState('all');
  const [workflows, setWorkflows] = useState(() => listWorkflowDestinations());
  const destination = useMemo(() => resolveWorkflowDestination(query), [query]);
  const dungeonEntrance = useMemo(() => resolveWorkflowDestination('dungeon-entrance'), []);
  const moonfallPreview = useMemo(() => resolveWorkflowDestination('moonfall-expanse'), []);
  const matches = useMemo(() => {
    const filter = query.trim().toLowerCase();
    return workflows.filter((entry) =>
      (sizeFilter === 'all' || entry.kind === sizeFilter) &&
      (!filter || entry.id.toLowerCase().includes(filter) ||
        entry.status.toLowerCase().includes(filter) ||
        (entry.area || '').toLowerCase().includes(filter)));
  }, [workflows, query, sizeFilter]);

  useEffect(() => {
    const refresh = () => setWorkflows(listWorkflowDestinations());
    const onKey = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation?.();
        onClose?.();
      }
    };
    refresh();
    window.addEventListener('storage', refresh);
    window.addEventListener('focus', refresh);
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('storage', refresh);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [onClose]);

  const travel = (target) => {
    if (!busy && target) onSelect?.(target);
  };
  return (
    <div className="axe-workflow-backdrop" role="presentation" onMouseDown={event => {
      if (event.target === event.currentTarget) onClose?.();
    }}>
      <section className="axe-workflow-panel" role="dialog" aria-modal="true"
        aria-label="Workflow tile teleport">
        <header className="axe-workflow-header">
          <div><span className="axe-workflow-kicker">GAME 3D · WOLFVEIL</span>
            <h2>Workflow</h2><p>Travel to work areas, dungeon portals or the Moonfall preview.</p></div>
          <button type="button" className="axe-workflow-close" aria-label="Close Workflow"
            onClick={onClose}><X size={18} /></button>
        </header>
        <form className="axe-workflow-search" onSubmit={event => {
          event.preventDefault();
          travel(destination);
        }}>
          <label htmlFor="axe-workflow-target">Search tile, destination or world coordinates</label>
          <div className="axe-workflow-inputrow">
            <Search size={17} aria-hidden="true" />
            <input id="axe-workflow-target" autoFocus value={query} maxLength={90}
              onChange={event => setQuery(event.target.value)}
              placeholder="Moonfall Expanse · Dungeon Entrance · X87-Z70" />
          </div>
          <small>World X/Z in metres, not geographic latitude/longitude.</small>
          {query.trim() && (
            <div className="axe-workflow-direct">
              {destination ? (
                <button type="submit" disabled={busy}>
                  <Navigation size={15} /> Teleport to {destination.id}
                  <span>X {destination.x.toFixed(1)} · Z {destination.z.toFixed(1)}</span>
                </button>
              ) : <p role="status">No valid Wolfveil tile or safe map coordinate matches that entry.</p>}
            </div>
          )}
        </form>
        <div className="axe-workflow-sectionhead">
          <strong>Quick destinations</strong><span>Named world landmarks · no tile needed</span>
        </div>
        <div className="axe-workflow-direct">
          <button type="button" disabled={busy || !dungeonEntrance}
            onClick={() => travel(dungeonEntrance)}>
            <MapPin size={17} aria-hidden="true" /> Dungeon Entrance
            <span>Outside portal · X {dungeonEntrance?.x.toFixed(1)} · Z {dungeonEntrance?.z.toFixed(1)}</span>
          </button>
          <button type="button" className="axe-workflow-moonfall" disabled={busy || !moonfallPreview}
            onClick={() => travel(moonfallPreview)} aria-label="Enter Moonfall Expanse space dungeon preview">
            <svg viewBox="0 0 106 98" className="axe-workflow-moonfall-art" aria-hidden="true">
              <defs><radialGradient id="axe-moonfall-night"><stop stopColor="#252454"/><stop offset="1" stopColor="#050d22"/></radialGradient></defs>
              <rect width="106" height="98" rx="7" fill="url(#axe-moonfall-night)"/>
              <circle cx="80" cy="20" r="15" fill="#d9e7ff"/><circle cx="77" cy="17" r="15" fill="#f3f5ff" opacity=".3"/>
              {[[10,10],[19,25],[40,15],[8,70],[95,65],[77,88],[56,38],[96,5]].map(([x,y],i)=><circle key={i} cx={x} cy={y} r="1.2" fill="#daebff"/>)}
              <path d="M28 79 L62 64 L37 46 L62 31" fill="none" stroke="#9cc5fa" strokeWidth="6"/>
              {[[28,79],[62,64],[37,46],[62,31]].map(([x,y],i)=><g key={i}>
                <circle cx={x} cy={y} r="12" fill="#314760" stroke="#e8be80" strokeWidth="2.2"/>
                <circle cx={x} cy={y} r="8.4" fill="#516b87" stroke="#96d1ff" strokeWidth="1"/>
              </g>)}
            </svg>
            <span className="axe-workflow-moonfall-copy"><strong>Moonfall Expanse · Space Dungeon</strong>
              <small>4 circular platforms · 3 bridges · eternal moon and stars</small>
              <small>High-level training · Lv 45–75 · preview loot profile</small></span>
            <Navigation size={18} aria-hidden="true" />
          </button>
        </div>
        <div className="axe-workflow-sectionhead">
          <strong>Work areas</strong><span>{matches.length} of {workflows.length} listed</span>
        </div>
        <label className="axe-workflow-filter">Show
          <select value={sizeFilter} onChange={event => setSizeFilter(event.target.value)}>
            <option value="all">All claimed work areas</option>
            <option value="tile-5m">5 m tiles</option>
            <option value="tile-10m">10 m precision tiles</option>
            <option value="section-100m">100 m squares</option>
          </select>
        </label>
        <div className="axe-workflow-list" aria-label="Available workflow destinations">
          {matches.map(item => (
            <button key={item.id} type="button" disabled={busy} onClick={() => travel(item)}
              className="axe-workflow-item">
              <MapPin size={18} aria-hidden="true" />
              <span><strong>{item.id}{item.area ? ` · ${item.area}` : ''}</strong>
                <small>{item.status}</small>
                <small>X {item.x.toFixed(1)} m · Z {item.z.toFixed(1)} m</small></span>
              <span className="axe-workflow-go">GO <Navigation size={13} /></span>
            </button>
          ))}
          {!matches.length && <p className="axe-workflow-empty">No listed work area matches. Enter any valid tile ID or coordinates above.</p>}
        </div>
        <p className="axe-workflow-footnote">Nine claimed squares are included from the November 9 GitHub issue/PR snapshot, plus any other locally planned areas. Percentages are reported source-QA estimates, NOT live completion or proof the draft visuals are mounted. GitHub claim issues are the current authority. Travel uses actual Play terrain for editor/test inspection. Dungeon Entrance is a named world landmark; Moonfall Expanse loads a separate dungeon scene directly without a terrain tile. Preview monsters cannot mint unverified server rewards.</p>
      </section>
    </div>
  );
}
