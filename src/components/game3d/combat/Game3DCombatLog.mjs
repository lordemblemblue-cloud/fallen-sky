// The combat feed is local and observational: real resolved combat outcomes,
// not a damage calculator, progression source or network authority.
export const MAX_GAME3D_COMBAT_LOG=80;
const TYPES=new Set(['dealt','taken','self','miss']);
let entries=[];
let serial=0;
const listeners=new Set();
const notify=()=>listeners.forEach(callback=>callback(entries.slice()));
export function getGame3DCombatLog(){return entries.slice();}
export function subscribeGame3DCombatLog(callback){
  listeners.add(callback);
  callback(getGame3DCombatLog());
  return ()=>listeners.delete(callback);
}
export function recordGame3DCombatEvent(type,amount,{source='Enemy',target='Enemy'}={}){
  if(!TYPES.has(type))return null;
  if(type!=='miss'&&(!Number.isFinite(amount)||amount<=0))return null;
  const event={
    id:++serial,type,
    amount:type==='miss'?null:Math.round(amount*10)/10,
    source:String(source).slice(0,48),
    target:String(target).slice(0,48),
    at:Date.now(),
  };
  entries=[...entries,event].slice(-MAX_GAME3D_COMBAT_LOG);
  notify();
  return event;
}
export function clearGame3DCombatLog(){entries=[];notify();}
export function describeGame3DCombatEvent(event){
  if(!event)return '';
  if(event.type==='miss')return 'MISS · '+event.target;
  if(event.type==='taken')return 'Received '+event.amount+' damage from '+event.source;
  if(event.type==='self')return 'Self damage '+event.amount;
  return 'Dealt '+event.amount+' damage to '+event.target;
}
