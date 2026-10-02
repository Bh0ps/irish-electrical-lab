import type { Progress } from './storage';
import type { MeasurementEvidence } from './learning';
import { validateTestRecord, type TestRecord } from './test-record';

export interface CompetenceRecord { attempts:number; successes:number; lastPracticed:number; nextReview:number }
export interface LearningRecord { version:1; activityIds:string[]; competencies:Record<string,CompetenceRecord>; evidence:MeasurementEvidence[] }
export interface StudyProgress extends Progress { version:2; learning:Record<string,LearningRecord>; lastTest?:TestRecord }
export const emptyLearningRecord = ():LearningRecord => ({version:1,activityIds:[],competencies:{},evidence:[]});
export function migrateProgress(value:Progress|undefined):StudyProgress {
  const old=value as Partial<StudyProgress>|undefined;
  let lastTest:TestRecord|undefined;
  try{if(old?.lastTest)lastTest=validateTestRecord(old.lastTest);}catch{/* A damaged local report must not erase valid progress. Backup imports validate it before restoration. */}
  return {lessons:Array.isArray(old?.lessons)?old.lessons:[],builds:Array.isArray(old?.builds)?old.builds:[],faults:Array.isArray(old?.faults)?old.faults:[],scores:old?.scores??{},version:2,learning:old?.learning??{},...lastTest?{lastTest}:{}};
}
export function recordActivity(progress:StudyProgress,lessonId:number,activityId:string,competency:string,success:boolean,now=Date.now()):StudyProgress {
  const record=progress.learning[lessonId]??emptyLearningRecord();
  const previous=record.competencies[competency]??{attempts:0,successes:0,lastPracticed:0,nextReview:0};
  const successes=previous.successes+(success?1:0);
  const intervalDays=success?[1,3,7,14,30][Math.min(successes-1,4)]:0;
  return {...progress,learning:{...progress.learning,[lessonId]:{...record,activityIds:success?Array.from(new Set([...record.activityIds,activityId])):record.activityIds,competencies:{...record.competencies,[competency]:{attempts:previous.attempts+1,successes,lastPracticed:now,nextReview:now+intervalDays*86400000}}}}};
}
export function recordEvidence(progress:StudyProgress,lessonId:number,evidence:MeasurementEvidence):StudyProgress {
  const record=progress.learning[lessonId]??emptyLearningRecord();
  return {...progress,learning:{...progress.learning,[lessonId]:{...record,evidence:[...record.evidence.filter(e=>e.id!==evidence.id).slice(-59),structuredClone(evidence)]}}};
}
export function reviewQueue(progress:StudyProgress,now=Date.now()):{lessonId:number;competency:string;attempts:number;successes:number}[] {
  return Object.entries(progress.learning).flatMap(([id,record])=>Object.entries(record.competencies).filter(([,c])=>c.nextReview<=now).map(([competency,c])=>({lessonId:Number(id),competency,attempts:c.attempts,successes:c.successes}))).sort((a,b)=>(a.successes/Math.max(1,a.attempts))-(b.successes/Math.max(1,b.attempts)));
}
