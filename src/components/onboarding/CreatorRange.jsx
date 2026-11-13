export default function CreatorRange({label,value=0,onChange,min=0,max=1,format,disabled=false}) {
 const percentage=(value-min)/(max-min)*100,zero=min<0?(0-min)/(max-min)*100:0;
 return <label className={'creator-range'+(min<0?' is-signed':'')} style={{'--fill-from':Math.min(zero,percentage)+'%','--fill-to':Math.max(zero,percentage)+'%'}}>
  <span>{label}<output>{format?format(value):min<0?(value>0?'+':'')+Math.round(value*100):Math.round(value*100)}</output></span>
  <input aria-label={label} type="range" min={min} max={max} step="0.01" value={value} disabled={disabled} onChange={e=>onChange(Number(e.target.value))} onDoubleClick={()=>onChange(min<0?0:min)}/>
 </label>;
}