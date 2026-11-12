import { useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';
import { WOLFVEIL_PREVIEW_SITES, workstreamPreviewHeight } from './WolfveilWorkstreamTerrainPreview';
import {
  WOLFVEIL_SECTION_GRID as GRID, SECTION_STATES, SECTION_STORAGE_KEY,
  allWolfveilSections, sectionAtWorld, sectionFromId,
  normalizeSectionPlan, exportWolfveilSectionPlan,
} from './wolfveilSectionGrid.mjs';

const names = {
  'not-started': 'Not started',
  'in-progress': 'In progress',
  'needs-review': 'Needs review',
  complete: 'Complete',
};
const readPlan = () => {
  try { return normalizeSectionPlan(JSON.parse(window.localStorage.getItem(SECTION_STORAGE_KEY) || '{}')); }
  catch { return normalizeSectionPlan(null); }
};
const groundY = (x, z) => workstreamPreviewHeight(x, z - GRID.sourceOffsetZ) + 1.35;
const makeLines = (points, color, opacity) => {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  const material = new THREE.LineBasicMaterial({
    color, opacity, transparent: true, depthWrite: false, depthTest: false,
  });
  const lines = new THREE.LineSegments(geometry, material);
  lines.userData.editorOnly = true;
  lines.raycast = () => {};
  lines.renderOrder = 1000;
  return lines;
};
function overlayForSection(id) {
  const group = new THREE.Group();
  group.name = 'WV_WIP_Section_Inspection_Overlay';
  group.userData.editorOnly = true;
  const points = [], selected = [];
  const addEdge = (into, x1, z1, x2, z2, subdivisions) => {
    let previous = [x1, groundY(x1, z1), z1];
    for (let index = 1; index <= subdivisions; index++) {
      const t = index / subdivisions;
      const x = x1 + (x2 - x1) * t, z = z1 + (z2 - z1) * t;
      const next = [x, groundY(x, z), z];
      into.push(...previous, ...next);
      previous = next;
    }
  };
  for (let column = 0; column <= GRID.columns; column++) {
    const x = GRID.minX + column * GRID.size;
    addEdge(points, x, GRID.minZ, x, GRID.maxZ, GRID.rows * 8);
  }
  for (let row = 0; row <= GRID.rows; row++) {
    const z = GRID.minZ + row * GRID.size;
    addEdge(points, GRID.minX, z, GRID.maxX, z, GRID.columns * 8);
  }
  group.add(makeLines(points, 0x6bd5e5, 0.67));
  const cell = sectionFromId(id);
  if (cell) {
    addEdge(selected, cell.minX, cell.minZ, cell.maxX, cell.minZ, 12);
    addEdge(selected, cell.maxX, cell.minZ, cell.maxX, cell.maxZ, 12);
    addEdge(selected, cell.maxX, cell.maxZ, cell.minX, cell.maxZ, 12);
    addEdge(selected, cell.minX, cell.maxZ, cell.minX, cell.minZ, 12);
    group.add(makeLines(selected.map((value, index) =>
      index % 3 === 1 ? value + 0.2 : value), 0xffd48a, 1));
  }
  return group;
}
function downloadPlan(plan) {
  const blob = new Blob([JSON.stringify(exportWolfveilSectionPlan(plan, WOLFVEIL_PREVIEW_SITES), null, 2)],
    { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'wolfveil-wip-section-plan.json';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export default function WolfveilSectionPlanner({ scene, onFocus }) {
  const sections = useMemo(() => allWolfveilSections(), []);
  const [open, setOpen] = useState(true);
  const [showGrid, setShowGrid] = useState(true);
  const [plan, setPlan] = useState(readPlan);
  const selected = sectionFromId(plan.selectedId);
  const selectedSites = selected ? WOLFVEIL_PREVIEW_SITES.filter(site =>
    sectionAtWorld(site.x, site.z + GRID.sourceOffsetZ)?.id === selected.id) : [];
  const complete = Object.values(plan.states).filter(s => s === 'complete').length;
  const active = Object.values(plan.states).filter(s => s === 'in-progress').length;
  useEffect(() => {
    try { window.localStorage.setItem(SECTION_STORAGE_KEY, JSON.stringify(plan)); }
    catch { /* Explicit export still works if browser storage is full. */ }
  }, [plan]);
  useEffect(() => {
    if (!scene || !showGrid) return undefined;
    const overlay = overlayForSection(plan.selectedId);
    scene.add(overlay);
    return () => {
      scene.remove(overlay);
      overlay.traverse(node => {
        node.geometry?.dispose?.();
        node.material?.dispose?.();
      });
    };
  }, [scene, showGrid, plan.selectedId]);
  const choose = id => {
    const section = sectionFromId(id);
    if (!section) return;
    setPlan(previous => ({ ...previous, selectedId: id }));
    onFocus?.(section);
  };
  const setStatus = status => {
    if (!selected || !SECTION_STATES.includes(status)) return;
    setPlan(previous => {
      const states = { ...previous.states };
      if (status === 'not-started') delete states[selected.id];
      else states[selected.id] = status;
      return { ...previous, states };
    });
  };
  const setNote = text => {
    if (!selected) return;
    setPlan(previous => ({
      ...previous, notes: { ...previous.notes, [selected.id]: text.slice(0, 1200) },
    }));
  };
  return (
    <section className={'wolfveil-section-planner' + (open ? ' is-open' : '')}
      aria-label="Wolfveil terrain section planning">
      <button className="wolfveil-section-planner-toggle" type="button"
        aria-expanded={open} onClick={() => setOpen(!open)}>
        {open ? 'Hide terrain squares' : 'Terrain squares · 100m'}
      </button>
      {open && <div className="wolfveil-section-planner-body">
        <h2>Build one square at a time</h2>
        <p className="wolfveil-section-caption">11 × 11 squares · 100m each · preview terrain only</p>
        <p className="wolfveil-section-caption">North ↑ · West ← · East → · South ↓</p>
        <div className="wolfveil-section-map" role="group" aria-label="Selectable Wolfveil map squares">
          {sections.map(section => {
            const status = plan.states[section.id] || 'not-started';
            return <button key={section.id} type="button" className={'wolfveil-section-cell status-' + status}
              aria-label={section.id + ': ' + names[status]} title={section.id + ' · ' + names[status]}
              aria-pressed={selected?.id === section.id} onClick={() => choose(section.id)}>
              {String(section.row * GRID.columns + section.column + 1).padStart(3, '0')}
            </button>;
          })}
        </div>
        <p className="wolfveil-section-caption">
          <span>{complete} / {sections.length} complete</span><span>{active} in progress</span>
        </p>
        {selected ? <div className="wolfveil-section-details">
          <strong>{selected.id} — selected work area</strong>
          <p>X {selected.minX}–{selected.maxX}m · Z {selected.minZ}–{selected.maxZ}m</p>
          <p>Reference sites: {selectedSites.map(site => site.id + ' ' + site.name).join(', ') || 'None in this square'}</p>
          <label>Status
            <select value={plan.states[selected.id] || 'not-started'}
              onChange={event => setStatus(event.target.value)}>
              {SECTION_STATES.map(state => <option value={state} key={state}>{names[state]}</option>)}
            </select>
          </label>
          <label>What should we build or fix here?
            <textarea rows={3} maxLength={1200} value={plan.notes[selected.id] || ''}
              onChange={event => setNote(event.target.value)}
              placeholder="Terrain, house assets, grass, stones, paths, references…"/>
          </label>
          <button type="button" onClick={() => onFocus?.(selected)}>View this square from above</button>
        </div> : <p className="wolfveil-section-caption">Select any square to focus the camera and track its work.</p>}
        <label className="wolfveil-section-grid-toggle">
          <input type="checkbox" checked={showGrid} onChange={event => setShowGrid(event.target.checked)}/>
          Show square boundaries on terrain
        </label>
        <button type="button" onClick={() => downloadPlan(plan)}>Export all 121 squares (JSON)</button>
        <p className="wolfveil-section-caption">Progress and notes are stored only in this browser. Export to share; no live map geometry is changed.</p>
      </div>}
    </section>
  );
}
