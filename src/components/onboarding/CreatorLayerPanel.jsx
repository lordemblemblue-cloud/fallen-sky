import { Image } from '@/components/ui/image';
import { useBuiltinLayers } from '@/components/onboarding/creatorBuiltinLayers';
import { selectLayer } from '@/components/onboarding/creatorOptions';
import CreatorRange from '@/components/onboarding/CreatorRange';
export default function CreatorLayerPanel({config,setConfig,slot}) {
 const layers=useBuiltinLayers(config),options=layers[slot]||[],selected=config.selected_assets?.[slot];
 const choose=asset=>setConfig(current=>selectLayer(current,slot,asset));
 return <section className="creator-group"><h3>{slot==='hair'?'Style':'Design'}</h3><div className="creator-layer-grid">
  <button type="button" aria-pressed={!selected} onClick={()=>choose(null)}><span className="creator-layer-placeholder">–</span><strong>{slot==='hair'?'Default':'None'}</strong></button>
  {options.map(asset=><button type="button" key={asset.id} aria-pressed={selected===asset.id} onClick={()=>choose(asset)}>{asset.thumbnail_url?<Image src={asset.thumbnail_url} alt="" className="h-7 w-7"/>:<span className="creator-layer-placeholder">{asset.name.slice(0,1)}</span>}<strong>{asset.name}</strong></button>)}
 </div>{layers.loading&&<p className="creator-hint" role="status">Loading layers…</p>}{layers.error&&<p className="creator-error" role="alert">{layers.error}</p>}
 {selected&&slot==='tattoo'&&<CreatorRange label="Opacity" value={config.layer_opacity?.tattoo??.75} onChange={value=>setConfig(current=>({...current,layer_opacity:{...current.layer_opacity,tattoo:value}}))}/>}
 </section>;
}