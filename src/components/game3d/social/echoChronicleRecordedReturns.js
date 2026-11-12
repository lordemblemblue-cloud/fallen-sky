// Combat / Quest 58.0–58.4: truthful *recorded* place repetitions.
// These are saved memory labels, not verified travel telemetry. An identical
// location string is never proof the player returned to the physical place.
import {buildEchoChronicleCrossroads} from './echoChronicleCrossroads.js';
import {ECHO_ALL_MONTHS} from './echoChronicleMonthlySky.js';

const timestamp=value=>{
 const parsed=typeof value==='string'?Date.parse(value):NaN;
 return Number.isFinite(parsed)?parsed:null;
};
const compareRecords=(a,b)=>{
 const left=timestamp(a.date),right=timestamp(b.date);
 if(left===null&&right!==null)return 1;
 if(right===null&&left!==null)return -1;
 return (left??0)-(right??0)||a.id.localeCompare(b.id);
};
const uniqueDayKeys=records=>new Set(records
 .map(record=>timestamp(record.date))
 .filter(value=>value!==null)
 .map(value=>new Date(value).toISOString().slice(0,10)));

export function buildEchoChronicleRecordedReturns(
 entries=[],featuredIds=[],month=ECHO_ALL_MONTHS,
){
 const crossroads=buildEchoChronicleCrossroads(entries,featuredIds,month);
 const paths=crossroads.places.filter(group=>group.records.length>=2)
  .map(group=>{
   const records=[...group.records].sort(compareRecords);
   const first=records[0],last=records.at(-1);
   const datedCount=records.filter(record=>timestamp(record.date)!==null).length;
   const undatedCount=records.length-datedCount;
   const differentRecordedDays=uniqueDayKeys(records).size;
   return Object.freeze({
    location:group.title,recordCount:records.length,
    savedSharedCount:group.shared,savedPersonalCount:group.personal,
    first,last,records:Object.freeze(records),
    datedCount,undatedCount,differentRecordedDays,
    // "Repeated" refers only to this saved label, not a game-world visit.
    crossDay:differentRecordedDays>=2,
   });
  }).sort((a,b)=>b.recordCount-a.recordCount||
   a.location.localeCompare(b.location));
 return Object.freeze({
  paths:Object.freeze(paths),selectedCount:crossroads.selectedCount,
  repeatedPlaceCount:paths.length,
  totalRepeatedRecords:paths.reduce((total,path)=>total+path.recordCount,0),
 });
}
