import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Crosshair, LogOut, RotateCcw, Rocket, Zap, Gauge, Shield, Power, RefreshCcw } from 'lucide-react';
import { loadSettings } from '../settings.js';
import { FleetClient } from './client/fleetClient.js';
import { LocalFleetTransport, RailwayFleetTransport } from './client/transport.js';
import { FlightControls } from './client/flightControls.js';
import { SpaceView } from './client/spaceView.js';
import { FleetHud } from './client/fleetHud.js';
import { FleetAudio } from './client/fleetAudio.js';
import { InteriorView } from './boarding/interiorView.js';
import Game2SkillTree from '../skillTree/Game2SkillTree';
import useSkillTreeMenu from '../skillTree/useSkillTreeMenu';
import { BOARDING_ROLES, CHARGES, CRUISER, GROUND, INTERIOR, ROLES, ROLE_IDS, SHIP_CLASSES, SHIP_TIERS, SIDES, SUBSYSTEM_IDS, TROOPER_TIERS } from '../../../../server/game2/fleet/rules.mjs';
import { dist } from '../../../../server/game2/fleet/vec.mjs';

// One Fleet Assault session: the space fight (WebGL2 view + 2D HUD) on top of a FleetClient. Practice runs the real
// match server in this page with AI pilots; online joins the Railway server. Fills its positioned parent.
const HELP = [
  ['Fly', 'Mouse steers (it springs back to centre) · arrows also pitch and turn · A / D (or Q / E) roll'],
  ['Speed', 'W faster · S brake · let go to cruise · Shift (or Space) boost: drains the meter, drifts through turns'],
  ['Evasive flight', 'B barrel-roll right · N barrel-roll left (3.2s cooldown) · X engines OFF/ON to coast, turn around, then ignite to surprise a pursuer'],
  ['Shield ability', 'Every ship launches with a shield · G refreshes 72% of maximum shield after damage (18-second server-validated cooldown)'],
  ['Weapons', 'Left mouse lasers (watch the heat) · T lock the enemy nearest the reticle · right mouse or F missile when locked'],
  ['Cruisers', 'Strip the shields, then hit the hardpoints: W weapons · S shield generator · H hyperdrive · C comms'],
  ['Boarding', 'Boarding missions fly a boarding craft: get under an enemy cruiser whose shields are down to break in'],
  ['Commander', '1–4 broadside focus · J hyperdrive jump (25% hull or less) · M mark a target · drag to look around'],
  ['Aboard a cruiser', 'You fight on foot with Game 2\'s Jedi Outcast saber and Force (F1 there lists them) · E plant / defuse a charge at a station · Esc: menu, commander orders'],
  ['Planet', 'WASD move on the schematic · E plant or defuse a charge at an array'],
  ['Other', 'Tab scoreboard · R back to the hangar (near your cruiser) · Esc menu and roles · H this help'],
];
const ROLE_SHORT = { commander: 'Commander', guard: 'Guard', pilot: 'Pilot', saboteur: 'Saboteur', boarder: 'Boarding', strike: 'Strike team', ground: 'Ground team' };

