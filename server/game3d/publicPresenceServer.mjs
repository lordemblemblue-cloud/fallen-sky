// Independent, bounded WebSocket service for guest world visualization.
// Run directly, not through the privileged duel/quest authority gateway.
/* global process, console, setInterval, clearInterval */
import { createServer } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { createPublicWorldPresence } from './publicPresence.mjs';
export function createPublicPresenceServer({allowedOrigins,host='127.0.0.1',port=0}={}) {
  if (!Array.isArray(allowedOrigins) || !allowedOrigins.length ||
      allowedOrigins.some(value => {
        try {const u=new globalThis.URL(value);return u.origin!==value ||
          !(u.protocol==='https:' || (u.protocol==='http:' && ['localhost','127.0.0.1','[::1]'].includes(u.hostname)));} catch {return true;}
      })) throw new Error('Explicit HTTPS origins (or local HTTP development origins) required');
  const state=createPublicWorldPresence();
  const server=createServer((req,res)=>{
    if (req.method==='GET' && req.url==='/health') {
      res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});
      res.end(JSON.stringify({ok:true}));return;
    }
    res.writeHead(404);res.end();
  });
  const wss=new WebSocketServer({noServer:true,maxPayload:1024,perMessageDeflate:false});
  const origins=new Set(allowedOrigins);
  server.on('upgrade',(req,socket,head)=>{
    if(req.url!=='/ws/world-presence' || !origins.has(req.headers.origin)) {socket.destroy();return;}
    if(state.count>=state.capacity) {
      socket.end('HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');return;
    }
    wss.handleUpgrade(req,socket,head,ws=>wss.emit('connection',ws));
  });
  const sockets=new Map();
  wss.on('connection',ws=>{
    const id=state.admit();
    if(!id){ws.close(4429,'server full');return;}
    const peer={id,lastPong:Date.now(),lastPose:Date.now(),windowStart:Date.now(),messages:0};
    sockets.set(ws,peer);
    ws.on('error',()=>ws.terminate());
    ws.on('pong',()=>{peer.lastPong=Date.now();});
    ws.on('close',()=>{sockets.delete(ws);state.leave(id);});
    ws.on('message',(data,binary)=>{
      const now=Date.now();
      if(now-peer.windowStart>=1000){peer.windowStart=now;peer.messages=0;}
      if(++peer.messages>40){ws.close(4429,'rate limit');return;}
      if(binary || peer.messages>15)return;
      try {if(state.update(id,JSON.parse(String(data))))peer.lastPose=now;}catch{/* malformed input ignored */}
    });
    ws.send(JSON.stringify({t:'welcome',count:state.count,max:state.capacity}));
  });
  const tick=setInterval(()=>{
    const now=Date.now();
    for(const [ws,peer] of sockets){
      if(now-peer.lastPong>30000 || now-peer.lastPose>30000 || ws.bufferedAmount>65536){ws.terminate();continue;}
      if(ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify(state.snapshot(peer.id)));
    }
  },100);
  const heartbeat=setInterval(()=>{for(const ws of sockets.keys())if(ws.readyState===WebSocket.OPEN)ws.ping();},10000);
  tick.unref();heartbeat.unref();
  return {state,
    listen:()=>new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,host,()=>{server.off('error',reject);resolve(server.address());});}),
    close:()=>new Promise(resolve=>{clearInterval(tick);clearInterval(heartbeat);for(const ws of sockets.keys())ws.terminate();wss.close(()=>server.close(resolve));})
  };
}
