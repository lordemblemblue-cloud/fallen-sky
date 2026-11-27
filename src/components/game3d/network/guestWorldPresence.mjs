// Isolated guest rendering transport; never creates an authenticated user.
const scenes = new Set(['wolfveil:all','wolfveil:town','wolfveil:south','wolfveil:west','wolfveil:east','wolfveil:north','lunar-cave','astral-dungeon','wolfveil-caves']);
export function guestWorldScene(region,area) {
  const scene=region==='wolfveil'?'wolfveil:'+(area||'all'):region;
  return scenes.has(scene)?scene:null;
}
export function guestWorldPresenceUrl(value, pageHostname) {
  try {
    if(typeof value!=='string'||!value.trim())return null;
    const url=new globalThis.URL(value.trim());
    const local=['localhost','127.0.0.1','[::1]'];
    if(url.username||url.password||url.search||url.hash||url.pathname!=='/ws/world-presence')return null;
    if(url.protocol!=='wss:'&&!(url.protocol==='ws:'&&local.includes(pageHostname)&&local.includes(url.hostname)))return null;
    return url.href;
  } catch {return null;}
}
function validCounts(message) {
  return Number.isSafeInteger(message.max)&&message.max>0&&message.max<=20&&
    Number.isSafeInteger(message.count)&&message.count>=1&&message.count<=message.max;
}
function validPlayer(player) {
  return player&&typeof player.player_id==='string'&&/^presence-[a-f0-9-]{36}$/.test(player.player_id)&&
    typeof player.display_name==='string'&&player.display_name.length<=32&&
    [player.x,player.y,player.z,player.yaw,player.last_update].every(Number.isFinite)&&
    Math.max(Math.abs(player.x),Math.abs(player.y),Math.abs(player.z))<=10000&&
    typeof player.anim==='string'&&/^[A-Za-z0-9_-]{1,48}$/.test(player.anim);
}
export function connectGuestWorldPresence({url,initialScene,socketFactory=u=>new globalThis.WebSocket(u),
  onStatus=()=>{},onPlayers=()=>{},clock=Date.now}) {
  let scene=initialScene, socket=null, stopped=false, admitted=false, lastSent=-Infinity, retry=null, retried=false;
  const clear=()=>onPlayers([]);
  const report=(status,count=null)=>onStatus({status,count,max:20});
  const open=()=>{
    if(stopped)return;
    report('connecting');
    let current;
    try{current=socketFactory(url);}catch{report('error');return;}
    socket=current;
    current.onmessage=event=>{
      if(stopped||socket!==current||typeof event.data!=='string'||event.data.length>32768)return;
      let message;try{message=JSON.parse(event.data);}catch{return;}
      if(!message||!validCounts(message))return;
      if(message.t==='welcome'){
        admitted=true;lastSent=-Infinity;report('connected',message.count);return;
      }
      if(!admitted||message.t!=='presence'||message.scene!==scene||!Array.isArray(message.players)||
        message.players.length>message.count-1||!message.players.every(validPlayer))return;
      const players=message.players.map(({player_id,display_name,x,y,z,yaw,anim,last_update})=>
        ({player_id,display_name,x,y,z,yaw,anim,last_update}));
      if(new Set(players.map(p=>p.player_id)).size!==players.length)return;
      report('connected',message.count);onPlayers(players);
    };
    current.onclose=()=>{
      if(stopped||socket!==current)return;
      const wasAdmitted=admitted;admitted=false;clear();report('error');
      // Recover once from an established connection dropping, not from a full
      // or unreachable initial server. This is not a waiting queue.
      if(wasAdmitted&&!retried){retried=true;retry=globalThis.setTimeout(open,1500);}
    };
    current.onerror=()=>{if(!stopped&&socket===current&&!admitted)report('error');};
  };
  open();
  return {
    setScene(next){if(next===scene)return;scene=next;lastSent=-Infinity;clear();},
    update(pose){
      if(stopped||!admitted||socket?.readyState!==1||!scenes.has(scene)||!pose)return;
      const now=clock();
      if(now-lastSent<100||socket.bufferedAmount>8192)return;
      const {x,y,z,yaw}=pose;
      if(![x,y,z,yaw].every(Number.isFinite))return;
      const anim=typeof pose.anim==='string'&&/^[A-Za-z0-9_-]{1,48}$/.test(pose.anim)?pose.anim:'idle';
      try{socket.send(JSON.stringify({t:'pose',scene,x,y,z,yaw,anim}));lastSent=now;}catch{/* next frame can retry */}
    },
    close(){stopped=true;admitted=false;if(retry!==null)globalThis.clearTimeout(retry);try{socket?.close();}catch{/* closed */}clear();}
  };
}
