// 22.7 - bounded, per-process admitted private sockets and pending upgrades.
export function createPrivateLoopbackCapacity227({maxSockets=2,maxHandshakes=2}={}){
 if(!Number.isInteger(maxSockets)||maxSockets<1||maxSockets>2||
    !Number.isInteger(maxHandshakes)||maxHandshakes<1||maxHandshakes>2)
  throw Error('22.7 refuses unbounded socket capacities');
 let sockets=0,handshakes=0,stopped=false;
 const reserve=kind=>{
  if(stopped)return null;
  if(kind==='handshake'&&handshakes>=maxHandshakes)return null;
  if(kind==='socket'&&sockets>=maxSockets)return null;
  if(kind!=='handshake'&&kind!=='socket')return null;
  if(kind==='handshake')handshakes++;else sockets++;
  let released=false;
  return ()=>{if(released)return false;released=true;
   if(kind==='handshake')handshakes--;else sockets--;return true};
 };
 return Object.freeze({reserve,shutdown(){stopped=true},
  snapshot(){return Object.freeze({sockets,handshakes,stopped})}});
}
