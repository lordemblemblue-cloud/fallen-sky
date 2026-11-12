// 84.7: refuse anything except the isolated loopback-only staging DB.
// This gate must run before any admin connection or child test process.
export const GAME3D_847_DISPOSABLE_DB='game3d_847_disposable';
export function safeDisposablePgUrl847(value){
 if(typeof value!=='string')return false;
 try{
  const u=new URL(value);
  return ['postgres:','postgresql:'].includes(u.protocol)&&
   ['127.0.0.1','localhost'].includes(u.hostname)&&
   u.pathname==='/'+GAME3D_847_DISPOSABLE_DB&&
   u.username==='postgres'&&!!u.password&&
   u.search===''&&u.hash===''&&
   (u.port===''||u.port==='5432');
 }catch{return false}
}
