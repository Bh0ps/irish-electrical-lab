import { ArrowLeft, BookOpen, Check, Wrench } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import './phone-field.css';

export type FieldAction={label:string;run:()=>void;selected?:boolean;disabled?:boolean};

interface Controls {
  place:string; jobOpen:boolean; hasJob:boolean; toolsOpen:boolean; leave:()=>void; job:()=>void;
  tools:(open:boolean)=>void; views:FieldAction[]; actions:FieldAction[];
}
export function PhoneFieldControls({place,jobOpen,hasJob,toolsOpen,leave,job,tools,views,actions}:Controls) {
  const group=(label:string,items:FieldAction[])=><section className="field-tool-group">
    <h3>{label}</h3><div>{items.map(item=><button type="button" key={item.label} disabled={item.disabled}
      aria-pressed={item.selected} onClick={()=>{tools(false);item.run();}}>
      {item.label}{item.selected&&<Check aria-hidden="true" size={16}/>}</button>)}</div>
  </section>;
  return <><nav className="field-bar" aria-label="Full screen controls">
    <button type="button" aria-label="Exit full screen" onClick={leave}><ArrowLeft aria-hidden="true" size={19}/>Exit</button>
    <span className="field-place">{place}</span>
    {hasJob&&<button type="button" aria-expanded={jobOpen} aria-controls="course-sheet" onClick={job}><BookOpen aria-hidden="true" size={17}/>Job</button>}
    <button type="button" aria-haspopup="dialog" aria-expanded={toolsOpen} onClick={()=>tools(true)}><Wrench aria-hidden="true" size={17}/>Tools</button>
  </nav>
  <Dialog open={toolsOpen} onOpenChange={tools}><DialogContent className="field-dialog">
    <DialogHeader><DialogTitle>{hasJob?'Site tools':'Workbench tools'}</DialogTitle></DialogHeader>
    {group('View',views)}{group('Work on the circuit',actions)}
  </DialogContent></Dialog></>;
}
