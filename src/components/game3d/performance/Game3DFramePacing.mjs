// Render-only FPS pacing for Game 3D. Do NOT throttle networking, physics,
// input, cooldowns or animation clocks. rAF stays active on every browser tick;
// only the expensive WebGL drawing pass is subject to the player's FPS cap.
export const GAME3D_RENDER_FPS_CAPS=Object.freeze([30,60,120,144]);
export function normalizeGame3DRenderFPSCap(value){
  const n=Number(value);
  return GAME3D_RENDER_FPS_CAPS.includes(n)?n:60;
}
export function createGame3DRenderFramePacer(initialFPS=60){
  let fps=normalizeGame3DRenderFPSCap(initialFPS);
  let interval=1000/fps;
  let renderAt=-Infinity;
  return {
    getFPSCap:()=>fps,
    setFPSCap(value){
      fps=normalizeGame3DRenderFPSCap(value);
      interval=1000/fps;
      renderAt=-Infinity;
    },
    shouldRender(now){
      if(!Number.isFinite(now))return false;
      if(!Number.isFinite(renderAt)||now<renderAt){renderAt=now;return true;}
      const elapsed=now-renderAt;
      // Carry leftover fractional time across frames; otherwise a 120 FPS
      // cap on a 144 Hz display would accidentally produce ~72 FPS.
      if(elapsed+.25<interval)return false;
      const intervals=Math.max(1,Math.floor((elapsed+.25)/interval));
      renderAt+=intervals*interval;
      if(renderAt>now+.25)renderAt=now;
      return true;
    },
  };
}
