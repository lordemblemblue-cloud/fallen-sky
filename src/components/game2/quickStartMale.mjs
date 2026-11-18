import { game2Character, game2CharacterStorageKey } from './characters/game2Characters.js';

// The P shortcut remains a deterministic male launch for existing players.
export const GAME2_QUICKSTART_PATH = '/Game2?quickstart=male';
export const GAME2_MALE_MODEL = 'Explorer_G2_Game.glb';
const MALE_QUICKSTART_KEY = 'atomxe.game2.quickstart.male.v1:';
const RANDOM_STARTER_KEY = 'atomxe.game2.quickstart.starter.v1:';

function newId(createId) {
  try {
    const value = createId();
    if (value != null && String(value)) return String(value);
  } catch { /* use a local fallback when browser crypto is restricted */ }
  return 'local-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

export function isGame2MaleQuickStart(search='') {
  return new URLSearchParams(search).get('quickstart') === 'male';
}

export function shouldLaunchGame2OnP(event,pathname='') {
  const path=String(pathname).toLowerCase();
  // Never override gameplay controls, editor/test screens or shortcuts in
  // other games. Onboarding renders over the original dashboard route.
  if(!['/','/home','/lunatemplate'].includes(path))return false;
  if(event?.repeat||event?.ctrlKey||event?.altKey||event?.metaKey)return false;
  if(!(event?.code==='KeyP'||String(event?.key).toLowerCase()==='p'))
    return false;
  const target=event?.target;
  if(target?.isContentEditable || target?.closest?.('[contenteditable="true"]'))
    return false;
  if(['INPUT','TEXTAREA','SELECT'].includes(String(target?.tagName||'').toUpperCase()))
    return false;
  return true;
}

export function getOrCreateGame2MaleCharacter(userId,{
  storage=typeof localStorage!=='undefined'?localStorage:null,
  createId=()=>typeof crypto!=='undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : 'local-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,10),
}={}){
  if(!userId)return null; // account login remains mandatory
  const key=MALE_QUICKSTART_KEY+encodeURIComponent(String(userId));
  try {
    const saved=JSON.parse(storage?.getItem(key)||'null');
    // Migrate older male records while keeping their original stable ID.
    if(saved?.id && saved?.gender==='male' && saved?.model===GAME2_MALE_MODEL) {
      const character={id:String(saved.id),name:'Jedi',gender:'male',
        model:GAME2_MALE_MODEL,avatarId:'explorer'};
      try { storage?.setItem(game2CharacterStorageKey(userId),'explorer'); }
      catch { /* retain the reusable starter even when persistence is blocked */ }
      return character;
    }
  } catch { /* invalid/storage-restricted browser: generate an ephemeral preset */ }
  const character={id:'game2-'+newId(createId),name:'Jedi',gender:'male',
    model:GAME2_MALE_MODEL,avatarId:'explorer'};
  try {
    storage?.setItem(key,JSON.stringify(character));
    storage?.setItem(game2CharacterStorageKey(userId),'explorer');
  } catch { /* private browsing can deny storage; gameplay still opens */ }
  return character;
}

/**
 * Create one account-scoped Game 2 starter on first direct entry. New players
 * receive the canonical male Explorer or female Artemis body with equal odds.
 * The choice is stable on later visits, and a later Game 2 character selection
 * is read from the same account-scoped key rather than being overwritten.
 */
export function getOrCreateGame2StarterCharacter(userId,{
  storage=typeof localStorage!=='undefined'?localStorage:null,
  random=Math.random,
  createId=()=>typeof crypto!=='undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : 'local-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,10),
}={}){
  if(!userId)return null; // direct Game 2 entry never creates an anonymous identity
  const key=RANDOM_STARTER_KEY+encodeURIComponent(String(userId));
  const selectedKey=game2CharacterStorageKey(userId);
  let saved=null,selectedId=null;
  try {
    saved=JSON.parse(storage?.getItem(key)||'null');
    selectedId=storage?.getItem(selectedKey);
  } catch { /* restricted storage falls back to an ephemeral starter */ }

  if(saved?.id && saved?.avatarId &&
     ['male','female'].includes(saved.gender) &&
     game2Character(saved.avatarId).id===saved.avatarId){
    const chosen=selectedId && game2Character(selectedId).id===selectedId
      ? game2Character(selectedId) : game2Character(saved.avatarId);
    return {
      id:String(saved.id),name:'Jedi',
      gender:chosen.gender==='female'?'female':'male',
      model:chosen.url||GAME2_MALE_MODEL,
      avatarId:chosen.id,
    };
  }

  let gender='male';
  try {
    const roll=Number(random());
    if(Number.isFinite(roll)&&roll>=0&&roll<1)gender=roll<.5?'male':'female';
  } catch { /* use the safe male fallback if the random source is unavailable */ }
  const chosen=game2Character(gender==='female'?'artemis':'explorer');
  const character={
    id:'game2-'+newId(createId),
    name:'Jedi',
    gender,
    model:chosen.url||GAME2_MALE_MODEL,
    avatarId:chosen.id,
  };
  try {
    storage?.setItem(key,JSON.stringify(character));
    storage?.setItem(selectedKey,chosen.id);
  } catch { /* a blocked localStorage session still receives this in-memory starter */ }
  return character;
}
