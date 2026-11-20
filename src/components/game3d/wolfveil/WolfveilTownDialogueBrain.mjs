// Bounded autonomous town-agent dialogue. Intentionally local and inexpensive.
// Not an LLM: no external API key, network calls or arbitrary model-generated
// item/XP grants. Agent memory, pair proximity and time-of-day select varied
// authored phrases. The real quest runtime owns all acceptance and rewards.
const TOPICS=Object.freeze([
  ['market','the market','a customer','the southern road'],
  ['weather','the breeze','the clouds','the light on the paving'],
  ['patrol','the gate','the north watch','the old stone path'],
  ['rumor','the forest trail','the ancient tree','the western hills'],
]);
const OPEN=Object.freeze([
  "Have you noticed", "I was thinking about", "Someone asked me about",
  "We should keep an eye on", "I heard a story about",
  "The other day we spoke of",
]);
const END=Object.freeze([
  "before sunset.","when the guards change shift.","once the market quiets.",
  "on the walk north.","while the lanterns are lit.",
  "when the next traveler arrives.",
]);
const ROLE_LINES=Object.freeze({
 guard:["The west approach is clear.","I need to check the gate.","Two patrols on the avenue, always.","Let's compare notes after our rounds."],
 tea:["Fresh tea is ready.","A warm cup for the road?","The kettle's singing again."],
 tailor:["I can mend a travel cloak.","The finer thread arrives tomorrow.","That sleeve needs a proper seam."],
 potter:["The kiln is warm.","The clay came from the riverbank.","Careful with the ink glaze."],
 resident:["The courtyard looks better already.","Our neighbors have been busy.","It is quiet beneath the old tree."],
 provisions:["Salt and bread for the road.","The market deliveries are late.","We have enough for the next watch."],
 herbalist:["The rain helps the herbs.","Mint and willow grow by the water.","Don't crush the leaves in your pack."],
 smith:["The forge is ready.","Steel needs patience, not anger.","Hear that? The hammer's still ringing."],
 showroom:["The display models are ready.","Take your time viewing the mount designs.","These are previews, not animals for sale."],
});
export function makeTownDialogueBrain(seed=1){
 let state=(Math.floor(seed)>>>0)||1;
 return ()=>{
  state^=state<<13;state^=state>>>17;state^=state<<5;
  return (state>>>0)/4294967296;
 };
}
const pick=(list,rand)=>list[Math.min(list.length-1,Math.floor(rand()*list.length))];
export function makeTownSentence(agent,rand,{friend=null,visitor=false}={}){
 const role=agent?.role||'resident',lines=ROLE_LINES[role]||ROLE_LINES.resident;
 if(visitor && rand()<.43)return pick(lines,rand);
 if(friend&&rand()<.6)
  return pick([
    'Good evening, '+friend.name+'. Our route looks calm.',
    'Have you checked the gate, '+friend.name+'?',
    friend.name+', meet me by the old stone path.',
    'I heard you and '+friend.name+' have the same watch.',
    'Careful on the northern road, '+friend.name+'.',
  ],rand);
 if(rand()<.46)return pick(lines,rand);
 const topic=pick(TOPICS,rand);
 return pick(OPEN,rand)+' '+pick(topic.slice(1),rand)+' '+pick(END,rand);
}
export function townConversationResult(agent,rand,context={}){
 const opening=makeTownSentence(agent,rand,{...context,visitor:true});
 const questOffer=Boolean(agent.questNpcId)&&rand()<.42;
 const hint=questOffer
  ?' I might have work for a traveler. Ask me about it.'
  :agent.role==='guard'?' Stay on the marked paths.':' Feel free to explore the shops.';
 return {id:agent.id,name:agent.name,role:agent.role,questNpcId:agent.questNpcId||null,
  questOffer,text:opening+hint,canGrantItems:false};
}
// Rendering random dialogue is NOT a trusted grant request. If an NPC offers
// a quest, the existing AXENPCQuestHandoff checks faction, level, prerequisite,
// objective and completion state before any normal quest-reward path can run.
