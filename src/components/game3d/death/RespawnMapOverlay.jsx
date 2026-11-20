// Death spawn selection. Only activated permanent checkpoints, the town,
// and a world-validated temporary nearby landing are offered.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { MapPin, Heart, Skull, Home, ShieldCheck } from 'lucide-react';
import { getDeathState, setDeathPhase } from './deathStore';
import { setHP, getPlayerHUD } from '../playerHUDStore';
import { getAvailableRespawnPoints, getDefaultSpawnPoint, getRespawnPoint, saveCheckpointId } from '../mapSpawnPoints';
import { exitAXEDungeon, getAXEDungeonCheckpointPosition, getAXEDungeonState } from '../axe/dungeons/AXEDungeonStore';
import { NEARBY_RESPAWN_ID } from './nearbyRespawnRules.mjs';
import { getAXEDungeonDefinition, getAXEDungeonRoom } from '../axe/dungeons/AXEDungeonSystem';

const MAP_PX = 480;
function mapBounds(points, death) {
  const xs = [death.x, ...points.map(p => p.x)];
  const zs = [death.z, ...points.map(p => p.z)];
  const centerX = (Math.min(...xs) + Math.max(...xs)) / 2;
  const centerZ = (Math.min(...zs) + Math.max(...zs)) / 2;
  return { centerX, centerZ, extent: Math.max(45, (Math.max(...xs) - Math.min(...xs)) * .62, (Math.max(...zs) - Math.min(...zs)) * .62) };
}
function screenPoint(x, z, bounds) {
  return {
    x: ((x - bounds.centerX + bounds.extent) / (2 * bounds.extent)) * MAP_PX,
    y: ((z - bounds.centerZ + bounds.extent) / (2 * bounds.extent)) * MAP_PX,
  };
}
const distance = (a, b) => Math.round(Math.hypot(a.x - b.x, a.z - b.z));