export default function FleetFlight({ mode, profile, onExit }) {
  const hostRef = useRef(null);
  const clientRef = useRef(null);
  const controlsRef = useRef(null);
  const overlayRef = useRef(null);
  const interiorRef = useRef(null);
  const tacticalRef = useRef(false);
  const [overlay, setOverlayState] = useState(null); // 'menu' | 'help' | 'board'
  const [, setTick] = useState(0);
  const [fatal, setFatal] = useState('');
  const [tactical, setTacticalState] = useState(false); // aboard: the space view behind the menu instead of the interior
  const setTactical = v => { tacticalRef.current = v; setTacticalState(v); };
  const setOverlay = v => { overlayRef.current = v; setOverlayState(v); };
  const skillGameRef = useRef(null);
  skillGameRef.current = interiorRef.current?.game || null;
  const skillTree = useSkillTreeMenu({
    gameRef: skillGameRef, ready: !!skillGameRef.current && !fatal,
    blocked: !!overlay && overlay !== 'skills',
    onBlockingChange: next => setOverlay(next ? 'skills' : null),
  });

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;
    const settings = loadSettings();
    const gl = document.createElement('canvas'), ui = document.createElement('canvas');
    for (const c of [gl, ui]) { Object.assign(c.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', display: 'block' }); host.appendChild(c); }
    ui.style.pointerEvents = 'none';
    gl.tabIndex = 0;
    let view, hud, controls, audio, raf = 0, last = performance.now(), fpsAt = last, frames = 0, fps = 0, uiAt = 0;
    const lag = Number(new URLSearchParams(window.location.search).get('fleetlag')) || 0;
    const transport = mode === 'online'
      ? new RailwayFleetTransport({ token: profile.token, selfId: profile.selfId, name: profile.name, role: profile.role, side: profile.side })
      : new LocalFleetTransport({ name: profile.name, role: profile.role, side: profile.side, lagMs: lag, drill: profile.drill ? 'boarding' : null });
    const client = clientRef.current = new FleetClient(transport);
    if (import.meta.env?.DEV) window.__fleetClient = client; // dev server only: lets a tester inspect the client
    try {
      view = new SpaceView(gl, { quality: settings.quality, fov: settings.fov });
      hud = new FleetHud(ui);
      controls = controlsRef.current = new FlightControls(gl, settings);
      audio = new FleetAudio(settings.masterVolume);
      controls.input.onFirstGesture = () => audio.resume();
    } catch (e) {
      setFatal('WebGL2 is not available: ' + e.message);
      gl.remove(); ui.remove();
      return undefined;
    }
    client.start();
    const interior = interiorRef.current = new InteriorView(host, settings, profile.avatarId); // selected player model aboard cruisers
    if (import.meta.env?.DEV) window.__fleetInterior = interior; // dev server only, like __fleetClient
    const walk = { p: null, sentAt: 0 }; // on the planet (or aboard while the interior is unavailable): the schematic marker
    let wasLocked = false, wasDead = false;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const now = performance.now(), dt = Math.min(100, now - last); last = now;
      frames++; if (now - fpsAt > 1000) { fps = frames; frames = 0; fpsAt = now; }
      const I = controls.input;
      // the server put our body aboard a cruiser: the interior on the Jedi Outcast engine replaces the space view
      const area = client.you?.b?.area?.startsWith('ship:') ? client.you.b.area : null;
      if ((area || BOARDING_ROLES.includes(client.you?.r)) && interior.status === 'idle') interior.load(); // boarding parties: ready by the time they reach a hangar
      if (interior.status === 'ready' && interior.area !== area) {
        try { document.exitPointerLock(); } catch { /* not locked */ }
        if (area) interior.enter(client, area); else { interior.leave(); setTactical(false); }
      }
      if (interior.game) { aboardFrame(now, dt); return; }
      gl.style.display = ui.style.display = 'block';
      // Esc while the pointer is locked only releases the lock (browsers keep that key): open the menu then
      if (wasLocked && !I.locked && !overlayRef.current && !client.result && client.you?.th !== 'dead') setOverlay('menu');
      // destroyed: free the mouse so the selection screen can be clicked
      if (client.you?.th === 'dead' && !wasDead) { try { document.exitPointerLock(); } catch { /* fine */ } }
      wasDead = client.you?.th === 'dead';
      wasLocked = I.locked;
      const orbit = { dx: I.btn[0] || I.locked ? I.dx : 0, dy: I.btn[0] || I.locked ? I.dy : 0, wheel: I.wheel };
      const flying = !!client.pred && !overlayRef.current;
      const pressed = controls.frame(dt, flying);
      if (!overlayRef.current) handleKeys(pressed, I);
      walkBody(dt, I);
      client.update(dt, flying ? controls : null);
      const info = view.render(client, dt, client.pred ? null : orbit);
      hud.draw(client, info, { fps: settings.showFps ? fps : 0 });
      const events = client.events.splice(0);
      const me = client.renderPos() || view.cam.p;
      audio.play(events, { boosting: !!client.pred?.boosting, near: e => (e.at && me ? Math.max(0, 1 - dist(me, e.at.map(v => v / 10)) / 2500) : 0.2) });
      if (now - uiAt > 250) { uiAt = now; setTick(t => t + 1); }
    };
    // aboard: the engine runs the fight; the flight controls idle; the space view only behind the menu ("tactical")
    const aboardFrame = (now, dt) => {
      wasLocked = false;
      const pressed = controls.frame(dt, false), dead = client.you?.th === 'dead';
      if (dead && !wasDead) { try { document.exitPointerLock(); } catch { /* fine */ } } // down: free the mouse for the deploy screen
      wasDead = dead;
      if (dead && !overlayRef.current) TROOPER_TIERS.forEach((t, i) => { if (pressed.has('Digit' + (i + 4))) client.loadout({ trooper: t.id }); });
      client.update(dt, null);
      const outside = !!(tacticalRef.current && overlayRef.current && overlayRef.current !== 'skills');
      interior.show(!outside); gl.style.display = ui.style.display = outside ? 'block' : 'none';
      const r = interior.frame(now, { blocked: !!overlayRef.current, render: !outside && overlayRef.current !== 'skills' });
      if (r.escaped && !overlayRef.current && !client.result && !dead) setOverlay('menu');
      if (outside) { const info = view.render(client, dt, { dx: 0, dy: 0, wheel: 0 }); hud.draw(client, info, { fps: 0 }); }
      client.events.splice(0); // the engine plays its own sounds aboard
      if (now - uiAt > 250) { uiAt = now; setTick(t => t + 1); }
    };
    const handleKeys = (pressed, I) => {
      if (pressed.has('Escape')) { setOverlay('menu'); try { document.exitPointerLock(); } catch { /* fine */ } }
      if (pressed.has('KeyH') || pressed.has('F1')) setOverlay('help');
      if (pressed.has('Tab')) setOverlay('board');
      if (pressed.has('KeyT')) {
        const p = client.renderPos(), f = client.forward();
        client.lockTarget = p && f ? client.pickTarget(p, f)?.eid || 0 : 0;
      }
      if (pressed.has('KeyR')) client.redeploy();
      if (pressed.has('KeyJ')) client.jump();
      if (client.you?.th === 'dead' || client.phase === 'warmup') { // the selection screen
        SHIP_TIERS.forEach((t, i) => { if (pressed.has('Digit' + (i + 1))) client.loadout({ ship: t.id }); });
        TROOPER_TIERS.forEach((t, i) => { if (pressed.has('Digit' + (i + 4))) client.loadout({ trooper: t.id }); });
      } else {
        SUBSYSTEM_IDS.forEach((s, i) => { if (pressed.has('Digit' + (i + 1))) client.focus(client.you?.cmd?.focus === s ? null : s); });
        if (pressed.has('Digit0')) client.focus(null);
      }
      if (pressed.has('KeyM')) {
        const t = client.targetInfo(client.lockTarget);
        if (t) client.mark(t.p, 'attack');
        else if (client.renderPos()) client.mark(client.renderPos(), 'defend');
      }
      if (pressed.has('KeyE') && client.you?.b?.alive) actAtStation();
      if (!I.held('KeyT') && client.lockTarget && !client.targetInfo(client.lockTarget)) client.lockTarget = 0;
    };
    const walkBody = (dt, I) => {
      const b = client.you?.b;
      if (!b?.alive || overlayRef.current) { walk.p = null; return; }
      const fix = client.events.find(e => e.e === 'fix');
      if (!walk.p || fix || dist(walk.p, b.p) > 6) walk.p = fix ? [...fix.p] : [...b.p];
      const ax = (I.held('KeyD') ? 1 : 0) - (I.held('KeyA') ? 1 : 0), az = (I.held('KeyS') ? 1 : 0) - (I.held('KeyW') ? 1 : 0);
      if (!ax && !az) return;
      const k = 9 * dt / 1000 / Math.hypot(ax, az);
      const box = b.area === 'ground' ? GROUND.bounds : INTERIOR.bounds;
      walk.p = [walk.p[0] + ax * k, walk.p[1], walk.p[2] + az * k].map((v, i) => Math.max(box[0][i], Math.min(box[1][i], v)));
      if (performance.now() - walk.sentAt > 100) { walk.sentAt = performance.now(); client.send({ c: 'pos', p: walk.p }); }
    };
    const actAtStation = () => {
      const b = client.you.b;
      const stations = b.area === 'ground'
        ? SIDES.map(s => ['array:' + s, GROUND.arrays[s]])
        : Object.entries(INTERIOR.stations).filter(([k]) => SUBSYSTEM_IDS.includes(k));
      const near = stations.map(([id, p]) => [id, dist(p, b.p)]).sort((a, c) => a[1] - c[1])[0];
      if (!near || near[1] > 4) { client.pushToast('Walk up to a station first'); return; }
      const charged = client.charges.find(c => c.area === b.area && c.station === near[0]);
      client.send({ c: charged && charged.side !== client.me.side ? 'defuse' : 'plant', station: near[0] });
    };
    raf = requestAnimationFrame(loop);
    gl.focus?.();
    return () => {
      cancelAnimationFrame(raf);
      interior.dispose(); interiorRef.current = null;
      client.close();
      controls?.dispose(); controlsRef.current = null; audio?.dispose(); view?.dispose();
      gl.remove(); ui.remove();
      clientRef.current = null;
      if (window.__fleetClient === client) delete window.__fleetClient;
      if (window.__fleetInterior === interior) delete window.__fleetInterior;
    };
  }, [mode, profile]);

  const client = clientRef.current;
  const interior = interiorRef.current;
  const aboard = !!interior?.game;
  const close = () => { setOverlay(null); (aboard ? interior.canvas : hostRef.current?.querySelector('canvas'))?.focus?.(); };
  const boarding = !aboard && client?.you?.b?.area?.startsWith('ship:') && interior && interior.status !== 'error';
  const cmd = client?.you?.cmd;
  const ended = client?.ended;
  const flying = !!(client?.pred && !aboard && !overlay && !client?.result && client.you?.th !== 'dead');
  const cockpit = client?.you?.lock;
  const readyLock = !!(cockpit?.[0] && client.predCls?.missiles &&
    cockpit[1] >= client.predCls.missiles.lockTime * 1000);
  const acquireTarget = () => {
    const p = client?.renderPos(), dir = client?.forward();
    if (!p || !dir) return;
    const target = client.pickTarget(p, dir);
    client.lockTarget = target?.eid || 0;
    if (!target) client.pushToast('No enemy within targeting cone');
  };
  return <div className="absolute inset-0 overflow-hidden bg-black text-white" data-testid="fleet-flight">
    <div ref={hostRef} className="absolute inset-0" />
    {skillTree.open && aboard && <Game2SkillTree game={interior.game} onClose={skillTree.close} online />}
    {/* Semantic click targets matching the lower-right cockpit HUD, routed through existing flight controls. */}
    {flying && <div data-testid="fleet-special-actions" role="group"
      aria-label="Defensive flight abilities" className="absolute bottom-[151px] right-3 z-10 flex items-center gap-2 sm:right-5">
      <button type="button" data-testid="fleet-barrel-roll" title="Barrel roll right (B); roll left (N)"
        aria-label="Perform barrel roll" disabled={(client.pred?.barrelCooldown || 0) > 0.05}
        onClick={() => controlsRef.current?.queueBarrel(1)}
        className="flex h-10 items-center gap-2 rounded-lg border border-cyan-300/40 bg-[#03141b]/70 px-3 text-xs text-cyan-100 backdrop-blur-sm disabled:opacity-40">
        <RefreshCcw size={16} /> Roll
      </button>
      <button type="button" data-testid="fleet-engine-cut" title="Cut/reignite engines (X)"
        aria-label="Toggle engines" aria-pressed={!!controlsRef.current?.engineOff}
        onClick={() => controlsRef.current?.toggleEngine()}
        className={'flex h-10 items-center gap-2 rounded-lg border px-3 text-xs backdrop-blur-sm ' +
          (controlsRef.current?.engineOff ? 'border-amber-300/75 bg-amber-400/20 text-amber-200' : 'border-cyan-300/40 bg-[#03141b]/70 text-cyan-100')}>
        <Power size={16} /> {controlsRef.current?.engineOff ? 'Ignite' : 'Cut engine'}
      </button>
      <button type="button" data-testid="fleet-shield-rebuff" title="Shield restoration skill (G)"
        aria-label="Restore ship shields" disabled={(client.you?.shcd || 0) > 0 || (client.you?.sh ?? 0) >= (client.you?.shmax ?? 1)}
        onClick={() => controlsRef.current?.queueShield()}
        className="flex h-10 items-center gap-2 rounded-lg border border-sky-300/60 bg-[#062438]/75 px-3 text-xs text-sky-100 backdrop-blur-sm disabled:opacity-40">
        <Shield size={16} /> {(client.you?.shcd || 0) > 0 ? Math.ceil(client.you.shcd / 1000) + 's' : 'Rebuff'}
      </button>
    </div>}
    {flying && <div data-testid="fleet-cockpit-actions" role="group" aria-label="Flight combat controls" className="absolute bottom-[78px] right-3 z-10 flex select-none items-end gap-1.5 sm:right-5 sm:gap-2">
      <button type="button" data-testid="fleet-lock-target" aria-label="Acquire enemy target" title="Lock enemy ahead (T)" aria-pressed={!!client.lockTarget}
        onClick={acquireTarget}
        className={'flex h-[58px] w-[62px] flex-col items-center justify-center gap-1 rounded-lg border bg-[#03141b]/55 text-[10px] font-bold uppercase tracking-wider backdrop-blur-sm transition hover:bg-cyan-300/20 sm:w-[68px] ' + (client.lockTarget ? 'border-amber-300/65 text-amber-200' : 'border-cyan-300/40 text-cyan-200')}>
        <Crosshair size={25} strokeWidth={1.6} /><span>Target</span>
      </button>
      {client.predCls?.lasers && <button type="button" data-testid="fleet-fire-lasers" aria-label="Fire primary lasers" title="Fire lasers (left mouse)"
        onPointerDown={e => { e.currentTarget.setPointerCapture?.(e.pointerId); controlsRef.current?.holdFire(true); controlsRef.current?.pulseFire(); }}
        onPointerUp={() => controlsRef.current?.holdFire(false)} onPointerCancel={() => controlsRef.current?.holdFire(false)} onPointerLeave={() => controlsRef.current?.holdFire(false)}
        onClick={() => controlsRef.current?.pulseFire()}
        className="flex h-[65px] w-[66px] flex-col items-center justify-center gap-1 rounded-lg border border-cyan-300/55 bg-[#041923]/55 text-[10px] font-bold uppercase tracking-wider text-cyan-100 backdrop-blur-sm transition hover:bg-cyan-300/20 active:bg-cyan-300/30 sm:w-[74px]">
        <Zap size={29} strokeWidth={1.7} /><span>Lasers</span>
      </button>}
      {client.predCls?.missiles && <button type="button" data-testid="fleet-fire-missile" aria-label="Launch locked missile" title="Launch missile (right mouse / F)" disabled={!readyLock || !(client.you?.ms > 0)}
        onClick={() => controlsRef.current?.queueMissile()}
        className={'flex h-[65px] w-[66px] flex-col items-center justify-center gap-1 rounded-lg border border-cyan-300/55 bg-[#041923]/55 text-[10px] font-bold uppercase tracking-wider text-cyan-100 backdrop-blur-sm transition enabled:hover:bg-cyan-300/20 enabled:active:bg-cyan-300/30 disabled:opacity-45 sm:w-[74px] ' + (readyLock ? 'border-amber-300/80 text-amber-200' : '')}>
        <Rocket size={28} strokeWidth={1.6} /><span>Missile {client.you?.ms ?? 0}</span>
      </button>}
      <button type="button" data-testid="fleet-boost" aria-label="Engage boost" title="Hold to boost (Shift / Space)"
        onPointerDown={e => { e.currentTarget.setPointerCapture?.(e.pointerId); controlsRef.current?.holdBoost(true); controlsRef.current?.pulseBoost(); }}
        onPointerUp={() => controlsRef.current?.holdBoost(false)} onPointerCancel={() => controlsRef.current?.holdBoost(false)} onPointerLeave={() => controlsRef.current?.holdBoost(false)}
        onClick={() => controlsRef.current?.pulseBoost()}
        className="flex h-[58px] w-[62px] flex-col items-center justify-center gap-1 rounded-lg border border-cyan-300/40 bg-[#03141b]/55 text-[10px] font-bold uppercase tracking-wider text-cyan-200 backdrop-blur-sm transition hover:bg-cyan-300/20 sm:w-[68px]">
        <Gauge size={25} strokeWidth={1.6} /><span>Boost</span>
      </button>
    </div>}
    {client?.boardedAt && client.now() - client.boardedAt.at < 1600 && <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-black/85">
      <div className="text-center"><div className="text-xs uppercase tracking-[.3em] text-cyan-300">Through the hangar field</div><div className="mt-2 text-2xl font-black">Boarding {client.boardedAt.name}</div></div>
    </div>}
    {client?.you?.b?.alive && !aboard && <Schematic client={client} />}
    {boarding && <div className="pointer-events-none absolute inset-x-0 top-1/3 z-10 flex justify-center"><div className="rounded-xl bg-black/75 px-5 py-3 text-center text-sm">
      <div className="font-bold text-cyan-200">Boarding the cruiser</div><div className="mt-1 text-xs text-white/60">Loading {interior.progress || 'the Jedi Outcast engine'}…</div></div></div>}
    {!aboard && interior?.status === 'error' && client?.you?.b?.area?.startsWith('ship:') && <div className="pointer-events-none absolute inset-x-0 bottom-6 z-10 text-center text-xs text-rose-200">The cruiser interior could not load ({interior.error}); the schematic stands in.</div>}
    {client && !overlay && !client.result && (client.you?.th === 'dead' || client.phase === 'warmup') && <div className="absolute inset-x-0 bottom-6 z-10 flex justify-center px-4"><DeployPanel client={client} /></div>}
    {fatal && <Notice title="Fleet Assault cannot start" text={fatal} onExit={onExit} />}
    {!fatal && ended && !client?.result && <Notice title="Disconnected" text={ended} onExit={onExit} />}
    {client?.result && !overlay && <div className="absolute inset-x-0 bottom-24 flex justify-center gap-3">
      <button onClick={() => client.requeue()} className="flex items-center gap-2 rounded-xl bg-cyan-300 px-5 py-2.5 text-sm font-bold text-slate-950"><RotateCcw size={15} /> Next match</button>
      <button onClick={onExit} className="rounded-xl bg-white/10 px-5 py-2.5 text-sm font-semibold">Leave</button>
    </div>}
    {overlay === 'help' && <Panel title="Controls" onClose={close}>
      <div className="grid gap-2 text-sm">{HELP.map(([k, v]) => <div key={k} className="grid grid-cols-[110px_1fr] gap-3"><span className="font-semibold text-cyan-200">{k}</span><span className="text-white/70">{v}</span></div>)}</div>
    </Panel>}
    {overlay === 'board' && client && <Scoreboard client={client} onClose={close} />}
    {overlay === 'menu' && client && <Panel title="Fleet Assault" onClose={close}>
      <DeployPanel client={client} />
      <div className="mt-5" />
      <div className="text-xs uppercase tracking-widest text-white/45">Role at your next launch</div>
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">{ROLE_IDS.map(r => <button key={r} onClick={() => client.chooseRole(r)}
        className={'rounded-lg px-3 py-2 text-left text-xs ' + ((client.you?.pr || client.me?.role) === r ? 'bg-cyan-300/20 ring-1 ring-cyan-300/60' : 'bg-white/5 hover:bg-white/10')}>
        <div className="font-semibold">{ROLES[r].name}</div><div className="mt-0.5 text-[10px] leading-snug text-white/45">{ROLES[r].blurb}</div></button>)}</div>
      {cmd && <div className="mt-5">
        <div className="text-xs uppercase tracking-widest text-white/45">Commander orders{client.cruisers.get(cmd.cruiser)?.subs.comms <= 0 ? ' · comms down: no broadside orders' : ''}</div>
        <div className="mt-2 flex flex-wrap gap-2">{SUBSYSTEM_IDS.map(s => <button key={s} onClick={() => client.focus(cmd.focus === s ? null : s)}
          className={'rounded-lg px-3 py-1.5 text-xs ' + (cmd.focus === s ? 'bg-orange-300/25 ring-1 ring-orange-300/70' : 'bg-white/5 hover:bg-white/10')}>Broadsides on {CRUISER.subsystems[s].name.toLowerCase()}</button>)}
          <button onClick={() => client.jump()} disabled={!cmd.canJump} className="rounded-lg bg-white/5 px-3 py-1.5 text-xs hover:bg-white/10 disabled:opacity-40">Hyperdrive jump (25% hull or less)</button></div>
      </div>}
      <div className="mt-5 flex flex-wrap gap-2">
        <button onClick={close} className="flex items-center gap-2 rounded-xl bg-cyan-300 px-4 py-2 text-sm font-bold text-slate-950"><Crosshair size={15} /> Resume</button>
        <button onClick={() => setOverlay('board')} className="rounded-xl bg-white/10 px-4 py-2 text-sm">Scoreboard</button>
        {aboard && <button onClick={() => setTactical(!tactical)} aria-pressed={tactical} className={'rounded-xl px-4 py-2 text-sm ' + (tactical ? 'bg-cyan-300/25 ring-1 ring-cyan-300/60' : 'bg-white/10')}>{tactical ? 'Back to the interior view' : 'Watch the battle outside'}</button>}
        <button onClick={() => { client.redeploy(); close(); }} className="rounded-xl bg-white/10 px-4 py-2 text-sm">Back to the hangar (R)</button>
        <button onClick={() => setOverlay('help')} className="rounded-xl bg-white/10 px-4 py-2 text-sm">Controls</button>
        <button onClick={onExit} className="flex items-center gap-2 rounded-xl bg-white/10 px-4 py-2 text-sm"><LogOut size={15} /> Leave the match</button>
      </div>
    </Panel>}
  </div>;
}

