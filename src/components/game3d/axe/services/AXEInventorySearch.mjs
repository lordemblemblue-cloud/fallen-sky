// Shared, read-only client filtering for the clone's Equipment and Vanity
// inventories. Only display subsets change; equip and ownership use their
// existing store actions with the original item identity.
const searchableText = item => [
  item?.name, item?.slot, item?.category, item?.kind, item?.rarity,
  item?.rarityLabel, item?.itemLevel, item?.setId, item?.id,
  item?.instanceId, item?.description,
].filter(v=>v!==null&&v!==undefined).join(' ').toLocaleLowerCase();
export function matchesInventorySearch(item, search='') {
  const terms=String(search??'').trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if(!terms.length)return true;
  const text=searchableText(item);
  return terms.every(term=>text.includes(term));
}
export function filterInventoryWithSearch(items=[], {
  search='', category='All', categoryKey='slot',
}={}) {
  return (Array.isArray(items)?items:[]).filter(item=>
    (category==='All'||item?.[categoryKey]===category)
    && matchesInventorySearch(item,search));
}
