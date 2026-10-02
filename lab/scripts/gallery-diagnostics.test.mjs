import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {restoreWindow,windowSnapshot}=require('../desktop/app/gallery-diagnostics-helpers.cjs');
function fakeWindow(){
  let bounds={x:70,y:50,width:1100,height:700},normal={...bounds},maximized=true,fullscreen=true,minimized=true,pendingBounds,pendingMax=false,ticks=0;const actions=[];
  const window={
    getBounds:()=>({...bounds}),getNormalBounds:()=>({...normal}),isMaximized:()=>maximized,isFullScreen:()=>fullscreen,isMinimized:()=>minimized,
    restore(){minimized=false;actions.push('restore');},setFullScreen(value){fullscreen=value;actions.push('fullscreen:'+value);},unmaximize(){pendingMax=true;actions.push('unmaximize');},
    setBounds(value){pendingBounds={...value};actions.push('setBounds');},
    maximize(){assert.deepEqual(bounds,normal,'actual OS bounds must have caught up before maximizing');assert.equal(pendingBounds,undefined);maximized=true;actions.push('maximize');},
    minimize(){minimized=true;actions.push('minimize');},
  };
  const wait=async()=>{ticks++;if(pendingMax){maximized=false;pendingMax=false;}if(pendingBounds){normal={...pendingBounds};if(ticks>=4){bounds={...pendingBounds};pendingBounds=undefined;}}};
  return {window,wait,actions};
}
test('gallery restores delayed OS bounds before restoring maximized/fullscreen/minimized states',async()=>{
  const {window,wait,actions}=fakeWindow(),original={bounds:{x:20,y:15,width:1600,height:1000},maximized:true,fullscreen:true,minimized:true};
  const report=await restoreWindow(window,original,wait);assert.equal(report.passed,true);assert.deepEqual(windowSnapshot(window),original);assert.ok(actions.indexOf('setBounds')<actions.indexOf('maximize'));
});
test('gallery refuses a silent native bounds restoration failure',async()=>{
  const {window}=fakeWindow();window.unmaximize=()=>{window.isMaximized=()=>false;};window.setBounds=()=>{};
  await assert.rejects(restoreWindow(window,{bounds:{x:0,y:0,width:1600,height:1000},maximized:false,fullscreen:false,minimized:false},async()=>{}),/bounds did not settle/);
});
