// 21.2: strict private upgrade preflight; not an HTTP upgrade handler.
export const PRIVATE_QUEST_PROTOCOL_212='axe-questbook-readonly-v1';
export const PRIVATE_QUEST_PATH_212='/internal/game3d/questbook-readonly';
const host=/^[A-Za-z0-9.-]+(?::[0-9]{1,5})?$/;
export function checkPrivateQuestUpgrade212({request,allowedOrigins,allowedHosts}={}){
 const headers=request?.headers;
 if(!request||!headers||request.method!=='GET'||
    request.url!==PRIVATE_QUEST_PATH_212||
    request.socket?.encrypted!==true||
    typeof headers.origin!=='string'||!Array.isArray(allowedOrigins)||
    !allowedOrigins.includes(headers.origin)||
    !/^https:\/\/[A-Za-z0-9.-]+(?::[0-9]{1,5})?$/.test(headers.origin)||
    typeof headers.host!=='string'||!host.test(headers.host)||
    !Array.isArray(allowedHosts)||!allowedHosts.includes(headers.host)||
    typeof headers.upgrade!=='string'||
    headers.upgrade.toLowerCase()!=='websocket'||
    typeof headers.connection!=='string'||
    !headers.connection.toLowerCase().split(',').some(s=>s.trim()==='upgrade')||
    headers['sec-websocket-protocol']!==PRIVATE_QUEST_PROTOCOL_212||
    typeof headers['sec-websocket-key']!=='string'||
    !/^[A-Za-z0-9+/]{22}==$/.test(headers['sec-websocket-key'])||
    headers['sec-websocket-version']!=='13'||
    headers.authorization!==undefined||headers.cookie!==undefined||
    headers['x-forwarded-for']!==undefined||
    headers['x-forwarded-proto']!==undefined)
  return false;
 return true;
}
