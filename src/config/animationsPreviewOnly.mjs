// Dedicated Game 3D animations subpage must NEVER appear on published
// Atom x Eve OS, even if this preview branch were accidentally merged.
// Base44's preview sandbox uses a preview-- host; .base44.app alone also
// hosts published apps, so never treat that suffix as a preview signal.
export function isAnimationsPreviewHost(host=typeof window!=='undefined'?window.location.hostname:'',
  dev=import.meta.env.DEV===true){
  const name=String(host||'').toLowerCase().trim();
  return Boolean(dev||
    name==='localhost'||name==='127.0.0.1'||
    name.startsWith('preview--')||name.startsWith('sandbox--'));
}
