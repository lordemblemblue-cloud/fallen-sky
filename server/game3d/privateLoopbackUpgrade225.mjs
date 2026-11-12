// 22.5 - permit only direct TLS loopback upgrades that satisfy original 21.2.
import {checkPrivateQuestUpgrade212} from './privateSocketPreflight212.mjs';
export function validatePrivateLoopbackUpgrade225(request,{allowedOrigins,port}={}){
 const peer=request?.socket?.remoteAddress;
 const local=request?.socket?.localAddress;
 if((peer!=='127.0.0.1'&&peer!=='::ffff:127.0.0.1')||
    (local!=='127.0.0.1'&&local!=='::ffff:127.0.0.1')||
    !Number.isInteger(port)||port<=0||port>65535)return false;
 return checkPrivateQuestUpgrade212({request,allowedOrigins,
  allowedHosts:[`127.0.0.1:${port}`]});
}
