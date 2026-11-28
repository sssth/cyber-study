import test from 'node:test';
import assert from 'node:assert/strict';
import {appliedExpression,changeFilter,expressionState,restoreExpression} from './filterExpression.js';
import {movieFilters,matchesMovie} from '../features/movies/movieSearch.js';
import {matchesItem} from './searchCore.js';

const catalog={id:'entity-catalog',filters:[{key:'type',options:[['book','书籍'],['movie','电影']]}]};
const movie={id:'movie',filters:movieFilters};

test('visual type and typed type execute the same predicate and preserve grouped logic',()=>{
 const original='杭州 RELATED OR NOT title:"TYPE book"';
 const selected=changeFilter(original,catalog,'type','book');
 assert.equal(selected,'TYPE book AND ('+original+')');
 assert.deepEqual(expressionState(selected,catalog).values,{type:'book'});
 assert.equal(changeFilter(selected,catalog,'type',''),original);
 assert.equal(changeFilter(selected,catalog,'type','movie'),'TYPE movie AND ('+original+')');
 assert.deepEqual(expressionState('TYPE book OR TYPE movie',catalog).values,{});
 assert.equal(matchesItem('book',{},appliedExpression('TYPE movie',catalog,{filters:{type:'book'}})),false);
});

test('visual score and date bounds support zero, replacement, and single-sided ranges',()=>{
 let q=changeFilter('',movie,'scoreMin','0');
 q=changeFilter(q,movie,'scoreMax','6');
 q=changeFilter(q,movie,'from','2021-01-01');
 assert.deepEqual(expressionState(q,movie).values,{scoreMin:'0',scoreMax:'6',from:'2021-01-01'});
 const state=appliedExpression(q,movie,{filters:{}});
 assert.ok(matchesMovie({score:0,watchedOn:'2021年1月1号'},state));
 assert.equal(matchesMovie({watchedOn:'2021-01-01'},state),false);
 assert.equal(changeFilter(q,movie,'scoreMin',''),'score:TO 6 AND watchedOn:FROM 2021-01-01');
 assert.match(changeFilter(q,movie,'scoreMin','8'),/score:FROM 8 TO 8/);
});

test('page search modes are visible, preserve the reader text, and can be deleted',()=>{
 const scope={id:'book:b',filters:[{key:'context',options:[['chapter','章'],['paragraph','段']]}]};
 const expression=restoreExpression({query:'杭州  雨天',filters:{context:'chapter'}},scope);
 assert.deepEqual(appliedExpression(expression,scope,{filters:{id:'b'}}),{expression,query:'杭州  雨天',filters:{context:'chapter',id:'b'}});
 assert.equal(changeFilter(expression,scope,'context',''),'杭州  雨天');
 assert.deepEqual(appliedExpression('雨天',scope,{filters:{context:'chapter'}}).filters,{});
});

test('qualified date pasted from the slash menu reflects in both date controls',()=>{
 const diary={id:'diary',filters:[{key:'from',type:'date'},{key:'to',type:'date'}]};
 assert.deepEqual(expressionState('diary.date:FROM 2021年1月1号 TO 2021-2-1',diary).values,{from:'2021-01-01',to:'2021-02-01'});
 assert.equal(changeFilter('diary.date:FROM 2021-1-1',diary,'to','2021-02-01'),'date:FROM 2021-01-01 TO 2021-02-01');
});
