import React, { useEffect, useState } from 'react';
import {
  Cloud, CloudRain, CloudSnow, CloudLightning, CloudFog,
  Sun, Moon, Wind, Droplets, Thermometer, Pencil,
} from 'lucide-react';
import WeatherTestPanel from './weather/WeatherTestPanel';
import {isGame3DEditorPreview} from './weather/editorPreviewPolicy.mjs';
import { QUEST_TEST_DESTINATIONS } from './threeroads/questTestDestinations.mjs';
import { questTestRuntimeActive } from './threeroads/questTestRuntime.mjs';

/**
 * Glass HUD for the WorldEnvironmentSystem. Shows the world clock, season, the
 * LIVE weather (driven by the real NWS 7-day forecast for Detroit, MI — no
 * city name / cycle control), the current hour's detail (temp, wind, precip %,
 * humidity), the current moon phase, and a compact 7-day forecast strip.
 * Polls the system state every 500ms.
 */

const WEATHER_ICONS = {
  clear: Sun, cloudy: Cloud, rain: CloudRain,
  snow: CloudSnow, storm: CloudLightning, fog: CloudFog,
};

const SEASON_COLOR = {
  spring: 'text-emerald-300', summer: 'text-amber-300',
  autumn: 'text-orange-300', winter: 'text-sky-300',
};

function MoonGlyph({ illum, eclipse }) {
  if (eclipse) return <Moon className="w-3.5 h-3.5 text-red-300" />;
  return <Moon className="w-3.5 h-3.5 text-indigo-300" style={{ opacity: 0.35 + 0.65 * illum }} />;
}

