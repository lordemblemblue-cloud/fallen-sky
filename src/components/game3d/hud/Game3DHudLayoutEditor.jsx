import {useCallback,useEffect,useRef,useState} from 'react';
import {Check,Move,RotateCcw,ZoomIn,ZoomOut} from 'lucide-react';
import {
  GAME3D_HUD_CUSTOMIZATION_EVENT,GAME3D_HUD_WIDGETS,
  changeGame3DHudWidget,clampHudRectTranslation,
  defaultGame3DHudCustomization,readGame3DHudCustomization,
  saveGame3DHudCustomization,
} from './Game3DHudCustomization.mjs';
import './Game3DHudLayoutEditor.css';

const byId=id=>GAME3D_HUD_WIDGETS.find(item=>item.id===id);
const windowSize=()=>({width:window.innerWidth,height:window.innerHeight});

/** Keep all original DOM and game input handlers intact: only the separate
 * CSS individual translate/scale properties move already-rendered widgets.
 * Existing transforms (centered octagon, chat dock, etc.) are not overwritten.
 */
export function applyGame3DHudCustomization(settings,root=document.querySelector('.game3d-view')){
  if(!root)return {};
  const rects={};
  const viewport=windowSize();
  for(const widget of GAME3D_HUD_WIDGETS){
    const node=root.querySelector(widget.selector);
    if(!node)continue;
    const data=settings.widgets[widget.id];
    // Rect at the actual scaled native anchor. Save only relative offsets —
    // never overwrite positional !important rules or world-space controls.
    node.style.translate='0px 0px';
    node.style.scale=String(settings.globalScale*data.scale);
    const base=node.getBoundingClientRect();
    if(!base.width || !base.height)continue;
    const bounded=clampHudRectTranslation(base,data,viewport);
    node.style.translate=`${bounded.x}px ${bounded.y}px`;
    const rect=node.getBoundingClientRect();
    rects[widget.id]={left:rect.left,top:rect.top,width:rect.width,height:rect.height};
  }
  return rects;
}

