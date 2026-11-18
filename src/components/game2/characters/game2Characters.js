// User-provided GLB rigs hosted in Atom X Eve's Base44 media library.
// Keep the GLBs and large texture payloads OUT of the public GitHub repo.
// These are actual glTF skins; Revan contains one idle clip, other three
// contain zero authored clips. Gameplay is always owned by Game2's Fighter.
export const GAME2_CHARACTERS=Object.freeze([
  Object.freeze({id:'explorer',name:'Explorer',label:'Default Game 2 Jedi',url:null,skinJoints:64,clips:'Game 2 native animation bank',gender:'male'}),
  Object.freeze({id:'revan',name:'Darth Revan',label:'Clone Wars style',gender:'male',
    url:'https://media.base44.com/files/public/6876751a602125f45f1861b9/c22e547cc_revan.glb',
    sha256:'36dcc018fe7ec58c148eba4116d183342fa2b3d0cb28496c9e6f35aa4653cf57',skinJoints:74,clips:'Idle Pose',
    author:'Goeth Sapphire',license:'CC BY 4.0',
    attribution:'https://sketchfab.com/3d-models/darth-revan-the-clone-wars-style-87c94bb6b9ad4214a0797f28f803183c'}),
  Object.freeze({id:'artemis',name:'Artemis',label:'Fortnite inspired',gender:'female',
    url:'https://media.base44.com/files/public/6876751a602125f45f1861b9/aec1f9a50_artemis.glb',
    sha256:'8d1c662b13098d1d5f98456a47999ebac36bb22979e5164331d705e2847e3dd0',skinJoints:540,clips:'No native motion clips',
    author:'GatoBugadoBR',license:'CC BY 4.0',
    attribution:'https://sketchfab.com/3d-models/artemis-fortnite-skin-99e7b91a917947648dc0ec2d6d85f54b'}),
  Object.freeze({id:'atris',name:'Atris',label:'Knights of the Old Republic II',gender:'female',
    url:'https://media.base44.com/files/public/6876751a602125f45f1861b9/3067bd67b_atris.glb',
    sha256:'f203375bdbeca851d5482400a066e44d9e06f9517e1be075a782e1fbdcfb87d5',skinJoints:139,clips:'No native motion clips',
    author:'Zorg_Sinister',license:'CC BY 4.0',
    attribution:'https://sketchfab.com/3d-models/kotor-2-atris-3819df6265ec42d082452211162a7a90'}),
  Object.freeze({id:'visas-marr',name:'Visas Marr',label:'Knights of the Old Republic II',gender:'female',
    url:'https://media.base44.com/files/public/6876751a602125f45f1861b9/2e450e61e_visas-marr.glb',
    sha256:'c7b0c1b644907e6832c92d6979bfd77d8a86e457225396959138bbce23b05284',skinJoints:121,clips:'No native motion clips',
    author:'fred346b',license:'CC BY 4.0',
    attribution:'https://sketchfab.com/3d-models/kotor-2-visas-marr-6902780c433842e18d9c735c243b7ba5'}),
]);
export const GAME2_CHARACTER_KEY='atomxe.game2.avatar.v1';
export function game2CharacterStorageKey(userId=null){
  const id=String(userId??'').trim();
  return id?GAME2_CHARACTER_KEY+':'+encodeURIComponent(id):GAME2_CHARACTER_KEY;
}
export function game2Character(id){return GAME2_CHARACTERS.find(x=>x.id===id)||GAME2_CHARACTERS[0];}
export function readGame2Character(storage=globalThis.localStorage,userId=null){
  try{return game2Character(storage?.getItem(game2CharacterStorageKey(userId)));}
  catch{return GAME2_CHARACTERS[0];}
}
export function selectGame2Character(id,storage=globalThis.localStorage,userId=null){
  const model=game2Character(id);
  try{storage?.setItem(game2CharacterStorageKey(userId),model.id);}catch{/* storage disabled */}
  return model;
}
