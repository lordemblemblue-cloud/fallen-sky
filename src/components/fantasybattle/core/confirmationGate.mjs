// A UI confirmation is a single-use capability tied to the originating screen and session.
const context=s=>({profileId:s?.profile?.id??null,encounterToken:s?.encounter?.token??null,running:Boolean(s?.running)});
export function createConfirmationGate(){
 let active=null;
 return {
  open(message,action,state){
   if(typeof action!=='function'||!state?.id||state.id==='40')return null;
   const ticket=Object.freeze({message,origin:state.id,...context(state)});
   active={ticket,action};return ticket;
  },
  cancel(){active=null;},
  consume(ticket,state){
   if(!active||active.ticket!==ticket)return null;
   const {action}=active;active=null;
   const current=context(state);
   if(state?.id!=='40'||state.stack?.at(-2)!==ticket.origin||current.profileId!==ticket.profileId||current.encounterToken!==ticket.encounterToken||current.running!==ticket.running)return null;
   return action;
  }
 };
}
