import React, {useEffect, useState} from 'react';
import {Monitor} from 'lucide-react';
import {
  GAME3D_PLATFORMS,GAME3D_AREA_LOADING_LABELS,GAME3D_PLATFORM_GRAPHICS_EVENT,
  readGame3DPlatformGraphics,rememberGame3DPlatformSetting,selectGame3DPlatform,
} from './Game3DPlatformGraphics.mjs';
import {game3dAreaBudget} from './Game3DAreaBudget.mjs';

// Graphics menu card: which platform's settings are being tuned (web browser,
// desktop app or mobile) and how much of Wolfveil stays loaded on it. Every
// other control on the Graphics page (resolution, quality, shadows, frame
// cap, GPU profile, visual style) is saved to the platform chosen here.
// Uses the pause menu's existing styles; adds no styles of its own.
const platformLabel=id=>GAME3D_PLATFORMS.find(entry=>entry.id===id)?.label||id;

export default function Game3DPlatformGraphicsPanel({open=true,onProfileApplied}){
  const [state,setState]=useState(()=>readGame3DPlatformGraphics());
  useEffect(()=>{
    if(open)setState(readGame3DPlatformGraphics());
  },[open]);
  useEffect(()=>{
    const refresh=()=>setState(readGame3DPlatformGraphics());
    window.addEventListener(GAME3D_PLATFORM_GRAPHICS_EVENT,refresh);
    return ()=>window.removeEventListener(GAME3D_PLATFORM_GRAPHICS_EVENT,refresh);
  },[]);

  const pickPlatform=id=>{
    const applied=selectGame3DPlatform(id);
    setState(readGame3DPlatformGraphics());
    onProfileApplied?.(applied);
  };
  const remember=patch=>{
    rememberGame3DPlatformSetting(patch);
    setState(readGame3DPlatformGraphics());
  };
  const profile=state.profile;
  const budget=game3dAreaBudget(state.active);
  const platformItems=[
    {id:'auto',text:`Auto (${platformLabel(state.detected)})`},
    ...GAME3D_PLATFORMS.map(entry=>({id:entry.id,text:entry.label})),
  ];
  const loadingItems=Object.entries(GAME3D_AREA_LOADING_LABELS).map(([id,text])=>({id,text}));

  return <div className="axe3d-pause__surface" data-testid="game3d-platform-graphics">
    <div className="axe3d-pause__surface-heading"><Monitor size={22}/><div>
      <strong>Platform Graphics</strong>
      <p>Web browser, desktop app and mobile each keep their own settings.</p>
    </div></div>
    <fieldset className="axe3d-pause__setting">
      <legend>Settings profile</legend>
      <div className="axe3d-pause__option-group">
        {platformItems.map(({id,text})=>
          <button type="button" key={id} aria-pressed={state.selected===id}
            onClick={()=>pickPlatform(id)}
            className={state.selected===id?'axe3d-pause__option is-selected':'axe3d-pause__option'}>
            {text}
          </button>)}
      </div>
    </fieldset>
    <p className="axe3d-pause__help" role="status" data-testid="game3d-platform-active">
      You are tuning: {platformLabel(state.active)}. Resolution, quality, shadows,
      frame rate and the other choices on this page are saved for this platform
      only; the other two keep what they had.
    </p>
    <fieldset className="axe3d-pause__setting">
      <legend>World loading</legend>
      <div className="axe3d-pause__option-group">
        {loadingItems.map(({id,text})=>
          <button type="button" key={id} aria-pressed={profile.areaLoading===id}
            onClick={()=>remember({areaLoading:id})}
            className={profile.areaLoading===id?'axe3d-pause__option is-selected':'axe3d-pause__option'}>
            {text}
          </button>)}
      </div>
    </fieldset>
    <p className="axe3d-pause__help">
      Wolfveil is split into the town and four sides. One area at a time draws
      only where you are and loads the next area as you near a portal. Whole
      valley draws everything, as before.
    </p>
    <div className="axe3d-pause__switch-row">
      <div><strong>Free graphics memory of unloaded areas</strong>
        <p>Releases an unloaded area&rsquo;s models and textures from the graphics
          card after 20 seconds. Saves memory; returning may pause briefly.</p></div>
      <button type="button" className="axe3d-pause__switch" role="switch"
        aria-checked={!!profile.releaseGpuMemory}
        aria-label="Free graphics memory of unloaded areas"
        onClick={()=>remember({releaseGpuMemory:!profile.releaseGpuMemory})}>
        <span className="axe3d-pause__switch-knob"/>
      </button>
    </div>
    <div className="axe3d-pause__switch-row">
      <div><strong>Distant forests</strong>
        <p>Keeps the trees of unloaded areas on the horizon, so the land beyond
          a portal is not bare. Costs triangles, not loading time.</p></div>
      <button type="button" className="axe3d-pause__switch" role="switch"
        aria-checked={!!profile.farScenery}
        aria-label="Distant forests"
        onClick={()=>remember({farScenery:!profile.farScenery})}>
        <span className="axe3d-pause__switch-knob"/>
      </button>
    </div>
    <p className="axe3d-pause__help" data-testid="game3d-platform-budget">
      Target for one loaded area on {platformLabel(state.active)}:
      {' '}{budget.drawCalls.toLocaleString('en-US')} draw calls,
      {' '}{budget.triangles.toLocaleString('en-US')} triangles,
      {' '}{budget.targetFps} FPS and never under {budget.floorFps}. Turn on
      Performance metrics below to see the live numbers against it.
    </p>
  </div>;
}
