import test from 'node:test';
import assert from 'node:assert/strict';
import {jobSite,walkStep} from '../lib/job-site';
import {SERVICE_AREAS,serviceRoomAt,serviceVisit} from '../lib/service-floorplan';
import {LESSONS} from '../lib/lessons';
import {runLessonScenarios} from '../lib/scenarios';
import {electricalKey} from '../lib/simulation-identity';
import type {Vec3} from '../lib/types';

test('each service room connects through the drawn doorway and has clear access to its actual equipment',()=>{
  for(const [id,equipment] of [[45,'emergency'],[39,'pump'],[40,'motor'],[61,'motor-a']] as const){
    const doc=LESSONS.find(l=>l.id===id)!.circuit,previous=electricalKey(doc),site=jobSite(doc);
    assert.ok(site.kind!=='home');const area=SERVICE_AREAS[site.kind];
    assert.equal(site.items.find(i=>i.id===equipment)?.room,4);
    const join=area.side*6.6,line=area.door,step=area.side*.5;
    const before:Vec3=[join-step,1.56,line],after=walkStep(before,step*2,0,site);
    assert.equal(serviceRoomAt(site.kind,after[0],after[2]),4);
    assert.equal(walkStep(after,-step*2,0,site)[0],before[0]);
    const blocked=walkStep([before[0],1.56,area.door-area.opening/2-.44],step*2,0,site);
    assert.equal(serviceRoomAt(site.kind,blocked[0],blocked[2]),area.side===1?2:0);
    const eye=serviceVisit(site,4)!.position;
    assert.equal(serviceRoomAt(site.kind,eye[0],eye[2]),4);
    assert.deepEqual(walkStep(eye,.01,0,site),[eye[0]+.01,eye[1],eye[2]]);
    assert.ok(runLessonScenarios(doc).every(check=>check.status==='pass'));
    assert.equal(electricalKey(doc),previous);
  }
});
