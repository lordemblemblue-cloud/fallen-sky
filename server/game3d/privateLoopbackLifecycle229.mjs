// 22.9 - track and terminate only socket objects adopted by this private worker.
export function createPrivateLoopbackLifecycle229(){
 const clients=new Map();let stopped=false;
 const add=(socket,bridge)=>{
  if(stopped||!socket||clients.has(socket))return false;
  clients.set(socket,bridge??null);return true;
 };
 const setBridge=(socket,bridge)=>{if(stopped||!clients.has(socket))return false;
  clients.set(socket,bridge);return true};
 const drop=socket=>{if(!clients.has(socket))return false;
  const bridge=clients.get(socket);clients.delete(socket);
  try{bridge?.shutdown()}catch{}
  return true;
 };
 const shutdown=()=>{
  if(stopped)return false;stopped=true;
  for(const [socket] of clients){
   drop(socket);
   try{socket.terminate?.()}catch{try{socket.close?.(1001,'Private shutdown')}catch{}}
  }
  return true;
 };
 return Object.freeze({add,setBridge,drop,shutdown,
  snapshot:()=>Object.freeze({active:clients.size,stopped})});
}
