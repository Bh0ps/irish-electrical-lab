import { ArrowLeft, BookOpen, Check, Wrench } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import './phone-field.css';

export type FieldAction={label:string;run:()=>void;selected?:boolean;disabled?:boolean};

interface Controls {
  place:string; jobOpen:boolean; hasJob:boolean; toolsOpen:boolean; leave:()=>void; job:()=>void;
  tools:(open:boolean)=>void; views:FieldAction[]; actions:FieldAction[];
  signal?:string; sound?:{enabled:boolean;change:()=>void};
  steering?:{enabled:boolean;change:()=>void};
  taskHost?:(node:HTMLDivElement|null)=>void;
}
export function PhoneFieldControls({place,jobOpen,hasJob,toolsOpen,leave,job,tools,views,actions,steering,signal,sound,taskHost}:Controls) {
  const group=(label:string,items:FieldAction[])=><section className="field-tool-group">
    <h3>{label}</h3><div>{items.map(item=><button type="button" key={item.label} disabled={item.disabled}
      aria-pressed={item.selected} onClick={()=>{tools(false);item.run();}}>
      {item.label}{item.selected&&<Check aria-hidden="true" size={16}/>}</button>)}</div>
  </section>;
  return <><nav className="field-bar" aria-label="Full screen controls">
    <button type="button" aria-label="Exit full screen" onClick={leave}><ArrowLeft aria-hidden="true" size={19}/>Exit</button>
    <span className="field-place" hidden={!!signal}>{place}</span>
    <output className="field-signal" aria-live="polite" aria-atomic="true">{signal??''}</output>
    {hasJob&&<button type="button" aria-expanded={jobOpen} aria-controls="course-sheet" onClick={job}><BookOpen aria-hidden="true" size={17}/>Job</button>}
    <button type="button" aria-haspopup="dialog" aria-expanded={toolsOpen} onClick={()=>tools(true)}><Wrench aria-hidden="true" size={17}/>Tools</button>
  </nav>
  {taskHost&&<div className="field-job-slot" ref={taskHost}/>}
  <Dialog open={toolsOpen} onOpenChange={tools}><DialogContent className="field-dialog">
    <DialogHeader><DialogTitle>{hasJob?'Site tools':'Workbench tools'}</DialogTitle></DialogHeader>
    {steering&&<label className="field-steering"><span><b>One-thumb walking</b><small>Use the side arrows to turn.</small></span><input type="checkbox" checked={steering.enabled} onChange={steering.change}/></label>}
    {sound&&<label className="field-steering"><b>Doorbell sounds</b><input type="checkbox" checked={sound.enabled} onChange={sound.change}/></label>}
    {group('View',views)}{group('Work on the circuit',actions)}
  </DialogContent></Dialog></>;
}
