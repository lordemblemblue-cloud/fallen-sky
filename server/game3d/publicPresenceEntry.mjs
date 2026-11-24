/* global process, console */
import { createPublicPresenceServer } from './publicPresenceServer.mjs';
const allowedOrigins=(process.env.GAME3D_PRESENCE_ORIGINS||'').split(',').map(v=>v.trim()).filter(Boolean);
const service=createPublicPresenceServer({allowedOrigins,host:'0.0.0.0',port:Number(process.env.PORT||5322)});
const address=await service.listen();
console.log('Public world presence listening on',address.port);
for(const signal of ['SIGTERM','SIGINT'])process.once(signal,async()=>{await service.close();process.exit(0);});
