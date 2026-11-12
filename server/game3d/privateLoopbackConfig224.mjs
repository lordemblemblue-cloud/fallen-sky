// 22.4 - disabled-by-default loopback-only TLS staging configuration.
const host='127.0.0.1';
const origin=/^https:\/\/[A-Za-z0-9.-]+(?::[0-9]{1,5})?$/;
export function validatePrivateLoopbackConfig224({enabled=false,port=0,tlsKey,tlsCert,allowedOrigins=[]}={}){
 if(enabled!==true||process.env.GAME3D_PRIVATE_STAGING_ENV!=='staging'||
    process.env.GAME3D_PRIVATE_LOOPBACK_224_ACK!=='I_ACCEPT_LOOPBACK_ONLY'||
    !Number.isInteger(port)||port<0||port>65535||
    !(typeof tlsKey==='string'||Buffer.isBuffer(tlsKey))||
    !(typeof tlsCert==='string'||Buffer.isBuffer(tlsCert))||
    tlsKey.length<100||tlsCert.length<100||
    !Array.isArray(allowedOrigins)||allowedOrigins.length<1||
    allowedOrigins.length>4||!allowedOrigins.every(o=>typeof o==='string'&&origin.test(o))||
    new Set(allowedOrigins).size!==allowedOrigins.length)
  throw Error('22.4 requires explicit isolated TLS loopback staging configuration');
 return Object.freeze({host,port,tlsKey,tlsCert,
  allowedOrigins:Object.freeze([...allowedOrigins]),
  privateServerOnly:true,publicRouteInstalled:false,productionReady:false});
}
