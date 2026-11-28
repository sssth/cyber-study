import test from 'node:test';
import assert from 'node:assert/strict';
import {readAssistantReply,searchCapabilities,validCandidate} from './expressionAssistant.js';

const movie={id:'movie',label:'影片'};
test('conversion describes all movie fields and rejects out-of-scope expressions',()=>{
 const {fields}=searchCapabilities(movie);
 assert.equal(Object.keys(fields).length,13);
 assert.deepEqual(fields.personalScore,['个人评分','number',{min:0,max:10}]);
 assert.deepEqual(fields.photo,['图片（有／无）','bool']);
 for(const query of ['personalScore:FROM 12','artist:张三','TYPE book','杭州 RELATED','watchedOn:2021-02-30','movie.status:已读'])
   assert.equal(validCandidate(query,movie),false,query);
 assert.ok(validCandidate('personalScore:FROM 0 TO 8 AND photo:NO',movie));
});
test('reply protocol distinguishes questions and complete queries',()=>{
 assert.deepEqual(readAssistantReply('{"ask":"哪种评分？"}',movie),{ask:'哪种评分？'});
 for(const text of ['{}','{"query":["foo"]}','{"ask":"a","query":"b"}','{"query":"个人评分:FROM 12"}'])
   assert.equal(readAssistantReply(text,movie),null);
});
test('geography exposes point and journey types to the converter',()=>{
 const scope={id:'geography',label:'地球仪'};
 const data=searchCapabilities(scope);
 assert.deepEqual(Object.keys(data.types).sort(),['journey','memory_point']);
 assert.ok(validCandidate('TYPE journey AND startDate:FROM 2026-01-01',scope));
 assert.equal(validCandidate('searchBy:journey',scope),false);
});
