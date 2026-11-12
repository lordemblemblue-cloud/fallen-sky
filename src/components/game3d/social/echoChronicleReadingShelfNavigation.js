// Combat / Quest 66.8–67.1: private, explicit deep navigation.
// A destination is permitted only when the currently scoped and actually
// recorded monthly index contains saved positions in that sky. The request
// contains no private memory title, other player identity or raw bookmark ID.
import {ECHO_ALL_MONTHS,ECHO_UNDATED_MONTH}
 from './echoChronicleMonthlySky.js';

const validMonth=month=>month===ECHO_UNDATED_MONTH||
 typeof month==='string'&&/^\d{4}-(0[1-9]|1[0-2])$/.test(month);
const validScope=value=>typeof value==='string'&&value.length>0&&value.length<=512;

export function planEchoReadingShelfNavigation(index,month,scope,activeScope){
 if(!validScope(scope)||scope!==activeScope)
  return Object.freeze({ok:false,reason:'character-changed'});
 if(!validMonth(month)||month===ECHO_ALL_MONTHS)
  return Object.freeze({ok:false,reason:'invalid-month'});
 const sky=Array.isArray(index?.skies)?
  index.skies.find(item=>item?.month===month&&
   Number.isInteger(item.bookmarkCount)&&item.bookmarkCount>0):null;
 if(!sky)return Object.freeze({ok:false,reason:'no-saved-reading-place'});
 if(sky.current)return Object.freeze({ok:false,reason:'already-selected'});
 return Object.freeze({ok:true,month,scope,view:'reading-shelf'});
}

export function isEchoReadingShelfNavigationActive(request,selected,scope){
 return request?.ok===true&&request.view==='reading-shelf'&&
  request.scope===scope&&validScope(scope)&&
  validMonth(request.month)&&request.month===selected;
}
