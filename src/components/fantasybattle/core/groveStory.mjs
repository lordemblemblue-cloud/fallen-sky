// Chapter 1 narrative only. No quest writes, reward grants or geometry dependencies.
export const GROVE_STORY=Object.freeze({
 title:'Whispering Grove Spirit',
 offer:'A light has gone out in Whispering Grove. Stop the spirit drawing travelers off the road.',
 journal:'The spirit echoes a distress call. Find its source and make the road safe.',
 warning:"Grove Archer's warning: Don't chase the voice. Find what is making it.",
 recruit:'Something remembers this road better than we do. Let me walk with you.',
 completion:'The path is open, but the silence is not an answer. Keep your lantern close.',
 opening:'The grove used to answer every bell. Now the bells answer each other.'
});
export function groveStoryState(profile){
 const state=profile?.quests?.grove;
 const defeated=profile?.world?.completedEncounters?.includes('wilds_grove_01')===true;
 if(!profile||!['available','active','complete','claimed'].includes(state))return null;
 return Object.freeze({state,defeated,
   serviceNote:state==='claimed'&&defeated?GROVE_STORY.completion:defeated?'The grove is clear. Record your discovery in the journal.':state==='active'?'Follow the lanterns. Look for the source of the voice.':GROVE_STORY.opening,
   history:state==='available'?null:defeated?'The Grove Spirit repeated a distress call from an older pilgrimage.':'A shrine light has gone out, and travelers hear voices in the grove.'
 });
}
