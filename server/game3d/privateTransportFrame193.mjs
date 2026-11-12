// 19.3: strict read-only request envelope, not a general player command path.
import {isRecord} from './privateTransportContract190.mjs';
export function parsePrivateQuestFrame193(frame){
 if(!isRecord(frame)||Object.keys(frame).length!==3||
    !Object.hasOwn(frame,'v')||!Object.hasOwn(frame,'seq')||
    !Object.hasOwn(frame,'op')||frame.v!==1||
    !Number.isSafeInteger(frame.seq)||frame.seq<1||frame.seq>256||
    frame.op!=='questbook.read')return null;
 return Object.freeze({seq:frame.seq,op:'questbook.read'});
}
