// Final teardown only: streaming scenes retain shared caches until viewer shutdown.
export function disposeResources(resources){
 const seen=new Set();let disposed=0,failed=0;
 for(const resource of resources){
  if(!resource||seen.has(resource)||typeof resource.dispose!=='function')continue;
  seen.add(resource);
  try{resource.dispose();disposed++;}catch{failed++;}
 }
 return {disposed,failed};
}
export function createCleanupScope(){
 let closed=false;const tasks=[];
 return {
  listen(target,type,listener,options){
   if(closed)return;
   target.addEventListener(type,listener,options);
   tasks.push(()=>target.removeEventListener(type,listener,options));
  },
  close(){
   if(closed)return;closed=true;
   for(const task of tasks.splice(0).reverse()){try{task();}catch{/* continue shutdown */}}
  }
 };
}
