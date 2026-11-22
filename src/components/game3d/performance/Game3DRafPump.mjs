// requestAnimationFrame pump for the draw-cost probe (developer tool; see Game3DPerfProbe.mjs).
//
// A hidden browser pane (or a window behind others) can stop requestAnimationFrame completely, which freezes the
// game loop: no area streaming, no grass around the player. The pump replaces rAF with a queue that a MessageChannel
// drains at most every `intervalMs`. It must be installed BEFORE anything calls rAF: a callback already handed to the
// browser's own rAF stays there and never comes back while the pane is hidden. Game3DPerformanceBootstrap installs it
// when its module is first evaluated, on the dev server only, when the URL has ?perfPump=1. Always restore it: left
// on, it keeps the main thread busy.
export function installRafPump(host = globalThis.window, intervalMs = 16) {
  if (!host || host.__gw3dRafPump) return host?.__gw3dRafPump || null;
  const originalRaf = host.requestAnimationFrame;
  const originalCancel = host.cancelAnimationFrame;
  let queue = new Map();
  let nextId = 1;
  let last = 0;
  let stopped = false;
  let paused = false;
  const ticks = []; // [time, ms] of each tick that ran callbacks: the game loop's own CPU time per frame
  const channel = new MessageChannel();
  channel.port1.onmessage = () => {
    if (stopped) return;
    const now = performance.now();
    if (!paused && now - last >= intervalMs && queue.size) {
      last = now;
      const run = queue; queue = new Map();
      for (const fn of run.values()) { try { fn(now); } catch (error) { console.error(error); } }
      ticks.push([now, performance.now() - now]);
      if (ticks.length > 2000) ticks.splice(0, 1000);
    }
    channel.port2.postMessage(0);
  };
  host.requestAnimationFrame = (fn) => { const id = nextId++; queue.set(id, fn); return id; };
  host.cancelAnimationFrame = (id) => { queue.delete(id); };
  channel.port2.postMessage(0);
  const pump = {
    installedAt: performance.now(),
    // hold every queued callback (the game loop stops: no simulation, no drawing) until resume()
    pause() { paused = true; },
    resume() { paused = false; },
    get paused() { return paused; },
    /** [time, ms] of the ticks since the given performance.now() time */
    ticksSince(since) { return ticks.filter(([at]) => at >= since); },
    restore() {
      if (stopped) return;
      stopped = true;
      host.requestAnimationFrame = originalRaf;
      host.cancelAnimationFrame = originalCancel;
      // hand the waiting callbacks back to the real rAF so the game loop keeps running
      for (const fn of queue.values()) originalRaf.call(host, fn);
      queue.clear();
      channel.port1.onmessage = null;
      if (host.__gw3dRafPump === pump) host.__gw3dRafPump = null;
    },
  };
  host.__gw3dRafPump = pump;
  return pump;
}
