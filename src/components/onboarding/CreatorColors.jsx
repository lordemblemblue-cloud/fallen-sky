import { Check } from 'lucide-react';
export default function CreatorColors({label,value,choices,onChange,onReset,disabled=false}) {
 return <fieldset className="creator-colors" disabled={disabled}><legend>{label}{onReset&&value&&<button type="button" className="creator-color-original" onClick={onReset}>Original</button>}</legend>
  <div>{choices.map((color,index)=><button type="button" key={color} style={{'--swatch':color}} aria-label={label+' preset '+(index+1)} aria-pressed={value===color} onClick={()=>onChange(color)}>{value===color&&<Check size={12}/>}</button>)}
   <label className="creator-custom-color" title={'Custom '+label.toLowerCase()}><input type="color" aria-label={'Custom '+label.toLowerCase()} value={value||choices[0]} onChange={e=>onChange(e.target.value)}/><span>+</span></label>
  </div>
 </fieldset>;
}