import type { BuildAssessment, AssessmentCheck } from './assessment';
import type { CircuitDocument } from './types';
import { electricalKey } from './simulation-identity';

export interface TestRecord { version:1; fingerprint:string; recordedAt:number; assessment:BuildAssessment }
/** Compact identity for study records; this is not a security or certification hash. */
export function testFingerprint(document:CircuitDocument):string {
  const text=electricalKey(document);let a=0x811c9dc5,b=0x9e3779b9;
  for(let i=0;i<text.length;i++){a=Math.imul(a^text.charCodeAt(i),0x01000193);b=Math.imul(b^text.charCodeAt(i),0x85ebca6b);}
  return (a>>>0).toString(16).padStart(8,'0')+(b>>>0).toString(16).padStart(8,'0');
}
export function captureTestRecord(document:CircuitDocument,assessment:BuildAssessment,recordedAt=Date.now()):TestRecord {
  if(assessment.circuitId!==document.id||assessment.revision!==document.revision)throw new Error('An older test cannot be recorded for the current circuit.');
  return validateTestRecord({version:1,fingerprint:testFingerprint(document),recordedAt,assessment});
}
export function validateTestRecord(value:unknown):TestRecord {
  const fail=()=>{throw new Error('Invalid saved test report. Current study data is preserved.');};
  const plain=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)&&[Object.prototype,null].includes(Object.getPrototypeOf(v));
  const text=(v:unknown,max:number):v is string=>typeof v==='string'&&v.length>0&&v.length<=max;
  if(!plain(value)||value.version!==1||!text(value.fingerprint,16)||!/^[a-f0-9]{16}$/.test(value.fingerprint)||!Number.isSafeInteger(value.recordedAt)||Number(value.recordedAt)<0) return fail();
  const a=value.assessment;
  if(!plain(a)||!Number.isSafeInteger(a.revision)||Number(a.revision)<0||!text(a.circuitId,128)||typeof a.passed!=='boolean'||!text(a.summary,8192)||!Array.isArray(a.checks)||a.checks.length>4096)return fail();
  const checks:AssessmentCheck[]=a.checks.map(c=>{
    if(!plain(c)||!text(c.id,512)||!['operation','protection','objectives','model'].includes(String(c.category))||!['pass','fail','not-run','unresolved'].includes(String(c.status))||!text(c.title,2048)||!text(c.explanation,8192)||c.component!==undefined&&!text(c.component,128)||c.wire!==undefined&&!text(c.wire,128))return fail();
    return {id:c.id,category:c.category as AssessmentCheck['category'],status:c.status as AssessmentCheck['status'],title:c.title,explanation:c.explanation,...c.component!==undefined?{component:c.component as string}:{},...c.wire!==undefined?{wire:c.wire as string}:{}};
  });
  if(a.passed&&checks.some(c=>c.status==='fail'||c.status==='unresolved')||!checks.length)return fail();
  return {version:1,fingerprint:value.fingerprint,recordedAt:Number(value.recordedAt),assessment:{revision:Number(a.revision),circuitId:a.circuitId,passed:a.passed,summary:a.summary,checks}};
}
export function testRecordMatches(record:TestRecord,document:CircuitDocument):boolean{return record.assessment.circuitId===document.id&&record.fingerprint===testFingerprint(document);}
