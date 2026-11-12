import {useEffect,useMemo,useState} from 'react';
import {BookOpen,ChevronLeft,ChevronRight,MapPin,Star,Users} from 'lucide-react';
import {buildEchoChronicleGraph,echoChroniclePageForSelected} from './echoChronicleGraph';

// Every star is a recorded chapter, not an invented or generated quest.
// Gold solid segments are EXPLICIT player-chosen branches; dotted lavender
// segments simply show chronology and make no claim about shared relationships.
const shorten=text=>String(text||'Recorded moment').slice(0,24);
const iconFor=entry=>entry.source==='personal'?BookOpen:
 entry.context==='exploration'?MapPin:
 entry.previousEncounters>0?Users:Star;
export default function EchoChronicleConstellation({
 entries=[],selectedId,onSelect,
}){
 const [requestedPage,setRequestedPage]=useState(0);
 // 48.1: selecting a chapter from the book or another page follows its star.
 // Manual Earlier/Later paging remains available even with a selection.
 useEffect(()=>{
  if(selectedId&&entries.some(entry=>entry.id===selectedId))
   setRequestedPage(echoChroniclePageForSelected(entries,selectedId,7));
 },[entries,selectedId]);
 const graph=useMemo(()=>buildEchoChronicleGraph(entries,{
  page:requestedPage,pageSize:7,
 }),[entries,requestedPage]);
 const {nodes,edges,offPageBranches,page,pageCount,total}=graph;
 return <section className="axe-echo-star-map" aria-label="Memory constellation timeline">
   <header className="axe-echo-star-map-heading">
    <span><Star size={16}/> Journey Timeline</span>
    <small>{total} saved {total===1?'moment':'moments'}</small>
   </header>
   <div className="axe-echo-star-sky">
    <span className="axe-echo-star-haze" aria-hidden="true"/>
    <svg aria-hidden="true" className="axe-echo-star-lines"
      viewBox="0 0 100 100" preserveAspectRatio="none">
      {edges.map(edge=><line key={edge.id} x1={edge.x1} y1={edge.y1}
        x2={edge.x2} y2={edge.y2}
        stroke={edge.kind==='chosen-branch'?'#f3c887':'#bda9ef'}
        strokeWidth={edge.kind==='chosen-branch'?'1.15':'.45'}
        strokeDasharray={edge.kind==='chosen-branch'?'none':'1 1'}/>)}
    </svg>
    {nodes.length ? nodes.map(node=>{
      const Marker=iconFor(node.entry);
      return <button type="button" key={node.id}
       className={'axe-echo-star-node'+(node.id===selectedId?' is-current':'')+
         (node.entry.source==='personal'?' is-personal':'')}
       style={{left:node.x+'%',top:node.y+'%'}}
       title={shorten(node.entry.title||node.entry.partnerName)+' — open recorded memory'}
       aria-pressed={node.id===selectedId}
       onClick={()=>onSelect(node.entry.id)}>
       <Marker size={15}/>
       <span>{shorten(node.entry.title||node.entry.partnerName)}</span>
      </button>;
    }) : <div className="axe-echo-star-empty">
      <Star size={32}/>
      <strong>Your constellation begins here</strong>
      <p>Record a personal moment or mutually save an encounter to illuminate your timeline.</p>
    </div>}
   </div>
   {offPageBranches.length>0&&<div className="axe-echo-star-offpage"
      aria-label="Continuation branches linked to other chapter skies">
      {offPageBranches.map(branch=><button type="button" key={branch.childId}
        onClick={()=>onSelect(branch.parentId)}
        title="Open the earlier recorded parent memory">
        <Star size={13}/> Branch continues from {branch.parentTitle}
      </button>)}
   </div>}
   {pageCount>1&&<nav className="axe-echo-star-pages" aria-label="Chronicle constellation pages">
     <button type="button" disabled={page>=pageCount-1}
       onClick={()=>setRequestedPage(value=>Math.min(pageCount-1,value+1))}>
       <ChevronLeft size={14}/> Earlier</button>
     <span>Chapter sky {page+1} of {pageCount}</span>
     <button type="button" disabled={page<=0}
       onClick={()=>setRequestedPage(value=>Math.max(0,value-1))}>
       Later <ChevronRight size={14}/></button>
   </nav>}
   <footer className="axe-echo-star-footer">
     <span>✧</span> Gold = chosen branch · Dotted = time order <span>✧</span>
   </footer>
  </section>;
}
