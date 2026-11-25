// Isolated anonymous arena host: no Base44 SDK, account privileges or durable progression.
/* global process, console */
import { randomUUID } from 'node:crypto';
import { createDuelistServer } from './server.mjs';
export function publicArenaOrigins(raw) {
  const origins=String(raw||'').split(',').map(v=>v.trim()).filter(Boolean);
  if(!origins.length || origins.some(value=>{
    try {const u=new globalThis.URL(value);return u.protocol!=='https:'||u.origin!==value;}catch{return true;}
  }))throw new Error('Configure explicit HTTPS DUELIST_PUBLIC_ORIGINS');
  return [...new Set(origins)];
}
export function createGuestArenaHost({origins,port=0,host='127.0.0.1',maxConnections=64,maxRooms=16}={}) {
  const allowedOrigins=publicArenaOrigins(origins);
  return createDuelistServer({
    port,host,allowedOrigins,maxConnections,maxRooms,publicArenaOnly:true,
    // Never trust a browser identity/token or allow a guest to claim an account.
    authenticate:async()=>({id:'guest-'+randomUUID(),name:'Guest',guest:true}),
    // Guest XP is deliberately not persisted or retained across visits.
    progress:{get:()=>null,add:()=>null,flush:()=>{}},
  });
}
