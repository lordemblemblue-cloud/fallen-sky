// Legacy cave/vortex geometry removed; retain ordinary wayfinding points.
import * as THREE from 'three';
export const SUIGEN_QUEST_POIS=Object.freeze([
  {id:'suigen-keep-council',name:'Acropolis Council',x:0,z:-105,category:'story',chapter:1},
  {id:'suigen-market-crossing',name:'Moonsteel Market',x:0,z:217,category:'town',chapter:1},
  {id:'suigen-forest-shrine',name:'Bamboo Shrine',x:-230,z:295,category:'discovery',chapter:2},
]);
export const SUIGEN_CAVE_PORTALS=Object.freeze([]);
export function createSuigenMountainWayfinding({worldRoot}={}){
 const root=new THREE.Group();root.name='Suigen_Wayfinding';worldRoot.add(root);
 return {root,walkables:[],questPOIs:SUIGEN_QUEST_POIS,nearestInteraction(){return null;},interact(){return null;},update(){},dispose(){root.parent?.remove(root);}};
}
