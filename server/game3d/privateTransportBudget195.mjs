// 19.5: bounded read rate; fail closed if time moves backward.
export function createPrivateTransportBudget195({now=Date.now,limit=8,
 windowMs=1000}={}){
 if(typeof now!=='function'||!Number.isInteger(limit)||limit<1||
    limit>8||!Number.isInteger(windowMs)||windowMs<1000)
  throw Error('19.5 invalid private read budget');
 let windowStart=null,count=0,previous=null,stopped=false;
 const allow=()=>{
  if(stopped)return false;
  const t=now();
  if(!Number.isSafeInteger(t)||t<=0||
     (previous!==null&&t<previous))return false;
  previous=t;
  if(windowStart===null||t-windowStart>=windowMs){
   windowStart=t;count=0;
  }
  if(count>=limit)return false;
  count++;return true;
 };
 return Object.freeze({allow,shutdown(){stopped=true}});
}
