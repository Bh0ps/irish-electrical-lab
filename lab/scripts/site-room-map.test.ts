import test from 'node:test';
import assert from 'node:assert/strict';
import {getLesson,LESSONS} from '../lib/lessons.ts';
import {jobSite} from '../lib/job-site.ts';
import {homeVisit,STAIR_LANDING,SIDE_PASSAGE} from '../lib/home-floorplan.ts';
import {serviceVisit} from '../lib/service-floorplan.ts';
import {siteMapLayout,locateOnMap} from '../lib/site-room-map.ts';

test('all room-map destinations correspond to a standing visit in their actual rooms',()=>{
  for(const lesson of LESSONS){
    const site=jobSite(lesson.circuit),layout=siteMapLayout(site);
    assert.ok(layout.walls.length>0);
    for(const room of layout.rooms){
      const view=site.kind==='home'?homeVisit(room.id,layout.stairs,site.doorsteps):serviceVisit(site,room.id);
      assert.ok(view,lesson.title+' / '+room.name);
      const mark=locateOnMap(site,'visit',12,{...view,job:'visit',focus:12,walking:true},true,-1);
      assert.equal(mark.room,room.id,lesson.title+' / '+room.name);
      assert.deepEqual([mark.x,mark.z,mark.yaw],[view.position[0],view.position[2],view.yaw]);
    }
  }
});
test('the side passage and upper landing appear only where the site contains them',()=>{
  const ids=(lesson:number)=>siteMapLayout(jobSite(getLesson(lesson)!.circuit)).rooms.map(r=>r.id);
  assert.ok(ids(72).includes(SIDE_PASSAGE.id));assert.ok(!ids(2).includes(SIDE_PASSAGE.id));
  assert.ok(ids(9).includes(STAIR_LANDING.id));assert.ok(!ids(72).includes(STAIR_LANDING.id));
});
test('inspection marks the fitting; stale camera data never marks a walking position',()=>{
  const site=jobSite(getLesson(2)!.circuit),board=site.items.find(i=>i.id==='course-enclosure')!;
  const view={...homeVisit(0,false)!,job:'old',focus:0,walking:true};
  const close=locateOnMap(site,'new',1,view,false,0,board.id);
  assert.deepEqual([close.room,close.x,close.z,close.yaw],[board.room,board.position[0],board.position[2],undefined]);
  for(const stale of [view,{...view,job:'new'},undefined])assert.equal(locateOnMap(site,'new',1,stale,true,3).x,undefined);
});
