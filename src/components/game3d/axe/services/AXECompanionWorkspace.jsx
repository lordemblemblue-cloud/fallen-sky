import {useEffect,useState} from 'react';
import {Compass} from 'lucide-react';
import AXECompanionMasteryPanel from './AXECompanionMasteryPanel';
import AXEGlassLoadoutPane from './AXEGlassLoadoutPane';
import AXECompanionStylePane from './AXECompanionStylePane';
import './AXECompanionCollectionPages.css';
import './AXECompanionWorkspace.css';
import './AXECompanionProfileRedesign.css';

// Mastery is a top-level Companion tab, immediately beside Equipment;
// the owned mount roster, gear and in-view growth remain in Equipment.
const TABS=['Equipment','Mastery','Vanity','Imbuement'];
const tabForService=serviceId=>serviceId==='pet'?'Mastery':'Equipment';
export default function AXECompanionWorkspace({onClose,serviceId='companion'}) {
  const [tab,setTab]=useState(()=>tabForService(serviceId));
  const [result,setResult]=useState('');
  useEffect(()=>{
    setTab(tabForService(serviceId));
    setResult('');
  },[serviceId]);
  const switchTab=id=>{setTab(id);setResult('');};
  return <div className="axe-comp-root axe-comp-root--modern" data-progression-panel="companion">
    <div className="axe-comp-header">
      <Compass size={42} strokeWidth={1.2}/><h2>Companion</h2>
      <span className="axe-comp-star">✧</span>
      <button type="button" className="axe-comp-header-close" data-service-close
        onClick={onClose} aria-label="Close Companion">×</button>
    </div>
    <div className="axe-comp-shell">
      <nav className="axe-comp-tabs" aria-label="Companion primary sections" data-companion-nav="primary">
        <span className="axe-comp-key-hint">LB</span>
        {TABS.map(next=><button type="button" key={next} aria-pressed={tab===next}
          onClick={()=>switchTab(next)}>{next==='Vanity'?'Variety':next==='Imbuement'?'Imbue':next}</button>)}
        <span className="axe-comp-key-hint">RB</span>
      </nav>
      <div className="axe-comp-modern">
        {tab==='Equipment'?<div className="axe-comp-equipment-content" data-equipment-section="companion">
          <AXEGlassLoadoutPane actor="companion" onNotice={setResult}/>
        </div>:tab==='Mastery'?<div className="axe-comp-equipment-content axe-comp-mastery-top" data-equipment-section="mastery">
          <AXECompanionMasteryPanel onNotice={setResult} onMyCompanion={()=>switchTab('Equipment')}/>
        </div>:<AXECompanionStylePane page={tab} onNotice={setResult}
          onPageChange={switchTab}/>}
      </div>
      {result&&<div className="axe-comp-feedback" role="status" aria-live="polite">{result}</div>}
    </div>
  </div>;
}
