// Optional, provisional companion conversations. No claimable currency or combat bonus.
export const BOND_GIFT=Object.freeze({item:'sapphireOre',cost:2,gain:5});
export const BOND_CONVERSATIONS=Object.freeze({
 groveArcher:Object.freeze([
  'The Grove Archer checks the trail behind the party. The quiet is a reminder to stay alert.',
  'The archer remembers the paths through the grove and offers to watch the rear of the party.',
  'The archer trusts the party to hold the line and promises to keep the road in sight.'
 ]),
 pilgrimWarden:Object.freeze([
  'The Warden checks the shield before the next journey. Safe passage is the first duty.',
  'The Warden speaks of the difference between guarding a road and controlling it.',
  'The Warden trusts the party to choose when to stand together and when to retreat.'
 ]),
 mistScout:Object.freeze([
  'The Scout listens for echoes before stepping onto unfamiliar ground.',
  'The Scout explains how an unbroken trail can conceal a dangerous detour.',
  'The Scout offers to watch the side paths while the party moves forward.'
 ])
});
export function bondConversation(id,state){
 if(!state?.recruited||!Object.hasOwn(BOND_CONVERSATIONS,id))return null;
 const tier=state.bond>=75?2:state.bond>=25?1:0;
 return BOND_CONVERSATIONS[id][tier];
}
