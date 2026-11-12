// 21.5: no binary commands, no lossy UTF8, no oversized frames.
const utf8=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true});
export function decodePrivateQuestFrame215(data,isBinary){
 if(isBinary!==false)return null;
 let bytes;
 if(typeof data==='string')bytes=Buffer.from(data,'utf8');
 else if(Buffer.isBuffer(data)||data instanceof Uint8Array)bytes=data;
 else return null;
 if(bytes.byteLength===0||bytes.byteLength>192)return null;
 try{
  const decoded=utf8.decode(bytes);
  if(Buffer.byteLength(decoded,'utf8')!==bytes.byteLength||
     decoded.includes('\u0000'))return null;
  return decoded;
 }catch{return null}
}
