/* App-owned native gallery diagnostics. */
'use strict';
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const sameBounds=(a,b)=>['x','y','width','height'].every(key=>a[key]===b[key]);
function windowSnapshot(window){return {bounds:window.getNormalBounds(),maximized:window.isMaximized(),fullscreen:window.isFullScreen(),minimized:window.isMinimized()};}
/** Wait for OS acknowledgment, not just the requested JS window state. Two
 * consecutive actual/normal samples must agree before maximizing again. */
async function restoreWindow(window,original,wait=delay){
  if(window.isMinimized())window.restore();
  window.setFullScreen(false);window.unmaximize();
  for(let i=0;i<100&&(window.isFullScreen()||window.isMaximized());i++)await wait(50);
  if(window.isFullScreen()||window.isMaximized())throw new Error('Native window did not leave fullscreen/maximized state');
  window.setBounds(original.bounds);let settled=0;
  for(let i=0;i<100&&settled<2;i++){
    settled=sameBounds(window.getBounds(),original.bounds)&&sameBounds(window.getNormalBounds(),original.bounds)?settled+1:0;
    await wait(50);
  }
  if(settled<2)throw new Error('Native normal bounds did not settle to the original rectangle');
  if(original.maximized)window.maximize();
  if(original.fullscreen)window.setFullScreen(true);
  if(original.minimized)window.minimize();
  for(let i=0;i<100;i++){
    if(window.isMaximized()===original.maximized&&window.isFullScreen()===original.fullscreen&&window.isMinimized()===original.minimized)break;
    await wait(50);
  }
  await wait(100);const actual=windowSnapshot(window);
  return {original,actual,passed:sameBounds(actual.bounds,original.bounds)&&actual.maximized===original.maximized&&actual.fullscreen===original.fullscreen&&actual.minimized===original.minimized};
}
module.exports={sameBounds,windowSnapshot,restoreWindow};
