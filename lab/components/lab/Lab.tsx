'use client';
import { fittingDetails,type FittingDetail } from '../../lib/fitting-details';
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Activity, BookOpen, Box, Cable, Check, CheckCircle2, Copy, Download, Focus, FolderOpen, Gauge, Lightbulb, Maximize2, MousePointer2, Move3D, Plus, RotateCcw, RotateCw, Save, Settings2, ShieldCheck, Trash2, Undo2, Redo2, Upload, Wrench, X, Zap } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Switch } from '../ui/switch';
import { Slider } from '../ui/slider';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import type { InspectionView, Tool } from './Workbench';
import { terminations, type PreparationTask, type WorkshopVisual } from '../../lib/termination-practice';
import { TesterControls, TerminationPractice } from './TesterControls';
import { forkDial, forkMode, forkRead, instrumentData, type ForkMethod, type ForkReading, type ForkReference, type ForkSetup } from '../../lib/fork-tester';
import type { SitePose } from './JobSiteView';
import {BoardDrawer} from './BoardDrawer';
import JobDrawing from './JobDrawing';
import { jobSite } from '../../lib/job-site';
import { normalizeBoardMounts } from '../../lib/board-assembly';
import './installation.css';
import TestReport from './TestReport';
import MeterHistory from './MeterHistory';
import BuildLibrary from './BuildLibrary';
import './build-library.css';
import LearningPanel from './LearningPanel';
import QuickPracticePanel from './QuickPracticePanel';
import { chooseQuickPractice, createQuickPracticeCircuit, practiceOnlyControlChanged, type QuickPracticeExperiment } from '../../lib/quick-practice';
import DimmerControl from './DimmerControl';
import { ConductorPicker, TerminalPicker, EquipmentList, nextFreePosition } from './ConnectionPicker';
import { useCompactWorkbench } from './useCompactWorkbench';
import { HouseCallPanel } from './HouseCallPanel';
import { HOUSE_CALLS, callActivityId, savedCallStep, onlyCallControlsChanged, houseJobLabels, nextHouseCall, type CallOperation } from '../../lib/house-calls';
import { BookHome, BookIndex } from './BookIndex';
import { CHAPTERS, courseTitle, createCoursebookBuild } from '../../lib/coursebook';
import { CablePicker } from './CablePicker';
import { addCableConnection, cleanCableRuns, describeCableCore, markedRole, suggestedCableChoice, type CableChoice } from '../../lib/cables';
import { validateBookmark, type LessonBookmark } from '../../lib/lesson-bookmark';
import OfflineSettings from '../../web/OfflineSettings';
import { DefinitionIcon, EquipmentIcon, LessonIcon, MenuIcon } from './MenuIcons';
import { equipmentReferences } from '../../lib/equipment-assets';
import { loadPresentationPreferences, savePresentationPreferences } from '../../lib/presentation-preferences';
import { DEFAULT_CAMERA_SPEED, type CameraMode } from '../../lib/camera-navigation';
import { DEFAULT_SCENERY, SCENERIES, type SceneryId } from '../../lib/scene-settings';
import { captureMeasurement, type LessonActivity } from '../../lib/learning';
import { emptyLearningRecord, migrateProgress, recordActivity, recordEvidence, reviewQueue, type StudyProgress } from '../../lib/progress';
import { isDesktop, canFullscreen, readJsonFile, saveJsonFile, openExternalReference, setFullscreen, observeFullscreen } from '../../lib/desktop';
import { BACKUP_LIMITS, exportStudyBackup, restoreStudyBackup, validateStudyBackup } from '../../lib/study-backup';
import {electricalKey,acceptsElectricalResult} from '../../lib/simulation-identity';
import {captureTestRecord,obsoleteEmptyPass,testFingerprint,testRecordMatches} from '../../lib/test-record';
import { getBuildHint, describeEndpoint } from '../../lib/build-hints';
import { connectionKey, suggestWireRole } from '../../lib/wire-connections';
import { createIsolatedGuidedBuild, type GuidedWireAddition } from '../../lib/guided-build';
import { loadUiPreferences, saveUiPreferences } from '../../lib/ui-preferences';
import type { LessonStageId } from '../../lib/lesson-stages';
import type { BuildAssessment, AssessmentCheck } from '../../lib/assessment';
import { COMPONENTS, COMPONENT_LIST, applyEquipmentVariant, equipmentPurpose } from '../../lib/components';
import { LESSONS } from '../../lib/lessons';
import { enclosedTerminals, getComponentTerminals } from '../../lib/terminal-layout';
import { measureVoltage } from '../../lib/simulation';
import SimulationWorker from '../../lib/simulation.worker?worker';
import { readRecord, validateCircuit, writeRecord, writeRecordsAtomic, type Progress } from '../../lib/storage';
import type { CircuitDocument, ComponentInstance, Endpoint, SimulationEvent, SimulationResult, TerminalRole, Vec3 } from '../../lib/types';

const clone=<T,>(v:T):T=>structuredClone(v);
const faults=[['open-wire','Open conductor'],['open-live','Open live'],['open-neutral','Open neutral'],['missing-earth','Missing protective conductor'],['short-circuit','Line–neutral short'],['earth-fault','Earth fault'],['overload','Overload'],['wrong-control','Incorrect control'],['phase-loss','Phase loss']];
const format=(n:number|undefined|null,d=2)=>Number.isFinite(n)?n!.toLocaleString('en-IE',{maximumFractionDigits:d,minimumFractionDigits:d}):'—';
const uid=(p:string)=>p+'-'+crypto.randomUUID().slice(0,8);
function movedEquipment(d:CircuitDocument,id:string,position:Vec3){const item=d.components.find(c=>c.id===id)!;const delta=position.map((v,i)=>v-item.position[i]);return d.components.map(c=>c.id===id||!!(item.params.gangGroup&&c.params.gangGroup===item.params.gangGroup)?{...c,position:c.position.map((v,i)=>v+delta[i]) as Vec3}:c);}
function rotatedEquipment(d:CircuitDocument,id:string){const item=d.components.find(c=>c.id===id)!;return d.components.map(c=>{if(c.id!==id&&(!item.params.gangGroup||c.params.gangGroup!==item.params.gangGroup))return c;const dx=c.position[0]-item.position[0],dz=c.position[2]-item.position[2];return {...c,rotation:c.rotation+Math.PI/2,position:[item.position[0]+dz,c.position[1],item.position[2]-dx] as Vec3};});}
function Choice({value,onChange,options,label}:{value:string;onChange:(v:string)=>void;options:{value:string;label:string;icon?:React.ReactNode}[];label:string}){return <Select value={value} onValueChange={onChange}><SelectTrigger aria-label={label} className="choice"><SelectValue/></SelectTrigger><SelectContent>{options.map(o=><SelectItem value={o.value} textValue={o.label} key={o.value}><span className="menu-choice-content">{o.icon??<MenuIcon value={o.value} label={label}/>}<span>{o.label}</span></span></SelectItem>)}</SelectContent></Select>;}
function Tip({label,children}:{label:string;children:React.ReactNode}){return <Tooltip><TooltipTrigger asChild>{children}</TooltipTrigger><TooltipContent>{label}</TooltipContent></Tooltip>;}
function IconButton({label,children,onClick,disabled=false}:{label:string;children:React.ReactNode;onClick:()=>void;disabled?:boolean}){return <Tip label={label}><Button variant="ghost" size="icon" aria-label={label} onClick={onClick} disabled={disabled} className="icon-button">{children}</Button></Tip>;}
function GraphicsUnavailable({list}:{list?:()=>void}){
  return <div className="canvas-error" role="alert"><p>The 3D view couldn’t load. You can use the equipment list to carry on.</p><Button onClick={list}>Open equipment list</Button></div>;
}
const Workbench=React.lazy(()=>import('./Workbench').catch(()=>({default:({onListView}:{onListView?:()=>void})=><GraphicsUnavailable list={onListView}/>})));
const JobSiteView=React.lazy(()=>import('./JobSiteView').catch(()=>({default:({onList}:{onList:()=>void})=><GraphicsUnavailable list={onList}/>})));
const initialLesson=LESSONS.find(l=>l.id===7)??LESSONS[0];