export default function Game3DHudLayoutEditor({active=false,onDone=()=>{}}){
  const [settings,setSettings]=useState(readGame3DHudCustomization);
  const [selected,setSelected]=useState('combat');
  const [rects,setRects]=useState({});
  const drag=useRef(null);
  const settingsRef=useRef(settings);
  settingsRef.current=settings;

  useEffect(()=>{
    const onChange=event=>setSettings(event?.detail||readGame3DHudCustomization());
    window.addEventListener(GAME3D_HUD_CUSTOMIZATION_EVENT,onChange);
    window.addEventListener('storage',onChange);
    return ()=>{
      window.removeEventListener(GAME3D_HUD_CUSTOMIZATION_EVENT,onChange);
      window.removeEventListener('storage',onChange);
    };
  },[]);

  const refresh=useCallback(()=>{
    const root=document.querySelector('.game3d-view');
    const current=settingsRef.current;
    const boxes=applyGame3DHudCustomization(current,root);
    if(active)setRects(boxes);
  },[active]);

  useEffect(()=>{
    const id=requestAnimationFrame(refresh);
    return ()=>cancelAnimationFrame(id);
  },[settings,active,refresh]);

  useEffect(()=>{
    const root=document.querySelector('.game3d-view');
    if(!root)return undefined;
    let id=0;
    const schedule=()=>{
      if(id)cancelAnimationFrame(id);
      id=requestAnimationFrame(refresh);
    };
    // The Questbook, compass or chat may arrive after player/world loading.
    // Observe ONLY child changes to avoid loops from our own inline styles.
    const observer=new MutationObserver(schedule);
    observer.observe(root,{childList:true,subtree:true});
    window.addEventListener('resize',schedule,{passive:true});
    window.addEventListener('orientationchange',schedule);
    schedule();
    return ()=>{
      observer.disconnect();cancelAnimationFrame(id);
      window.removeEventListener('resize',schedule);
      window.removeEventListener('orientationchange',schedule);
      // Don't leave stale inline mutations on components after leaving Game 3D.
      for(const widget of GAME3D_HUD_WIDGETS){
        const node=root.querySelector(widget.selector);
        if(node){node.style.removeProperty('translate');node.style.removeProperty('scale');}
      }
    };
  },[refresh]);

  useEffect(()=>{
    if(!active)return undefined;
    const wasEditing=!!window.__axeHudEditMode;
    window.__axeHudEditMode=true;
    // The existing gameplay listeners respond to this event by releasing
    // WASD/attack. Edit input never reaches world movement controls.
    window.dispatchEvent(new Event('axePauseMenuOpened'));
    const keys=event=>{
      if(event.key==='Escape'){
        event.preventDefault();event.stopImmediatePropagation?.();onDone();
      } else if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)
        && !event.target?.matches?.('input,select,textarea,[contenteditable=true]')){
        event.preventDefault();event.stopImmediatePropagation?.();
        const increment=event.shiftKey?.25:1;
        const old=settingsRef.current.widgets[selected];
        const patch={
          x:old.x+(event.key==='ArrowLeft'?-increment:event.key==='ArrowRight'?increment:0),
          y:old.y+(event.key==='ArrowUp'?-increment:event.key==='ArrowDown'?increment:0),
        };
        saveGame3DHudCustomization(changeGame3DHudWidget(settingsRef.current,selected,patch));
      }
    };
    window.addEventListener('keydown',keys,true);
    return ()=>{
      window.__axeHudEditMode=wasEditing;
      window.removeEventListener('keydown',keys,true);
    };
  },[active,onDone,selected]);

  const update=next=>{
    settingsRef.current=next;
    setSettings(next);
  };
  const save=next=>update(saveGame3DHudCustomization(next));
  const selectedWidget=byId(selected);
  const selectedData=settings.widgets[selected];
  const rect=rects[selected];

  const onDragStart=event=>{
    if(event.button!==0 || !rect)return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current={id:event.pointerId,startX:event.clientX,startY:event.clientY,
      offsetX:selectedData.x,offsetY:selectedData.y,
      width:window.innerWidth,height:window.innerHeight};
  };
  const onDragMove=event=>{
    const d=drag.current;
    if(!d||d.id!==event.pointerId)return;
    event.preventDefault();
    update(changeGame3DHudWidget(settingsRef.current,selected,{
      x:d.offsetX+(event.clientX-d.startX)/d.width*100,
      y:d.offsetY+(event.clientY-d.startY)/d.height*100,
    }));
  };
  const onDragEnd=event=>{
    if(drag.current?.id!==event.pointerId)return;
    drag.current=null;
    save(settingsRef.current);
  };
  const zoom=factor=>save(changeGame3DHudWidget(settings,selected,{
    scale:Math.round((selectedData.scale+factor)*100)/100,
  }));
  const resetSelected=()=>save(changeGame3DHudWidget(settings,selected,{x:0,y:0,scale:1}));
  const resetAll=()=>save({...settings,widgets:defaultGame3DHudCustomization().widgets});

  if(!active)return null;
  return <div className="axe3d-hud-editor" data-testid="game3d-hud-layout-editor">
    <div className="axe3d-hud-editor__backdrop" aria-hidden="true"/>
    <div className="axe3d-hud-editor__toolbar" role="region" aria-label="Edit HUD layout">
      <strong><Move size={16}/> Edit UI layout</strong>
      <label>Box
        <select aria-label="Select HUD box" value={selected} onChange={e=>setSelected(e.target.value)}>
          {GAME3D_HUD_WIDGETS.map(({id,label})=><option key={id} value={id}>{label}</option>)}
        </select>
      </label>
      <button type="button" aria-label="Make selected box smaller" onClick={()=>zoom(-.05)}><ZoomOut size={15}/></button>
      <output aria-label="Selected box scale">{Math.round(selectedData.scale*100)}%</output>
      <button type="button" aria-label="Make selected box bigger" onClick={()=>zoom(.05)}><ZoomIn size={15}/></button>
      <button type="button" onClick={resetSelected}><RotateCcw size={15}/> Reset box</button>
      <button type="button" onClick={resetAll}>Reset all positions</button>
      <button type="button" className="axe3d-hud-editor__done" onClick={onDone}><Check size={16}/> Save &amp; Finish</button>
      <small>Drag the highlighted box · Arrow keys move · Shift + arrows fine-tune · Esc finishes</small>
    </div>
    {rect ? <button type="button"
      className="axe3d-hud-editor__drag"
      style={{left:Math.max(0,rect.left),top:Math.max(0,rect.top),
        width:rect.width,height:rect.height}}
      onPointerDown={onDragStart} onPointerMove={onDragMove}
      onPointerUp={onDragEnd} onPointerCancel={onDragEnd}
      aria-label={`Drag ${selectedWidget.label} to another position`}>
      <span><Move size={14}/>{selectedWidget.label} · Drag</span>
    </button> : <div className="axe3d-hud-editor__missing" role="status">
      {selectedWidget.label} is not currently shown. Choose another box.
    </div>}
  </div>;
}