// the Battlefront II-style selection screen: three ship levels and three levels on foot, each with its cost
function DeployPanel({ client }) {
  const you = client.you || {}, side = client.me?.side || 'republic';
  const pts = you.pts ?? 0, kills = you.kills ?? 0, [ship, trooper] = you.lo || ['fighter', 'trooper'];
  const spend = client.welcome?.cfg?.spendPoints !== false;
  const card = (t, picked, onPick, detail, key) => {
    const open = kills >= t.kills && pts >= t.cost;
    return <button key={t.id} onClick={onPick} aria-pressed={picked}
      className={'rounded-xl p-3 text-left transition ' + (picked ? 'bg-cyan-300/15 ring-1 ring-cyan-300/70' : 'bg-white/[.05] ring-1 ring-white/10 hover:bg-white/10')}>
      <div className="flex items-center justify-between text-[10px] uppercase tracking-widest text-white/45"><span>Level {t.level}</span><span>key {key}</span></div>
      <div className="mt-1 text-sm font-bold">{t.name[side]}</div>
      <div className="mt-0.5 text-[11px] leading-snug text-white/55">{detail}</div>
      <div className={'mt-1.5 text-xs font-semibold ' + (t.cost ? 'text-amber-200' : 'text-emerald-300')}>{t.cost ? t.cost + ' points' + (t.kills ? ' · ' + t.kills + ' kills' : '') : 'Free'}</div>
      {!open && <div className="mt-0.5 text-[11px] text-rose-300">Needs {[t.cost > pts && (t.cost - pts) + ' more points', t.kills > kills && (t.kills - kills) + ' more kills'].filter(Boolean).join(' and ')}</div>}
    </button>;
  };
  return <div className="w-full max-w-3xl rounded-2xl border border-white/10 bg-[#04101c]/90 p-4 text-white backdrop-blur">
    <div className="flex items-center justify-between text-xs"><span className="font-bold uppercase tracking-[.2em] text-cyan-200">Deploy</span>
      <span className="text-white/60"><b className="text-amber-200">{pts}</b> points · <b className="text-white">{kills}</b> kills</span></div>
    <div className="mt-3 text-[10px] uppercase tracking-widest text-white/45">Ship</div>
    <div className="mt-1 grid gap-2 sm:grid-cols-3">{SHIP_TIERS.map((t, i) => {
      const c = SHIP_CLASSES[t.cls];
      return card(t, ship === t.id, () => client.loadout({ ship: t.id }), c.hull + ' hull · ' + c.boostSpeed + ' m/s boost · ' + c.guns.length + ' guns · ' + (c.missiles?.count || 0) + ' missiles', i + 1);
    })}</div>
    <div className="mt-3 text-[10px] uppercase tracking-widest text-white/45">On foot (boarding, guards, planet)</div>
    <div className="mt-1 grid gap-2 sm:grid-cols-3">{TROOPER_TIERS.map((t, i) => card(t, trooper === t.id, () => client.loadout({ trooper: t.id }), t.kit + ' · ' + t.hp + ' health' + (t.shield ? ' + ' + t.shield + ' shield' : ''), i + 4))}</div>
    <p className="mt-2 text-[10px] text-white/40">Takes effect at your next launch. {spend ? 'Points are spent when you deploy; if you cannot afford it then, you get the free level.' : 'A level stays unlocked once you reach it.'} Boarding parties always fly the boarding craft.</p>
  </div>;
}

