// The cruiser interior for FleetFlight: Game 2's own engine (engine/game.js in 'boarding' mode, its renderer, character,
// animation bank, sounds) on a canvas of its own over the space view. The engine and its assets load the first time
// the player's body is put aboard a ship (as Game2Duel loads them, a separate chunk); a new Game is made for each ship
// and thrown away when the body leaves it (a respawn in space, the end of the match).
import { QUALITY_DPR } from '../../settings.js';
import {game2Character} from '../../characters/game2Characters.js';

const BASE = import.meta.env?.BASE_URL ?? '/';
const ASSET_BASE = `${BASE}game2/`;

export class InteriorView {
  constructor(host, settings, avatarId='explorer') {
    this.host = host; this.settings = settings; this.avatarId=avatarId;
    this.avatarRenderer=null;
    this.canvas = document.createElement('canvas'); this.hud = document.createElement('canvas');
    for (const c of [this.canvas, this.hud]) { Object.assign(c.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', display: 'none' }); host.appendChild(c); }
    this.hud.style.pointerEvents = 'none'; this.canvas.tabIndex = 0;
    this.status = 'idle'; this.progress = ''; this.error = ''; this.game = null; this.net = null; this.area = null; this.wasLocked = false;
  }
  load() {
    if (this.loading) return this.loading;
    this.status = 'loading'; this.progress = 'the Jedi Outcast engine';
    this.loading = (async () => {
      const [{ Renderer }, { loadAll }, { Game }, { BoardingNet }, { cruiserLayout }] = await Promise.all([
        import('../../engine/gl.js'), import('../../engine/assets.js'), import('../../engine/game.js'), import('./boardingNet.js'), import('./cruiserInterior.js'),
      ]);
      this.mods = { Game, BoardingNet, cruiserLayout };
      this.R = new Renderer(this.canvas);
      this.R.maxDpr = QUALITY_DPR[this.settings.quality] ?? 1.5;
      this.assets = await loadAll(ASSET_BASE, what => { this.progress = what; }, { map: false });
      this.status = 'ready';
    })().catch(e => { console.error('Fleet Assault: the cruiser interior could not load', e); this.status = 'error'; this.error = e?.message || String(e); });
    return this.loading;
  }
  // put the player aboard: a Game for this ship and the match glue on it
  enter(client, area) {
    this.leave();
    const { Game, BoardingNet, cruiserLayout } = this.mods, ship = client.cruisers.get(+area.slice(5));
    const name = client.names.get(ship?.eid) || 'Cruiser', enemy = ship && ship.side !== client.me?.side;
    this.game = new Game(this.R, this.assets, this.canvas, this.hud, {
      mode: 'boarding', layout: cruiserLayout(ship?.side), settings: this.settings, saber: 'single', sfxBase: `${ASSET_BASE}sfx/`,
      combatMusicUrl: `${ASSET_BASE}audio/Game2_Battle_Theme.mp3`, title: enemy ? 'FLEET ASSAULT · BOARDING' : 'FLEET ASSAULT · DEFENDING', subtitle: name,
    });
    this.net = new BoardingNet(this.game, client, { area });
    this.area = area; this.wasLocked = false;
    this.show(true);
    // The boarding player runs the SAME Game2 Fighter/Force/controller as
    // every other ground mode. Only the local visible body is replaced.
    const model=game2Character(this.avatarId);
    if(model.url)void (async()=>{
      let layer=null;
      try{
        const {Game2SelectedCharacterRenderer}=await import('../../characters/Game2SelectedCharacterRenderer.js');
        if(!this.game||this.area!==area)return;
        layer=new Game2SelectedCharacterRenderer(this.host);
        this.avatarRenderer=layer;
        this.host.insertBefore(layer.canvas,this.hud);
        await layer.load(model);
        if(this.avatarRenderer!==layer||!this.game||this.area!==area){
          layer.dispose();return;
        }
        layer.canvas.style.display='block';
        this.game.player.externalAvatarVisible=true;
      }catch(error){
        console.warn('Fleet boarding character model unavailable; using playable Explorer',error);
        layer?.dispose();
        if(this.avatarRenderer===layer)this.avatarRenderer=null;
        if(this.game)this.game.player.externalAvatarVisible=false;
      }
    })();
    try { this.canvas.focus({ preventScroll: true }); } catch { this.canvas.focus?.(); }
  }
  leave() {
    this.avatarRenderer?.dispose();this.avatarRenderer=null;
    if (!this.game) return;
    try { this.game.dispose(); } catch { /* already gone */ }
    this.net?.dispose();
    this.game = null; this.net = null; this.area = null;
    this.show(false);
  }
  show(on) { for (const c of [this.canvas,this.hud,this.avatarRenderer?.canvas].filter(Boolean)) c.style.display = on ? 'block' : 'none'; }
  // one rendered frame. blocked: a menu is open over it (the fight goes on, our keys and mouse do not reach it);
  // render false: the space view is shown instead (the simulation still runs)
  frame(nowMs, { blocked = false, render = true } = {}) {
    const g = this.game; if (!g) return { escaped: false };
    const I = g.input, esc = I.pressedSet.has('Escape'); // without pointer lock (an embedding page refused it) Esc arrives as a key
    if (blocked) { I.pressedSet.clear(); I.releasedSet.clear(); I.down.clear(); I.btn.fill(false); I.btnPressed.fill(false); I.dx = I.dy = I.wheel = I.zoom = 0; }
    const now = nowMs / 1000, dt = g.last ? now - g.last : 1 / 60; g.last = now;
    g.update(dt);
    if (render) {
      g.render();
      if(this.avatarRenderer?.ready)this.avatarRenderer.sync(g);
    }
    const escaped = (this.wasLocked && !I.locked) || (esc && !blocked); this.wasLocked = I.locked; // Esc released the pointer: the menu opens
    return { escaped };
  }
  dispose() {
    this.leave();
    try { this.R?.gl?.getExtension('WEBGL_lose_context')?.loseContext(); } catch { /* the context is already gone */ }
    this.canvas.remove(); this.hud.remove();
  }
}