export default function RespawnMapOverlay() {
  const deathPosition = getDeathState().deathPosition;
  const deathPos = deathPosition && Number.isFinite(deathPosition.x) && Number.isFinite(deathPosition.z)
    ? deathPosition : { x: 0, z: 0 };
  const session = getAXEDungeonState().activeSession;
  const dungeonCheckpoint = session ? getAXEDungeonCheckpointPosition() : null;
  const dungeonDef = session ? getAXEDungeonDefinition(session.dungeonId) : null;
  const dungeonRoom = session
    ? getAXEDungeonRoom(session.dungeonId, session.checkpointRoomId || session.currentRoomId) : null;

  const registered = useMemo(() => getAvailableRespawnPoints(), []);
  const [nearby, setNearby] = useState(null);
  const [selected, setSelected] = useState(() => {
    const saved = getRespawnPoint();
    return getAvailableRespawnPoints().some(p => p.id === saved.id) ? saved.id : getDefaultSpawnPoint().id;
  });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const chosenByPlayer = useRef(false);

  useEffect(() => {
    if (!deathPosition || session) return undefined;
    let active = true;
    window.dispatchEvent(new CustomEvent('axeNearbyRespawnQuery', {
      detail: { deathPosition, respond: point => {
        if (!active || point?.id !== NEARBY_RESPAWN_ID || !point.temporary) return;
        setNearby(point);
        if (!chosenByPlayer.current) setSelected(NEARBY_RESPAWN_ID);
      } },
    }));
    return () => { active = false; };
  }, [deathPos.x, deathPos.z, session]);

  const points = useMemo(() => nearby ? [nearby, ...registered] : registered, [nearby, registered]);
  const chosen = points.find(p => p.id === selected) || registered[0] || getDefaultSpawnPoint();
  const bounds = useMemo(() => mapBounds(points, deathPos), [points, deathPos.x, deathPos.z]);
  const pick = id => { chosenByPlayer.current = true; setSelected(id); setError(''); };

  // The world validates terrain and completes the teleport before the UI grants
  // HP. If its scene was torn down, remain dead rather than revive in midair.
  const request = (detail, onSuccess) => {
    if (submitting) return;
    setSubmitting(true);
    setError('');
    let answered = false;
    window.dispatchEvent(new CustomEvent('playerRespawn', {
      detail: { ...detail, respond: response => {
        if (answered) return;
        answered = true;
        setSubmitting(false);
        if (!response?.ok) { setError(response?.reason || 'No safe landing at that location. Select another spawn.'); return; }
        onSuccess();
        const { maxHP } = getPlayerHUD();
        setHP(maxHP);
        setDeathPhase('alive', { deathPosition: null });
      } },
    }));
    if (!answered) { setSubmitting(false); setError('The world is still loading. Try again once it is ready.'); }
  };
  const handleRespawn = () => {
    if (!chosen) return;
    request(chosen.temporary
      ? { source: NEARBY_RESPAWN_ID, spawnId: chosen.id, deathPosition }
      : { spawnId: chosen.id }, () => {
      if (session) exitAXEDungeon({ failed: true });
      if (!chosen.temporary) saveCheckpointId(chosen.id);
    });
  };
  const handleDungeonRespawn = () => {
    if (!session || !dungeonCheckpoint) return;
    request({
      ...dungeonCheckpoint, source: 'axe-dungeon-checkpoint',
      spawnId: session.checkpointRoomId || session.currentRoomId,
    }, () => {});
  };

  const marker = screenPoint(deathPos.x, deathPos.z, bounds);
  return (
    <div className="fixed inset-0 z-[200] overflow-y-auto bg-slate-950/95 backdrop-blur-lg px-4 py-5 text-white" role="dialog" aria-modal="true" aria-label="Choose respawn location">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
        <header className="text-center">
          <div className="mb-2 text-xs font-semibold uppercase tracking-[.35em] text-rose-300">You Died</div>
          <h2 className="text-2xl font-bold tracking-wide sm:text-3xl">Choose where to return</h2>
          <p className="mt-2 text-sm text-slate-300">Nearby safe ground, Town Plaza, or checkpoints you have reached.</p>
        </header>
        {dungeonCheckpoint && (
          <button type="button" onClick={handleDungeonRespawn} disabled={submitting}
            className="rounded-xl border border-fuchsia-300/40 bg-fuchsia-400/10 px-5 py-4 text-left hover:bg-fuchsia-400/20 disabled:opacity-50">
            <span className="text-xs font-semibold uppercase tracking-widest text-fuchsia-200">Dungeon checkpoint</span>
            <span className="mt-1 block text-lg font-semibold">Resume at {dungeonRoom?.name || 'your latest room'}</span>
            <span className="block text-sm text-slate-300">Continue {dungeonDef?.name || session.dungeonId} without abandoning the run.</span>
          </button>
        )}
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(290px,350px)]">
          <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-3 sm:p-4">
            <div className="mb-3 flex items-center justify-between text-xs uppercase tracking-widest text-slate-300">
              <span>World map</span><span>Death location <Skull className="ml-1 inline h-3.5 w-3.5 text-rose-400" /></span>
            </div>
            <div className="relative mx-auto aspect-square w-full max-w-[480px] overflow-hidden rounded-xl border border-white/10 bg-[radial-gradient(circle,rgba(43,65,83,.9),rgba(9,15,28,1))]">
              <svg className="absolute inset-0 h-full w-full" viewBox="0 0 480 480" aria-hidden="true">
                {Array.from({ length: 7 }, (_, i) => (
                  <g key={i} stroke="rgba(255,255,255,.09)" strokeWidth="1">
                    <line x1="0" y1={(i+1)*60} x2="480" y2={(i+1)*60} />
                    <line x1={(i+1)*60} y1="0" x2={(i+1)*60} y2="480" />
                  </g>
                ))}
                <circle cx={marker.x} cy={marker.y} r="9" fill="#fb7185" />
                <circle cx={marker.x} cy={marker.y} r="15" stroke="#fb7185" strokeWidth="2" fill="none" opacity=".45" />
              </svg>
              {points.map(point => {
                const pos = screenPoint(point.x, point.z, bounds);
                const active = selected === point.id;
                return <button type="button" key={point.id} onClick={() => pick(point.id)}
                  aria-label={point.label} aria-pressed={active}
                  title={point.label}
                  className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 p-2 transition ${active ? 'z-10 scale-125 border-white bg-cyan-400 text-slate-950' : 'border-cyan-300/80 bg-slate-900/90 text-cyan-300 hover:bg-cyan-700 hover:text-white'}`}
                  style={{ left: `${pos.x / MAP_PX * 100}%`, top: `${pos.y / MAP_PX * 100}%` }}>
                  {point.default ? <Home className="h-4 w-4" /> : <MapPin className="h-4 w-4" />}
                </button>;
              })}
            </div>
            <p className="mt-3 text-center text-xs text-slate-400">Map markers show available respawn locations. The red marker shows where you fell.</p>
          </div>
          <div className="flex min-w-0 flex-col gap-3">
            <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-widest text-cyan-200"><ShieldCheck className="h-4 w-4" /> Available spawns</h3>
            <div className="flex max-h-[min(55vh,470px)] flex-col gap-2 overflow-y-auto pr-1">
              {points.map(point => (
                <button type="button" key={point.id} onClick={() => pick(point.id)}
                  aria-pressed={selected === point.id}
                  className={`rounded-xl border px-4 py-3 text-left transition ${selected === point.id ? 'border-cyan-300 bg-cyan-500/20' : 'border-white/15 bg-white/5 hover:border-cyan-300/50'}`}>
                  <span className="block text-sm font-semibold">{point.label}</span>
                  <span className="mt-1 block text-xs text-slate-300">{point.temporary ? 'Temporary · safe ground near your death' : point.default ? 'Default town spawn · always available' : 'Activated checkpoint'} · {distance(point, deathPos)}m away</span>
                </button>
              ))}
            </div>
            <div className="mt-auto rounded-xl border border-cyan-300/20 bg-cyan-300/5 p-3">
              <div className="text-sm font-semibold text-cyan-100">Selected: {chosen.label}</div>
              <p className="mt-1 text-xs text-slate-300">{chosen.temporary ? 'This temporary spot will not replace your saved checkpoint.' : 'The landing will be checked again for terrain and collisions.'}</p>
            </div>
            {error && <p role="alert" className="rounded-lg border border-rose-400/30 bg-rose-400/10 p-3 text-sm text-rose-200">{error}</p>}
            <button type="button" disabled={submitting} onClick={handleRespawn}
              className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-cyan-400 px-5 py-3 font-bold text-slate-950 transition hover:bg-cyan-300 disabled:opacity-50">
              <Heart className="h-5 w-5" /> {submitting ? 'Checking spawn…' : `Respawn at ${chosen.label}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