function Panel({ title, children, onClose }) {
  return <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="max-h-full w-full max-w-3xl overflow-y-auto rounded-2xl border border-cyan-300/20 bg-[#071420]/95 p-6 shadow-2xl">
      <div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-black tracking-wide">{title}</h2><button onClick={onClose} className="text-sm text-white/60 hover:text-white">Close</button></div>
      {children}
    </div>
  </div>;
}

function Notice({ title, text, onExit }) {
  return <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/70 p-6">
    <div className="max-w-md rounded-2xl border border-white/10 bg-[#0a1926] p-6 text-center">
      <div className="text-lg font-black">{title}</div><p className="mt-2 text-sm text-white/65">{text}</p>
      <button onClick={onExit} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-white/10 px-4 py-2 text-sm"><ArrowLeft size={15} /> Back</button>
    </div>
  </div>;
}

function Scoreboard({ client, onClose }) {
  const rows = client.board?.players || [];
  const commander = client.you?.r === 'commander';
  return <Panel title="Scoreboard" onClose={onClose}>
    <div className="grid gap-4 md:grid-cols-2">{SIDES.map((side, sc) => <div key={side}>
      <div className={'mb-2 text-sm font-bold ' + (side === 'republic' ? 'text-sky-300' : 'text-orange-300')}>{side === 'republic' ? 'Republic' : 'Empire'}{side === client.me?.side ? ' (you)' : ''}</div>
      <table className="w-full text-xs"><thead><tr className="text-white/40"><th className="text-left font-medium">Pilot</th><th className="text-left font-medium">Role</th><th>K</th><th>D</th><th>Pts</th></tr></thead>
        <tbody>{rows.filter(r => r[2] === sc).sort((a, b) => b[6] - a[6]).map(r => <tr key={r[0]} className={r[0] === client.me?.eid ? 'text-cyan-200' : r[7] ? 'text-white/85' : 'text-white/40'}>
          <td className="py-0.5">{r[1]}</td>
          <td>{commander && r[7] && side === client.me?.side && r[0] !== client.me?.eid
            ? <select aria-label={'Assign ' + r[1]} className="rounded bg-white/10 px-1 text-xs" value={ROLE_IDS[r[3]]} onChange={e => client.assign(r[0], e.target.value)}>
              {['pilot', 'saboteur', 'boarder', 'strike', 'ground', 'guard'].map(x => <option key={x} value={x}>{ROLE_SHORT[x]}</option>)}</select>
            : ROLE_SHORT[ROLE_IDS[r[3]]]}</td>
          <td className="text-center">{r[4]}</td><td className="text-center">{r[5]}</td><td className="text-center">{r[6]}</td></tr>)}</tbody></table>
    </div>)}</div>
    <p className="mt-4 text-[11px] text-white/40">Grey names are AI pilots filling empty seats; they leave as players join.{commander ? ' As commander you can reassign your players (it takes effect at their next launch).' : ''}</p>
  </Panel>;
}

