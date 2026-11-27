import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useRef } from 'react';
import { FANTASY_BATTLE_RELEASED } from '@/components/games/hub/gamesHubCatalog.mjs';
import { mountSapphireWorld } from '@/components/fantasybattle/world/sapphireWorld';
function WorldFrame() {
  const root=useRef(null);
  useEffect(()=>{
    if(window.parent===window)return;
    let alive=true, api=null;
    const send=(event)=>{if(alive)window.parent.postMessage({channel:'fantasy-world',...event},location.origin);};
    const receive=(e)=>{
      if(e.origin!==location.origin||e.source!==window.parent||e.data?.channel!=='fantasy-host'||!api)return;
      const {type,data}=e.data;
      try {
        if(type==='restore')api.restore(data);
        else if(type==='pause')api.pause(data);
        else if(type==='battle')api.battle();
        else if(type==='finish')api.finish(data.id,data.won);
        else if(type==='quality')api.quality(data);
        else if(type==='appearance')api.appearance(data);
        else if(type==='move')api.move(data.key,data.value);
        else if(type==='jump')api.jump();
        else if(type==='interact')api.interact();
      } catch(error){send({type:'error',message:String(error?.message||error)});}
    };
    window.addEventListener('message',receive);
    mountSapphireWorld(root.current,event=>{if(event.type!=='ready')send(event);}).then(result=>{
      if(!alive){result.stop();return;}api=result;send({type:'ready',world:api.snapshot()});
    }).catch(error=>send({type:'error',message:String(error?.message||error)}));
    const key=e=>{if(['Escape','KeyC','KeyK','KeyM','KeyL','KeyI'].includes(e.code)&&!e.repeat){e.preventDefault();send({type:'key',code:e.code});}};
    window.addEventListener('keydown',key);
    return()=>{alive=false;api?.stop();window.removeEventListener('message',receive);window.removeEventListener('keydown',key);};
  },[]);
  return <div ref={root} className="fb-world-frame"/>;
}
function Entry(){return (import.meta.env.DEV||FANTASY_BATTLE_RELEASED)?<><style>{'.fb-world-frame{position:fixed;inset:0;background:#0d1730;overflow:hidden}.fb-world-frame #viewport{position:absolute;inset:0}.fb-world-frame #viewport canvas{display:block;width:100%;height:100%}.fb-world-frame > :not(#viewport):not(#startup-error){display:none!important}.fb-world-frame #startup-error:not([hidden]){position:absolute;inset:20% 10% auto;padding:1rem;background:#10182b;color:white;z-index:10}.fb-world-frame #startup-error[hidden]{display:none}'}</style><WorldFrame/></>:<main>Coming soon.</main>;}
export const Route=createFileRoute('/fantasy-battle-world')({ssr:false,component:Entry});
