import {useEffect,useState} from 'react';
import {BookOpen,LockKeyhole,Pencil,Save,Trash2} from 'lucide-react';
import {echoChronicleMonthLabel} from './echoChronicleMonthlySky';
import {
 MAX_ECHO_SKY_REFLECTION,MAX_ECHO_SKY_TITLE,
} from './echoChronicleSkyChapters.js';

const messageFor=result=>{
 if(result?.reason==='no-chosen-stars')return 'Choose an existing saved memory before writing a sky chapter.';
 if(result?.reason==='storage-unavailable')return 'Browser storage is unavailable or full. Your previous sky story was not changed.';
 if(result?.reason==='too-long')return 'Shorten the title or reflection before saving.';
 if(result?.reason==='chapter-limit')return 'This character has reached the 36-chapter limit.';
 if(result?.reason==='invalid-clock')return 'The device date is invalid. The story was not saved.';
 if(result?.reason==='character-changed')return 'The active character changed. This unsaved chapter was not transferred.';
 return 'Could not save this private story. Check its title or reflection.';
};

export default function EchoChronicleSkyChapterEditor({
 month,chapter,canWrite,onSave,onDelete,
}){
 const [editing,setEditing]=useState(false);
 const [title,setTitle]=useState('');
 const [reflection,setReflection]=useState('');
 const [error,setError]=useState('');
 useEffect(()=>{
  setTitle(chapter?.title||'');
  setReflection(chapter?.reflection||'');
  setEditing(false);setError('');
 },[month,chapter?.updatedAt,chapter?.title,chapter?.reflection]);
 const savedTime=chapter?.updatedAt&&Number.isFinite(Date.parse(chapter.updatedAt))
  ?new Date(chapter.updatedAt).toLocaleString():null;
 const save=event=>{
  event.preventDefault();
  setError('');
  const result=onSave?.({month,title,reflection});
  if(!result?.ok){setError(messageFor(result));return;}
  setEditing(false);
 };
 const remove=()=>{
  if(!chapter||!onDelete)return;
  if(!window.confirm('Delete only this private sky title and reflection? Your original memories, photographs and chosen stars will remain.'))return;
  const result=onDelete(month);
  if(!result?.ok){setError(messageFor(result));return;}
  setEditing(false);
 };
 return <section className="axe-echo-sky-chapter"
   aria-label={'Personal sky story for '+echoChronicleMonthLabel(month)}>
   <div className="axe-echo-sky-chapter-heading">
    <BookOpen size={16}/>
    <div>
     <h4>{chapter?.title||'Your Sky Story'}</h4>
     <small>{echoChronicleMonthLabel(month)} ·
       {savedTime?' Edited on this device '+savedTime:
        ' No personal reflection saved yet'}</small>
    </div>
    <button type="button" aria-expanded={editing}
      disabled={!canWrite}
      onClick={()=>{setError('');setEditing(value=>!value)}}>
      <Pencil size={14}/>{chapter?'Edit story':'Write my sky story'}
    </button>
   </div>
   {!editing&&<p className="axe-echo-sky-chapter-reflection">
    {chapter?.reflection||'Give the constellation your own title and write what these memories meant to you.'}
   </p>}
   {editing&&<form className="axe-echo-sky-chapter-form" onSubmit={save}>
    <label>Private chapter title
     <input value={title} maxLength={MAX_ECHO_SKY_TITLE}
       placeholder="The friends I met under the winter sky"
       onChange={event=>setTitle(event.target.value)}/>
    </label>
    <label>My reflection · not a verified quest record
     <textarea value={reflection} maxLength={MAX_ECHO_SKY_REFLECTION}
       placeholder="Write about the real memories that connect these stars..."
       onChange={event=>setReflection(event.target.value)} rows={3}/>
    </label>
    <div>
     <button type="submit"><Save size={14}/> Save private chapter</button>
     <button type="button" onClick={()=>setEditing(false)}>Cancel</button>
     {chapter&&<button type="button" className="axe-echo-sky-chapter-delete"
       onClick={remove}><Trash2 size={14}/> Delete story text</button>}
    </div>
   </form>}
   {!canWrite&&<p className="axe-echo-sky-chapter-warning">
    Choose at least one currently available saved memory in this sky to write here.
   </p>}
   {error&&<p role="alert" className="axe-echo-sky-chapter-error">{error}</p>}
   <footer><LockKeyhole size={12}/> Private to this character and device.
    Writing a sky story does not share it with other players or grant quest rewards.</footer>
  </section>;
}
