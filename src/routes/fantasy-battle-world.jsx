import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useRef } from 'react';
import { FANTASY_BATTLE_RELEASED } from '@/components/games/hub/gamesHubCatalog.mjs';
import {WORLD_STARTUP_PROTOCOL,createStartupReplay} from '@/components/fantasybattle/core/worldStartup.mjs';
function WorldFrame() {
  const root=useRef(null);
  useEffect(()=>{
    if(window.parent===window)return;
    let alive=true, api=null;
    const run=new URLSearchParams(location.search).get('run');
    const send=(event)=>{if(alive)window.parent.postMessage({channel:'fantasy-world',...event,run,protocol:WORLD_STARTUP_PROTOCOL},location.origin);};
    const startup=createStartupReplay(send);
    const receive=async(e)=>{
      if(e.origin!==location.origin||e.source!==window.parent||e.data?.channel!=='fantasy-host'||e.data.run!==run)return;
      const {type,data}=e.data;
      if(type==='probe'){startup.probe();return;}
      if(!api)return;
      try {
        if(type==='restore'){if(startup.beginRestore())await api.restore(data);}
        else if(type==='pause'){api.pause(data);if(data===false)startup.finish();}
        else if(type==='battle')api.battle(data);
        else if(type==='finish')api.finish(data.id,data.won);
        else if(type==='quality')api.quality(data);
        else if(type==='appearance')api.appearance(data);
        else if(type==='move')api.move(data.key,data.value);
        else if(type==='jump')api.jump();
        else if(type==='interact')api.interact();
      } catch(error){send({type:'error',message:String(error?.message||error)});}
    };
    window.addEventListener('message',receive);
    const mount=root.current;startup.phase('module');
    import('@/components/fantasybattle/world/sapphireWorld.js').then(({mountSapphireWorld})=>alive?mountSapphireWorld(mount,event=>{if(event.type==='startup')startup.phase(event.phase);else if(event.type==='restored')startup.restored(event);else send(event);}):null).then(result=>{
      if(!result)return;
      if(!alive){result.stop();return;}api=result;startup.ready();
    }).catch(error=>send({type:'error',message:String(error?.message||error)}));
    const key=e=>{if(['Escape','KeyC','KeyK','KeyM','KeyL','KeyI'].includes(e.code)&&!e.repeat){e.preventDefault();send({type:'key',code:e.code});}};
    window.addEventListener('keydown',key);
    return()=>{alive=false;api?.stop();window.removeEventListener('message',receive);window.removeEventListener('keydown',key);};
  },[]);
  return <div ref={root} className="fb-world-frame"/>;
}
function Entry(){return (import.meta.env.DEV||FANTASY_BATTLE_RELEASED)?<><style>{'.fb-world-frame{position:fixed;inset:0;background:#0d1730;overflow:hidden}.fb-world-frame #viewport{position:absolute;inset:0}.fb-world-frame #viewport canvas{display:block;width:100%;height:100%}.fb-world-frame > :not(#viewport):not(#startup-error){display:none!important}.fb-world-frame #startup-error:not([hidden]){position:absolute;inset:20% 10% auto;padding:1rem;background:#10182b;color:white;z-index:10}.fb-world-frame #startup-error[hidden]{display:none}'}</style><WorldFrame/></>:<main>Coming soon.</main>;}
export const Route=createFileRoute('/fantasy-battle-world')({ssr:false,component:Entry});
