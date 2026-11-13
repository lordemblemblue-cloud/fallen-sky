// TEMPORARY visual check of the Wolfveil world. Removed before this work is finished.
import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { createWolfveilVillage } from '@/components/game3d/wolfveil/WolfveilScene';
import { installWolfveilImportedTown } from '@/components/game3d/wolfveil/WolfveilImportedTownScene.mjs';
import { createWolfveilLivingMeadow } from '@/components/game3d/wolfveil/WolfveilLivingMeadow';
import { createWolfveilLivingSumiEMaterials } from '@/components/game3d/wolfveil/WolfveilLivingSumiEMaterials.mjs';
import { createInkWashLook } from '@/components/game3d/render/inkWashLook';

export const Route = createFileRoute('/wvshot/$view')({ ssr: false, component: Shot });

function Shot() {
  const { view } = Route.useParams();
  const host = useRef(null);
  const [log, setLog] = useState('starting');
  useEffect(() => {
    const el = host.current;
    let stop = false, timer = 0;
    const errs = [];
    const origError = console.error, origWarn = console.warn;
    console.error = (...a) => { errs.push('E:' + a.map(String).join(' ').slice(0, 700)); origError(...a); };
    console.warn = (...a) => { errs.push('W:' + a.map(String).join(' ').slice(0, 300)); origWarn(...a); };
    try {
      let inkLevel = 3; const flags = new Set();
      const specs = [];
      for (const t of decodeURIComponent(view).split('_')) {
        if (/^ink\d$/.test(t)) { inkLevel = Number(t[3]); continue; }
        if (/^[a-z]{4,}$/.test(t)) { flags.add(t); continue; }
        const ortho = t[0] === 'o';
        specs.push({ ortho, n: (ortho ? t.slice(1) : t).split(',').map(Number) });
      }
      const cols = specs.length > 1 ? 2 : 1, rows = Math.ceil(specs.length / cols);
      const W = Math.floor(window.innerWidth / cols), H = Math.floor(window.innerHeight / rows);
      const gl = document.createElement('canvas');
      const renderer = new THREE.WebGLRenderer({ canvas: gl, antialias: true, preserveDrawingBuffer: true });
      renderer.setPixelRatio(1); renderer.setSize(W, H, false);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.1;
      const scene = new THREE.Scene();
      scene.fog = new THREE.Fog(0xa9c4dc, 350, 2200);
      scene.background = new THREE.Color(0x9fc3e6);
      const hemi = new THREE.HemisphereLight(0xcfe4ff, 0x4a3a2a, 1.0); scene.add(hemi);
      const sun = new THREE.DirectionalLight(0xfff4d6, 2.2); sun.position.set(210, 420, 170); scene.add(sun);
      const ink = createInkWashLook({ renderer, guard: { render: (s, c) => { renderer.render(s, c); return true; } }, level: inkLevel, palette: 'vibrant' });
      const village = createWolfveilVillage(scene, {
        originAtMarket: true, silverWater: true, sunLight: sun, hideMarketStalls: true, importedTownAtMarket: true,
        spawnGroundTile: true, groundCover: { radius: 68, cellSize: 16, attemptsPerCell: 450, squareHalfExtent: 48 },
      });
      let townState = 'loading';
      const town = installWolfveilImportedTown(scene, { onStatus: s => { townState = s.state + (s.reason ? ':' + s.reason : ''); }, onReady: () => inkWorld?.refresh() });
      const meadow = createWolfveilLivingMeadow({ scene, offsetZ: 70, grassTileReplacement: village.grassTileReplacement });
      const inkWorld = createWolfveilLivingSumiEMaterials({ roots: [village.world.group, meadow.root, town.root], level: inkLevel });
      const weather = { weather: 'clear', windDir: 'SW', windMph: 8 };
      const floor = (x, z) => Math.max(village.worldHeight(x, z), town.groundY(x, z) ?? -Infinity);
      const outs = specs.map(() => {
        const c = document.createElement('canvas'); c.width = W; c.height = H; c.style.cssText = 'width:100%;height:100%;display:block';
        el.appendChild(c); return c.getContext('2d');
      });
      el.style.gridTemplateColumns = `repeat(${cols},1fr)`;
      let cycle = 0, applied = false;
      const applyFlags = () => {
        if (applied || !town.model) return; applied = true;
        if (flags.has('nomeadow')) meadow.root.visible = false;
        if (flags.has('novillage')) village.world.group.visible = false;
        if (flags.has('basic')) town.model.traverse(o => { if (o.isMesh) o.material = new THREE.MeshBasicMaterial({ color: 0xff0000 + (o.id * 977 % 255) }); });
        if (flags.has('nocull')) town.model.traverse(o => { o.frustumCulled = false; });
      };
      const draw = () => {
        if (stop) return;
        const t0 = performance.now(); applyFlags();
        specs.forEach((s, i) => {
          let cam, focus;
          if (s.ortho) {
            const [cx, cz, half] = s.n, aspect = W / H;
            cam = new THREE.OrthographicCamera(-half * aspect, half * aspect, half, -half, 1, 2500);
            cam.position.set(cx, 900, cz); cam.up.set(0, 0, 1); cam.lookAt(cx, 0, cz);
            focus = { x: cx, y: floor(cx, cz), z: cz };
          } else {
            const [x, z, h, tx, tz, th, fov = 55] = s.n;
            cam = new THREE.PerspectiveCamera(fov, W / H, 0.1, 3200);
            cam.position.set(x, floor(x, z) + h, z);
            focus = { x: tx, y: floor(tx, tz), z: tz };
            cam.lookAt(tx, focus.y + th, tz);
          }
          cam.updateMatrixWorld(true);
          for (let k = 0; k < 3; k++) {
            village.update(0.05, weather, focus); town.update(0.05);
            meadow.update(0.05, weather, focus, []); inkWorld.update(0.05, weather);
          }
          if (s.ortho || !inkLevel) renderer.render(scene, cam); else ink.render(scene, cam);
          outs[i].drawImage(gl, 0, 0);
        });
        cycle++;
        let dbg = '';
        if (town.model) {
          const b = new THREE.Box3().setFromObject(town.model); let n = 0, vis = 0;
          town.model.traverse(o => { if (o.isMesh) { n++; if (o.visible) vis++; } });
          const rows = []; let chain = '';
          for (let o = town.model; o; o = o.parent) chain += `${o.name || o.type}:${o.visible ? 1 : 0}>`;
          town.model.traverse(o => {
            if (!o.isMesh || rows.length >= 14) return;
            const m = Array.isArray(o.material) ? o.material[0] : o.material, g = o.geometry;
            const wb = new THREE.Box3().setFromObject(o);
            rows.push(`${o.name} v${g.attributes.position.count} i${g.index?.count ?? '-'} dr${g.drawRange.start},${g.drawRange.count} box ${[wb.min.x, wb.min.y, wb.min.z, wb.max.x, wb.max.y, wb.max.z].map(v => v.toFixed(0)).join(',')} ${m.type} ${m.name} op${m.opacity} tr${m.transparent} vis${m.visible} col${m.color?.getHexString()} side${m.side} layers${o.layers.mask}`);
          });
          errs.length = 0; errs.push(chain, ...rows);
          dbg = ` meshes ${n}/${vis} box ${[b.min.x, b.min.y, b.min.z, b.max.x, b.max.y, b.max.z].map(v => v.toFixed(1)).join(',')} floorY ${floor(0, 0).toFixed(2)} terr ${village.worldHeight(0, 0).toFixed(2)}`;
        }
        const bad = renderer.info.programs?.filter(p => p.diagnostics && !p.diagnostics.runnable).length;
        setLog(`cycle ${cycle} · ${Math.round(performance.now() - t0)}ms · town ${townState} · ink ${inkLevel}${dbg} · badPrograms ${bad} · calls ${renderer.info.render.calls}\n${errs.slice(0, 16).join('\n')}`);
        timer = setTimeout(draw, 1500);
      };
      draw();
    } catch (e) { setLog('ERROR ' + (e?.stack || e)); }
    return () => { stop = true; clearTimeout(timer); };
  }, [view]);
  return (
    <div style={{ position: 'fixed', inset: 0, background: '#000' }}>
      <div ref={host} style={{ position: 'absolute', inset: 0, display: 'grid', gap: 2 }} />
      <pre style={{ position: 'absolute', left: 4, top: 4, margin: 0, color: '#fff', background: 'rgba(0,0,0,.6)', font: '11px monospace', padding: 3, whiteSpace: 'pre-wrap', maxWidth: '90%' }}>{log}</pre>
    </div>
  );
}