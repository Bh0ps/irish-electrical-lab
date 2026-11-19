'use client';
import { useState } from 'react';
import { BookOpen, FileDown, FileUp, FolderOpen, Plus, Save, Trash2 } from 'lucide-react';
import { Button } from '../ui/button';
import type { CircuitDocument } from '../../lib/types';

interface LibraryProps {
  current: CircuitDocument;
  builds: CircuitDocument[];
  onSave: ()=>Promise<boolean>;
  onNew: ()=>void;
  onExample: ()=>void;
  onLoad: (circuit:CircuitDocument)=>void;
  onRemove: (id:string)=>void;
  onExport: ()=>void;
  onImport: ()=>void;
  onBackup: ()=>void;
  onRestore: ()=>void;
  restoring: boolean;
}

export default function BuildLibrary(props: LibraryProps) {
  const [saving,setSaving] = useState(false);
  const [savedName,setSavedName] = useState('');
  const [removeId,setRemoveId] = useState<string>();
  async function save() {
    if(saving) return;
    setSaving(true);
    try {
      if(await props.onSave()) setSavedName(props.current.name);
    } finally { setSaving(false); }
  }
  return <div className="build-library">
    <div className="library-current">
      <div><small>On the bench</small><strong>{props.current.name}</strong></div>
      <Button className="primary-button" disabled={saving} onClick={()=>void save()}><Save size={16}/>{saving?'Saving…':'Save build'}</Button>
    </div>
    <div className="library-start">
      <Button variant="outline" onClick={props.onNew}><Plus size={16}/>New circuit</Button>
      <Button variant="outline" onClick={props.onExample}><BookOpen size={16}/>Start from example</Button>
    </div>
    <section className="library-saves" aria-label="Saved builds">
      <h3>Saved builds <span>{props.builds.length}</span></h3>
      <span role="status" className="sr-only">{savedName && savedName+' saved.'}</span>
      {props.builds.length===0?<p>Choose Save build to keep a copy of the circuit on the bench.</p>:<ul>{props.builds.map(build=>
        <li key={build.id}>
          <button className="library-open" onClick={()=>props.onLoad(build)}>
            <FolderOpen size={17}/><span><b>{build.name}</b><small>{build.components.length} {build.components.length===1?'item':'items'} · {build.wires.length} {build.wires.length===1?'wire':'wires'}</small></span>
          </button>
          {removeId===build.id?<div className="library-remove">
            <span>Remove the saved copy of {build.name}?</span><button onClick={()=>{props.onRemove(build.id);setRemoveId(undefined);}}>Remove</button>
            <button onClick={()=>setRemoveId(undefined)}>Keep</button>
          </div>:<button className="library-trash" aria-label={'Remove saved copy of '+build.name} onClick={()=>setRemoveId(build.id)}><Trash2 size={16}/></button>}
        </li>)}</ul>}
    </section>
    <details className="library-files"><summary>Files and backups</summary>
      <p>Export circuit saves one circuit to a file. A full backup also keeps your other builds and lesson progress.</p>
      <div className="library-start">
        <Button variant="outline" onClick={props.onImport}><FileUp size={16}/>Import circuit</Button>
        <Button variant="outline" onClick={props.onExport}><FileDown size={16}/>Export circuit</Button>
        <Button variant="outline" onClick={props.onBackup}><FileDown size={16}/>Export full backup</Button>
        <Button variant="outline" onClick={props.onRestore} disabled={props.restoring}><FileUp size={16}/>Restore backup</Button>
      </div>
    </details>
  </div>;
}
