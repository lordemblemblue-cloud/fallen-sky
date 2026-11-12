// Combat / Quest 48.7: a pending client-side screenshot is scoped to
// the user and character where selection began. No IDs are transmitted.
export function sameEchoChroniclePrivateScope(before,after){
 if(!before||!after||typeof before!=='object'||typeof after!=='object')
  return false;
 return typeof before.userId==='string'&&before.userId.length>0&&
  typeof before.characterId==='string'&&before.characterId.length>0&&
  before.userId===after.userId&&before.characterId===after.characterId;
}