// Aboard a cruiser or on the planet the playable level is the next branch (Jedi Outcast combat engine); meanwhile a
// schematic lets players walk to stations and plant or defuse charges against the real server rules.
function Schematic({ client }) {
  const b = client.you.b;
  const ground = b.area === 'ground';
  const box = ground ? GROUND.bounds : INTERIOR.bounds;
  const W = 260, H = ground ? 260 : 300;
  const sx = x => ((x - box[0][0]) / (box[1][0] - box[0][0])) * W, sz = z => ((z - box[0][2]) / (box[1][2] - box[0][2])) * H;
  const stations = ground ? SIDES.map(s => ['array:' + s, GROUND.arrays[s]]) : Object.entries(INTERIOR.stations);
  const charges = client.charges.filter(c => c.area === b.area);
  const act = b.act;
  return <div className="pointer-events-none absolute right-4 top-28 z-10 rounded-xl border border-white/10 bg-[#04101c]/85 p-3 text-[10px] text-white/70">
    <div className="mb-1 font-bold uppercase tracking-widest text-cyan-200">{ground ? 'Planet · comms arrays' : 'Cruiser interior'}</div>
    <svg width={W} height={H} className="rounded bg-black/40">
      {stations.map(([id, p]) => <g key={id}><circle cx={sx(p[0])} cy={sz(p[2])} r={6} fill="none" stroke="rgba(255,255,255,0.5)" />
        <text x={sx(p[0])} y={sz(p[2]) - 9} textAnchor="middle" fill="rgba(255,255,255,0.7)" fontSize="9">{id.replace('array:', 'array ')}</text></g>)}
      {charges.map(c => { const p = ground ? GROUND.arrays[c.station.slice(6)] : INTERIOR.stations[c.station]; return <text key={c.station} x={sx(p[0])} y={sz(p[2]) + 18} textAnchor="middle" fill="#ffb347" fontSize="10">{Math.ceil(c.left / 1000)}s</text>; })}
      {(client.bodies || []).map(([eid, sc, , x, , z]) => <circle key={eid} cx={sx(x / 10)} cy={sz(z / 10)} r={eid === client.me.eid ? 4 : 3} fill={eid === client.me.eid ? '#ffffff' : SIDES[sc] === client.me.side ? '#6fc8ff' : '#ff7a5c'} />)}
    </svg>
    <div className="mt-1">HP {Math.ceil(b.hp)} / {b.max}{b.maxShield ? ' · shield ' + Math.ceil(b.shield) + ' / ' + b.maxShield : ''}{b.tier ? ' · ' + (b.tier === 'commander' ? 'Jedi commander' : b.tier) : ''} · WASD move · E plant / defuse</div>
    {act && <div className="mt-1 text-amber-300">{act[0] === 'plant' ? 'Planting' : 'Defusing'} {act[1]}: {Math.ceil(act[2] / 1000)} s (fuse {CHARGES.fuseMs / 1000} s)</div>}
  </div>;
}
