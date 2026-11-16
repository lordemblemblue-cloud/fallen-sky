import { useEffect, useMemo, useState } from 'react';
import { Compass, DoorOpen, LocateFixed, Mountain, Route } from 'lucide-react';
import {
  UNDERGROUND_EXITS, UNDERGROUND_LINKS, UNDERGROUND_ROOMS,
  planUndergroundExitRoute, projectUnderground, undergroundMetresToMap,
} from './undergroundMapModel.mjs';
import {
  getDiscoveredRooms, revealRoomsNear, subscribeDiscoveredRooms,
} from './wolfveilUndergroundDiscovery.mjs';
import './WolfveilUndergroundMapPanel.css';

const WOLFVEIL_OFFSET_Z = 70;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export default function WolfveilUndergroundMapPanel({ position }) {
  const [discovered, setDiscovered] = useState(getDiscoveredRooms);
  const [selected, setSelected] = useState(null);
  const [zoom, setZoom] = useState(1.5);
  const [follow, setFollow] = useState(true);
  const [focus, setFocus] = useState({ x: 500, y: 500 });

  useEffect(() => subscribeDiscoveredRooms(setDiscovered), []);

  const localX = Number(position?.x) || 0;
  const localZ = (Number(position?.z) || 0) - WOLFVEIL_OFFSET_Z;
  const step = Math.round(localX / 5) + ':' + Math.round(localZ / 5);
  useEffect(() => { revealRoomsNear(localX, localZ, 22); }, [step]);

  const discoveredSet = useMemo(() => new Set(discovered), [discovered]);
  const route = useMemo(() => planUndergroundExitRoute(localX, localZ), [step]);
  const isKnown = id => !id || String(id).startsWith('exit:') || discoveredSet.has(id);

  const playerPoint = projectUnderground(localX, localZ);
  // Standing above ground puts the arrow outside the charted network: the map
  // then frames the whole cave system instead of following an off-map marker.
  const playerOnChart = playerPoint.x >= -40 && playerPoint.x <= 1040 &&
    playerPoint.y >= -40 && playerPoint.y <= 1040;
  const viewSize = 1000 / zoom;
  const center = follow ? (playerOnChart ? playerPoint : { x: 500, y: 500 }) : focus;
  const half = viewSize / 2;
  const viewX = clamp(center.x - half, 0, 1000 - viewSize);
  const viewY = clamp(center.y - half, 0, 1000 - viewSize);

  const selectedRoom = UNDERGROUND_ROOMS.find(room => room.id === selected);
  const selectedExit = UNDERGROUND_EXITS.find(exit => exit.id === selected);
  const heading = (Number(position?.yaw) || 0) * 180 / Math.PI;

  const onCanvasClick = event => {
    if (event.target.closest?.('g[role="button"]')) return;
    const rect = event.currentTarget.getBoundingClientRect();
    setFocus({
      x: viewX + (event.clientX - rect.left) / rect.width * viewSize,
      y: viewY + (event.clientY - rect.top) / rect.height * viewSize,
    });
    setFollow(false);
  };

  return <div className="axe-world-map-main axe-underground-map">
    <nav className="axe-world-map-filters" aria-label="Underground map legend">
      <h3>CAVE NETWORK</h3>
      <div className="axe-underground-legend">
        <span><i className="axe-ug-known"/> Explored room</span>
        <span><i className="axe-ug-unknown"/> Not yet entered</span>
        <span><i className="axe-ug-exit"/> Surface exit</span>
        <span><i className="axe-ug-route"/> Route to nearest exit</span>
      </div>
      <div className="axe-world-map-filter-note">
        <strong><Route size={17}/> Nearest surface exit</strong>
        <p>{playerOnChart && route
          ? route.exit.name + ' · ' + Math.round(route.distance) + ' m of tunnel'
          : 'Stand inside the cave network to chart a walkable way out.'}</p>
      </div>
      <div className="axe-world-map-filter-note">
        <strong><Mountain size={17}/> Discovery</strong>
        <p>Every chamber is drawn from the first visit but stays dimmed until you
          walk into it. {discovered.length} of {UNDERGROUND_ROOMS.length} rooms explored.</p>
      </div>
    </nav>
    <div className="axe-world-map-maparea">
      <div className="axe-world-map-maphead"><Compass size={16}/> Wolfveil Underground
        <span>North ↑</span></div>
      <svg className="axe-world-map-canvas" role="group" aria-label="Underground map of the Wolfveil caves"
        viewBox={[viewX, viewY, viewSize, viewSize].join(' ')}
        preserveAspectRatio="xMidYMid meet" onClick={onCanvasClick}>
        <defs>
          <radialGradient id="axe-ug-base">
            <stop stopColor="#2b4154"/><stop offset="0.62" stopColor="#16283a"/>
            <stop offset="1" stopColor="#0a1725"/>
          </radialGradient>
        </defs>
        <rect x="0" y="0" width="1000" height="1000" fill="url(#axe-ug-base)"/>
        {Array.from({ length: 9 }, (_, i) => <g key={i} stroke="#9fc0d2" strokeOpacity=".07">
          <path d={'M ' + (i + 1) * 100 + ' 0 V 1000'}/><path d={'M 0 ' + (i + 1) * 100 + ' H 1000'}/>
        </g>)}
        {UNDERGROUND_LINKS.map(link => {
          const known = isKnown(link.from) && isKnown(link.to);
          return <polyline key={link.id} fill="none"
            points={link.points.map(point => {
              const p = projectUnderground(point[0], point[1]); return p.x + ',' + p.y;
            }).join(' ')}
            stroke={known ? '#8db9cb' : '#42586b'} strokeOpacity={known ? 0.8 : 0.45}
            strokeWidth={link.kind === 'entry' ? 6 : 11} strokeLinejoin="round"
            strokeLinecap="round" strokeDasharray={link.kind === 'entry' ? '13 10' : undefined}/>;
        })}
        {UNDERGROUND_ROOMS.map(room => {
          const p = projectUnderground(room.x, room.z);
          const known = discoveredSet.has(room.id);
          const r = undergroundMetresToMap(room.radius);
          const chosen = selected === room.id;
          return <g key={room.id} role="button" tabIndex={0}
            aria-label={(known ? room.name : 'Uncharted chamber') + ' — ' +
              (known ? Math.round(room.depth) + ' m below the surface' : 'not yet explored')}
            onClick={event => { event.stopPropagation(); setSelected(room.id); }}
            onKeyDown={event => {
              if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelected(room.id); }
            }}
            style={{ cursor: 'pointer' }} opacity={known ? 1 : 0.62}>
            <circle cx={p.x} cy={p.y} r={r} fill="#0d1a27" fillOpacity=".7"
              stroke={known ? '#d8c08a' : '#5a7286'} strokeWidth="5"
              strokeDasharray={known ? undefined : '9 9'}/>
            <circle cx={p.x} cy={p.y} r={r * 0.86} fill={known ? '#274055' : '#1a2836'}
              fillOpacity=".82" stroke={known ? '#9fd3e4' : '#46596b'} strokeWidth="2"/>
            {room.kind === 'hub' && <circle cx={p.x} cy={p.y} r={r * 0.44} fill="none"
              stroke="#e7c489" strokeWidth="3"/>}
            {chosen && <circle cx={p.x} cy={p.y} r={r + 9} fill="none" stroke="#eaf8ff"
              strokeWidth="3" strokeOpacity=".75"/>}
            <text x={p.x} y={p.y + 6} textAnchor="middle" fontSize="17" fontWeight="bold"
              fill={known ? '#f4e6cc' : '#7e91a2'}>{known ? '⌂' : '?'}</text>
            <text x={p.x} y={p.y + r + 22} textAnchor="middle" fontSize="17"
              fill={known ? '#f6ebd9' : '#8c9daa'} stroke="#122334" strokeWidth="4"
              paintOrder="stroke">{known ? room.name : 'Uncharted'}</text>
            {known && <text x={p.x} y={p.y + r + 42} textAnchor="middle" fontSize="14"
              fill="#b9d4e0" stroke="#122334" strokeWidth="4" paintOrder="stroke">
              −{Math.round(room.depth)} m
            </text>}
          </g>;
        })}
        {playerOnChart && route?.points?.length > 1 && <polyline fill="none" stroke="#f0c983" strokeWidth="5"
          strokeDasharray="18 11" strokeLinecap="round" strokeOpacity=".9"
          points={route.points.map(point => {
            const p = projectUnderground(point[0], point[1]); return p.x + ',' + p.y;
          }).join(' ')}/>}
        {UNDERGROUND_EXITS.map(exit => {
          const p = projectUnderground(exit.x, exit.z);
          const chosen = selected === exit.id;
          return <g key={exit.id} role="button" tabIndex={0}
            aria-label={exit.name + ' — surface exit'}
            onClick={event => { event.stopPropagation(); setSelected(exit.id); }}
            onKeyDown={event => {
              if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelected(exit.id); }
            }}
            style={{ cursor: 'pointer' }}>
            {(chosen || route?.exit?.id === exit.id) && <circle cx={p.x} cy={p.y} r="17"
              fill="none" stroke="#ffe9bd" strokeWidth="3" strokeOpacity=".75"/>}
            <circle cx={p.x} cy={p.y} r="11" fill="#10303f" stroke="#a8e2c4" strokeWidth="3"/>
            <text x={p.x} y={p.y + 5} textAnchor="middle" fontSize="14" fontWeight="bold"
              fill="#c9f3dc">⌂</text>
            <text x={p.x} y={p.y - 19} textAnchor="middle" fontSize="14" fill="#d7f2e6"
              stroke="#122334" strokeWidth="4" paintOrder="stroke">Surface</text>
          </g>;
        })}
        {playerOnChart && <g aria-label="Your location">
          <circle cx={playerPoint.x} cy={playerPoint.y} r="19" fill="#e4f6ff" fillOpacity=".18"/>
          <g transform={'translate(' + playerPoint.x + ' ' + playerPoint.y + ') rotate(' + heading + ')'}>
            <path d="M0 -16 L10 12 L0 6 L-10 12 Z" fill="#e8f8ff" stroke="#5cbde9"
              strokeWidth="3"/>
          </g>
        </g>}
      </svg>
      <div className="axe-world-map-zoom">
        <button type="button" onClick={() => setZoom(value => Math.min(4, value * 1.5))}
          aria-label="Zoom in">+</button>
        <span>{Math.round(zoom * 100)}%</span>
        <button type="button" onClick={() => setZoom(value => Math.max(1, value / 1.5))}
          aria-label="Zoom out">−</button>
        <button type="button" onClick={() => { setFollow(true); setSelected(null); }}
          title="Center on player" aria-label="Center on player"><LocateFixed size={17}/></button>
      </div>
    </div>
    <aside className="axe-world-map-details">
      <h3><DoorOpen size={20}/> UNDERGROUND DATA</h3>
      {selectedRoom ? <div>
        <strong>{discoveredSet.has(selectedRoom.id) ? selectedRoom.name : 'Uncharted chamber'}</strong>
        <span>{discoveredSet.has(selectedRoom.id)
          ? 'Explored chamber · ' + Math.round(selectedRoom.depth) + ' m below the surface'
          : 'Drawn on the chart but not yet entered. Walk inside to reveal it.'}</span>
        <span>World position: {Math.round(selectedRoom.x)}, {Math.round(selectedRoom.z)}</span>
        <span>{selectedRoom.kind === 'hub'
          ? 'Central hub where the four cavern tunnels meet.'
          : 'Connected by tunnel to the Subterranean Wolf-Spirit Rotunda.'}</span>
      </div> : selectedExit ? <div>
        <strong>{selectedExit.name}</strong>
        <span>Walkable surface exit · press E at the rock arch to leave.</span>
        <span>World position: {Math.round(selectedExit.x)}, {Math.round(selectedExit.z)}</span>
      </div> : <div>
        <strong>{playerOnChart && route ? route.exit.name : 'Wolfveil Underground'}</strong>
        <span>{playerOnChart && route
          ? Math.round(route.distance) + ' m of tunnel to the nearest surface exit. The gold dashed line follows real corridors.'
          : 'Select a chamber or exit for local information.'}</span>
      </div>}
      <p className="axe-world-map-chart-info">
        Every room and tunnel is drawn from the same geometry used for walking and
        collision. Unexplored chambers stay dimmed; elevation is measured from the
        surface mouth above each cavern. The Lunar Cave training dungeon keeps its
        own separate chart.
      </p>
      <div className="axe-world-map-legend">
        <span><i className="axe-map-dot-player"/> Player</span>
        <span><i className="axe-ug-known axe-map-dot-point"/> Explored chamber</span>
        <span><i className="axe-ug-unknown axe-map-dot-point"/> Undiscovered</span>
        <span><i className="axe-ug-exit axe-map-dot-point"/> Surface exit</span>
      </div>
    </aside>
  </div>;
}