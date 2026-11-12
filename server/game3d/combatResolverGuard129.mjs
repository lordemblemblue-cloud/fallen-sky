// Combat 12.7–12.9: protect the existing worker's single-writer strike
// transaction against invalid values from a server-side damage resolver.
const bounded=x=>typeof x==='number'&&Number.isFinite(x)&&x>=0&&x<=100000;
export function validateResolvedStrike129(result){
 if(!result||typeof result!=='object'||Array.isArray(result))
  return {ok:false,reason:'invalid_strike_result'};
 try{
  if(!Object.hasOwn(result,'damage'))
   return {ok:false,reason:'invalid_strike_result'};
  const damage=result.damage,reflected=result.reflected??0,
    lifeSteal=result.lifeSteal??0;
  if(!bounded(damage)||!bounded(reflected)||!bounded(lifeSteal)||
     (result.critical!==undefined&&typeof result.critical!=='boolean')||
     (result.blocked!==undefined&&typeof result.blocked!=='boolean'))
   return {ok:false,reason:'invalid_strike_result'};
  return {ok:true,strike:Object.freeze({
   damage,reflected,lifeSteal,
   critical:result.critical===true,blocked:result.blocked===true,
  })};
 }catch{return {ok:false,reason:'invalid_strike_result'}}
}
