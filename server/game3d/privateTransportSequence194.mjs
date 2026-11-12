// 19.4: one-time strictly increasing per-handle client sequence.
export function createPrivateTransportSequence194(){
 let next=1,stopped=false;
 return Object.freeze({
  accept(seq){
   if(stopped||!Number.isSafeInteger(seq)||seq!==next||seq>256)
    return false;
   next++;return true;
  },
  shutdown(){stopped=true},
  get accepted(){return next-1},
 });
}
