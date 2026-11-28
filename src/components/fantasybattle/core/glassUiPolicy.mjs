// Each registered UI screen has a deliberate presentation policy. Never use
// a single narrow information panel for a map, inventory or live combat HUD.
const groups = {
  title:['01'],
  right:['13','40','47'],
  scene:['02','03','04','05','06','07','08','11','12','16','17','18','19','20','21','22','23','24','25','26','27','28','29','30','32','33','34','35','37','39','46','48'],
  hud:['09','10'],
  event:['14','15','31','36','38','42','43','44','45'],
  toast:['41'],
};
export const GLASS_UI_POLICY=Object.freeze(Object.fromEntries(Object.entries(groups).flatMap(([kind,ids])=>ids.map(id=>[id,kind]))));
export function glassUiKind(id){return Object.hasOwn(GLASS_UI_POLICY,id)?GLASS_UI_POLICY[id]:null;}
export function usesRightGlass(id){return glassUiKind(id)==='right';}
