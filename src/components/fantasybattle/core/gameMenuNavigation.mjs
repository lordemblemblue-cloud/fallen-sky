import {PAUSE_LINKS,UI_SCREENS} from '../uiCatalog.mjs';
export const GAME_MENU_GROUPS=Object.freeze([
 {label:'Character',ids:['05','06','21','12','11','27','30']},
 {label:'Adventure',ids:['07','08','25','24','28','29']},
 {label:'Game',ids:['18','03','34','37']},
].map(group=>Object.freeze({...group,ids:Object.freeze(group.ids)})));
const names=Object.freeze({'04':'Game menu','05':'Character','06':'Equipment','07':'World map','08':'Quest journal','11':'Party','12':'Skillbook','18':'Save game','21':'Inventory','24':'Bestiary','25':'Fast travel','26':'Recruitment','27':'Appearance','28':'Achievements','29':'World codex','30':'Companion bonds','32':'Attributes','34':'Tutorial','37':'Notifications','39':'Compare equipment','46':'Recovery','03':'Settings','16':'Merchant','17':'Blacksmith','22':'Crafting','23':'Encounter entrance','33':'Sanctuary'});
export const menuName=id=>Object.hasOwn(names,id)?names[id]:UI_SCREENS[id]?.name||'Game menu';
const workspaceIds=new Set(['04',...PAUSE_LINKS.filter(id=>id!=='03'),'26','32','39','46','16','17','22','23','33']);
export const isGameMenu=id=>workspaceIds.has(id);
export const canResumeGame=stack=>stack[0]==='09'||stack[0]==='10';
export function menuDestination(stack,target,hotkey=false){
 if(!isGameMenu(target)&&target!=='03')return stack;
 const root=stack[0];
 if(!canResumeGame(stack))return stack;
 if(target==='04')return [root,'04'];
 if(hotkey&&!stack.includes('04'))return [root,target];
 return [root,'04',target];
}

const parentService=Object.freeze({'26':'11','32':'05','39':'06','46':'21','16':'21','17':'06','22':'21','23':'07','33':'05'});
export const activeMenuService=id=>Object.hasOwn(parentService,id)?parentService[id]:id;
