// Combat / Quest 67.9–68.3 — reversible, private monthly reading navigation.
// This is an ephemeral return to an actually visited Chronicle month, not a
// browser URL, game-world teleport, public activity, or new quest state.
import {
 ECHO_ALL_MONTHS,ECHO_UNDATED_MONTH,
} from './echoChronicleMonthlySky.js';
import {isEchoReadingShelfNavigationActive}
 from './echoChronicleReadingShelfNavigation.js';

const validScope=value=>typeof value==='string'&&value.length>0&&value.length<=512;
export const isEchoChronicleArchiveMonth=value=>
 value===ECHO_ALL_MONTHS||value===ECHO_UNDATED_MONTH||
 (typeof value==='string'&&/^\d{4}-(0[1-9]|1[0-2])$/.test(value));

export function planEchoReadingShelfReturn(
 request,previousMonth,currentMonth,scope,activeScope,
){
 if(!validScope(scope)||scope!==activeScope)
  return Object.freeze({ok:false,reason:'character-changed'});
 if(!isEchoReadingShelfNavigationActive(request,currentMonth,scope))
  return Object.freeze({ok:false,reason:'not-a-reading-shelf-arrival'});
 if(!isEchoChronicleArchiveMonth(previousMonth)||previousMonth===currentMonth)
  return Object.freeze({ok:false,reason:'previous-sky-unavailable'});
 return Object.freeze({
  ok:true,month:previousMonth,scope,view:'monthly-sky',
 });
}
