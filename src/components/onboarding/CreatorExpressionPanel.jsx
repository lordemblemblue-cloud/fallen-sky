import {EXPRESSION_PRESETS,EXPRESSION_CONTROLS} from './avatarCustomization';
import {
 ADDITIONAL_PRESETS,EXPRESSION_GROUPS,EXPRESSION_DESCRIPTIONS,MUSCLE_GROUPS,
 projectExpressionPreset,supportedExpressionControls,expressionIntensity,
} from './creatorExpressionPerformance.mjs';
import './creator-expression-detail.css';

const PRESETS=[...EXPRESSION_PRESETS,...ADDITIONAL_PRESETS].map(p=>({
 ...p,description:p.description||EXPRESSION_DESCRIPTIONS[p.id]||'Live facial animation',
}));
const previewStrength=v=>Math.round(v*100)+'%';

function FaceSlider({control,value,onChange,partial=false}){
 return <label className="creator-expression-muscle">
  <span className="creator-expression-muscle-title"><span>{control.label}{partial&&<small title="Only some of the authored left/right keys are available"> · one side</small>}</span><output>{previewStrength(value)}</output></span>
  <input type="range" min="0" max="1" step="0.02" value={value}
   aria-label={control.label+' facial movement'} onChange={event=>onChange(Number(event.target.value))}/>
 </label>;
}

export default function CreatorExpressionPanel({
 capabilities={},expression={},onExpressionChange,enabled=true,
}){
 const available=capabilities.expressions||[];
 const keys=new Set(available);
 const supported=supportedExpressionControls(EXPRESSION_CONTROLS,available);
 const intensity=expressionIntensity(expression.intensity);
 const live=enabled&&available.length>0;
 const byId=new Map(PRESETS.map(p=>[p.id,p]));
 const project=p=>projectExpressionPreset(p,EXPRESSION_CONTROLS,available);
 const selected=byId.get(expression.preset);
 const setPreset=(preset)=>{
  const result=project(preset);
  if(!live||!result.enabled)return;
  onExpressionChange?.({
   preset:preset.id,values:result.values,morphs:result.morphs,intensity,
  });
 };
 const setMuscle=(id,value)=>{
  if(!live)return;
  onExpressionChange?.({
   preset:'custom',
   values:{...(expression.values||{}),[id]:value},
   morphs:{},
   intensity,
  });
 };
 const setStrength=(next)=>{
  if(!live)return;
  onExpressionChange?.({...expression,intensity:next});
 };
 return <div className="creator-expression-workbench" aria-label="Live facial performance studio">
  <div className="creator-expression-intro">
   <strong>Facial performance</strong>
   <p>Choose an emotion, then fine-tune the individual facial muscles. Every active movement is connected to the selected character's actual rig.</p>
   <div className="creator-expression-rig" role="status" aria-live="polite">
    {live
     ? <span>{available.length} detected face shapes · {supported.length} adjustable movements</span>
     : <span>{enabled?'Waiting for the real facial rig. Check the character preview if this persists.':'Select Eve or Adam under Body to use the animated expression studio.'}</span>}
   </div>
  </div>
  {live&&<>
   <section className="creator-expression-strength" aria-label="Expression intensity">
    <FaceSlider control={{label:'Performance intensity'}} value={intensity} onChange={setStrength}/>
    <p>At 0% the face rests in neutral. At 100% the selected expression uses its authored strength.</p>
   </section>
   {EXPRESSION_GROUPS.map(group=><section className="creator-expression-moods" key={group.id} aria-label={group.label}>
    <h3>{group.label}</h3>
    <div className="creator-expression-preset-grid">
     {group.ids.map(id=>{
      const preset=byId.get(id);if(!preset)return null;
      const match=project(preset);
      const disabled=!match.enabled;
      const active=expression.preset===preset.id;
      return <button key={id} type="button" className="creator-expression-preset"
       title={disabled?'This model lacks the required shape keys':preset.description}
       disabled={disabled} aria-pressed={active} onClick={()=>setPreset(preset)}>
       <strong>{preset.label}</strong>
       <span>{preset.description}</span>
       <small>{preset.id==='neutral'?'Rest pose':disabled?'Unavailable on this rig':match.partial?'Partial rig match':'Live rig match'}</small>
      </button>;
     })}
    </div>
   </section>)}
   <section className="creator-expression-active" aria-live="polite">
    <div><strong>Now previewing</strong><span>{selected?.label||'Custom expression'}</span></div>
    <button type="button" onClick={()=>setPreset(byId.get('neutral'))} disabled={expression.preset==='neutral'}>Reset face</button>
   </section>
   <div className="creator-expression-fine-tune">
    <h3>Fine-tune facial movement</h3>
    <p>Adjust left/right eyes, brow, mouth and cheeks with the shapes your current Eve or Adam model actually contains. Double-clicking a slider is not needed; choose Neutral to reset everything.</p>
    {MUSCLE_GROUPS.map((group,index)=>{
     const controls=supported.filter(c=>group.ids.includes(c.id));
     if(!controls.length)return null;
     return <details key={group.id} open={index===0} className="creator-expression-detail-group">
      <summary>{group.label}<small>{controls.length} movements</small></summary>
      <div>{controls.map(c=><FaceSlider key={c.id} control={c}
       partial={c.morphs.some(name=>!keys.has(name))}
       value={expression.values?.[c.id]||0}
       onChange={value=>setMuscle(c.id,value)}/>)}</div>
     </details>;
    })}
   </div>
  </>}
  <p className="creator-expression-footnote">Live preview only. Expressions are not permanently applied to the character's face or saved over its original features.</p>
 </div>;
}
