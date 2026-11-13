// ─── Respawn Map Overlay ───────────────────────────────────────────────
// Shown after the death tips screen. Top-down map of the world's real spawn
// points. When the current world finds safe ground a few meters from the
// character's death, offer that temporary landing too. All world collisions
// are rechecked when the player respawns; a remote player is never a target.
//
// On confirm: saves the chosen point as this character's checkpoint (scoped
// to the logged-in user), dispatches `playerRespawn` so the world teleports
// and revives the player, then clears the death phase.

import React, { useEffect, useMemo, useState } from 'react';
import { MapPin, Heart, Skull } from 'lucide-react';
import { getDeathState, setDeathPhase } from './deathStore';
import { setHP, getPlayerHUD } from '../playerHUDStore';
import {
  MAP_SPAWN_POINTS,
  getRespawnPoint,
  saveCheckpointId,
} from '../mapSpawnPoints';
import { exitAXEDungeon, getAXEDungeonCheckpointPosition, getAXEDungeonState } from '../axe/dungeons/AXEDungeonStore';
import { NEARBY_RESPAWN_ID } from './nearbyRespawnRules.mjs';
import { getAXEDungeonDefinition, getAXEDungeonRoom } from '../axe/dungeons/AXEDungeonSystem';

const MAP_PX = 480;
const WORLD_EXTENT = 45; // half-size of the mapped world area, in world units

function mapBounds(points, deathPos) {
  const xs = [deathPos.x, ...points.map(point => point.x)];
  const zs = [deathPos.z, ...points.map(point => point.z)];
  const centerX = (Math.min(...xs) + Math.max(...xs)) / 2;
  const centerZ = (Math.min(...zs) + Math.max(...zs)) / 2;
  const extent = Math.max(WORLD_EXTENT, (Math.max(...xs) - Math.min(...xs)) * .62,
    (Math.max(...zs) - Math.min(...zs)) * .62);
  return { centerX, centerZ, extent };
}
function worldToScreen(x, z, bounds) {
  const px = ((x - bounds.centerX + bounds.extent) / (bounds.extent * 2)) * MAP_PX;
  const py = ((z - bounds.centerZ + bounds.extent) / (bounds.extent * 2)) * MAP_PX;
  return { px, py };
}

const dist2D = (a, b) => Math.round(Math.hypot(a.x - b.x, a.z - b.z));