export default function Lab({startWithList=false}:{startWithList?:boolean}={}){
  const touchLayout = useCompactWorkbench();
  const [path,setPath]=useState<'home'|'coursebook'|'full'>('home');
  const [startActivity,setStartActivity]=useState<string>();
  const lastBenchFps=useRef(0);
  const [settingsFps,setSettingsFps]=useState(0);
  const reportBenchFps=useCallback((value:number)=>{lastBenchFps.current=value;},[]);
  const [callOperation,setCallOperation]=useState<CallOperation>();
  const [savedCallView,setSavedCallView]=useState('');
  const [showJobs,setShowJobs]=useState(false);
  const [sessionKey,setSessionKey]=useState(0);
  const [listView,setListView]=useState(startWithList);
  const [surface,setSurface]=useState<'site'|'bench'|'drawing'>('site');
  const [planTrace,setPlanTrace]=useState<{sequence:number;wire:string;docId:string}>();
  const [drawingOpened,setDrawingOpened]=useState(false),[drawingWire,setDrawingWire]=useState<string>();
  const sitePose=useRef<SitePose|undefined>(undefined);
  const [siteJump,setSiteJump]=useState<{id:number;component?:string}>({id:0});
  const [bookmark,setBookmark]=useState<LessonBookmark>();
  const [manualInspection,setManualInspection]=useState<{component:string;part:string}>();
  const [cableChoice,setCableChoice]=useState<CableChoice>();
  const probePlacement=useRef({red:false,black:false,current:false});
  const scoredFault=useRef(false);
  const testButton=useRef<{circuit:string;component:string}|undefined>(undefined);
  const [scored,setScored]=useState(false);
  const activityCircuit=useRef('');

  const [sheetOpen, setSheetOpen] = useState(true);
  const [moveTarget, setMoveTarget] = useState<string>();
  const [conductorPickerOpen, setConductorPickerOpen] = useState(false);
  const [practice, setPractice] = useState<{ experiment: QuickPracticeExperiment; circuitId: string }>();
  const [practicePrompt, setPracticePrompt] = useState('');
  const [dimmingActive, setDimmingActive] = useState(false);
  const [mounted,setMounted]=useState(false),[document,setDocument]=useState<CircuitDocument>(()=>clone(initialLesson.circuit));
  const [hydrated,setHydrated]=useState(false);
  const [mode,setMode]=useState('explore'),[tool,setTool]=useState<Tool>('select'),[lessonId,setLessonId]=useState(initialLesson.id);
  const [query,setQuery]=useState(''),[category,setCategory]=useState('all'),[selected,setSelected]=useState<string>(),[selectedPart,setSelectedPart]=useState('body'),[pickedDetail,setPickedDetail]=useState<{component:string;part:string;id:string}>(),[selectedWire,setSelectedWire]=useState<string>();
  const [panel,setPanel]=useState('lesson'),[view,setView]=useState<InspectionView>('normal'),[labels,setLabels]=useState(true),[paths,setPaths]=useState(true);
  const [depth,setDepth]=useState<'foundation'|'apprentice'>('foundation'),[quality,setQuality]=useState<'auto'|'high'|'economy'>('auto'),[pathFilter,setPathFilter]=useState<'all'|'L'|'N'|'PE'|'control'|'none'>('all');
  const [cameraMode,setCameraMode]=useState<CameraMode>('orbit'),[cameraSpeed,setCameraSpeed]=useState(DEFAULT_CAMERA_SPEED),[scenery,setScenery]=useState<SceneryId>(DEFAULT_SCENERY);
  const [inspectorCollapsed,setInspectorCollapsed]=useState(false),[fullscreen,setFull]=useState(false),[activeActivity,setActiveActivity]=useState<LessonActivity>();
  const [workspace,setWorkspace]=useState<'learn'|'sandbox'>('learn'),[courseStage,setCourseStage]=useState<LessonStageId>('look');
  const [coursesOpen,setCoursesOpen]=useState(false),[courseDestination,setCourseDestination]=useState<'learn'|'sandbox'>('learn'),[buildsOpen,setBuildsOpen]=useState(false),[moreOpen,setMoreOpen]=useState(false),[viewOpen,setViewOpen]=useState(false);
  const [equipmentQuery,setEquipmentQuery]=useState(''),[equipmentGroup,setEquipmentGroup]=useState('all'),[liveHints,setLiveHints]=useState(true),[hoverTerminal,setHoverTerminal]=useState<Endpoint>();
  const [replacePrompt,setReplacePrompt]=useState<{title:string;action:(preservedBuild?:CircuitDocument)=>void}>(),[replaceBusy,setReplaceBusy]=useState(false);
  const baseline=useRef('');
  const fingerprintLayout=(d:CircuitDocument)=>JSON.stringify({...d,revision:0});
  const [placeType,setPlaceType]=useState('lamp'),[wireRole,setWireRole]=useState<TerminalRole>('L'),[pendingEnd,setPendingEnd]=useState<{circuit:string;point:Endpoint}>();
  const wireStart=useMemo(()=>pendingEnd?.circuit===document.id&&describeEndpoint(document,pendingEnd.point)?pendingEnd.point:undefined,[pendingEnd,document]);
  const [wireRoleOverride,setWireRoleOverride]=useState(false),[wireAddition,setWireAddition]=useState<GuidedWireAddition>();
  useEffect(()=>{if(pendingEnd&&!wireStart){setPendingEnd(undefined);setWireRoleOverride(false);}},[pendingEnd,wireStart]);
  const [guidedSession,setGuidedSession]=useState<string>();
  const [wallSwitchPress,setWallSwitchPress]=useState<{circuitId:string;revision:number}>();
  const wireAdditionSequence=useRef(0);
  const [history,setHistory]=useState<CircuitDocument[]>([]),[future,setFuture]=useState<CircuitDocument[]>([]);
  const [result,setResult]=useState<SimulationResult>(),[simError,setSimError]=useState(''),[cameraCommand,setCamera]=useState({id:0,action:'first-light'});
  const [progress,setProgress]=useState<StudyProgress>(()=>migrateProgress(undefined)),[saveStatus,setSaveStatus]=useState('Loading saved work'),[notice,setNotice]=useState('');
  const [meterMode,setMeterMode]=useState('voltage'),[probeA,setProbeA]=useState<Endpoint>(),[probeB,setProbeB]=useState<Endpoint>(),[activeProbe,setActiveProbe]=useState<'red'|'black'>('red'),[resistance,setResistance]=useState<{value:number|null;explanation:string;status?:'value'|'open'|'unresolved'}>();
  const [challengeStarted,setChallengeStarted]=useState(false),[hints,setHints]=useState(0),[diagnosis,setDiagnosis]=useState('open-live'),[events,setEvents]=useState<SimulationEvent[]>([]);
  const [savedBuilds,setSavedBuilds]=useState<CircuitDocument[]>([]);
  const [diagnosisAccepted,setDiagnosisAccepted]=useState(false),[challengeRepaired,setChallengeRepaired]=useState(false);
  const [backupBusy,setBackupBusy]=useState(false);
  const challengeRef=useRef({accepted:false,repaired:false,lessonId:initialLesson.id,hints:0,circuitId:''});
  const [assessment,setAssessment]=useState<BuildAssessment>(),[pendingTest,setPendingTest]=useState<{revision:number;circuitId:string}>();
  const [assessmentKey,setAssessmentKey]=useState<string>();
  const testSequence=useRef(0),activeTest=useRef<{id:number;revision:number;circuitId:string;mode:string}|null>(null),testTimeout=useRef<ReturnType<typeof setTimeout>|null>(null);
  const diagnosisRequest=useRef<{id:number;hints:number;lessonId:number}|null>(null);
  const [instrumentChoice,setInstrumentChoice]=useState<'study'|'t6'>();
  const useFork=instrumentChoice?instrumentChoice==='t6':workspace==='sandbox'||lessonId===7||lessonId>64;
  const [forkMethod,setForkMethod]=useState<ForkMethod>('probe-voltage'),[forkReference,setForkReference]=useState<ForkReference>('none');
  const [testerLight,setTesterLight]=useState(false);
  const [forkSelectingReference,setForkSelectingReference]=useState(false),[heldReading,setHeldReading]=useState<ForkReading>();
  const [forkPreview,setForkPreview]=useState<{key:string;reading:ForkReading}>();
  const [handTool,setHandTool]=useState<WorkshopVisual>();
  const [sampleRequest,setSampleRequest]=useState<{id:PreparationTask;version:number}>();
  const workshopAction=useRef<(()=>void)|undefined>(undefined);
  const forkSetup=useMemo<ForkSetup>(()=>({method:forkMethod,reference:forkReference,
    a:forkMethod==='off'||forkMethod.startsWith('fork')?undefined:probeA,b:forkMethod==='off'?undefined:forkMethod.startsWith('fork')?(forkReference==='black'?probeB:undefined):probeB,
    wire:forkMethod.startsWith('fork')?selectedWire:undefined}),[forkMethod,forkReference,probeA,probeB,selectedWire]);
  const forkKey=JSON.stringify([document.id,document.revision,forkSetup]);
  const evidenceSlot=useRef(lessonId);evidenceSlot.current=lessonId;
  const forkKeyRef=useRef(forkKey);forkKeyRef.current=forkKey;
  const worker=useRef<Worker|null>(null),docRef=useRef(document),dragBefore=useRef<CircuitDocument|null>(null),dimmerBefore=useRef<CircuitDocument|null>(null),saveTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const restoring=useRef(false);
  const freshWorkerState=useRef(false);
  const persistDraft = useCallback(() => {
    if (!saveTimer.current || restoring.current) return;
    clearTimeout(saveTimer.current);
    saveTimer.current = null;
    void writeRecord('draft', docRef.current).then(() => {
      if (!saveTimer.current) setSaveStatus('Saved on this device');
    }).catch(() => setSaveStatus('Storage unavailable. Export a backup to keep your work.'));
  }, []);
  useEffect(() => {
    const page = globalThis.document;
    const onVisibility = () => { if (page.hidden) persistDraft(); };
    page.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', persistDraft);
    return () => {
      page.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', persistDraft);
      persistDraft();
    };
  }, [persistDraft]);
  const pulseTimers=useRef(new Map<string,ReturnType<typeof setTimeout>>());
  const simulationKey=useMemo(()=>electricalKey(document),[document]);
  const currentTestKey=useMemo(()=>testFingerprint(document),[document]);
  const electricalIdentity=useRef({key:simulationKey,generation:1}),lastRequestedGeneration=useRef(0),lastSolvedGeneration=useRef(0);
  useLayoutEffect(()=>{docRef.current=document;if(electricalIdentity.current.key!==simulationKey||freshWorkerState.current)electricalIdentity.current={key:simulationKey,generation:electricalIdentity.current.generation+1};},[document,simulationKey]);
  const lesson=LESSONS.find(l=>l.id===lessonId)??initialLesson,component=document.components.find(c=>c.id===selected),definition=component?COMPONENTS[component.type]:undefined,wire=document.wires.find(w=>w.id===selectedWire);
  const testRunning=!!pendingTest&&pendingTest.revision===document.revision&&pendingTest.circuitId===document.id;
  const assessmentStale=!!assessment&&(assessment.revision!==document.revision||assessment.circuitId!==document.id||assessmentKey!==currentTestKey);
  const learningRecord=progress.learning[lessonId]??emptyLearningRecord(),evidence=learningRecord.evidence;
  const investigating=mode==='challenges'&&challengeStarted&&!diagnosisAccepted;
  const visibleAssessment=assessment&&investigating?{...assessment,checks:assessment.checks.filter(c=>!c.id.startsWith('fault:')).map(c=>c.category==='protection'&&c.status==='fail'?{...c,title:'Check the circuit protection',explanation:'Follow the feed, neutral and earth at the fitting. Take two readings before choosing the fault.'}:c)}:assessment;
  const dueReview=useMemo(()=>reviewQueue(progress),[progress]);
  const suggestedPractice = useMemo(() => chooseQuickPractice(progress), [progress]);
  const activePractice = workspace === 'learn' && practice?.circuitId === document.id ? practice.experiment : undefined;
  const practicePromptChanged = useCallback((phase: 'predict' | 'operate' | 'compare', message: string) => {
    setPracticePrompt(message);
    if (phase === 'compare') setSheetOpen(true);
  }, []);
  const currentCall=workspace==='learn'&&path==='coursebook'&&!activePractice?HOUSE_CALLS.find(call=>call.lesson===document.lessonId&&savedCallStep(call,startActivity)!==undefined):undefined;
  const followingCall=currentCall?nextHouseCall(currentCall,progress):undefined;
  const callView=currentCall?JSON.stringify([document.id,document.revision]):'';
  const savedCall=bookmark&&HOUSE_CALLS.find(call=>call.lesson===bookmark.circuit.lessonId&&savedCallStep(call,bookmark.activityId)!==undefined);
  const activityChanged=useCallback((activity:LessonActivity|undefined)=>{
    activityCircuit.current=docRef.current.id;
    setActiveActivity(activity);
  },[]);
  useEffect(()=>{
    const activityId=currentCall?startActivity:activeActivity?.id;
    if(!hydrated || restoring.current || workspace!=='learn' || path==='home' || activePractice ||
      !activityId || !document.lessonId || (!currentCall && activityCircuit.current!==document.id) ||
      !new RegExp('^(lesson|book):'+document.lessonId+':').test(activityId))return;
    const saved:LessonBookmark={version:1,circuit:document,activityId,path,
      mode:mode==='challenges'?'challenges':mode==='build'?'build':'explore',
      ...(challengeStarted?{fault:{hints,accepted:diagnosisAccepted,repaired:challengeRepaired,scored}}:{})};
    setBookmark(saved);
    // A learner may close the app after a wrong turn as well as after a checked step.
    let active=true;
    void writeRecordsAtomic({bookmark:saved,draft:document})
      .catch(()=>{if(active)setSaveStatus('Could not save the lesson position.');})
      .then(()=>{if(active&&callView)setSavedCallView(callView);});
    return ()=>{active=false;};
  },[hydrated,workspace,path,activePractice,activeActivity,startActivity,currentCall,callView,document,mode,challengeStarted,hints,diagnosisAccepted,challengeRepaired,scored]);
  const lampMeterDemo=workspace==='learn'&&path!=='home'&&activeActivity?.bookStep==='meter-demo'&&document.lessonId===7;
  useEffect(()=>{
    if(!lampMeterDemo||!docRef.current.components.some(c=>c.id==='light'&&c.type==='lamp'))return;
    // Stage the real probes for the worked reading. The following task starts with clean leads.
    probePlacement.current={red:false,black:false,current:false};
    setForkMethod('probe-voltage');setMeterMode('voltage');setHeldReading(undefined);setInstrumentChoice('t6');
    setProbeA({component:'light',terminal:'L'});setProbeB({component:'light',terminal:'N'});
    setTool('meter');setSurface('bench');setSelected('light');setSelectedPart('terminals');setView('open');
    setCamera(previous=>({id:previous.id+1,action:'rear'}));setPanel('');setInspectorCollapsed(true);
    return ()=>{
      probePlacement.current={red:false,black:false,current:false};
      setProbeA(undefined);setProbeB(undefined);setActiveProbe('red');setHeldReading(undefined);
    };
  },[lampMeterDemo,document.id]);
  const categories=useMemo(()=>Array.from(new Set(LESSONS.map(l=>l.category))),[]);
  const shown=useMemo(()=>LESSONS.filter(l=>(category==='all'||l.category===category)&&`${l.id} ${l.title} ${l.summary}`.toLowerCase().includes(query.toLowerCase())),[query,category]);
  const voltage=probeA&&probeB&&result?.revision===document.revision?measureVoltage(result,probeA,probeB):undefined;
  const current=selectedWire&&result?.revision===document.revision&&result.wireCurrents[selectedWire]?Math.hypot(result.wireCurrents[selectedWire].re,result.wireCurrents[selectedWire].im):null;
  const liveFork=useMemo(()=>forkMethod==='resistance'&&forkPreview?.key===forkKey?forkPreview.reading:forkRead(document,result,forkSetup),[document,result,forkMethod,forkPreview,forkSetup,forkKey]);
  const visibleFork=heldReading??liveFork;
  const forkVoltage=useMemo(()=>forkMethod==='fork-current'&&forkReference!=='none'?forkRead(document,result,{...forkSetup,method:'fork-voltage'}):liveFork,[forkMethod,forkReference,document,result,forkSetup,liveFork]);
  const hasReference=forkMethod.startsWith('fork')&&forkVoltage.unit==='V'&&forkVoltage.status==='value';
  const voltageLight=forkVoltage.unit==='V'&&(forkVoltage.status==='overrange'||forkVoltage.value!==null&&Math.abs(forkVoltage.value)>=30);
  const meterTargetMode=useFork?(forkMethod.startsWith('fork')&&!forkSelectingReference?'current':forkMode(forkMethod)):meterMode;
  useEffect(()=>{
    if(document.supply.enabled||!useFork||tool!=='meter'||forkMethod!=='resistance'||!forkSetup.a||!forkSetup.b||!result?.converged||result.revision!==document.revision)return;
    worker.current?.postMessage({kind:'instrument-preview',document,key:forkKey,setup:forkSetup});
  },[useFork,tool,forkMethod,forkKey,forkSetup,document,result?.converged,result?.revision]);
  const reading=meterMode==='voltage'?voltage:meterMode==='resistance'?resistance:{value:current,explanation:current===null?'Choose a wire to read its current.':'This is how many amps are flowing through the wire.'};
  useEffect(()=>{let live=true;queueMicrotask(()=>{if(live)setMounted(true);});Promise.all([readRecord<CircuitDocument>('draft'),readRecord<Progress>('progress'),readRecord<CircuitDocument[]>('builds'),loadUiPreferences(),loadPresentationPreferences(),readRecord('bookmark')]).then(([d,p,b,prefs,presentation,storedBookmark])=>{if(!live)return;if(storedBookmark){try{setBookmark(validateBookmark(storedBookmark));}catch{setNotice('Your saved lesson position could not be opened. Your builds are available in My builds.');}}setLiveHints(prefs.liveHints);setDepth(prefs.courseDepth);setCameraMode(presentation.cameraMode);setCameraSpeed(presentation.cameraSpeed);setScenery(presentation.scenery);setQuality(presentation.quality);if(d){const valid=validateCircuit(d);setDocument(valid);if(!valid.lessonId)setWorkspace('sandbox');if(valid.lessonId)setLessonId(valid.lessonId);}if(Array.isArray(b))setSavedBuilds(b);if(!storedBookmark&&d?.lessonId&&(d.id!=='lesson-7'||fingerprintLayout(d)!==fingerprintLayout(initialLesson.circuit))){const oldLesson=LESSONS.find(l=>l.id===d.lessonId);if(oldLesson){
      const first=oldLesson.circuit.components[0];if(first)setBookmark({version:1,circuit:validateCircuit(d),activityId:'lesson:'+d.lessonId+':inspect:'+first.id,path:'full',mode:d.id.startsWith('guided')?'build':'explore'});}}
    const restoredProgress=migrateProgress(p);setProgress(restoredProgress);const savedTest=restoredProgress.lastTest;if(savedTest&&!obsoleteEmptyPass(savedTest,d??initialLesson.circuit)){setAssessmentKey(savedTest.fingerprint);setAssessment({...savedTest.assessment,...testRecordMatches(savedTest,d??initialLesson.circuit)?{revision:(d??initialLesson.circuit).revision}:{}});}baseline.current=fingerprintLayout(d?.lessonId?LESSONS.find(l=>l.id===d.lessonId)?.circuit??initialLesson.circuit:initialLesson.circuit);setSaveStatus('Saved on this device');}).catch(()=>{if(live)setSaveStatus('Storage unavailable · use Export');}).finally(()=>{if(live)setHydrated(true);});return()=>{live=false;};},[]);
  useEffect(()=>{
    if(!mounted)return;
    const w=new SimulationWorker();worker.current=w;
    let tick:ReturnType<typeof setTimeout>|undefined;
    const stopTick=()=>{if(tick)clearTimeout(tick);tick=undefined;};
    const schedule=(needed:boolean)=>{stopTick();if(needed&&!globalThis.document.hidden)tick=setTimeout(()=>w.postMessage({document:docRef.current,electricalGeneration:electricalIdentity.current.generation,dt:.25}),250);};
    w.onmessage=e=>{
      const m=e.data;
      if(m.kind==='result'&&acceptsElectricalResult({id:docRef.current.id,revision:docRef.current.revision,generation:electricalIdentity.current.generation},{circuitId:m.circuitId,revision:m.result.revision,electricalGeneration:m.electricalGeneration})){lastSolvedGeneration.current=electricalIdentity.current.generation;setResult({...m.result,revision:docRef.current.revision});setSimError('');schedule(!!m.needsTick);
        const pressed=testButton.current;
        if(pressed&&pressed.circuit===docRef.current.id&&docRef.current.components.find(c=>c.id===pressed.component)?.params.testPressed){
          testButton.current=undefined;setDocument(d=>({...d,revision:d.revision+1,components:d.components.map(c=>c.id===pressed.component?{...c,params:{...c.params,testPressed:false}}:c)}));
        }if(m.result.events?.length)setEvents(old=>[...m.result.events,...old].slice(0,30));}
      if(m.kind==='instrument-preview'&&m.key===forkKeyRef.current&&m.revision===docRef.current.revision&&m.circuitId===docRef.current.id)setForkPreview({key:m.key,reading:m.reading});
      if(!restoring.current&&m.kind==='measurement'&&m.revision===docRef.current.revision&&m.circuitId===docRef.current.id){setResistance({value:m.value,explanation:m.explanation,status:m.evidence?.status});if(m.evidence&&m.evidence.status!=='unresolved'){const slot=docRef.current.lessonId??evidenceSlot.current;setProgress(p=>recordEvidence(p,slot,m.evidence));setNotice((m.evidence.instrument?.displayed??(m.value===null?'OL':format(m.value)))+' Ω recorded.');}}
      if(!restoring.current&&m.kind==='diagnosis'&&diagnosisRequest.current?.id===m.requestId&&m.revision===docRef.current.revision&&m.circuitId===docRef.current.id){diagnosisRequest.current=null;if(!m.accepted)setNotice(m.explanation);else {challengeRef.current.accepted=true;setDiagnosisAccepted(true);setNotice(`Diagnosis accepted. Repair the defect and run the tests to finish. ${m.explanation}`);}}
      const request=activeTest.current;
      if(!restoring.current&&m.kind==='assessment'&&request&&request.id===m.requestId){
        if(testTimeout.current)clearTimeout(testTimeout.current);activeTest.current=null;setPendingTest(undefined);
        const a=m.assessment as BuildAssessment;
        if(a.revision===docRef.current.revision&&a.circuitId===docRef.current.id){setAssessment(a);const completed=captureTestRecord(docRef.current,a);setAssessmentKey(completed.fingerprint);setProgress(p=>({...p,lastTest:completed}));setNotice('');if(a.passed&&request.mode==='build'&&docRef.current.lessonId){const id=docRef.current.lessonId;setProgress(p=>({...p,builds:Array.from(new Set([...p.builds,id]))}));}const challenge=challengeRef.current;if(a.passed&&challenge.accepted&&challenge.repaired&&a.circuitId===challenge.circuitId){const score=Math.max(40,100-challenge.hints*15);setProgress(p=>({...recordActivity(p,challenge.lessonId,'fault-repaired','diagnosis-and-repair',true),faults:Array.from(new Set([...p.faults,challenge.lessonId])),scores:scoredFault.current?{...p.scores,[challenge.lessonId]:Math.max(p.scores[challenge.lessonId]??0,score)}:p.scores}));challenge.accepted=false;setNotice(scoredFault.current?'Fault repaired and retested · '+score+'/100.':'The repair passed. Your readings are saved.');}}
      }
      if(m.kind==='error'&&m.revision===docRef.current.revision){setSimError(m.message);if(request&&request.id===m.requestId){if(testTimeout.current)clearTimeout(testTimeout.current);activeTest.current=null;setPendingTest(undefined);setAssessment({revision:request.revision,circuitId:request.circuitId,passed:false,summary:'Test could not finish.',checks:[{id:'worker-error',category:'model',status:'fail',title:'Test calculation failed',explanation:m.message}]});}}
    };
    w.onerror=e=>setSimError('The circuit worker failed: '+e.message);
    const visibility=()=>{stopTick();if(!globalThis.document.hidden)w.postMessage({document:docRef.current,electricalGeneration:electricalIdentity.current.generation,dt:0});};
    globalThis.document.addEventListener('visibilitychange',visibility);lastRequestedGeneration.current=electricalIdentity.current.generation;w.postMessage({document:docRef.current,electricalGeneration:electricalIdentity.current.generation,dt:.1});
    return()=>{stopTick();globalThis.document.removeEventListener('visibilitychange',visibility);if(testTimeout.current)clearTimeout(testTimeout.current);w.terminate();worker.current=null;activeTest.current=null;};
  },[mounted]);
  useEffect(()=>{if(!mounted)return;const generation=electricalIdentity.current.generation;if(lastRequestedGeneration.current!==generation){lastRequestedGeneration.current=generation;worker.current?.postMessage({document,electricalGeneration:generation,dt:.05,reset:freshWorkerState.current});freshWorkerState.current=false;}else if(lastSolvedGeneration.current===generation){queueMicrotask(()=>setResult(previous=>previous?{...previous,revision:document.revision}:previous));}if(!hydrated)return;queueMicrotask(()=>{setResistance(undefined);setSaveStatus('Saving…');});if(saveTimer.current)clearTimeout(saveTimer.current);if(!restoring.current)saveTimer.current=setTimeout(persistDraft,450);},[document,mounted,hydrated,persistDraft]);
  useEffect(()=>{if(mounted&&hydrated&&!restoring.current)writeRecord('progress',progress).catch(()=>{});},[progress,mounted,hydrated]);
  useEffect(()=>{if(!hydrated||restoring.current||!assessment||assessmentKey!==currentTestKey||assessment.revision!==document.revision||assessment.circuitId!==document.id)return;const saved=captureTestRecord(document,assessment);setAssessmentKey(saved.fingerprint);setProgress(previous=>previous.lastTest?.fingerprint===saved.fingerprint&&JSON.stringify({...previous.lastTest.assessment,revision:0})===JSON.stringify({...saved.assessment,revision:0})?previous:{...previous,lastTest:saved});},[assessment,assessmentKey,currentTestKey,document,hydrated]);
  useEffect(()=>observeFullscreen(setFull),[]);
  useEffect(()=>{if(hydrated)saveUiPreferences({version:1,liveHints,courseDepth:depth}).catch(()=>{});},[hydrated,liveHints,depth]);
  useEffect(()=>{if(hydrated)savePresentationPreferences({version:1,cameraMode,cameraSpeed,scenery,quality}).catch(()=>{});},[hydrated,cameraMode,cameraSpeed,scenery,quality]);
  useEffect(()=>{if(!notice)return;const t=setTimeout(()=>setNotice(''),6500);return()=>clearTimeout(t);},[notice]);
  useEffect(()=>{const timers=pulseTimers.current;return()=>{for(const timer of timers.values())clearTimeout(timer);timers.clear();};},[document.id]);
  function clearProbes(){
    setHeldReading(undefined);setForkPreview(undefined);setForkSelectingReference(false);
    probePlacement.current={red:false,black:false,current:false};
    setProbeA(undefined);setProbeB(undefined);setActiveProbe('red');setResistance(undefined);
  }
  function commit(next:CircuitDocument,replacing=false){next=cleanCableRuns(normalizeBoardMounts(next,docRef.current));if(replacing||next.id!==docRef.current.id){setHistory([]);clearProbes();cancelConnection();}else setHistory(h=>[...h.slice(-39),clone(docRef.current)]);setFuture([]);setDocument({...next,revision:docRef.current.revision+1});}
  function patch(id:string,params:ComponentInstance['params']){commit({...docRef.current,components:docRef.current.components.map(c=>c.id===id?{...c,params:{...c.params,...params}}:c)});}
  function startDimming(){if(!dimmerBefore.current)dimmerBefore.current=clone(docRef.current);setDimmingActive(true);}
  function changeDimming(id:string,level:number){if(!dimmerBefore.current){patch(id,{level});return;}const d=docRef.current;setDocument({...d,revision:d.revision+1,components:d.components.map(c=>c.id===id?{...c,params:{...c.params,level}}:c)});}
  function endDimming(){setDimmingActive(false);const before=dimmerBefore.current;dimmerBefore.current=null;if(before&&fingerprintLayout(before)!==fingerprintLayout(docRef.current)){setHistory(h=>[...h.slice(-39),before]);setFuture([]);}}
  function pairContactor(id:string,partner:string){commit({...document,components:document.components.map(c=>c.id===id?{...c,params:{...c.params,mechanicallyInterlockedWith:partner}}:c.id===partner?{...c,params:{...c.params,mechanicallyInterlockedWith:id}}:c.params.mechanicallyInterlockedWith===id||!!(partner&&c.params.mechanicallyInterlockedWith===partner)?{...c,params:{...c.params,mechanicallyInterlockedWith:''}}:c)});}
  function undo(){if(!history.length)return;setFuture(f=>[clone(docRef.current),...f]);setDocument({...clone(history.at(-1)!),revision:docRef.current.revision+1});setHistory(h=>h.slice(0,-1));}
  function undoGuidedWire(addition:GuidedWireAddition){
    const current=docRef.current,previous=history.at(-1);
    if(!previous||current.id!==addition.circuitId||current.revision!==addition.revision||
      !current.wires.some(w=>w.id===addition.wireId)||previous.wires.some(w=>w.id===addition.wireId))return false;
    undo();cancelConnection();return true;
  }
  function redo(){if(!future.length)return;setHistory(h=>[...h,clone(docRef.current)]);setDocument({...clone(future[0]),revision:docRef.current.revision+1});setFuture(f=>f.slice(1));}
  const undoRef=useRef(undo),redoRef=useRef(redo),deleteWireRef=useRef(()=>{});useLayoutEffect(()=>{undoRef.current=undo;redoRef.current=redo;deleteWireRef.current=()=>{if(surface==='drawing'||workspace==='learn'&&surface==='site'||!selectedWire)return;const current=docRef.current;if(!current.wires.some(w=>w.id===selectedWire))return;commit({...current,wires:current.wires.filter(w=>w.id!==selectedWire),faults:current.faults.filter(f=>f.wire!==selectedWire)});setSelectedWire(undefined);setPanel('');setInspectorCollapsed(true);setNotice('Wire deleted. Undo restores its connections. Retest the edited circuit.');};});
  useEffect(()=>{const key=(e:KeyboardEvent)=>{if(!(e.target instanceof Element))return;if((e.target as HTMLElement)?.matches('input,textarea,select,[contenteditable],[role=textbox],[role=combobox]' )||(e.target as HTMLElement)?.closest('[role=dialog],[role=listbox],[contenteditable=true]'))return;if(e.key==='Backspace'&&!e.ctrlKey&&!e.metaKey&&!e.altKey){e.preventDefault();deleteWireRef.current();return;}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();if(e.shiftKey)redoRef.current();else undoRef.current();}if(e.key==='Escape'){cancelConnection();setTool('select');}};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);},[]);
  function loadLesson(id:number){sitePose.current=undefined;setSiteJump({id:0});setDrawingOpened(false);setDrawingWire(undefined);setPlanTrace(undefined);setSurface('site');setNotice('');freshWorkerState.current=true;setCableChoice(undefined);probePlacement.current={red:false,black:false,current:false};setManualInspection(undefined);setActiveActivity(undefined);activityCircuit.current='';setPractice(undefined);setMoveTarget(undefined);cancelConnection();const l=LESSONS.find(x=>x.id===id)!;baseline.current=fingerprintLayout(l.circuit);commit(clone(l.circuit),true);setLessonId(id);setSelected(undefined);setSelectedWire(undefined);setPanel('lesson');setTool('select');setView('normal');clearProbes();setChallengeStarted(false);setHints(0);setEvents([]);setCamera(c=>({id:c.id+1,action:'fit'}));}
  function newBuild(){setCableChoice(undefined);setPractice(undefined);setMoveTarget(undefined);cancelConnection();const empty:CircuitDocument={version:1,id:uid('build'),name:'My circuit',revision:0,supply:{enabled:false,phase:'single',voltage:240,frequency:50,sourceResistance:.12},components:[],wires:[],faults:[]};baseline.current=fingerprintLayout(empty);commit(empty);setWorkspace('sandbox');setMode('build');setTool('select');setPanel('');setInspectorCollapsed(true);setChallengeStarted(false);setDiagnosisAccepted(false);setPlaceType('source');setSelected(undefined);setSelectedWire(undefined);setNotice('Place a supply on the workbench, then add your equipment.');}
  async function saveBuild():Promise<boolean>{if(savedBuilds.length>=BACKUP_LIMITS.builds){setNotice('Saved builds are full. Export a backup and remove a saved copy first.');return false;}const current=clone(docRef.current),snapshot={...current,id:uid('saved')},previous=savedBuilds,next=[snapshot,...previous];try{await writeRecord('builds',next);setSavedBuilds(next);baseline.current=fingerprintLayout(current);setNotice('Saved in My builds.');return true;}catch{setNotice('Could not save this build. Your current circuit is preserved.');return false;}}
  function removeSavedBuild(id:string){const previous=savedBuilds,next=previous.filter(b=>b.id!==id);setSavedBuilds(next);writeRecord('builds',next).then(()=>setNotice('Saved copy removed.')).catch(()=>{setSavedBuilds(previous);setNotice('Could not remove that saved copy.');});}
  function guidedBuild(){setSurface('bench');setMoveTarget(undefined);setCableChoice(undefined);const d=path==='coursebook'?createCoursebookBuild(lesson,uid('guided'),CHAPTERS.some(c=>c.practical===lesson.id)):createIsolatedGuidedBuild(lesson.circuit,uid('guided'));commit(d);cancelConnection();setGuidedSession(d.id);setWorkspace('learn');setMode('build');setChallengeStarted(false);setDiagnosisAccepted(false);setTool('wire');setPanel('connect');setInspectorCollapsed(false);setView('open');setCamera(c=>({id:c.id+1,action:'rear'}));setNotice('Equipment is laid out with the simulated sources off. Correct connections are checked automatically.');}
  function selectComponent(id:string,part='',showTools=true,detail?:string){setPickedDetail(detail?{component:id,part,id:detail}:undefined);setMoveTarget(undefined);if(showTools)setSheetOpen(true);setInspectorCollapsed(false);if(id==='@meter'){setPanel('meter');return;}setSelected(id);setSelectedWire(undefined);setSelectedPart(part);setPanel('inspect');if(tool==='inspect'){const picked=docRef.current.components.find(c=>c.id===id);const face=picked&&detail&&fittingDetails(picked,COMPONENTS[picked.type]).find(d=>d.id===detail)?.face;setCamera(c=>({id:c.id+1,action:face==='service'?'focus-service-detail':'focus'}));}}
  function selectPhysicalPart(id:string,part='body',detail?:string){setManualInspection({component:id,part});const picked=docRef.current.components.find(c=>c.id===id);if(picked&&Object.values(terminations).some(s=>s.tool===picked.type)){openWorkshopTool(picked.type);return;}if(id==='@meter'||docRef.current.components.find(c=>c.id===id)?.type==='forktester'){setPanel('meter');setTool('meter');setSheetOpen(true);setInspectorCollapsed(false);if(id==='@meter'&&handTool){workshopAction.current?.();return;}if(id!=='@meter'){setInstrumentChoice('t6');physicalInstrument(part);}else if(useFork)physicalInstrument(part);else if(part==='actuator')setMeterMode(previous=>previous==='voltage'?'current':previous==='current'?'resistance':'voltage');return;}selectComponent(id,part,!touchLayout||part!=='actuator'||docRef.current.components.find(c=>c.id===id)?.type==='dimmer',detail);const c=docRef.current.components.find(c=>c.id===id);if(c&&['gammaboard','invictaboard'].includes(c.type)&&part==='door'&&(tool==='select'||tool==='inspect')){patch(c.id,{doorOpen:c.params.doorOpen===false});return;}if(c&&part==='test'&&(tool==='select'||tool==='inspect')){pressTest(c);return;}if(c&&part==='actuator'&&(tool==='select'||tool==='inspect')&&['proximity','pwmcontrol','switch','switch2','intermediate','dimmer','pushbutton','selector','changeover','isolator','isolator3','mcb','mcb3','rcd','rcd3','rcbo','fcu','sensor'].includes(c.type))operate(c);}
  function pressTest(c:ComponentInstance){testButton.current={circuit:docRef.current.id,component:c.id};patch(c.id,{testPressed:true});}
  function cancelConnection(){setPendingEnd(undefined);setWireRoleOverride(false);}
  function terminal(e:Endpoint){setPickedDetail(undefined);setManualInspection({component:e.component,part:e.terminal});setMoveTarget(undefined);setSelected(e.component);setSelectedPart(e.terminal);if(tool==='wire'){setSelectedWire(undefined);setPanel('connect');setInspectorCollapsed(false);
    const current=docRef.current,expected=current.lessonId===lesson.id?lesson.circuit:undefined;
    if(!wireStart){setPendingEnd({circuit:current.id,point:e});if(!wireRoleOverride){const endpoints=activeActivity?.kind==='connect'?activeActivity.endpoints:undefined;const partner=endpoints?.find(target=>target.component!==e.component||target.terminal!==e.terminal);const startsRequestedPair=endpoints?.some(target=>target.component===e.component&&target.terminal===e.terminal);setWireRole(suggestWireRole(current,e,startsRequestedPair?partner:undefined,expected));}return;}
    if(wireStart.component===e.component&&wireStart.terminal===e.terminal){cancelConnection();return;}
    if(current.wires.length>=300){setNotice('The builder supports up to 300 wires.');return;}
    const nextWire={id:uid('w'),from:wireStart,to:e,role:wireRoleOverride?wireRole:suggestWireRole(current,wireStart,e,expected),resistance:.01,bends:[]};
    try {
      const targetWire=activeActivity?.wire ? expected?.wires.find(w=>w.id===activeActivity.wire) : undefined;
      if(workspace==='learn'&&targetWire&&connectionKey(wireStart,e)===connectionKey(targetWire.from,targetWire.to))nextWire.resistance=targetWire.resistance;
      const added=addCableConnection(current,nextWire,cableChoice??suggestedCableChoice(current,targetWire,expected));
      commit(added.document);
      if(cableChoice)setCableChoice(added.choice);
    } catch(error) {setNotice(error instanceof Error?error.message:'Choose an available core.');return;}
    setWireAddition({sequence:++wireAdditionSequence.current,circuitId:current.id,revision:current.revision+1,wireId:nextWire.id});cancelConnection();
  }else if(tool==='meter'){setPanel('meter');setInspectorCollapsed(false);if(useFork&&forkMethod==='fork-voltage'&&forkReference==='black'){setProbeB(e);probePlacement.current.black=true;setForkSelectingReference(false);return;}probePlacement.current[activeProbe]=true;if(activeProbe==='red'){setProbeA(e);setActiveProbe('black');}else{setProbeB(e);if(!probeA)setActiveProbe('red');}}else selectComponent(e.component,e.terminal);}
  function place(position:Vec3,type=placeType){setMoveTarget(undefined);if(document.components.length>=80){setNotice('The builder supports up to 80 components.');return;}const d=COMPONENTS[type];const c:ComponentInstance={id:uid(type),type,label:d.name,position,rotation:0,params:clone(d.defaults)};commit({...document,components:[...document.components,c]});setSelected(c.id);setTool('select');setPanel('inspect');setInspectorCollapsed(false);setNotice(d.name+' added to the bench.');}
  function move(id:string,position:Vec3,stage:'start'|'move'|'end'){if(stage==='start'){dragBefore.current=clone(docRef.current);return;}setDocument(normalizeBoardMounts({...docRef.current,revision:docRef.current.revision+1,components:movedEquipment(docRef.current,id,position)}));if(stage==='end'&&dragBefore.current){const before=dragBefore.current;dragBefore.current=null;setHistory(h=>[...h.slice(-39),before]);setFuture([]);setMoveTarget(undefined);}}
  function remove(){setMoveTarget(undefined);if(wire){commit({...document,wires:document.wires.filter(w=>w.id!==wire.id),faults:document.faults.filter(f=>f.wire!==wire.id)});setSelectedWire(undefined);}else if(component){const removed=new Set(document.components.filter(c=>c.id===component.id||!!(component.params.gangGroup&&c.params.gangGroup===component.params.gangGroup)).map(c=>c.id));const removedWires=new Set(document.wires.filter(w=>removed.has(w.from.component)||removed.has(w.to.component)).map(w=>w.id));commit({...document,components:document.components.filter(c=>!removed.has(c.id)).map(c=>removed.has(String(c.params.mechanicallyInterlockedWith))?{...c,params:{...c.params,mechanicallyInterlockedWith:''}}:c),wires:document.wires.filter(w=>!removedWires.has(w.id)),faults:document.faults.filter(f=>!removed.has(f.component??'')&&!removedWires.has(f.wire??''))});setSelected(undefined);}}
  function operate(c:ComponentInstance){
    if(currentCall && startActivity){
      setCallOperation({component:c.id,activity:startActivity,before:docRef.current,reading:result});
    }
    if(c.id==='switch'&&c.type==='switch'&&docRef.current.lessonId===7){
      setWallSwitchPress({circuitId:docRef.current.id,revision:docRef.current.revision+1});
    }
    const p={...COMPONENTS[c.type].defaults,...c.params};if(c.type==='pwmcontrol'){patch(c.id,{on:!Boolean(p.on)});return;}if(c.type==='proximity'){patch(c.id,{active:!Boolean(p.active)});return;}if(c.type==='pushbutton'){const previous=pulseTimers.current.get(c.id);if(previous)clearTimeout(previous);patch(c.id,{pressed:true});pulseTimers.current.set(c.id,setTimeout(()=>{const d=docRef.current;setDocument({...d,revision:d.revision+1,components:d.components.map(x=>x.id===c.id?{...x,params:{...x.params,pressed:false}}:x)});pulseTimers.current.delete(c.id);},400));}else if(['switch2','intermediate','selector','changeover'].includes(c.type))patch(c.id,{position:Number(p.position)===0?1:0});else if(['sensor','smartrelay','timer','plc','ev','vfd','pv','battery'].includes(c.type))patch(c.id,{on:!Boolean(p.on??p.active??p.demand),active:!Boolean(p.active??p.on??p.demand),demand:!Boolean(p.demand??p.on??p.active)});else patch(c.id,{closed:!Boolean(p.closed??true)});}
  function holdButton(c:ComponentInstance){const pending=pulseTimers.current.get(c.id);if(pending)clearTimeout(pending);pulseTimers.current.delete(c.id);patch(c.id,{pressed:!Boolean(c.params.pressed)});}
  function resetTrips(){commit({...document,components:document.components.map(c=>result?.deviceStates[c.id]?.tripped?{...c,params:{...c.params,resetToken:Number(c.params.resetToken??0)+1,closed:true}}:c)});setNotice('Breakers reset. If the fault is still there, they can trip again.');}
  function inject(type:string,exact=false,base?:CircuitDocument){const d=base??docRef.current;const candidates=d.wires.filter(w=>type==='open-neutral'?w.role==='N':type==='missing-earth'?w.role==='PE':type==='phase-loss'?['L1','L2','L3'].includes(w.role):w.role!=='PE'&&w.role!=='N');const target=d.components.find(c=>['lamp','led','heater','motor','motor3','pump','fan','cooker','shower','boiler','heatpump','socket','emergency'].includes(c.type));if(!exact&&(!target&&['short-circuit','earth-fault','overload'].includes(type)||!candidates.length&&!['short-circuit','earth-fault','overload'].includes(type))){setNotice('This build has no suitable target for that study fault. Add the appropriate equipment and connections first.');return;}commit({...d,faults:[{type,wire:exact?lesson.challenge.wire:candidates.at(-1)?.id,component:exact?lesson.challenge.component:target?.id,enabled:true}]});setEvents([]);}
  function startChallenge(forScore=false){setSurface('bench');scoredFault.current=forScore;setScored(forScore);setPractice(undefined);setMoveTarget(undefined);setSheetOpen(true);cancelConnection();setWorkspace('learn');setMode('challenges');setChallengeStarted(true);setDiagnosisAccepted(false);setChallengeRepaired(false);setHints(0);const example=clone(lesson.circuit);example.id=uid('challenge');challengeRef.current={accepted:false,repaired:false,lessonId:lesson.id,hints:0,circuitId:example.id};inject(lesson.challenge.fault,true,example);clearProbes();setPanel('results');setTool('meter');setInspectorCollapsed(false);setCamera(c=>({id:c.id+1,action:'fit'}));}
  function repair(){commit({...document,faults:[],components:document.components.map(c=>({...c,params:{...c.params,resetToken:Number(c.params.resetToken??0)+1}}))});if(challengeStarted&&challengeRef.current.accepted){challengeRef.current.repaired=true;setChallengeRepaired(true);}setNotice('The repair is in. Test the circuit again.');}
  function markLesson(){setProgress(p=>({...p,lessons:Array.from(new Set([...p.lessons,lessonId]))}));setNotice('Lesson marked as studied.');}
  function runTest(){setSheetOpen(true);const d=docRef.current;setAssessmentKey(testFingerprint(d));setInspectorCollapsed(false);setPanel('results');if(!worker.current){setSimError('The bench is still starting. If it stays here, reopen the app.');return;}const id=++testSequence.current;activeTest.current={id,revision:d.revision,circuitId:d.id,mode:workspace!=='learn'?'sandbox':mode==='build'&&path==='coursebook'&&!CHAPTERS.some(ch=>ch.practical===d.lessonId)?'practice':mode};setPendingTest({revision:d.revision,circuitId:d.id});setAssessment(undefined);if(testTimeout.current)clearTimeout(testTimeout.current);testTimeout.current=setTimeout(()=>{if(activeTest.current?.id!==id)return;activeTest.current=null;setPendingTest(undefined);setAssessment({revision:d.revision,circuitId:d.id,passed:false,summary:'Test could not finish.',checks:[{id:'test-timeout',category:'model',status:'fail',title:'No test response',explanation:'The bench took too long to give a result. Reopen the app and test again.'}]});},10000);worker.current.postMessage({kind:'test',requestId:id,document:d,electricalGeneration:electricalIdentity.current.generation,expected:d.lessonId?LESSONS.find(l=>l.id===d.lessonId)?.circuit:undefined,dt:.1});}
  function inspectCheck(check:AssessmentCheck){setSurface('bench');if(check.wire){setSelectedWire(check.wire);setSelected(undefined);setSheetOpen(true);setPanel('inspect');setInspectorCollapsed(false);}else if(check.component)selectComponent(check.component);setCamera(c=>({id:c.id+1,action:check.wire?'focus-wire':'focus'}));}
  function submit(){if(!worker.current){setNotice('The bench is still starting. If it stays here, reopen the app.');return;}const id=++testSequence.current;diagnosisRequest.current={id,hints,lessonId};worker.current.postMessage({kind:'diagnose',requestId:id,document:docRef.current,electricalGeneration:electricalIdentity.current.generation,diagnosis,evidence,challenge:lesson.challenge,dt:0});setNotice('Checking your diagnosis against the recorded target measurements…');}
  function showHint(){const next=Math.min(hints+1,3);setHints(next);challengeRef.current.hints=next;setNotice(next===1?'Follow the affected power and return paths. Compare supply readings with the equipment that is not behaving as expected.':next===2?'Record a voltage or current reading at the affected equipment, then a second reading across the suspected conductor. Isolated resistance can help identify an interrupted path.':lesson.challenge.hint);}
  function chooseForkMethod(method:ForkMethod){
    setForkMethod(method);setHeldReading(undefined);setForkSelectingReference(false);setMeterMode(forkMode(method));
  }
  function selectForkReference(ref:ForkReference){
    setForkReference(ref);setForkSelectingReference(ref==='black');setHeldReading(undefined);
    if(ref==='black'){setActiveProbe('black');setProbeB(undefined);probePlacement.current.black=false;}
  }
  function openWorkshopTool(type:string){
    const entry=(Object.entries(terminations) as [PreparationTask,(typeof terminations)[PreparationTask]][]).find(([,sample])=>sample.tool===type);
    chooseTool('meter');setInstrumentChoice('t6');
    if(entry)setSampleRequest(current=>({id:entry[0],version:(current?.version??0)+1}));
    else {setHandTool(undefined);setSampleRequest(undefined);}
  }
  function physicalInstrument(part:string){
    if(part==='hold')setHeldReading(heldReading?undefined:['value','open','overrange'].includes(liveFork.status)?liveFork:undefined);
    if(part==='actuator')chooseForkMethod((['off','probe-voltage','fork-current','resistance','off'] as ForkMethod[])[forkDial(forkMethod)+1]);
    if(part==='mode'&&forkMethod.startsWith('fork'))chooseForkMethod(forkMethod==='fork-current'?'fork-voltage':'fork-current');
    if(part==='backlight'&&forkMethod!=='off')setTesterLight(on=>!on);
    if(part==='ground'&&forkMethod==='fork-voltage')selectForkReference('pad');
  }
  function recordReading(){
    if(useFork){
      if(heldReading){setNotice('Release HOLD and record a fresh reading.');return;}
      const meta=instrumentData(forkSetup,liveFork);
      if(!meta||!result?.converged||result.revision!==document.revision){setNotice(liveFork.explanation);return;}
      const assisted=forkMethod.startsWith('fork')?!probePlacement.current.current||forkMethod==='fork-voltage'&&forkReference==='black'&&!probePlacement.current.black:!(probePlacement.current.red&&probePlacement.current.black);
      const request={mode:forkMode(forkMethod),a:forkSetup.a,b:forkSetup.b,wire:forkSetup.wire,instrument:meta};
      if(forkMethod==='resistance'){worker.current?.postMessage({kind:'measure',document,...request,assisted});return;}
      const entry={...captureMeasurement(document,result,request),assisted};
      if(entry.value===null){setNotice(entry.explanation);return;}
      setProgress(p=>recordEvidence(p,lessonId,entry));setNotice(liveFork.shown+' '+liveFork.unit+' recorded.');return;
    }
    if(!result||result.revision!==document.revision){setNotice('Wait for the meter to settle, then record the reading.');return;}if(meterMode==='resistance'){if(!probeA||!probeB){setNotice('Place both probes before recording a resistance reading.');return;}if(document.supply.enabled){setNotice('Switch off the bench supply and any battery or solar supply before measuring resistance.');return;}worker.current?.postMessage({kind:'measure',document,a:probeA,b:probeB,assisted:!(probePlacement.current.red&&probePlacement.current.black)});return;}const entry={...captureMeasurement(document,result,{mode:meterMode as 'voltage'|'current',a:probeA,b:probeB,wire:selectedWire}),assisted:meterMode==='current'?!probePlacement.current.current:!(probePlacement.current.red&&probePlacement.current.black)};if(entry.value===null){setNotice(entry.explanation);return;}setProgress(p=>recordEvidence(p,lessonId,entry));setNotice(`${format(entry.value)} ${entry.unit} saved.`);}
  function targetActivity(activity:LessonActivity){if(activity.kind==='operate'&&activity.component&&activeSurface==='site'){sitePose.current=undefined;setSiteJump(s=>({id:s.id+1,component:activity.component}));}if(['measure','connect','inspect'].includes(activity.kind)||activity.part==='terminals')setSurface('bench');setManualInspection(undefined);setMoveTarget(undefined);const id=activity.component??activity.endpoints?.[0]?.component;if(id){setSelected(id);setSelectedWire(undefined);setSelectedPart(activity.part??'body');}setInspectorCollapsed(false);setTool(activity.kind==='operate'?'select':activity.kind==='connect'?'wire':activity.kind==='measure'?'meter':'inspect');setPanel(activity.kind==='connect'?'connect':activity.kind==='measure'?'meter':'inspect');if(activity.kind==='connect'||activity.kind==='measure')setView('open');else if(activity.part==='terminals'){const fitting=document.components.find(c=>c.id===id);setView(fitting&&enclosedTerminals(fitting)?'open':'normal');}setCamera(c=>({id:c.id+1,action:activity.part==='terminals'?'rear':'focus'}));}
  function setupMeasurement(activity:LessonActivity){if(!activity.measurement)return;setSurface('bench');probePlacement.current={red:false,black:false,current:false};setSheetOpen(true);const m=activity.measurement;if(useFork)chooseForkMethod(m.mode==='current'?'fork-current':m.mode==='resistance'?'resistance':'probe-voltage');setMeterMode(m.mode);setProbeA(m.a);setProbeB(m.b);if(m.wire){const expected=lesson.circuit.wires.find(w=>w.id===m.wire);const match=document.wires.find(w=>w.id===m.wire||expected&&((w.from.component===expected.from.component&&w.from.terminal===expected.from.terminal&&w.to.component===expected.to.component&&w.to.terminal===expected.to.terminal)||(w.from.component===expected.to.component&&w.from.terminal===expected.to.terminal&&w.to.component===expected.from.component&&w.to.terminal===expected.from.terminal)));setSelectedWire(match?.id);}setTool('meter');setPanel('meter');setInspectorCollapsed(false);setView('open');setCamera(c=>({id:c.id+1,action:'rear'}));setNotice(m.mode==='current'?'The wire is selected. Read the amps, then choose Record reading.':'The probes are in place. Read the meter, then choose Record reading.');}
  async function importCircuit(){try{const raw=await readJsonFile('circuit');if(raw===null)return;const d=validateCircuit(JSON.parse(raw));requestReplacement('Import circuit',()=>{baseline.current=fingerprintLayout(d);commit(d);if(d.lessonId)setLessonId(d.lessonId);setWorkspace('sandbox');setMode('explore');setSelected(undefined);setSelectedWire(undefined);setChallengeStarted(false);setCamera(c=>({id:c.id+1,action:'fit'}));setBuildsOpen(false);setPanel('');setInspectorCollapsed(true);setSurface('bench');setNotice('Circuit imported.');});}catch(e){setNotice(e instanceof Error?e.message:'Could not import this circuit.');}}
  async function backupStudy(){try{const backup=exportStudyBackup(docRef.current,savedBuilds,progress,bookmark);if(await saveJsonFile(JSON.stringify(backup,null,2),'Irish Electrical Lab study backup.json','backup'))setNotice('Backup saved with your current circuit, saved builds and lesson progress.');}catch(e){setNotice(e instanceof Error?e.message:'The backup could not be saved.');}}
  async function restoreStudy(){try{const raw=await readJsonFile('backup');if(raw===null)return;validateStudyBackup(raw);requestReplacement('Restore full study backup',preserved=>void restoreValidatedStudy(raw,preserved));}catch(e){setNotice(e instanceof Error?e.message:'The backup was not restored. Your current study data is preserved.');}}
  async function restoreValidatedStudy(raw:string,preservedBuild?:CircuitDocument){try{restoring.current=true;setBackupBusy(true);if(saveTimer.current)clearTimeout(saveTimer.current);saveTimer.current=null;if(testTimeout.current)clearTimeout(testTimeout.current);activeTest.current=null;diagnosisRequest.current=null;setPendingTest(undefined);for(const timer of pulseTimers.current.values())clearTimeout(timer);pulseTimers.current.clear();const backup=await restoreStudyBackup(raw,preservedBuild);setBookmark(backup.bookmark);setPath('home');setPractice(undefined);setActiveActivity(undefined);setSheetOpen(true);setSavedBuilds(backup.builds);setProgress(migrateProgress(backup.progress));setHistory([]);setFuture([]);freshWorkerState.current=true;setAssessment(undefined);setResult(undefined);if(backup.draft){baseline.current=fingerprintLayout(backup.draft);setDocument(clone(backup.draft));if(backup.draft.lessonId){setLessonId(backup.draft.lessonId);setWorkspace('learn');setMode('explore');}else{setWorkspace('sandbox');setMode('build');}}else{setDocument(clone(initialLesson.circuit));setLessonId(initialLesson.id);baseline.current=fingerprintLayout(initialLesson.circuit);setWorkspace('learn');setMode('explore');}setBuildsOpen(false);challengeRef.current.accepted=false;challengeRef.current.repaired=false;setDiagnosisAccepted(false);setChallengeRepaired(false);setSelected(undefined);setSelectedWire(undefined);cancelConnection();clearProbes();setChallengeStarted(false);const restoredTest=migrateProgress(backup.progress).lastTest;if(restoredTest&&!obsoleteEmptyPass(restoredTest,backup.draft??initialLesson.circuit)){setAssessmentKey(restoredTest.fingerprint);setAssessment({...restoredTest.assessment,...backup.draft&&testRecordMatches(restoredTest,backup.draft)?{revision:backup.draft.revision}:{}});}else setAssessment(undefined);setNotice('Full study backup restored on this device.');}catch(e){setNotice(e instanceof Error?e.message:'The backup was not restored. Your current study data is preserved.');}finally{restoring.current=false;setBackupBusy(false);}}
  useEffect(()=>{if(!mounted)return;const ctx=(globalThis.document as unknown as {modelContext?:{registerTool:(t:unknown,o:unknown)=>unknown}}).modelContext;if(!ctx?.registerTool)return;const ac=new AbortController();for(const t of [{name:'get_configuration',description:'Read the visible electrical circuit.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true},execute:()=>clone(docRef.current)},{name:'test_configuration',description:'Request the same circuit test used by the workbench.',inputSchema:{type:'object',properties:{},additionalProperties:false},execute:()=>new Promise(resolve=>{const w=worker.current;if(!w){resolve({error:'Simulation worker is not ready.'});return;}const revision=docRef.current.revision;const timer=setTimeout(()=>{w.removeEventListener('message',receive);resolve({error:'The circuit test timed out.'});},5000);const receive=(event:MessageEvent)=>{const message=event.data;if(message.kind!=='result'||message.result.revision!==revision)return;clearTimeout(timer);w.removeEventListener('message',receive);resolve(docRef.current.revision===revision?message.result:{error:'The circuit changed during this test.'});};w.addEventListener('message',receive);w.postMessage({document:docRef.current,electricalGeneration:electricalIdentity.current.generation,dt:.1});})}]){try{Promise.resolve(ctx.registerTool(t,{signal:ac.signal})).catch(()=>{});}catch{}}return()=>ac.abort();},[mounted]);

  function requestReplacement(title:string,action:(preservedBuild?:CircuitDocument)=>void){if(fingerprintLayout(docRef.current)!==baseline.current)setReplacePrompt({title,action});else action();}
  function beginPractice(experiment: QuickPracticeExperiment) {
    setSurface('bench');setDrawingOpened(false);setDrawingWire(undefined);setPlanTrace(undefined);setCableChoice(undefined);setPath('full');
    endDimming();
    const circuit = createQuickPracticeCircuit(experiment, uid('practice'));
    baseline.current = fingerprintLayout(circuit);
    commit(circuit);
    setPractice({ experiment, circuitId: circuit.id });
    setPracticePrompt(experiment.question);
    setLessonId(experiment.lessonId);
    setWorkspace('learn');
    setMode('explore');
    setCourseStage('predict');
    setSelected(undefined);
    setSelectedWire(undefined);
    setMoveTarget(undefined);
    setTool('select');
    setPanel('lesson');
    setView('normal');
    cancelConnection();
    clearProbes();
    setChallengeStarted(false);
    setDiagnosisAccepted(false);
    setChallengeRepaired(false);
    setEvents([]);
    setCoursesOpen(false);
    setSheetOpen(true);
    setPaths(true);
    setPathFilter('all');
    setCamera(camera => ({ id: camera.id + 1, action: 'fit' }));
  }
  function showPracticeControl(experiment: QuickPracticeExperiment) {
    setTool('select');
    selectComponent(experiment.target, 'actuator');
    setCamera(camera => ({ id: camera.id + 1, action: 'focus' }));
  }
  function openHouseCall(id:number){
    const call=HOUSE_CALLS.find(c=>c.lesson===id);if(!call)return;
    const open=()=>{
      loadLesson(id);
      const job={...houseJobLabels(clone(LESSONS.find(l=>l.id===id)!.circuit)),id:uid('house'),revision:docRef.current.revision+1};
      baseline.current=fingerprintLayout(job);setDocument(job);
      setPath('coursebook');setMode('explore');setWorkspace('learn');
      setStartActivity(callActivityId(id,0));setSessionKey(k=>k+1);setCallOperation(undefined);
      setGuidedSession(undefined);setCoursesOpen(false);setSheetOpen(true);setInspectorCollapsed(false);setCourseStage('try');
    };
    if(currentCall && onlyCallControlsChanged(currentCall,docRef.current,lesson.circuit))open();
    else requestReplacement(call.title,open);
  }
  function openBook(id:number,practical=false,afterCompletedLesson=false){
    const course=LESSONS.find(l=>l.id===id);if(!course)return;
    const open=()=>{
      loadLesson(id);setPath('coursebook');setCoursesOpen(false);setWorkspace('learn');setInspectorCollapsed(false);
      setSheetOpen(true);setStartActivity(undefined);setSessionKey(k=>k+1);setGuidedSession(undefined);setMode('explore');setCourseStage('look');if(id===7)setCamera(c=>({id:c.id+1,action:'first-light'}));
      if(practical){setSurface('bench');const draft=createCoursebookBuild(course,uid('practical'),true);setDocument(draft);baseline.current=fingerprintLayout(draft);
        setStartActivity('lesson:'+id+':connect:'+course.circuit.wires[0].id);setMode('build');setTool('wire');setPanel('connect');setCourseStage('build');setView('open');}
    };
    if(afterCompletedLesson&&workspace==='learn'&&activeActivity?.bookStep==='finish')open();
    else requestReplacement('Open '+courseTitle(course),open);
  }
  function resumeBook(){
    if(!bookmark){openBook(7);return;}
    const restore=()=>{
      const circuit=clone(savedCall?houseJobLabels(bookmark.circuit):bookmark.circuit);
      setCallOperation(undefined);setCoursesOpen(false);loadLesson(circuit.lessonId!);setDocument(circuit);baseline.current=fingerprintLayout(circuit);
      setPath(bookmark.path);setStartActivity(bookmark.activityId);setSessionKey(k=>k+1);setGuidedSession(undefined);setWorkspace('learn');
      if(bookmark.mode!=='explore'||bookmark.path==='full')setSurface('bench');setMode(bookmark.mode);setSheetOpen(true);setInspectorCollapsed(false);
      const f=bookmark.fault;if(f){scoredFault.current=f.scored;setScored(f.scored);setChallengeStarted(true);setHints(f.hints);
        setDiagnosisAccepted(f.accepted);setChallengeRepaired(f.repaired);challengeRef.current={accepted:f.accepted,repaired:f.repaired,lessonId:bookmark.circuit.lessonId!,hints:f.hints,circuitId:bookmark.circuit.id};}
    };
    if(fingerprintLayout(document)===fingerprintLayout(bookmark.circuit))restore();else requestReplacement('Continue saved lesson',restore);
  }
  function openFull(){
    setPath('full');setStartActivity(undefined);setSessionKey(k=>k+1);setPanel('lesson');setSheetOpen(true);setActiveActivity(undefined);
  }
  function chooseLesson(id:number){requestReplacement('Open configuration',()=>{loadLesson(id);setWorkspace(courseDestination);setMode('explore');setCoursesOpen(false);setBuildsOpen(false);setCourseStage('look');});}
  function openCourses(destination:'learn'|'sandbox',jobs=false){setShowJobs(jobs);setCourseDestination(destination);setCoursesOpen(true);setBuildsOpen(false);}
  function chooseTool(next:Tool){
    if(next===tool && (next==='wire'||next==='meter')){
      setSurface('bench');setViewOpen(false);setInspectorCollapsed(false);setSheetOpen(true);
      setPanel(next==='wire'?'connect':'meter');return;
    }
    if(next!=='select')setSurface('bench');setViewOpen(false);setMoveTarget(undefined);setConductorPickerOpen(false);setSheetOpen(next!=='select'||!!selected);setHoverTerminal(undefined);setInspectorCollapsed(false);if(next==='place'){setTool('select');setPanel('equipment');setEquipmentQuery('');return;}setTool(next);if(next==='wire'||next==='meter')setView('open');setPanel(next==='wire'?'connect':next==='meter'?'meter':selected?'inspect':'');
    // A trip to the meter can leave the first end of a wire selected.
    if(next==='wire' && !wireStart) setCamera(c=>({id:c.id+1,action:'rear'}));
  }
  function chooseStage(stage:LessonStageId){if(stage==='measure'||stage==='build'||stage==='fix')setSurface('bench');setCourseStage(stage);setMoveTarget(undefined);if(stage!=='build')cancelConnection();if(stage==='look'||stage==='predict'||stage==='fix')setTool('select');if(stage==='try'){setTool('select');setPanel(selected?'inspect':'');}if(stage==='measure'){setView('open');setTool('meter');setPanel('meter');setInspectorCollapsed(false);}if(stage==='fix'){setPanel('results');setInspectorCollapsed(false);}if(stage==='build'&&mode==='build'){setView('open');setTool('wire');setPanel('connect');setCamera(c=>({id:c.id+1,action:'rear'}));}}
  async function continueReplacement(save:boolean){if(!replacePrompt)return;setReplaceBusy(true);try{const preserved=save?{...clone(docRef.current),id:uid('saved')}:undefined;if(save&&!await saveBuild())return;const action=replacePrompt.action;setReplacePrompt(undefined);action(preserved);}finally{setReplaceBusy(false);}}
  function loadSaved(record:CircuitDocument){let b:CircuitDocument;try{b=validateCircuit(record);}catch(error){setNotice(error instanceof Error?error.message:'This saved build could not be opened.');return;}requestReplacement('Load saved build',()=>{baseline.current=fingerprintLayout(b);commit(b);if(b.lessonId)setLessonId(b.lessonId);setWorkspace('sandbox');setMode('explore');setSelected(undefined);setSelectedWire(undefined);setPanel('');setChallengeStarted(false);setBuildsOpen(false);setCamera(c=>({id:c.id+1,action:'fit'}));setNotice('Saved build loaded.');});}
  function selectConductor(id:string){if(tool==='meter')probePlacement.current.current=true;setMoveTarget(undefined);setSelectedWire(id);setSelected(undefined);setPanel(tool==='meter'?'meter':'inspect');setInspectorCollapsed(false);setConductorPickerOpen(false);setSheetOpen(true);}
  const attached=document.lessonId===lessonId;
  const hasSite=workspace==='learn'&&attached;
  const location=useMemo(()=>jobSite(document,attached?lesson.circuit:undefined),[document,attached,lesson]);
  const activeSurface=surface==='drawing'?'drawing':listView?'list':surface==='site'&&hasSite?'site':'bench';
  function showSurface(value:'site'|'drawing'|'bench'|'list'){
    setViewOpen(false);if(value==='drawing')setDrawingOpened(true);
    if(value==='list'){setSurface('bench');setListView(true);return;}
    setSurface(value);setListView(false);
  }
  function findFixture(id:string,pin?:string){
    setSelected(id);setSelectedPart(pin??'body');setViewOpen(false);
    if(startWithList){showSurface('list');selectComponent(id,pin);return;}
    if(hasSite){sitePose.current=undefined;showSurface('site');setSiteJump(a=>({id:a.id+1,component:id}));}
    else{showSurface('bench');setCamera(c=>({id:c.id+1,action:pin?'rear':'focus'}));}
  }
  function inspectFixture(id:string){
    const fitting=document.components.find(c=>c.id===id);showSurface('bench');selectComponent(id);setView(fitting&&enclosedTerminals(fitting)?'open':'normal');setCamera(c=>({id:c.id+1,action:'focus'}));
  }
  const buildHint=liveHints&&workspace==='sandbox'?getBuildHint({document,result,expected:attached?lesson.circuit:undefined}):undefined;
  const suggestedWireRole=wireRoleOverride?wireRole:wireStart&&hoverTerminal?suggestWireRole(document,wireStart,hoverTerminal,attached?lesson.circuit:undefined):!wireStart&&workspace==='learn'&&mode==='build'&&activeActivity?.kind==='connect'?activeActivity.expectedRole??wireRole:wireRole;
  const fromDescription=describeEndpoint(document,wireStart),destinationDescription=describeEndpoint(document,hoverTerminal);
  const details=component&&definition?fittingDetails(component,definition):[];
  const fittingDetail=selected===pickedDetail?.component&&selectedPart===pickedDetail?.part?details.find(d=>d.id===pickedDetail?.id):undefined;
  function inspectFittingDetail(detail:FittingDetail){
    if(!component)return;
    if(!startWithList)showSurface('bench');
    setManualInspection({component:component.id,part:detail.part});
    selectComponent(component.id,detail.part,true,detail.id);
    setView(detail.face==='service'&&enclosedTerminals(component)?'open':'normal');
    setCamera(c=>({id:c.id+1,action:detail.face==='service'?'focus-service-detail':'focus'}));
  }
  const selectedTerminal=component&&definition?getComponentTerminals(component,definition).find(t=>t.id===selectedPart):undefined;
  const isControl=(c:ComponentInstance)=>['proximity','pwmcontrol','switch','switch2','intermediate','dimmer','pushbutton','selector','changeover','isolator','isolator3','mcb','mcb3','rcd','rcd3','rcbo','fcu','sensor','smartrelay','timer','plc','ev','vfd','pv','battery','thermostat','cutout','overload','safetyRelay'].includes(c.type);
  const canOperate=component&&isControl(component);
  const canEdit=workspace==='sandbox'||mode==='build'&&courseStage==='build';
  const movingOnTouch=canEdit&&tool==='select'&&!!component&&moveTarget===component.id;
  const toggleMove=()=>{setMoveTarget(movingOnTouch?undefined:component?.id);setTool('select');setSheetOpen(false);};
  const closeTools=()=>{setSheetOpen(false);setInspectorCollapsed(true);if(!touchLayout)setPanel(workspace==='learn'?'lesson':'');};
  const groups=Array.from(new Set(COMPONENT_LIST.map(c=>c.group)));
  const equipment=COMPONENT_LIST.filter(c=>(equipmentGroup==='all'||c.group===equipmentGroup)&&(c.name+' '+c.description).toLowerCase().includes(equipmentQuery.toLowerCase())).sort((a,b)=>{const common=['source','rcbo','switch','lamp','socket','junction'];return (common.includes(a.type)?0:1)-(common.includes(b.type)?0:1);});
  const inBook=workspace==='learn' && path!=='full' && !activePractice;
  const home=inBook && path==='home';
  const stateText=(c:ComponentInstance)=>{
    if(!result?.converged||result.revision!==document.revision)return;
    const state=result.deviceStates[c.id];if(state?.tripped)return 'Tripped';
    if(state&&['proximity','floatvalve','callchime','pwmcontrol'].includes(c.type))return state.details;
    if(state&&c.type==='cctstrip')return 'Warm '+format(Number(state.warmWatts??0),1)+' W · cool '+format(Number(state.coolWatts??0),1)+' W';
    if(['lamp','led','indicator','emergency'].includes(c.type))return state ? (state.energized?'Lit':'Off') : undefined;
    if(['switch','mcb','mcb3','rcd','rcd3','rcbo','isolator','isolator3'].includes(c.type)&&state)return state.closed?'On · contacts closed':'Off · contacts open';
    if(state&&['contactor','relay'].includes(c.type)){
      if(state.interlockBlocked)return 'Coil on · the interlock holds the contacts open';
      return state.closed?'Contacts pulled in':'Contacts at rest';
    }
    if(state&&['fan','motor','motor3','pump'].includes(c.type))return state.energized?'Running':'Stopped';
  };
  const neutralEarth=(!assessmentStale&&!investigating)?assessment?.checks.find(c=>c.status==='fail'&&c.id.includes('neutralEarth:')):undefined;
  const bondWire=neutralEarth?.wire?document.wires.find(w=>w.id===neutralEarth.wire):undefined;
  const lampObservation=neutralEarth&&result?.revision===document.revision&&result.converged?document.components.filter(c=>['lamp','led'].includes(c.type)&&result.deviceStates[c.id]).map(c=>c.label+' is '+(result.deviceStates[c.id].energized?'lit':'off')).join('. '):'';
  const contextTitle=panel==='meter'?'Measure':panel==='connect'?'Connect terminals':panel==='results'?'Circuit test':panel==='equipment'?'Add equipment':component?.label??(wire?'Selected conductor':'Workbench tools');
  if(!mounted||!hydrated)return <div className="boot"><Zap/><h1>Irish Electrical Lab</h1><p>Opening your workbench…</p></div>;
  const inspectorContent=<><div className="compact-object"><h3>{fittingDetail?.title??component?.label??'Conductor'}</h3><p>{fittingDetail?.explanation??selectedTerminal?.purpose??definition?.parts.find(p=>p.id===selectedPart)?.purpose??(component ? equipmentPurpose(component) : undefined)??(wire?describeEndpoint(document,wire.from)?.label+' → '+describeEndpoint(document,wire.to)?.label:'Choose a fitting or wire on the bench.')}</p>{component&&stateText(component)&&<div className="compact-object-state">{stateText(component)}</div>}{component?.type==='dimmer'&&<DimmerControl component={component} state={result?.revision===document.revision?result.deviceStates[component.id]:undefined} onChange={level=>changeDimming(component.id,level)} onStart={startDimming} onEnd={endDimming}/>}{component?.type==='pwmcontrol'&&<div className="pwm-controls">{(['level','mix'] as const).filter(k=>k==='level'||component.variant==='tunable-white'||document.lessonId===69).map(k=><label key={k}>{k==='level'?'Brightness':'Cool channel share'} <output>{Math.round(Number(component.params[k]??COMPONENTS.pwmcontrol.defaults[k]??.5)*100)}%</output><input aria-label={k==='level'?'LED brightness':'Cool channel share'} type="range" min={0} max={100} step={1} value={Math.round(Number(component.params[k]??COMPONENTS.pwmcontrol.defaults[k]??.5)*100)} onChange={e=>patch(component.id,{[k]:Number(e.target.value)/100})}/></label>)}</div>}{component&&<BoardDrawer key={component.id} circuit={document} selected={selected} onChange={commit} onSelect={id=>selectComponent(id)} editable={!!canEdit}/>}{wire&&<p className="wire-keyboard-help">{touchLayout?'Use Undo to put the wire back.':'Press Backspace to remove this wire. Undo puts it back.'}</p>}<div className="quick-actions">{component&&['rcbo','rcd','rcd3'].includes(component.type)&&<Button variant="outline" onClick={()=>pressTest(component)}>Press test button T</Button>}{canOperate&&<Button className="primary-button" onClick={()=>operate(component!)}>{component?.type==='dimmer'?Boolean(component.params.closed??true)?'Switch dimmer off':'Switch dimmer on':'Operate'}</Button>}{component?.type==='pushbutton'&&<Button variant="outline" onClick={()=>holdButton(component)}>{component.params.pressed?'Release held button':'Hold button for a measurement'}</Button>}{component&&<Button variant="outline" onClick={event=>{
      setView(enclosedTerminals(component)?'open':'normal');setSelectedPart('terminals');
      if(startWithList){
        const details=event.currentTarget.closest('.context-content,.lesson-context')?.querySelector<HTMLDetailsElement>('details.technical-details');
        if(details){details.open=true;details.querySelector<HTMLButtonElement>('.terminal-list button')?.focus();}
      }else{showSurface('bench');setCamera(c=>({id:c.id+1,action:'rear'}));}
    }}>Show terminals</Button>}{component&&canEdit&&<>{touchLayout&&<Button variant="outline" aria-pressed={movingOnTouch} onClick={toggleMove}>Move</Button>}<Button variant="outline" onClick={()=>commit({...document,components:rotatedEquipment(document,component.id)})}>Rotate</Button><Button variant="outline" disabled={document.components.length>=80} onClick={()=>{const p=clone(component.params);delete p.gangGroup;delete p.gangModule;const c={...clone(component),mount:undefined,params:p,id:uid(component.type),position:[component.position[0]+1.5,component.position[1],component.position[2]] as Vec3};commit({...document,components:[...document.components,c]});setSelected(c.id);}}>Duplicate</Button><Button variant="outline" onClick={remove}>Delete</Button></>}{wire&&<Button variant="outline" onClick={remove}>Remove conductor</Button>}{<Button variant="outline" onClick={()=>setConductorPickerOpen(value=>!value)} aria-expanded={conductorPickerOpen}>Find conductor</Button>}</div>{conductorPickerOpen&&<ConductorPicker circuit={document} selected={selectedWire} onPick={selectConductor}/>}</div><details className="technical-details"><summary>Parts, terminals and settings</summary><div className="component-picker"><Choice value={selected??"none"} onChange={id=>id==="none"?setSelected(undefined):selectComponent(id)} label="Select equipment" options={[{value:"none",label:"Select equipment…"},...document.components.map(c=>({value:c.id,label:c.label,icon:<EquipmentIcon component={c} size={26}/>}))]}/></div>{component&&definition?<><p>{equipmentPurpose(component)}</p>{equipmentReferences(component,definition).length>0&&<details><summary>Equipment references</summary>{equipmentReferences(component,definition).map(ref=><button type="button" className="book-link" key={ref.id} onClick={()=>openExternalReference(ref.url).catch(()=>setNotice('The reference could not be opened.'))}>{ref.title}</button>)}</details>}{definition.abstraction&&<div className="model-note"><b>What the bench simulates</b><p>{definition.abstraction}</p></div>}<div className="part-picker">{definition.parts.map(p=><button key={p.id} className={selectedPart===p.id?'active':''} onClick={()=>{setManualInspection({component:component.id,part:p.id});setPickedDetail(undefined);setSelectedPart(p.id);setCamera(c=>({id:c.id+1,action:'focus'}));}}>{p.name}</button>)}</div><section className="part-explanation"><h3>{fittingDetail?.title??definition.parts.find(p=>p.id===selectedPart)?.name??'Part of the fitting'}</h3><p>{fittingDetail?.explanation??definition.parts.find(p=>p.id===selectedPart)?.purpose??'Choose a part to see what it does.'}</p></section><div className="component-state"><span>{stateText(component)}</span><b>{result?.deviceStates[component.id]?.tripped?'TRIPPED':result?.deviceStates[component.id]?.details??'Ready to test'}</b></div>{details.length>0&&<><h3>Recognise this fitting</h3><div className="part-picker">{details.map(detail=><button key={detail.id} className={fittingDetail?.id===detail.id?'active':''} aria-pressed={fittingDetail?.id===detail.id} onClick={()=>inspectFittingDetail(detail)}>{detail.title}</button>)}</div></>}<h3>Terminal markings</h3><div className="terminal-list">{getComponentTerminals(component,definition).map(t=><button key={t.id} onClick={()=>terminal({component:component.id,terminal:t.id})}><span className={'terminal-role role-'+t.role.replace('+','plus').replace('-','minus')}>{t.label}</span><span>{t.group&&<b>{t.group} · </b>}{t.purpose}</span></button>)}</div>{definition.variants&&<><h3>Equipment form</h3><Choice label="Equipment form" value={component.variant??'automatic'} options={[{value:'automatic',label:'Example / automatic form'},...definition.variants.map(v=>({value:v.id,label:v.name,icon:<DefinitionIcon type={component.type} variant={v.id} size={28}/>}))]} onChange={variant=>commit({...document,components:document.components.map(c=>c.id===component.id?applyEquipmentVariant(c,variant==='automatic'?undefined:variant):c)})}/><p className="small-copy">{component.type==='led'||component.type==='driver'?'Choose a module to use its ratings on the bench. You can change them below.':'Choose the fitting you want to study.'}</p></>}<details className="advanced-parameters"><summary>Ratings and settings</summary><p className="small-copy">These are the values the bench uses for this fitting. Check the label on a real fitting for its rating.</p><div className="parameter-list">{Object.entries({...definition.defaults,...component.params}).filter(([key])=>!['resetToken','gangGroup','gangModule'].includes(key)).map(([key,v])=><label key={key}><span>{key.replace(/([A-Z])/g,' $1')}</span>{key==='mechanicallyInterlockedWith'?<Choice label='Mechanical interlock partner' value={String(v)||'none'} onChange={value=>pairContactor(component.id,value==='none'?'':value)} options={[{value:'none',label:'No mechanical partner'},...document.components.filter(c=>c.type==='contactor'&&c.id!==component.id).map(c=>({value:c.id,label:c.label}))]}/>:typeof v==='boolean'?<Switch aria-label={key} checked={v} onCheckedChange={value=>patch(component.id,{[key]:value})}/>:<Input aria-label={key} maxLength={4096} type={typeof v==='number'?'number':'text'} step="any" value={v} onChange={e=>{const val=typeof v==='number'?Number(e.target.value):e.target.value;if(typeof val==='number'&&!Number.isFinite(val))return;patch(component.id,{[key]:val});}}/>}</label>)}</div></details>{(workspace==='sandbox'||mode==='build')&&<><h3>Placement</h3><div className="coordinate-inputs">{['X','Y','Z'].map((a,i)=><label key={a}>{a}<Input aria-label={'Position '+a} type="number" step=".25" value={component.position[i]} onChange={e=>{const pos=[...component.position] as Vec3;pos[i]=Number(e.target.value);if(pos.every(v=>Number.isFinite(v)&&Math.abs(v)<=10000))commit({...document,components:movedEquipment(document,component.id,pos)});}}/></label>)}</div><div className="row-actions"><Button variant="outline" onClick={()=>commit({...document,components:rotatedEquipment(document,component.id)})}><RotateCw size={14}/>Rotate</Button><Button variant="outline" disabled={document.components.length>=80} onClick={()=>{const copiedParams=clone(component.params);delete copiedParams.gangGroup;delete copiedParams.gangModule;const c={...clone(component),mount:undefined,params:copiedParams,id:uid(component.type),position:[component.position[0]+1.5,0,component.position[2]] as Vec3};commit({...document,components:[...document.components,c]});setSelected(c.id);}}><Copy size={14}/>Copy</Button><IconButton label="Delete component" onClick={remove}><Trash2 size={15}/></IconButton></div></>}
    </>:wire?<><div className="section-label">WIRE DETAILS <Cable size={15}/></div><h2>{wire.role} conductor</h2><p>{describeCableCore(document,wire)}</p><p>{wire.from.component}.{wire.from.terminal}<br/>to {wire.to.component}.{wire.to.terminal}</p><p>Where two wires cross, they only connect if they share a terminal.</p><Choice value={wire.role} onChange={role=>commit({...document,wires:document.wires.map(w=>w.id===wire.id?{...w,role:role as TerminalRole}:w)})} label="Wire identification" options={['L','N','PE','L1','L2','L3','control','output','DC+','DC-'].filter(v=>!wire.cable||markedRole(wire.cable.core,v as TerminalRole)===v).map(v=>({value:v,label:v}))}/><label className="field-label">Resistance (Ω)<Input type="number" min=".001" step=".01" value={wire.resistance} onChange={e=>{const r=Number(e.target.value);if(r>0&&r<=1e9)commit({...document,wires:document.wires.map(w=>w.id===wire.id?{...w,resistance:r}:w)});}}/></label><h3>3D bend points</h3>{wire.bends.map((p,i)=><div className="coordinate-inputs" key={i}>{p.map((v,j)=><Input key={j} aria-label={`Bend ${i+1} coordinate ${j+1}`} type="number" step=".25" value={v} onChange={e=>{const bends=clone(wire.bends);bends[i][j]=Number(e.target.value);if(Number.isFinite(bends[i][j])&&Math.abs(bends[i][j])<=10000)commit({...document,wires:document.wires.map(w=>w.id===wire.id?{...w,bends}:w)});}}/>)}</div>)}<Button variant="outline" disabled={wire.bends.length>=32} onClick={()=>{const a=document.components.find(c=>c.id===wire.from.component)!.position,b=document.components.find(c=>c.id===wire.to.component)!.position;commit({...document,wires:document.wires.map(w=>w.id===wire.id?{...w,bends:[...w.bends,[(a[0]+b[0])/2,1.2,(a[2]+b[2])/2]]}:w)});}}><Plus size={14}/>Add bend</Button><Button variant="outline" onClick={remove}><Trash2 size={14}/>Remove conductor</Button></>:<div className="empty-inspector"><MousePointer2 size={34}/><h2>Choose a fitting</h2><p>Pick a fitting, terminal or wire to see what it does.</p></div>}
    </details></>;
  const studyMeterContent=<><Choice value={meterMode} onChange={v=>{setMeterMode(v);setTool('meter');setResistance(undefined);}} label="Meter measurement mode" options={[{value:'voltage',label:'Voltage (volts)'},{value:'current',label:'Current (amps)'},{value:'resistance',label:'Resistance (ohms) / continuity'}]}/><div className="meter-display"><small>{meterMode==='current'?'CURRENT':meterMode==='resistance'?'RESISTANCE':'TERMINAL VOLTAGE'}</small><b>{reading?.value==null?(meterMode==='resistance'&&resistance?.status==='open'?'OL':'— — —'):format(reading.value,meterMode==='resistance'?3:2)}<span>{meterMode==='current'?'A':meterMode==='resistance'?'Ω':'V'}</span></b><p>{reading?.explanation??'Connect the probes to two terminals.'}</p></div>{meterMode!=='current'&&<details className="manual-probes" open={listView||undefined}><summary>Choose {activeProbe} probe terminal by name</summary><TerminalPicker circuit={document} label={activeProbe+' probe terminal'} onPick={terminal}/></details>}{meterMode==='current'?<><p>{selectedWire?(wire?describeEndpoint(document,wire.from)?.label+' → '+describeEndpoint(document,wire.to)?.label:'Choose a wire'):(touchLayout?'Tap a wire on the bench or choose it below.':'Select a wire to see how much current it carries.')}</p>{<details className="manual-probes"><summary>Choose conductor by name</summary><ConductorPicker circuit={document} selected={selectedWire} onPick={selectConductor}/></details>}</>:<><button className={'probe-button red '+(activeProbe==='red'?'active':'')} onClick={()=>{setActiveProbe('red');setTool('meter');}}><span>RED PROBE</span><b>{probeA?describeEndpoint(document,probeA)?.label:'Choose a terminal'}</b></button><button className={'probe-button black '+(activeProbe==='black'?'active':'')} onClick={()=>{setActiveProbe('black');setTool('meter');}}><span>BLACK PROBE</span><b>{probeB?describeEndpoint(document,probeB)?.label:'Choose a terminal'}</b></button><Button variant="outline" className="full" onClick={clearProbes}>Clear probes</Button></>}{!(workspace==='learn'&&attached&&activeActivity?.kind==='measure')&&meterMode==='resistance'&&<Button className="primary-button full" disabled={!probeA||!probeB||document.supply.enabled} onClick={()=>{worker.current?.postMessage({kind:'measure',document,a:probeA,b:probeB,assisted:!(probePlacement.current.red&&probePlacement.current.black)});}}>Measure resistance and record</Button>}{meterMode==='resistance'&&document.supply.enabled&&<p className="warning-copy">Switch off the bench supply and any battery or solar supply before measuring resistance.</p>}{!(workspace==='learn'&&attached&&activeActivity?.kind==='measure')&&meterMode!=='resistance'&&<Button className="primary-button full" onClick={recordReading} disabled={!result||result.revision!==document.revision||reading?.value==null}><CheckCircle2 size={15}/>Record reading</Button>}<details className="reading-help"><summary>About these readings</summary><section className="lesson-section"><h3>Reading a result</h3><p>Put one probe on each of the two points you want to compare. A lamp with a broken neutral can go dark while its line terminal is still live.</p><p>If an output has no connection to earth, measure across its two terminals. The bench can show a voltage there even when it cannot give a reading to earth.</p><p>Continuity tells you whether current can get from one probe to the other. To measure current with the fork, choose one insulated wire.</p></section></details></>;
  const resultContent=<>{neutralEarth&&<section className="wiring-observation"><strong>{lampObservation ? lampObservation+'.' : 'Check the neutral and earth connection.'}</strong><p>{bondWire?'This wire joins '+describeEndpoint(document,bondWire.from)?.label+' to '+describeEndpoint(document,bondWire.to)?.label+'.':'The wiring on this bench joins neutral to earth.'} Neutral and earth need their own paths back to the supply here.</p>{Object.values(result?.deviceStates??{}).some(state=>state.tripped)&&<p>Remove the link, reset the device that tripped, then test again.</p>}<div className="quick-actions"><Button onClick={()=>inspectCheck(neutralEarth)}>Show connection</Button><Button variant="outline" onClick={undo} disabled={!history.length}>Undo</Button></div></section>}<TestReport recordedAt={progress.lastTest&&progress.lastTest.fingerprint===assessmentKey?progress.lastTest.recordedAt:undefined} assessment={visibleAssessment} running={testRunning} stale={assessmentStale} onSelect={inspectCheck}/><div className="quick-actions">{!assessmentStale && workspace==='sandbox' && assessment?.checks.some(check=>check.id==='setup:wiring')?<Button className="primary-button" onClick={()=>chooseTool(document.components.length?'wire':'place')}>{document.components.length?'Connect terminals':'Add equipment'}</Button>:<Button onClick={runTest} disabled={testRunning} className="primary-button">{testRunning?'Testing…':'Test circuit'}</Button>}{result?.revision===document.revision&&Object.values(result.deviceStates).some(s=>s.tripped)&&<Button variant="outline" onClick={resetTrips}>Reset trips</Button>}</div>{mode==='challenges'&&challengeStarted&&<section className="challenge-panel"><h3>Your diagnosis</h3><p>{lesson.challenge.briefing}</p><Choice value={diagnosis} onChange={setDiagnosis} label="Fault diagnosis" options={faults.map(([value,label])=>({value,label}))}/><p>{evidence.filter(e=>e.circuitId===document.id&&e.revision===document.revision&&(e.value!==null||e.status==='open')).length} readings on this circuit · {hints} hints</p>{diagnosisAccepted&&<div className="task-feedback success">Diagnosis checked. {challengeRepaired?'Test the repaired circuit again.':'Repair the fault, then test again.'}</div>}<Button className="primary-button full" onClick={submit}>Submit diagnosis</Button><Button variant="outline" className="full" onClick={showHint}>Reveal next hint</Button><Button variant="outline" className="full" onClick={repair} disabled={!diagnosisAccepted}><Wrench size={14}/>Repair fault</Button>{diagnosisAccepted&&<details className="diagnosis-answer"><summary>Why this fault gave these readings</summary><p>{lesson.challenge.answer}</p></details>}</section>}<details className="technical-details"><summary>Events and study faults</summary>{result?.preTrip&&<p>Current before the trip · {format(result.preTrip.totalCurrent)} A · {result.preTrip.explanation}</p>}{events.map((event,index)=><p key={index}><b>{event.title}</b><br/>{event.detail}</p>)}{workspace==='learn'&&mode!=='challenges'&&<Button variant="outline" onClick={()=>requestReplacement('Start scored fault challenge',()=>{openFull();startChallenge(true);})}>Try a scored fault challenge</Button>}{mode!=='challenges'&&<div className="fault-tools">{faults.map(([type,name])=><Button variant="outline" key={type} onClick={()=>inject(type)}>{name}</Button>)}{!!document.faults.length&&<Button variant="outline" onClick={repair}>Clear practice faults</Button>}</div>}<p className="small-copy">{result?result.nodes+' circuit values calculated · '+format(result.elapsedMs,1)+' ms for the last calculation':'Waiting for the bench reading.'}</p></details></>;
  const connectContent=<>
    <div className="wire-destinations" aria-label="Connection">
      <p aria-live="polite">{!document.components.length?'Add a fitting to start wiring.':wireStart?'Choose the other end of the wire.':'Choose the first end of the wire.'}</p>
      {!document.components.length&&<Button variant="outline" onClick={()=>chooseTool('place')}>Add equipment</Button>}
      <ol><li className={wireStart?'chosen':'current'}><span>From</span><b>{fromDescription?.label??'First terminal'}</b></li>
        <li className={wireStart?'current':''}><span>To</span><b>{destinationDescription?.label??'Second terminal'}</b></li></ol>
      {wireStart&&<Button size="sm" variant="ghost" onClick={cancelConnection}>Cancel connection</Button>}
    </div>
    <details className="manual-probes" key={document.id+':wire-points'} open={listView||undefined}>
      <summary>{wireStart?'Choose destination by name':'Choose terminal by name'}</summary>
      <TerminalPicker circuit={document} label="Connect terminals by name" nextFitting from={wireStart} onPick={terminal}/>
    </details>
    <CablePicker document={document} value={cableChoice??suggestedCableChoice(document,lesson.circuit.wires.find(w=>w.id===activeActivity?.wire),attached?lesson.circuit:undefined)} onChange={setCableChoice} onSelectWire={id=>{setTool('select');selectConductor(id);setPanel('inspect');}} onRemoveEmptyRun={id=>commit({...document,cableRuns:document.cableRuns?.filter(r=>r.id!==id)})}/>
    <details className="wire-identification"><summary>Wire marking · {suggestedWireRole}</summary><Choice value={suggestedWireRole} onChange={v=>{setWireRole(v as TerminalRole);setWireRoleOverride(true);}} label="Conductor identification" options={['L','N','PE','L1','L2','L3','control','output','DC+','DC-'].map(v=>({value:v,label:v==='PE'?'PE · Protective conductor':v}))}/><p className="small-copy">{wireRoleOverride?'You chose the marking for this wire.':'The lab suggests a marking from the two terminals. You can change it here.'}</p></details>
    {(fromDescription||destinationDescription)&&<details><summary>What these terminals do</summary>{[fromDescription,destinationDescription].map((d,i)=>d&&<p key={i}><b>{d.label}</b><br/>{d.purpose}</p>)}</details>}
  </>;
  const paletteContent=<><Input aria-label="Search equipment" placeholder="Search equipment…" value={equipmentQuery} onChange={e=>setEquipmentQuery(e.target.value)}/><Choice label="Equipment category" value={equipmentGroup} onChange={setEquipmentGroup} options={[{value:'all',label:'All equipment'},...groups.map(g=>({value:g,label:g}))]}/><div className="equipment-palette">{equipment.map(c=><button key={c.type} onClick={()=>{if(c.type==='forktester'||Object.values(terminations).some(s=>s.tool===c.type)){openWorkshopTool(c.type);return;}if(listView){place(nextFreePosition(document,c.type),c.type);return;}setPlaceType(c.type);setTool('place');setPanel('');setInspectorCollapsed(true);setSheetOpen(false);}}><DefinitionIcon type={c.type}/><span><b>{c.name}</b><small>{c.group}</small></span>{c.type==='forktester'||Object.values(terminations).some(s=>s.tool===c.type)?<small>Use tool</small>:<Plus size={15}/>}</button>)}</div></>;
  const meterContent=<><label className="instrument-type">Instrument<select aria-label="Instrument" value={useFork?'t6':'study'} onChange={e=>{setInstrumentChoice(e.target.value as 'study'|'t6');setHeldReading(undefined);setMeterMode(e.target.value==='t6'?forkMode(forkMethod):'voltage');}}>
    <option value="study">Precision study meter</option><option value="t6">T6-600 · open-fork tester</option></select></label>
    {useFork?<TesterControls inspecting={['focus-instrument','rear-instrument'].includes(cameraCommand.action)} onReturn={()=>setCamera(c=>({id:c.id+1,action:'fit'}))} backlight={testerLight&&forkMethod!=='off'} onBacklight={()=>physicalInstrument('backlight')} hasReference={hasReference} voltageLight={voltageLight} onInspect={(rear=false)=>{setTool('meter');setListView(false);setSurface('bench');setCamera(c=>({id:c.id+1,action:rear?'rear-instrument':'focus-instrument'}));}} onSource={url=>openExternalReference(url).catch(()=>setNotice('Could not open the tester reference.'))} doc={document} setup={forkSetup} reading={visibleFork} held={!!heldReading} activeProbe={activeProbe} onMethod={chooseForkMethod} onReference={selectForkReference}
      onProbe={c=>{setActiveProbe(c);setTool('meter');if(['focus-instrument','rear-instrument'].includes(cameraCommand.action))setCamera(last=>({id:last.id+1,action:'rear'}));}} onEndpoint={terminal} onWire={id=>{selectConductor(id);setForkSelectingReference(false);if(['focus-instrument','rear-instrument'].includes(cameraCommand.action))setCamera(c=>({id:c.id+1,action:'focus-wire'}));}} onHold={()=>physicalInstrument('hold')} onClear={clearProbes} onRead={recordReading}
      showRecord={!(workspace==='learn'&&attached&&activeActivity?.kind==='measure')}/>:studyMeterContent}
    <MeterHistory circuit={document} readings={evidence}/>
    <TerminationPractice requested={sampleRequest} action={workshopAction} onTool={setHandTool} onSource={url=>openExternalReference(url).catch(()=>setNotice('Could not open the manufacturer reference.'))} onDone={(id,ok)=>setProgress(p=>recordActivity(p,lessonId,'tools:'+id,'termination-'+id,ok))}/>
    </>;
  const context=panel==='meter'?meterContent:panel==='results'?resultContent:panel==='connect'?connectContent:panel==='equipment'?paletteContent:panel==='inspect'?inspectorContent:null;
  const briefSwitchAction=inBook&&!!activeActivity?.bookStep&&panel==='inspect'&&selectedPart==='actuator'&&component?.type==='switch';
  const courseContext=context&&!inspectorCollapsed&&!briefSwitchAction?<section className="course-tool-context" aria-label="Workbench tools"><div className="context-heading"><b>{contextTitle}</b><IconButton label="Close tools" onClick={closeTools}><X size={15}/></IconButton></div>{context}</section>:undefined;
  return <TooltipProvider delayDuration={250}><div className={'lab-shell simple-lab installation-lab surface-'+activeSurface+' '+workspace+(touchLayout?' mobile-lab':'')+(inBook?' book-shell':'')+(home?' book-landing':'')+(listView?' showing-equipment-list':'')} aria-busy={backupBusy||replaceBusy}>
    <header className="app-header"><div className="brand"><span className="brand-icon"><Zap size={21}/></span><div>IRISH ELECTRICAL <b>LAB</b></div></div><nav className="simple-navigation" aria-label="Main navigation"><Button aria-pressed={workspace==='learn'} onClick={()=>{setWorkspace('learn');setPath('home');setPractice(undefined);setSheetOpen(true);setMoveTarget(undefined);setTool('select');setPanel('lesson');setViewOpen(false);}}><BookOpen size={16}/>Learn</Button><Button aria-pressed={workspace==='sandbox'} onClick={()=>{setWorkspace('sandbox');setSurface('bench');setMode('build');setChallengeStarted(false);challengeRef.current.accepted=false;setMoveTarget(undefined);setSheetOpen(false);setTool('select');setPanel('');setInspectorCollapsed(true);}}><Wrench size={16}/>Sandbox</Button></nav><div className="header-right">{workspace==='learn'&&<Button variant="outline" aria-label="Courses" onClick={()=>openCourses('learn')}><BookOpen size={15}/><span className="header-action-name chapter-nav-label">Chapters</span></Button>}<Button variant="outline" aria-label="My builds" onClick={()=>setBuildsOpen(true)}><FolderOpen size={15}/><span className="header-action-name">My builds</span></Button><Button variant="ghost" aria-label="Settings and help" onClick={()=>{setSettingsFps(lastBenchFps.current);setMoreOpen(true);}}><Settings2 size={15}/><span className="header-action-name">More</span></Button></div></header>
    <div className={'simple-workspace '+(workspace==='learn'?'with-course':context&&!inspectorCollapsed?'with-tools':'')}><main className="work-area"><div className="workspace-heading"><div>{workspace==='learn'?<><div className="eyebrow">{currentCall?'Oakfield house · House job':lesson.category+' · '+lesson.level}</div><h1>{currentCall?currentCall.title:home?(hasSite?location.name:'Your workbench'):inBook?courseTitle(lesson):lesson.title}</h1></>:<Input aria-label="Build name" value={document.name} maxLength={256} onChange={e=>commit({...document,name:e.target.value||'My circuit'})}/>}</div><div className="heading-actions" hidden={inBook && !(mode==='build'||courseStage==='fix'||activeActivity?.kind==='measure'||activeActivity?.id.endsWith(':retest'))}><label className="simple-supply"><span>{document.supply.enabled?'Supply ON':'Supply OFF'}</span><Switch aria-label="Simulated supply" disabled={!!activePractice} checked={document.supply.enabled} onCheckedChange={enabled=>commit({...document,supply:{...document.supply,enabled}})}/></label>{!activePractice&&<Button className="primary-button test-circuit-button" disabled={testRunning} onClick={runTest}><Activity size={16} className={testRunning?'testing-pulse':''}/>{testRunning?'Testing…':'Test circuit'}</Button>}</div></div>
    {!home&&!sheetOpen&&touchLayout&&workspace==='learn'&&attached&&<button type="button" className="phone-task" aria-expanded={sheetOpen} aria-controls="course-sheet" onClick={()=>setSheetOpen(open=>!open)}>
      <span><b>{activePractice?'Quick practice':courseStage.charAt(0).toUpperCase()+courseStage.slice(1)}</b><span>{sheetOpen?'Lesson and tools':activePractice?practicePrompt:activeActivity?.instruction??'Open lesson'}</span></span>
      <span aria-hidden="true">{sheetOpen?'Hide':'Open'}</span>
    </button>}
    <div className="canvas-wrap">
    <nav className="surface-tabs" aria-label="Installation views">{(hasSite?['site','drawing','bench','list'] as const:['bench','drawing','list'] as const).map(v=><button key={v} type="button" aria-pressed={activeSurface===v} onClick={()=>showSurface(v)}>{v==='site'?'Site':v==='drawing'?'Drawing':v==='bench'?'Workbench':'Equipment list'}</button>)}</nav>
    <div className="toolbar" hidden={activeSurface==='drawing'||activeSurface==='site'}><Button variant="ghost" className={'tool-button '+((tool==='select'||tool==='inspect')&&panel!=='equipment'?'active':'')} onClick={()=>chooseTool('select')}><MousePointer2 size={17}/>Select</Button>{!activePractice&&(!inBook||activeActivity?.kind==='connect'||activeActivity?.kind==='measure'||activeActivity?.kind==='repair'||courseStage==='fix')&&<>{!inBook&&<Button variant="ghost" className={'tool-button '+(tool==='place'||panel==='equipment'?'active':'')} onClick={()=>chooseTool('place')}><Plus size={17}/>{touchLayout?'Add':'Add equipment'}</Button>}{(!inBook||activeActivity?.kind==='connect')&&<Button variant="ghost" className={'tool-button '+(tool==='wire'?'active':'')} onClick={()=>chooseTool('wire')}><Cable size={17}/>Connect</Button>}{(!inBook||activeActivity?.kind!=='connect')&&<Button variant="ghost" className={'tool-button '+(tool==='meter'?'active':'')} onClick={()=>chooseTool('meter')}><Gauge size={17}/>Measure</Button>}</>}<span className="toolbar-divider"/><IconButton label="Undo" onClick={undo} disabled={!history.length}><Undo2 size={17}/></IconButton><span className="desktop-bench-action"><IconButton label="Redo" onClick={redo} disabled={!future.length}><Redo2 size={17}/></IconButton></span><span className="toolbar-spacer"/><span className="desktop-bench-action"><IconButton label="Fit workbench" onClick={()=>setCamera(c=>({id:c.id+1,action:'fit'}))}><Maximize2 size={17}/></IconButton><IconButton label="Rear terminals" onClick={()=>setCamera(c=>({id:c.id+1,action:'rear'}))}><RotateCcw size={17}/></IconButton></span><Button variant="ghost" className="tool-button" onClick={()=>{setViewOpen(v=>!v);if(touchLayout)setSheetOpen(false);}}><Focus size={16}/>View</Button></div>
    {drawingOpened&&<div className="drawing-container" hidden={activeSurface!=='drawing'}><JobDrawing planTrace={planTrace?.docId===document.id?planTrace:undefined} key={String(document.lessonId??document.id)+workspace} doc={document} lesson={attached?lesson:undefined} site={location} selected={selected} part={selectedPart} highlight={(id,pin)=>{setSelected(id);setSelectedPart(pin??'body');}} goTo={findFixture} highlightWire={setDrawingWire} openLocation={hasSite} initialPage={hasSite?'plan':'wiring'}/></div>}
    <React.Suspense fallback={<div className="scene-loading" role="status">Opening the 3D view…</div>}>{activeSurface==='drawing'?null:activeSurface==='site'?<JobSiteView onExplore={()=>setSheetOpen(false)} onPeek={id=>{setDrawingWire(id);if(id&&touchLayout)setSheetOpen(false);}} onPlan={wire=>{setPlanTrace(previous=>({sequence:(previous?.sequence??0)+1,wire,docId:document.id}));setDrawingWire(wire);showSurface('drawing');if(touchLayout)setSheetOpen(false);}} showWallSwitch={inBook&&!home&&['switch-off','switch-on','contact'].includes(activeActivity?.bookStep??'')} site={location} doc={document} result={result} selected={selected} terminalId={selectedPart} touch={touchLayout} tool={tool} jump={siteJump} pose={sitePose} wire={drawingWire} onFocus={id=>findFixture(id)} onService={inspectFixture} onPart={selectPhysicalPart} onTerminal={terminal} onList={()=>showSurface('list')}/>:activeSurface==='list'?<EquipmentList circuit={document} selected={selected} tags={hasSite?Object.fromEntries(location.items.map(item=>[item.id,item.ref+' · '+location.location(item.room)])):undefined} states={Object.fromEntries(document.components.map(c=>[c.id,stateText(c)]))} operable={isControl} onSelect={id=>{setManualInspection({component:id,part:'body'});selectComponent(id);}} onOperate={operate}/>:<Workbench onListView={()=>setListView(true)} onCable={id=>{const run=document.cableRuns?.find(r=>r.id===id);if(run){cancelConnection();setCableChoice({kind:run.kind,runId:id});setTool('wire');setView('open');setPanel('connect');setInspectorCollapsed(false);setSheetOpen(true);}}} touchLayout={touchLayout} touchMove={movingOnTouch} document={document} result={result} tool={tool} mode={workspace==='sandbox'?'build':courseStage==='build'?mode:mode==='challenges'?'challenges':'explore'} selected={selected} selectedWire={selectedWire??drawingWire} selectedPart={fittingDetail?'detail:'+fittingDetail.id:selectedPart} view={view} labels={labels} paths={paths} pathFilter={pathFilter} placeType={placeType} quality={touchLayout&&quality==='auto'?'economy':quality} scenery={scenery} cameraMode={cameraMode} cameraSpeed={cameraSpeed} guidanceEndpoints={workspace==='learn'&&attached&&!activePractice?activeActivity?.endpoints:undefined} wireStart={tool==='wire'?wireStart:undefined} probes={useFork?[forkSetup.a,forkSetup.b]:[probeA,probeB]} cameraCommand={cameraCommand} onSelect={selectPhysicalPart} onTerminal={terminal} onTerminalHover={setHoverTerminal} onWire={selectConductor} onPlace={place} onMove={move} onFps={reportBenchFps} workshop={handTool} instrumentType={handTool?.type??(useFork?'forktester':undefined)} instrumentParams={{dialPosition:forkDial(forkMethod),held:!!heldReading,fork:forkMethod.startsWith('fork'),redOut:!!forkSetup.a,blackOut:!!forkSetup.b,signal:visibleFork.signal??'',validReference:hasReference,backlight:testerLight,hazard:voltageLight}} meterReading={useFork?visibleFork.shown+' '+visibleFork.unit:(reading?.value==null?(meterMode==='resistance'&&resistance?.status==='open'?'OL':'— — —'):format(reading.value))+' '+(meterMode==='current'?'A':meterMode==='resistance'?'Ω':'V')} meterMode={meterTargetMode}/>}</React.Suspense>
    <div className="canvas-top-label" hidden={activeSurface!=='bench'}><span>{document.components.length+' equipment · '+document.wires.length+' wires'}</span><span className="scene-caption">{SCENERIES.find(scene=>scene.id===scenery)?.label}{cameraMode==='free'?' · Free camera':''}</span></div>{viewOpen&&<div className="simple-view-menu"><div className="context-heading"><b>Workbench view</b><IconButton label="Close view controls" onClick={()=>setViewOpen(false)}><X size={15}/></IconButton></div>{touchLayout&&<div className="quick-actions phone-view-actions">
      <Button variant="outline" disabled={!future.length} onClick={redo}><Redo2 size={15}/>Redo</Button>
      <Button variant="outline" disabled={!!activePractice||!document.wires.length} onClick={()=>{setTool('select');setPanel('inspect');setInspectorCollapsed(false);setConductorPickerOpen(true);setViewOpen(false);setSheetOpen(true);}}><Cable size={15}/>Find conductor</Button>
    </div>}{touchLayout?<p className="small-copy">Drag to turn the view. Pinch to zoom. Slide two fingers to move sideways.</p>:<div className="camera-mode-controls" role="group" aria-label="Camera navigation"><Button variant="outline" aria-pressed={cameraMode==='orbit'} onClick={()=>setCameraMode('orbit')}><RotateCcw size={16}/>Orbit</Button><Button variant="outline" aria-pressed={cameraMode==='free'} onClick={()=>setCameraMode('free')}><Move3D size={16}/>Free camera</Button></div>}{!touchLayout&&cameraMode==='free'&&<div className="free-camera-help"><p>Click the bench. Use WASD to move and Q or E to change height. Hold the right mouse button to look around. Hold Shift to move faster.</p><label>Movement speed <output>{format(cameraSpeed,1)}</output><input aria-label="Free camera speed" type="range" min=".5" max="12" step=".5" value={cameraSpeed} onChange={event=>setCameraSpeed(Number(event.target.value))}/></label></div>}<section className="scenery-control"><h3>Environment</h3><div className="scenery-options">{SCENERIES.map(scene=><Button key={scene.id} variant="outline" aria-pressed={scenery===scene.id} title={scene.description} onClick={()=>setScenery(scene.id)}><MenuIcon value={scene.id}/><span>{scene.label}</span></Button>)}</div></section><h3>Equipment inspection</h3><Choice label="Equipment inspection view" value={view} onChange={v=>setView(v as InspectionView)} options={[{value:'normal',label:'Normal view'},{value:'open',label:'Remove cover'},{value:'exploded',label:'Exploded view'},{value:'cutaway',label:'Cutaway view'}]}/><div className="quick-actions">{['fit','front','rear','top','focus'].map(action=><Button key={action} variant="outline" disabled={action==='focus'&&!selected} onClick={()=>{setCamera(c=>({id:c.id+1,action}));setViewOpen(false);}}><MenuIcon value={action} label="Camera view"/>{action==='rear'?'Rear terminals':action==='focus'?'Focus selected':action[0].toUpperCase()+action.slice(1)}</Button>)}</div></div>}
    {tool==='place'&&<div className="placement-caption"><Box size={16}/><span>{COMPONENTS[placeType].name+(touchLayout?' · Tap to place':' · Click the bench to place')}</span><button onClick={()=>chooseTool('select')}>Cancel</button></div>}
    <div className="canvas-bottom" hidden={activeSurface!=='bench'}><span>{touchLayout?(movingOnTouch?'Drag the selected equipment':tool==='wire'?'Tap two terminals':tool==='meter'?(handTool?'Use the tool on its sample':meterTargetMode==='current'?'Tap one conductor':'Tap a terminal for the probe'):tool==='place'?'Tap the bench to place':selectedWire?'Conductor selected':'Tap to interact · pinch to zoom'):tool==='wire'?'Click two terminals · Escape cancels':tool==='meter'?(handTool?'Use the tool on its sample':meterTargetMode==='current'?'Click one conductor for the fork or clamp':'Click terminals to place probes'):tool==='place'?'Click the bench to place':selectedWire?'Selected wire · Backspace deletes · Undo restores':cameraMode==='free'?'Free camera · WASD / Q,E · right-drag look · Shift faster':workspace==='sandbox'?'Click controls to operate · drag housings to move':'Click controls to operate · drag background to orbit'}</span></div>{simError&&<div className="simulation-alert">{simError}</div>}{testRunning&&<div className="test-running-overlay" role="status"><Activity size={17} className="testing-pulse"/>Testing connections, operation and protective paths…</div>}
    </div><div className="bench-status"><span>{document.supply.voltage+' V · '+document.supply.frequency+' Hz'}</span><button className="test-status-link" disabled={!!activePractice} onClick={()=>{setPanel('results');setSheetOpen(true);setInspectorCollapsed(false);}}>{testRunning?'Testing…':assessmentStale?'Circuit changed · retest':assessment?assessment.passed?'Last test passed':assessment.checks.some(c=>c.id==='setup:wiring')?'Nothing wired yet':assessment.checks.some(c=>c.status==='unresolved')?'Reading unavailable':'View test result':'Not tested'}</button><details><summary>Live readings</summary><span>{format(result?.totalCurrent)+' A · '+format(result?.totalPower,0)+' W · '+(result?.converged?'Readings ready':'Waiting for a reading')}</span></details>{workspace==='sandbox'&&attached&&<button className="attached-lesson" onClick={()=>openCourses('sandbox')}>Practice example: {lesson.title}</button>}</div>
    {workspace==='sandbox'&&liveHints&&buildHint&&<div className={'wiring-hint '+buildHint.severity} role="status" aria-label="Wiring hint"><Lightbulb size={17}/><div><b>{buildHint.title}</b><p>{buildHint.explanation}</p><small>{buildHint.nextCheck}</small></div>{(buildHint.component||buildHint.wire)&&<Button variant="ghost" onClick={()=>inspectCheck({id:buildHint.id,category:'protection',status:'fail',title:buildHint.title,explanation:buildHint.explanation,component:buildHint.component,wire:buildHint.wire})}>Show on bench</Button>}</div>}
    </main>{workspace==='learn'&&(attached||home)?<aside id="course-sheet" className="learn-column" data-sheet-open={home||sheetOpen}><div className="phone-sheet-heading"><b>Lesson and tools</b><IconButton label="Close lesson sheet" onClick={()=>setSheetOpen(false)}><X size={17}/></IconButton></div>{home?<BookHome resume={savedCall?.title??(bookmark?courseTitle(LESSONS.find(l=>l.id===bookmark.circuit.lessonId)!):undefined)} start={resumeBook} index={()=>openCourses('learn')}/>:activePractice?<QuickPracticePanel key={document.id} experiment={activePractice} document={document} result={dimmingActive?undefined:result} simulationError={simError}
      onAttempt={success=>setProgress(p=>recordActivity(p,activePractice.lessonId,activePractice.activityId,activePractice.competency,success))}
      onPrediction={correct=>setProgress(p=>recordActivity(p,lessonId,activePractice.activityId+':prediction',activePractice.competency+'-prediction',correct))}
      onReflection={correct=>setProgress(p=>recordActivity(p,lessonId,activePractice.activityId+':explain',activePractice.competency+'-explanation',correct))}
      onPromptChange={practicePromptChanged}
      onTarget={()=>showPracticeControl(activePractice)}
      onTrace={()=>{setSurface('bench');setPaths(true);setPathFilter(activePractice.trace??'all');if(touchLayout)setSheetOpen(false);}}
      onRestart={()=>{if(practiceOnlyControlChanged(activePractice,document))beginPractice(activePractice);else requestReplacement('Restart experiment',()=>beginPractice(activePractice));}}
      onExit={()=>{setPractice(undefined);setTool('select');setPanel('lesson');setCourseStage('look');setPathFilter('all');}}
      context={courseContext}/>:currentCall?<HouseCallPanel key={document.id+':call:'+sessionKey}
      call={currentCall} document={document} result={savedCallView===callView?result:undefined} operation={callOperation} start={startActivity} onActivity={activityChanged}
      nextJob={followingCall?{title:followingCall.title,open:()=>openHouseCall(followingCall.lesson)}:undefined}
      startFault={()=>{
        const begin=()=>{setPath('full');setStartActivity('lesson:'+lesson.id+':repair');setSessionKey(k=>k+1);setCallOperation(undefined);startChallenge();};
        if(onlyCallControlsChanged(currentCall,docRef.current,lesson.circuit))begin();
        else requestReplacement('Start fault practice',begin);
      }}
      onCredit={async(id,next)=>{
        const saved:LessonBookmark={version:1,circuit:document,activityId:next,path:'coursebook',mode:'explore'};
        setProgress(p=>recordActivity(p,currentCall.lesson,id,'house-call',true));
        try { await writeRecordsAtomic({bookmark:saved,draft:document}); }
        catch { setSaveStatus('Could not save this job on this device.'); }
        if(docRef.current.id===saved.circuit.id)setStartActivity(previous=>previous===id?next:previous);
      }}
      operate={id=>{const c=document.components.find(item=>item.id===id);if(c)operate(c);}}
      locate={id=>{setSelected(id);showSurface('site');sitePose.current=undefined;setSiteJump(s=>({id:s.id+1,component:id}));}}
      undo={()=>{if(callOperation?.before.id===docRef.current.id&&callOperation.before.revision+1===docRef.current.revision)undo();}} restart={()=>openHouseCall(currentCall.lesson)} choose={()=>openCourses('learn',true)}/>:<LearningPanel key={lesson.id+':'+path+':'+sessionKey} path={path==='coursebook'?'coursebook':undefined}
        initialActivityId={startActivity} manualInspection={manualInspection}
        onContinueLesson={id=>openBook(id,false,true)} onSetDimmerLevel={level=>patch('dimmer',{level})} onPulseSetting={(id,key,value)=>patch(id,{[key]:value})} onFullExercises={openFull} onOperateComponent={id=>{const c=document.components.find(c=>c.id===id);if(c)operate(c);}} wireAddition={wireAddition} onUndoWire={undoGuidedWire} wallSwitchPress={wallSwitchPress} guidedSession={guidedSession} lesson={lesson} document={document} result={result} selected={selected} selectedPart={selectedPart} record={learningRecord} evidence={evidence} depth={depth} challengeStarted={challengeStarted} mode={mode} assessment={assessmentStale?undefined:assessment} diagnosisAccepted={diagnosisAccepted} challengeRepaired={challengeRepaired} onActivityChange={activityChanged} onStageChange={chooseStage} onRecord={recordReading} context={courseContext} onTarget={targetActivity} onAttempt={(activity,success)=>setProgress(p=>recordActivity(p,lessonId,activity.id,activity.competency,success))} onMeasure={setupMeasurement} onBuild={()=>requestReplacement('Start guided build',guidedBuild)} onTest={runTest} onChallenge={()=>requestReplacement('Start fault practice',()=>startChallenge())} onStudied={markLesson} onReference={url=>openExternalReference(url).catch(()=>setNotice('This reference could not be opened.'))}/>}</aside>:workspace==='sandbox'&&context&&!inspectorCollapsed?<aside className="context-drawer" data-sheet-open={sheetOpen} aria-label="Workbench tools"><div className="context-heading"><h2>{contextTitle}</h2><IconButton label="Close tools" onClick={closeTools}><X size={17}/></IconButton></div><div className="context-content">{context}</div></aside>:null}</div>
    <footer className="app-footer"><span><ShieldCheck size={13}/>Educational study bench</span><span>{saveStatus}</span><span>{workspace==='sandbox'?'Sandbox':'Learn'} · {isDesktop()?'Windows app':touchLayout?'Mobile lab':'Browser'}</span></footer>
    <Dialog open={coursesOpen} onOpenChange={setCoursesOpen}><DialogContent className="courses-dialog"><DialogHeader><DialogTitle>{courseDestination==='sandbox'?'Start from an example':'Chapters and practicals'}</DialogTitle></DialogHeader>{courseDestination==='learn'?<BookIndex houseCall={openHouseCall} progress={progress} showJobs={showJobs} resumeJobId={savedCall&&bookmark?.activityId!==callActivityId(savedCall.lesson,savedCall.steps.length)?savedCall.lesson:undefined} currentLessonId={savedCall?undefined:bookmark?.circuit.lessonId} resumeCurrent={resumeBook} open={openBook} quick={suggestedPractice.title} practice={()=>requestReplacement('Start quick practice',()=>beginPractice(suggestedPractice))}/>:<><Input aria-label="Search configurations" placeholder="Search configurations…" value={query} onChange={e=>setQuery(e.target.value)}/><Choice label="Configuration category" value={category} onChange={setCategory} options={[{value:'all',label:'All configurations'},...categories.map(c=>({value:c,label:c}))]}/><div className="course-list">{shown.map(l=><button key={l.id} onClick={()=>chooseLesson(l.id)}><LessonIcon lesson={l}/><span className="course-number">{String(l.id).padStart(2,'0')}</span><div><b>{l.title}</b><small>{l.category+' · '+l.level}</small></div>{progress.lessons.includes(l.id)&&<Check size={16}/>}</button>)}</div><p className="small-copy">{progress.lessons.length+' studied · '+progress.builds.length+' builds tested · '+progress.faults.length+' faults repaired'}</p>{!!dueReview.length&&<details><summary>Concepts to review</summary>{dueReview.slice(0,8).map(item=><Button variant="ghost" key={item.lessonId+item.competency} onClick={()=>chooseLesson(item.lessonId)}>{LESSONS.find(l=>l.id===item.lessonId)?.title}</Button>)}</details>}</>}</DialogContent></Dialog>
    <Dialog open={buildsOpen} onOpenChange={setBuildsOpen}><DialogContent className="builds-dialog"><DialogHeader><DialogTitle>My builds</DialogTitle></DialogHeader><BuildLibrary current={document} builds={savedBuilds} onSave={saveBuild}
      onNew={()=>requestReplacement('New circuit',()=>{newBuild();setBuildsOpen(false);})} onExample={()=>openCourses('sandbox')}
      onLoad={loadSaved} onRemove={removeSavedBuild} onImport={importCircuit}
      onExport={()=>saveJsonFile(JSON.stringify(docRef.current,null,2),document.name+'.json','circuit').catch(()=>setNotice('Circuit export failed.'))}
      onBackup={backupStudy} onRestore={restoreStudy} restoring={backupBusy}/></DialogContent></Dialog>
    <Dialog open={moreOpen} onOpenChange={setMoreOpen}><DialogContent className="more-dialog"><DialogHeader><DialogTitle>Settings and help</DialogTitle></DialogHeader><OfflineSettings/><label className="preference-row">Wiring hints<Switch aria-label="Wiring hints" checked={liveHints} onCheckedChange={setLiveHints}/></label><Choice label="Learning depth" value={depth} onChange={v=>setDepth(v as typeof depth)} options={[{value:'foundation',label:'Beginner explanations'},{value:'apprentice',label:'Apprentice detail'}]}/><details><summary>Graphics and supply settings</summary><section className="workbench-settings"><h3>Workbench settings</h3><label><span>Show labels</span><Switch checked={labels} onCheckedChange={setLabels}/></label><label><span>Trace circuit connections</span><Switch checked={paths} onCheckedChange={setPaths}/></label><Choice value={pathFilter} onChange={v=>setPathFilter(v as typeof pathFilter)} label="Connection path to trace" options={[{value:'all',label:'All wires'},{value:'L',label:'Line / phase paths'},{value:'N',label:'Neutral paths'},{value:'PE',label:'Earth wires (PE), even with no current'},{value:'control',label:'Control paths'},{value:'none',label:'Turn highlighting off'}]}/><Choice value={quality} onChange={v=>setQuality(v as typeof quality)} label="Graphics quality" options={[{value:'auto',label:'Graphics · automatic'},{value:'high',label:'Graphics · high detail'},{value:'economy',label:'Graphics · economy'}]}/>{settingsFps>0&&<small>Last workbench reading · {settingsFps} frames per second</small>}<Choice value={document.supply.phase} onChange={v=>commit({...document,supply:{...document.supply,phase:v as 'single'|'three',voltage:v==='single'?240:400}})} label="Supply system" options={[{value:'single',label:'Single-phase supply'},{value:'three',label:'Three-phase supply'}]}/><div className="voltage-presets">{(document.supply.phase==='single'?[230,240]:[400,415]).map(v=><Button key={v} variant="outline" className={document.supply.voltage===v?'chosen':''} onClick={()=>commit({...document,supply:{...document.supply,voltage:v}})}>{v} V{v===230?' nominal':''}</Button>)}</div><label className="field-label">Supply voltage (V)<Slider min={document.supply.phase==='single'?207:360} max={document.supply.phase==='single'?253:440} step={1} value={[document.supply.voltage]} onValueChange={([voltage])=>commit({...document,supply:{...document.supply,voltage}})}/><span>{format(document.supply.voltage,0)} V</span></label><p className="small-copy">The bench allows {document.supply.sourceResistance} Ω for the supply. Each wire adds its own resistance. Both limit the current if there’s a short.</p></section></details>{canFullscreen()&&<Button variant="outline" onClick={()=>{const next=!fullscreen;setFullscreen(next).then(()=>setFull(next)).catch(()=>setNotice('Fullscreen could not be changed.'));}}>{fullscreen?'Leave fullscreen':'Fullscreen'}</Button>}{touchLayout?<details><summary>Touch controls</summary><p>Tap a switch to work it. Drag to look around, pinch to zoom or slide two fingers to move sideways. To move a fitting, tap it and choose Move.</p><p>Use Connect to join two terminals. In Measure, tap a terminal for each probe. You can also find a terminal by name. To remove a wire, tap it and choose Remove conductor. Undo puts it back.</p></details>:<details><summary>Mouse and keyboard help</summary><p>Click a switch, lever or button to work it. In Sandbox, drag the body of a fitting to move it. Find the camera controls under View.</p><p>In Orbit, drag the background to turn, scroll to zoom or drag with the right button to move sideways. In Free camera, click the bench and use WASD to move. Use Q or E to change height, Shift to move faster and the right mouse button to look around. Drag with the middle button to pan or scroll to move forwards and back.</p><p>Use Connect to join two terminals. In Measure, click a terminal for each probe or one wire to read its current. Switch off all supplies before measuring resistance.</p><p>Use Ctrl+Z to undo, Ctrl+Shift+Z to redo and Escape to cancel. Test circuit tries the controls on a copy of your wiring. For a fault exercise, take your readings, choose the fault, repair it and test again.</p></details>}<p className="small-copy">The bench shows what happens once the circuit settles. Each course lists the equipment references and what the simulation leaves out.</p></DialogContent></Dialog>
    <Dialog open={!!replacePrompt} onOpenChange={open=>{if(!open&&!replaceBusy)setReplacePrompt(undefined);}}><DialogContent><DialogHeader><DialogTitle>Keep your current work?</DialogTitle></DialogHeader><p>{replacePrompt?.title+' will replace the circuit on your bench. Save a copy to keep your changes.'}</p><div className="quick-actions"><Button className="primary-button" disabled={replaceBusy} onClick={()=>void continueReplacement(true)}>{replaceBusy?'Saving…':'Save and continue'}</Button><Button variant="outline" disabled={replaceBusy} onClick={()=>void continueReplacement(false)}>Discard and continue</Button><Button variant="outline" disabled={replaceBusy} onClick={()=>setReplacePrompt(undefined)}>Cancel</Button></div></DialogContent></Dialog>
    {notice&&<div className="notice" role="status"><Lightbulb size={17}/><span>{notice}</span><button aria-label="Dismiss notification" onClick={()=>setNotice('')}><X size={15}/></button></div>}{backupBusy&&<div className="backup-overlay" role="status">Restoring your builds and progress…</div>}
  </div></TooltipProvider>;
}
