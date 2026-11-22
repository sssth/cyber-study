import test from 'node:test';
import assert from 'node:assert/strict';
import { day, duration, initializeActivity, loadActivity, recordActivity } from '../data/activityTime.js';
import { saveSpaceData } from '../data/spaceStorage.js';
import { entityMetrics, layoutKey, readLayout } from './statistics.js';

function storage() {
  const values = new Map();
  globalThis.localStorage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
}
test('old layouts migrate related metrics to one section, including empty layouts', () => {
  storage(); saveSpaceData('statistics-blocks', ['links','entities','todos']);
  assert.deepEqual(readLayout().map(g => g.id), ['entities','memo']);
  assert.ok(readLayout()[0].items.includes('related'));
  saveSpaceData(layoutKey, [{id:'memo',items:[]}]); assert.deepEqual(readLayout(), [{id:'memo',items:[]}]);
  saveSpaceData(layoutKey, []); assert.deepEqual(readLayout(), []);
});
test('separate elapsed times clip at rolling boundaries and preserve legacy focus', () => {
  storage();
  const now = Date.now();
  saveSpaceData('plant', {focusMinutes:20}); initializeActivity();
  recordActivity('reading', now-day-20000, now-day+40000);
  recordActivity('music', now-day-20000, now-day+40000);
  recordActivity('copying', now-40000, now);
  const data = loadActivity(now);
  assert.equal(data.legacy,1200000);
  assert.equal(duration(data,'reading',1,now),40000);
  assert.equal(duration(data,'reading',7,now),60000);
  assert.equal(duration(data,'music',0,now),60000);
  assert.equal(duration(data,'diary',7,now),0);
});
test('metrics distinguish membership from entity count and respect reading status', () => {
  storage();
  localStorage.setItem('cyber-study.reader.v1', JSON.stringify({books:{b:{readingStatus:'finished'}}}));
  const metrics=entityMetrics([{id:'b',type:'book'}, {id:'p',type:'memory_point'},
    {id:'j',type:'journey',pointIds:['p']},{id:'k',type:'journey',pointIds:['p']}].map(item=>({...item,key:item.type+':'+item.id})),Date.now());
  assert.equal(metrics.includedPoints,1); assert.equal(metrics.contains,2); assert.equal(metrics.finished,1);
});

test('journal day windows and current streak use distinct local dates and allow today to finish', () => {
  storage();
  const items = ['2026-10-24','2026-10-25','2026-11-16','2026-11-17','2026-11-21','2026-11-22','2026-11-22']
    .map((date,i) => ({type:'diary', id:String(i), key:'diary:'+i, date}));
  const now = new Date(2026,10,23,12).getTime();
  const metrics = entityMetrics(items,now);
  assert.equal(metrics.monthDays,5);
  assert.equal(metrics.recentDays,3);
  assert.equal(metrics.streakDays,2);
  assert.equal(entityMetrics(items,new Date(2026,10,24,0).getTime()).streakDays,0);
  items.push({type:'diary',id:'today',key:'diary:today',date:'2026-11-23'});
  assert.equal(entityMetrics(items,now).streakDays,3);
});
test('visited places exclude wishes, deduplicate city picker and manual entries, and distinguish regions', () => {
  storage();
  const base = {country:'A',region:'North',city:'Springfield'};
  const items = [{...base,cityId:'id-a'}, {...base,city:' springfield '}, {...base,region:'South'},
    {...base,country:'B'}, {visitStatus:'visited'}, {country:'C',city:'Elsewhere',visitStatus:'wish'}]
    .map((point,i)=>({...point,type:'memory_point',id:String(i),key:'memory_point:'+i}));
  const stats = entityMetrics(items, Date.now());
  assert.deepEqual([stats.wishPoints,stats.visitedPoints,stats.visitedCities,stats.visitedRegions,stats.visitedCountries],[1,5,3,3,2]);
});
test('count marked excerpts, annotation characters and only completed copying works', () => {
  storage();
  const items = [
    ...['underline','highlight','bookmark','excerpt'].map(excerptType=>({type:'excerpt',excerptType})),
    {type:'annotation',annotation:'甲 \n乙'}, {type:'typing_work',complete:true,typedText:'一 二',text:'longer'},
    {type:'typing_work',complete:true,text:'三'}, {type:'typing_work',complete:false,typedText:'四'}
  ].map((item,i)=>({...item,id:String(i),key:item.type+':'+i}));
  const stats = entityMetrics(items,Date.now());
  assert.deepEqual([stats.excerpts,stats.underlines,stats.highlights,stats.bookmarks,stats.annotationCharacters,stats.copiedCharacters],[4,1,2,1,2,3]);
});
