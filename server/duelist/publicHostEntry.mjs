/* global process, console */
import { createGuestArenaHost } from './publicHost.mjs';
const server=createGuestArenaHost({origins:process.env.DUELIST_PUBLIC_ORIGINS,host:'0.0.0.0',port:Number(process.env.PORT||5321)});
const address=await server.listen();
console.log('Duelist public guest arena host on port',address.port);
for(const signal of ['SIGTERM','SIGINT'])process.once(signal,async()=>{await server.close();process.exit(0);});
