import { useEffect, useState } from 'react';
import { buildKitZip, buildStandaloneHtml, downloadBlob, downloadJson, recolorImage } from './exportKit.js';
import { ASSET_BASE } from './FantasyBattleStage.js';
import rigData from './data/archerRig.json';
import skillDoc from './data/bowSkills.json';

const SLIDERS = [
  ['parallax', 'Parallax', 0, 2, 0.05],
  ['stiffness', 'Physics stiffness', 0.3, 2, 0.05],
  ['speed', 'Playback speed', 0.1, 1.5, 0.05],
  ['smear', 'Smear', 0, 2, 0.05],
];
const EXPRESSIONS = ['neutral', 'focused', 'attackShout', 'hurt', 'wink'];

export default function StudioPanel({ stage, hud, onClose }) {
  const [settings, setSettings] = useState(() => ({ ...stage.settings }));
  const [busy, setBusy] = useState(null);
  const [note, setNote] = useState('');
  const [video, setVideo] = useState(null);
  const manifest = stage.manifest;
  const practice = hud.mode === 'practice';

  useEffect(() => () => { if (video) URL.revokeObjectURL(video.url); }, [video]);

  const set = (patch) => { const next = { ...settings, ...patch }; setSettings(next); stage.setSettings(patch); };
  const run = async (label, fn) => {
    setBusy(label); setNote('');
    try { await fn(); } catch (e) { console.error(e); setNote(`${label} failed: ${e?.message || e}`); } finally { setBusy(null); }
  };
  const swapBow = (filter) => run('Bow swap', async () => {
    const url = filter ? await recolorImage(`${ASSET_BASE}bow.png`, filter) : null;
    await Promise.all(Object.values(stage.fighters).map((f) => f.setLayerTexture('bow', url)));
  });
  const swapHair = (filter) => run('Hair swap', async () => {
    const layers = ['hairBack', 'lockLeft', 'lockRight'];
    const urls = filter ? await Promise.all(layers.map((id) => recolorImage(`${ASSET_BASE}${rigData.layers.find((l) => l.id === id).part}.png`, filter))) : layers.map(() => null);
    await Promise.all(layers.map((id, i) => stage.fighters.hero.setLayerTexture(id, urls[i])));
  });
  const loadSkillFile = (file) => run('Load skill JSON', async () => {
    const data = JSON.parse(await file.text());
    const loaded = [stage.fighters.hero.loadSkillJSON(data), stage.fighters.rival.loadSkillJSON(data)][0];
    stage.emitHud();
    setNote(`Loaded ${loaded.map((s) => s.id).join(', ')}. Play it from Practice.`);
  });

  return (
    <aside className="fb-studio" aria-label="Fantasy Battle studio">
      <header>
        <h2>Studio</h2>
        <button type="button" onClick={onClose}>Close</button>
      </header>

      <h3>Mode</h3>
      <button type="button" aria-pressed={!practice} disabled={hud.phase === 'playing'} onClick={() => stage.setMode('battle')}>Battle</button>
      <button type="button" aria-pressed={practice} disabled={hud.phase === 'playing'} onClick={() => stage.setMode('practice')}>Practice</button>
      <p className="fb-note">Practice plays skills at once (cancel windows and the input buffer apply); the shade only takes hits.</p>

      <h3>Skills</h3>
      {hud.skills.map((s) => (
        <button key={s.id} type="button" disabled={!practice} onClick={() => stage.practice(s.id)}>{s.hotkey ? `${s.hotkey} ` : ''}{s.name}</button>
      ))}
      <div>
        {EXPRESSIONS.map((name) => <button key={name} type="button" onClick={() => stage.fighters.hero.triggerExpression(name, 1.6)}>{name}</button>)}
      </div>
      <label className="fb-btn">Load skill JSON...
        <input type="file" accept="application/json,.json" hidden onChange={(e) => e.target.files?.[0] && loadSkillFile(e.target.files[0])} />
      </label>

      <h3>Debug</h3>
      <button type="button" aria-pressed={settings.wireframe} onClick={() => set({ wireframe: !settings.wireframe })}>Wireframe</button>
      <button type="button" aria-pressed={settings.pivots} onClick={() => set({ pivots: !settings.pivots })}>Pivots</button>
      <button type="button" aria-pressed={settings.hitboxes} onClick={() => set({ hitboxes: !settings.hitboxes })}>Hitboxes</button>
      {SLIDERS.map(([key, label, min, max, stepSize]) => (
        <label key={key} className="fb-row">
          <span>{label}</span>
          <input type="range" min={min} max={max} step={stepSize} value={settings[key]} onChange={(e) => set({ [key]: Number(e.target.value) })} />
          <output>{Number(settings[key]).toFixed(2)}</output>
        </label>
      ))}

      <h3>Skin swaps (setLayerTexture)</h3>
      <button type="button" disabled={!!busy} onClick={() => swapBow('hue-rotate(185deg) saturate(1.3) brightness(1.05)')}>Moon bow</button>
      <button type="button" disabled={!!busy} onClick={() => swapBow(null)}>Gold bow</button>
      <button type="button" disabled={!!busy} onClick={() => swapHair('sepia(1) saturate(4) hue-rotate(-25deg) brightness(0.95)')}>Copper hair</button>
      <button type="button" disabled={!!busy} onClick={() => swapHair(null)}>Silver hair</button>

      <h3>Download</h3>
      <button type="button" disabled={!!busy || !manifest} onClick={() => run('Zip', async () => downloadBlob(await buildKitZip(manifest, (p) => setNote(`Packing ${Math.round(p * 100)}%`)), 'silver-archer-kit.zip'))}>All layers + JSON (.zip)</button>
      <button type="button" onClick={() => downloadJson(rigData, 'archerRig.json')}>Rig JSON</button>
      <button type="button" onClick={() => downloadJson(skillDoc, 'bowSkills.json')}>Skills JSON</button>
      <button type="button" disabled={!!busy || !manifest} onClick={() => run('Player', async () => downloadBlob(new Blob([await buildStandaloneHtml(manifest)], { type: 'text/html' }), 'silver-archer-player.html'))}>Standalone HTML player</button>
      <button type="button" disabled={!!busy || hud.phase === 'playing'} onClick={() => run('Recording', async () => {
        setNote('Recording the three bow skills...');
        const blob = await stage.recordClip();
        if (video) URL.revokeObjectURL(video.url);
        setVideo({ url: URL.createObjectURL(blob), size: blob.size });
        setNote('');
      })}>Record WebM</button>
      {video && <a className="fb-btn" href={video.url} download="silver-archer-skills.webm">Save WebM ({Math.round(video.size / 1024)} KB)</a>}
      {busy && <p className="fb-note">{busy}...</p>}
      {note && <p className="fb-note">{note}</p>}
      <p className="fb-note">The recording plays Quick Shot, Radiant Shot and Triple Volley in practice mode (WebM; GIF is not offered).</p>
      {manifest && (
        <div className="fb-layers">
          {Object.keys(manifest.parts).map((name) => (
            <a key={name} href={`${ASSET_BASE}${name}.png`} download={`${name}.png`} title={`Download ${name}.png`}>
              <img src={`${ASSET_BASE}${name}.png`} alt="" loading="lazy" />
              {name}
            </a>
          ))}
        </div>
      )}
      <p className="fb-note">Renderer: {hud.renderer?.api || hud.renderer?.kind || 'starting'}{hud.renderer?.reason ? ` (${hud.renderer.reason})` : ''}</p>
    </aside>
  );
}