export default function WorldEnvironmentHUD({ system, adminTools = false }) {
  const [snap, setSnap] = useState(null);
  const [weatherEditorOpen, setWeatherEditorOpen] = useState(false);
  const [questTestOpen, setQuestTestOpen] = useState(false);
  const [questTestActive, setQuestTestActive] = useState(questTestRuntimeActive);

  useEffect(() => {
    const refresh = () => setQuestTestActive(questTestRuntimeActive());
    window.addEventListener('game3dQuestTestSessionChanged', refresh);
    return () => window.removeEventListener('game3dQuestTestSessionChanged', refresh);
  }, []);

  const travel = destinationId => {
    setQuestTestOpen(false);
    window.dispatchEvent(new CustomEvent('game3dQuestTestTravel', { detail: { destinationId } }));
  };
  const editorPreview = typeof window !== 'undefined' && isGame3DEditorPreview({
    pathname: window.location.pathname, isDev: import.meta.env.DEV,
  });

  useEffect(() => {
    if (!system) return;
    let alive = true;
    const tick = () => { if (alive) setSnap(system.getState()); };
    tick();
    const id = setInterval(tick, 500);
    return () => { alive = false; clearInterval(id); };
  }, [system]);

  if (!snap) return null;

  const isNight = snap.time < 6 || snap.time > 19;
  const WeatherIcon = WEATHER_ICONS[snap.weather] || Sun;
  const hh = String(snap.hours).padStart(2, '0');
  const mm = String(snap.minutes).padStart(2, '0');
  const moonPct = Math.round((snap.moonIllum || 0) * 100);
  const days = Array.isArray(snap.days) ? snap.days.slice(0, 7) : [];

  return (
    <>
    <div
      className="game3d-world-weather absolute z-[40] flex flex-col gap-1.5 px-3 py-2 rounded-xl pointer-events-none select-none"
      style={{
        background: 'rgba(10, 14, 22, 0.55)',
        backdropFilter: 'blur(14px) saturate(150%)',
        WebkitBackdropFilter: 'blur(14px) saturate(150%)',
        border: '1px solid rgba(255,255,255,0.12)',
        boxShadow: '0 4px 16px rgba(0,0,0,0.35)',
      }}
    >
      {/* Row 1 — clock · season · weather */}
      <div className="game3d-weather-main flex items-center gap-2">
        {isNight ? <Moon className="w-4 h-4 text-indigo-300" /> : <Sun className="w-4 h-4 text-yellow-300" />}
        <span className="text-xs font-bold text-white tabular-nums tracking-wide">{hh}:{mm}</span>
        <div className="w-px h-4 bg-white/15" />
        <span className={`text-[10px] font-black uppercase tracking-wider ${SEASON_COLOR[snap.seasonId] || 'text-white/80'}`}>
          {snap.seasonLabel}
        </span>
        <div className="w-px h-4 bg-white/15" />
        <WeatherIcon className="w-4 h-4 text-cyan-200 flex-shrink-0" />
        <span className="text-[10px] font-bold text-white/85 truncate flex-1">{snap.weatherLabel}</span>
        {snap.precipActive && <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse flex-shrink-0" />}
        {editorPreview && (
          <button type="button" className="pointer-events-auto flex items-center gap-1 rounded-md border border-cyan-300/35 bg-cyan-500/15 px-2 py-1 text-[10px] font-bold text-cyan-100 hover:bg-cyan-500/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300"
            aria-label="Edit weather and time of day" title="Editor: change day, night, and weather"
            aria-expanded={weatherEditorOpen} onClick={() => setWeatherEditorOpen(value => !value)}>
            <Pencil className="w-3 h-3" aria-hidden="true" /> Edit
          </button>
        )}
      </div>

      {/* Row 2 — live detail: temp · wind · precip % */}
      <div className="game3d-weather-details flex items-center gap-2.5 text-[9px] text-white/70">
        <span className="flex items-center gap-1">
          <Thermometer className="w-3 h-3 text-orange-300" />
          <span className="tabular-nums font-bold text-white/90">{snap.tempF != null ? `${Math.round(snap.tempF)}°F` : '—'}</span>
        </span>
        <span className="flex items-center gap-1">
          <Wind className="w-3 h-3 text-teal-300" />
          <span className="tabular-nums font-bold text-white/90">
            {snap.windMph != null ? `${snap.windMph}mph` : '—'}{snap.windDir ? ` ${snap.windDir}` : ''}
          </span>
        </span>
        <span className="flex items-center gap-1">
          <Droplets className="w-3 h-3 text-cyan-300" />
          <span className="tabular-nums font-bold text-white/90">{snap.precipProb != null ? `${snap.precipProb}%` : '—'}</span>
        </span>
      </div>

      {/* Row 3 — moon phase */}
      <div className="flex items-center gap-1.5">
        <MoonGlyph illum={snap.moonIllum || 0} eclipse={snap.eclipse} />
        <span className="text-[9px] font-bold text-white/75">{snap.moonPhaseLabel}</span>
        <span className="text-[8px] text-white/40 tabular-nums">{moonPct}%</span>
        {snap.eclipse && <span className="text-[8px] text-red-300 font-bold ml-1">Eclipse</span>}
      </div>

      {/* Row 4 — 7-day forecast strip */}
      {days.length > 0 && (
        <div className="game3d-weather-forecast flex items-stretch gap-1 mt-0.5 pt-1.5 border-t border-white/10">
          {days.map((d, i) => {
            const Icon = WEATHER_ICONS[d.dominant] || Sun;
            const tint = d.storm ? 'text-amber-300' : d.snow ? 'text-sky-300'
              : d.rain ? 'text-cyan-300' : d.fog ? 'text-slate-300' : 'text-yellow-200';
            return (
              <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
                <span className="text-[7px] font-black uppercase text-white/45">{i === 0 ? 'Now' : d.dayName}</span>
                <Icon className={`w-3.5 h-3.5 ${tint}`} />
                <span className="text-[7px] font-bold text-white/85 tabular-nums leading-none">{d.hi}°</span>
                <span className="text-[7px] text-white/40 tabular-nums leading-none">{d.lo}°</span>
                {d.maxPrecipProb > 0 && (
                  <span className="text-[6px] text-cyan-300/70 tabular-nums leading-none">{d.maxPrecipProb}%</span>
                )}
              </div>
            );
          })}
        </div>
      )}
      {adminTools && (
        <div className="pointer-events-auto mt-1 flex flex-col gap-1">
          <button type="button"
            className="w-full rounded-lg border border-cyan-300/40 bg-cyan-500/15 px-2.5 py-1.5 text-left text-[10px] font-black tracking-wide text-cyan-100 hover:bg-cyan-500/25 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300"
            aria-label="Open admin Quest Test teleport menu"
            aria-expanded={questTestOpen}
            onClick={() => setQuestTestOpen(value => !value)}>
            QUEST TEST · TELEPORT
          </button>
          <button type="button"
            className="w-full rounded-lg border border-amber-300/30 bg-amber-500/10 px-2.5 py-1.5 text-left text-[9px] font-black tracking-wide text-amber-100 hover:bg-amber-500/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-300"
            aria-label="Admin teleport to Wolfveil cave gate"
            title="Admin shortcut: teleport inside Wolfveil caves by the return gate"
            onClick={() => window.dispatchEvent(new CustomEvent('game3dPortalTravel', {
              detail: { target: 'wolfveil-caves', spawnAtGate: true },
            }))}>
            ADMIN · TELEPORT TO CAVE GATE
          </button>
        </div>
      )}
    </div>
    {adminTools && questTestOpen && (
      <div role="dialog" aria-label="Developer Quest Test Teleport" className="pointer-events-auto fixed right-3 top-36 z-[90] w-[min(340px,calc(100vw-24px))] max-h-[65dvh] overflow-y-auto rounded-xl border border-cyan-300/40 bg-slate-950/95 p-3 text-white shadow-2xl backdrop-blur-xl">
        <div className="mb-2 flex items-center justify-between gap-2">
          <strong className="text-sm text-cyan-100">Quest Test · Three Roads</strong>
          <button type="button" aria-label="Close Quest Test menu" className="rounded px-2 py-1 text-xs text-slate-300 hover:bg-white/10" onClick={() => setQuestTestOpen(false)}>Close</button>
        </div>
        <p className="mb-2 text-xs text-slate-300">Admin preview. Travel to existing story locations; unfinished camps may lag or contain incomplete quests.</p>
        <div className="flex flex-col gap-1.5">
          {QUEST_TEST_DESTINATIONS.map(destination => (
            <button type="button" key={destination.id}
              className="rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-left hover:border-cyan-300/50 hover:bg-cyan-400/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300"
              onClick={() => travel(destination.id)}>
              <span className="flex items-center justify-between gap-2 text-xs font-bold">
                {destination.name}
                {destination.preview && <span className="text-[9px] font-semibold text-amber-300">Preview</span>}
              </span>
              <span className="mt-0.5 block text-[10px] text-slate-400">{destination.detail}</span>
            </button>
          ))}
          {questTestActive && <button type="button"
            className="rounded-lg border border-emerald-400/35 bg-emerald-500/10 px-3 py-2 text-left text-xs font-bold text-emerald-200 hover:bg-emerald-500/20"
            onClick={() => travel('return')}>Return to previous position</button>}
        </div>
        <p className="mt-2 text-[10px] text-amber-200/80">Travel itself gives no rewards. Interacting with unfinished quests may still affect saved quest progress; use a test character.</p>
      </div>
    )}
    {editorPreview && <WeatherTestPanel system={system} open={weatherEditorOpen} onClose={() => setWeatherEditorOpen(false)} />}
    </>
  );
}