// Correlate events with the active encounter, not the last mounted renderer.
export function isCurrentEncounter(active,token){return typeof token==='string'&&token.length>0&&active?.token===token;}
export function currentSaveStamp(slots,slot,profile){const record=slots.find(s=>s.id===slot);if(!record)return null;if(record.status!=='valid'||record.profile.id!==profile?.id||JSON.stringify(record.profile)!==JSON.stringify(profile))return undefined;return record.stamp;}
