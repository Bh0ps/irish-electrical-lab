import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_PRESENTATION_PREFERENCES, PRESENTATION_PREFERENCES_RECORD, loadPresentationPreferences, normalisePresentationPreferences, savePresentationPreferences } from '../lib/presentation-preferences';
import { readRecord, writeRecord, writeRecordsAtomic } from '../lib/storage';

test('graphics preferences handle missing and invalid profiles and bound actual camera speed',()=>{
  for(const value of [undefined,null,[],true,'free',{version:2},new Date()])assert.deepEqual(normalisePresentationPreferences(value),DEFAULT_PRESENTATION_PREFERENCES);
  const valid={version:1,cameraMode:'free',cameraSpeed:8,scenery:'industrial',quality:'high'} as const;
  assert.deepEqual(normalisePresentationPreferences({...valid,draft:'ignored'}),valid);
  assert.equal(normalisePresentationPreferences({...valid,cameraSpeed:Infinity}).cameraSpeed,DEFAULT_PRESENTATION_PREFERENCES.cameraSpeed);
  assert.equal(normalisePresentationPreferences({...valid,cameraSpeed:1000}).cameraSpeed,12);
  assert.equal(normalisePresentationPreferences({...valid,cameraSpeed:-1000}).cameraSpeed,.5);
  assert.deepEqual(normalisePresentationPreferences({version:1,cameraMode:'teleport',scenery:'remote-url',quality:'ultra'}),DEFAULT_PRESENTATION_PREFERENCES);
});
test('scenery and free-camera persistence leave all study and previous UI settings intact',async()=>{
  const preserved={draft:{id:'existing',version:1},progress:{lessons:[12],evidence:['current-reading']},builds:[{id:'saved'}],'ui-preferences':{version:1,liveHints:false,courseDepth:'apprentice'}};
  await writeRecordsAtomic(preserved);
  const preferences={version:1,cameraMode:'free',cameraSpeed:2,scenery:'courtyard',quality:'economy'} as const;
  await savePresentationPreferences(preferences);assert.deepEqual(await loadPresentationPreferences(),preferences);
  for(const [key,value] of Object.entries(preserved))assert.deepEqual(await readRecord(key),value);
  await writeRecord(PRESENTATION_PREFERENCES_RECORD,{version:99,scenery:'invalid'});assert.deepEqual(await loadPresentationPreferences(),DEFAULT_PRESENTATION_PREFERENCES);
  for(const [key,value] of Object.entries(preserved))assert.deepEqual(await readRecord(key),value);
});
