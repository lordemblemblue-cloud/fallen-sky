import {useEffect,useState} from 'react';
import {Compass} from 'lucide-react';
import AXECompanionMasteryPanel from './AXECompanionMasteryPanel';
import AXEGlassLoadoutPane from './AXEGlassLoadoutPane';
import AXECompanionStylePane from './AXECompanionStylePane';
import './AXECompanionCollectionPages.css';
import './AXECompanionWorkspace.css';
import './AXECompanionProfileRedesign.css';

// My Companion's owned-mount roster and gear are one Equipment screen.
// Mastery stays immediately to the right; growth is toggled above the 3D viewer.
const TABS=['Equipment','Vanity','Imbuement'];
const EQUIPMENT_VIEWS=[
  {id:'companion',label:'Equipment'},
  {id:'mastery',label:'Mastery'},
];
const equipmentViewForService=serviceId=>serviceId==='pet'?'mastery':'companion';
export default function AXECompanionWorkspace({onClose,serviceId='companion'}) {
  const [tab,setTab]=useState('Equipment');
  const [equipmentView,setEquipmentView]=useState(()=>equipmentViewForService(serviceId));
  const [result,setResult]=useState('');
  useEffect(()=>{
    setTab('Equipment');
    setEquipmentView(equipmentViewForService(serviceId));
    setResult('');
  },[serviceId]);
  const switchView=id=>{setEquipmentView(id);setResult('');};
  const switchTab=id=>{setTab(id);setResult('');};
  return <div className="axe-comp-root axe-comp-root--modern" data-progression-panel="companion">
    <div className="axe-comp-header">
      <Compass size={42} strokeWidth={1.2}/><h2>Companion</h2>
      <span className="axe-comp-star">✧</span>
      <button type="button" className="axe-comp-header-close" data-service-close
        onClick={onClose} aria-label="Close Companion">×</button>
    </div>
    <div className="axe-comp-shell">
      <nav className="axe-comp-tabs" aria-label="Companion sections">
        <span className="axe-comp-key-hint">LB</span>
        {TABS.map(next=><button type="button" key={next} aria-pressed={tab===next}
          onClick={()=>switchTab(next)}>{next==='Imbuement'?'Imbue':next}</button>)}
        <span className="axe-comp-key-hint">RB</span>
      </nav>
      <div className="axe-comp-modern">
        {tab==='Equipment'?<div className="axe-comp-equipment-shell">
          <nav className="axe-comp-equipment-subnav" aria-label="Companion equipment subpages">
            {EQUIPMENT_VIEWS.map(view=><button type="button" key={view.id}
              aria-pressed={equipmentView===view.id}
              onClick={()=>switchView(view.id)}>{view.label}</button>)}
          </nav>
          <div className="axe-comp-equipment-content" data-equipment-section={equipmentView}>
            {equipmentView==='mastery'?<AXECompanionMasteryPanel
                onNotice={setResult} onMyCompanion={()=>switchView('companion')}/>
              :<AXEGlassLoadoutPane actor="companion" onNotice={setResult}/>}
          </div>
        </div>:<AXECompanionStylePane page={tab} onNotice={setResult}
          onPageChange={switchTab}/>}
      </div>
      {result&&<div className="axe-comp-feedback" role="status" aria-live="polite">{result}</div>}
    </div>
  </div>;
}
