// Combat Foundation 6.2 — deterministic, bounded event read ordering.
// The helper checks a server journal snapshot, not a client-provided event stream.
const id=x=>typeof x==='string'&&/^[A-Za-z0-9_.:-]{1,160}$/.test(x);
export function verifyWorldEventOrder(rows,{max=250}={}){
 if(!Array.isArray(rows)||rows.length>max||
    !Number.isSafeInteger(max)||max<1||max>1000)
  return {ok:false,code:'world_event_window_overflow'};
 const ids=new Set();
 let previousTick=-1,previousId='';
 for(const row of rows){
  const raw=row?.server_tick;
  const tick=(typeof raw==='string' && /^(0|[1-9][0-9]*)$/.test(raw))
    ? Number(raw) : (typeof raw==='number' ? raw : NaN);
  const eventId=row?.event_id;
  if(!Number.isSafeInteger(tick)||tick<0||!id(eventId)||
     ids.has(eventId))
    return {ok:false,code:'invalid_or_replayed_event'};
  if(tick<previousTick||
     (tick===previousTick&&eventId<=previousId))
    return {ok:false,code:'out_of_order_server_events'};
  ids.add(eventId);previousTick=tick;previousId=eventId;
 }
 return {ok:true,count:rows.length,lastTick:previousTick,
  lastEventId:previousId};
}