export default function RespawnMapOverlay() {
  const death = getDeathState();
  const deathPos = death.deathPosition || { x: 0, z: 0 };
  const dungeonState = getAXEDungeonState();
  const dungeonSession = dungeonState.activeSession;
  const dungeonCheckpoint = dungeonSession ? getAXEDungeonCheckpointPosition() : null;
  const dungeonDef = dungeonSession ? getAXEDungeonDefinition(dungeonSession.dungeonId) : null;
  const dungeonCheckpointRoom = dungeonSession
    ? getAXEDungeonRoom(
        dungeonSession.dungeonId,
        dungeonSession.checkpointRoomId || dungeonSession.currentRoomId,
      )
    : null;

  const [nearbyPoint, setNearbyPoint] = useState(null);
  const [selectionTouched, setSelectionTouched] = useState(false);
  // Registered checkpoint remains available until the terrain-based nearby
  // resolver confirms a valid landing spot.
  const [selected, setSelected] = useState(() => {
    const deathPosition = getDeathState().deathPosition;
    if (!deathPosition || !Number.isFinite(deathPosition.x) || !Number.isFinite(deathPosition.z)) return getRespawnPoint().id;
    return MAP_SPAWN_POINTS.reduce((nearest, candidate) =>
      Math.hypot(candidate.x - deathPosition.x, candidate.z - deathPosition.z) <
      Math.hypot(nearest.x - deathPosition.x, nearest.z - deathPosition.z) ? candidate : nearest,
      getRespawnPoint()).id;
  });
  useEffect(() => {
    if (!death.deathPosition || dungeonSession) return;
    let active = true;
    window.dispatchEvent(new CustomEvent('axeNearbyRespawnQuery', {
      detail: {
        deathPosition: death.deathPosition,
        respond: point => {
          if (!active || !point || point.id !== NEARBY_RESPAWN_ID) return;
          setNearbyPoint(point);
          if (!selectionTouched) setSelected(NEARBY_RESPAWN_ID);
        },
      },
    }));
    return () => { active = false; };
  }, [deathPos.x, deathPos.z, dungeonSession, selectionTouched]);
  const points = useMemo(() => nearbyPoint ? [nearbyPoint, ...MAP_SPAWN_POINTS] : MAP_SPAWN_POINTS, [nearbyPoint]);
  const selectedPoint = points.find((p) => p.id === selected) || getRespawnPoint();
  const bounds = useMemo(() => mapBounds(points, deathPos), [points, deathPos.x, deathPos.z]);
  const selectPoint = id => { setSelectionTouched(true); setSelected(id); };

  const handleRespawn = () => {
    const point = selectedPoint;
    if (dungeonSession) exitAXEDungeon({ failed: true });
    // A temporary nearby landing must not overwrite the character's saved
    // permanent checkpoint. The world re-validates it against live collision.
    if (!point.temporary) saveCheckpointId(point.id);
    const { maxHP } = getPlayerHUD();
    setHP(maxHP);
    window.dispatchEvent(new CustomEvent('playerRespawn', {
      detail: point.temporary
        ? { source: NEARBY_RESPAWN_ID, spawnId: point.id, deathPosition: death.deathPosition }
        : { x: point.x, z: point.z, spawnId: point.id },
    }));
    setDeathPhase('alive', { deathPosition: null });
  };

  const handleDungeonCheckpointRespawn = () => {
    if (!dungeonCheckpoint || !dungeonSession) return;
    const { maxHP } = getPlayerHUD();
    setHP(maxHP);
    window.dispatchEvent(new CustomEvent('playerRespawn', {
      detail: {
        ...dungeonCheckpoint,
        spawnId: dungeonSession.checkpointRoomId || dungeonSession.currentRoomId,
        source: 'axe-dungeon-checkpoint',
      },
    }));
    setDeathPhase('alive', { deathPosition: null });
  };

  const deathMarker = worldToScreen(deathPos.x, deathPos.z, bounds);

  return (
    <div className="fixed inset-0 z-[200] bg-black/95 backdrop-blur-md flex items-center justify-center">
      <div className="flex flex-col items-center gap-6">
        <div className="text-center">
          <div className="text-red-400 text-xs uppercase tracking-[0.4em] mb-2">You Died</div>
          <h2 className="text-white text-3xl font-bold tracking-wider">Choose a Respawn Point</h2>
          <p className="text-white/50 text-sm mt-1">Choose nearby safe ground or a registered checkpoint</p>
        </div>

        {dungeonCheckpoint && (
          <button
            onClick={handleDungeonCheckpointRespawn}
            className="w-full max-w-[480px] rounded-2xl border border-fuchsia-300/35 bg-fuchsia-300/10 px-5 py-4 text-left transition hover:bg-fuchsia-300/15"
          >
            <div className="text-[10px] font-bold uppercase tracking-[0.3em] text-fuchsia-200/70">
              Dungeon Checkpoint
            </div>
            <div className="mt-1 text-lg font-bold text-white">
              Return to {dungeonCheckpointRoom?.name || 'Last Dungeon Checkpoint'}
            </div>
            <div className="mt-1 text-xs text-white/50">
              Continue {dungeonDef?.name || dungeonSession?.dungeonId} without abandoning the active run.
            </div>
          </button>
        )}

        {nearbyPoint && (
          <button
            onClick={() => selectPoint(NEARBY_RESPAWN_ID)}
            aria-pressed={selected === NEARBY_RESPAWN_ID}
            className={`w-full max-w-[480px] rounded-xl border px-4 py-3 text-left transition ${selected === NEARBY_RESPAWN_ID ? 'border-cyan-300 bg-cyan-400/20' : 'border-cyan-300/30 bg-cyan-300/10 hover:bg-cyan-300/15'}`}
          >
            <div className="text-xs uppercase tracking-widest font-semibold text-cyan-200">Respawn nearby</div>
            <div className="text-sm text-white/80 mt-1">Safe ground about {nearbyPoint.distance}m from where you fell</div>
          </button>
        )}
        <div
          className="relative rounded-2xl overflow-hidden border border-white/15"
          style={{
            width: MAP_PX,
            height: MAP_PX,
            background: 'radial-gradient(circle at center, rgba(40,50,70,0.6) 0%, rgba(10,12,18,0.95) 75%)',
          }}
        >
          <svg className="absolute inset-0" width={MAP_PX} height={MAP_PX}>
            {Array.from({ length: 7 }).map((_, i) => (
              <g key={i} stroke="rgba(255,255,255,0.06)" strokeWidth="1">
                <line x1={0} y1={(i + 1) * (MAP_PX / 8)} x2={MAP_PX} y2={(i + 1) * (MAP_PX / 8)} />
                <line x1={(i + 1) * (MAP_PX / 8)} y1={0} x2={(i + 1) * (MAP_PX / 8)} y2={MAP_PX} />
              </g>
            ))}
          </svg>

          {/* Where you fell */}
          <div
            className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center pointer-events-none"
            style={{ left: deathMarker.px, top: deathMarker.py }}
          >
            <Skull className="w-4 h-4 text-red-400" />
            <span className="text-red-300 text-[10px] mt-0.5 font-bold tracking-wider">DIED HERE</span>
          </div>

          {/* Valid map spawn points */}
          {points.map((p) => {
            const { px, py } = worldToScreen(p.x, p.z, bounds);
            const isSelected = selected === p.id;
            return (
              <button
                key={p.id}
                onClick={() => selectPoint(p.id)}
                className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center group"
                style={{ left: px, top: py }}
              >
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${
                    isSelected
                      ? 'bg-cyan-400 ring-4 ring-cyan-400/40 scale-110'
                      : 'bg-cyan-600/60 ring-2 ring-cyan-400/30 group-hover:bg-cyan-500'
                  }`}
                >
                  <MapPin className="w-5 h-5 text-white" />
                </div>
                <div
                  className={`mt-1 px-2 py-0.5 rounded text-[10px] font-bold whitespace-nowrap ${
                    isSelected ? 'bg-cyan-400 text-black' : 'bg-black/70 text-cyan-200'
                  }`}
                >
                  {p.label} · {dist2D(p, deathPos)}m
                </div>
              </button>
            );
          })}
        </div>

        <button
          onClick={handleRespawn}
          className="px-8 py-3 rounded-full bg-cyan-500 hover:bg-cyan-400 text-black font-bold tracking-wider transition-all flex items-center gap-2 shadow-lg shadow-cyan-500/40"
        >
          <Heart className="w-5 h-5" />
          Respawn at {selectedPoint.label}
        </button>
      </div>
    </div>
  );
}