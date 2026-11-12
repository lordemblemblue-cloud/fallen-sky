// 21.6: bound message queue, close permanently on a terminal error.
export function createPrivateSocketLimit216({maxPending=4}={}){
 if(!Number.isInteger(maxPending)||maxPending<1||maxPending>4)
  throw Error('21.6 maxPending must be 1-4');
 let pending=0,ended=false;
 return Object.freeze({
  reserve(){if(ended||pending>=maxPending)return false;pending++;return true},
  release(){if(pending>0)pending--},
  close(){ended=true},
  get pending(){return pending},
  get ended(){return ended},
 });
}
