// Correlate events with the active encounter, not the last mounted renderer.
export function isCurrentEncounter(active,token){return typeof token==='string'&&token.length>0&&active?.token===token;}
export function currentSaveStamp(slots,slot,profile){const record=slots.find(s=>s.id===slot);if(!record)return null;if(record.status!=='valid'||record.profile.id!==profile?.id||JSON.stringify(record.profile)!==JSON.stringify(profile))return undefined;return record.stamp;}

// Revalidate the displayed revision at the moment the player commits to loading.
// Never silently substitute a changed save or recover over a damaged one.
export function resolveDisplayedSave(state,displayed){
 if(state?.error)return {record:null,message:'Save storage could not be read. Your files are unchanged.'};
 if(!displayed||displayed.status!=='valid')return {record:null,message:'Choose a valid saved adventure.'};
 const live=state?.slots?.find(record=>record.id===displayed.id);
 if(live?.status!=='valid'||live.stamp!==displayed.stamp||live.profile.id!==displayed.profile.id)return {record:null,message:'This save changed. Review the updated save list and select it again.'};
 return {record:live,message:null};
}
