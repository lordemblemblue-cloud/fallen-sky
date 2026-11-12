// 21.4: forbid adopting one accepted socket more than once per worker.
const claimed=new WeakSet();
export function reservePrivateSocket214(socket){
 if(!socket||typeof socket!=='object'||claimed.has(socket)||
    typeof socket.on!=='function'||typeof socket.off!=='function'||
    typeof socket.send!=='function'||typeof socket.close!=='function'||
    socket.readyState!==1)return false;
 claimed.add(socket);return true;
}
