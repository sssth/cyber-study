import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {snapshotStore} from '../electron/snapshots.cjs';
import {snapshotMarkdown} from '../src/resultApplications/snapshotMarkdown.js';
import {snapshotPrompt} from '../src/data/snapshotPrompt.js';

test('保存、列出并把选定快照作为文字加入提问',async context=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'study-snapshots-'));
  context.after(()=>fs.rm(root,{recursive:true,force:true}));
  const store=snapshotStore(root),time=Date.now();
  const markdown=snapshotMarkdown({time,source:{detail:true,label:'阅读器'},entities:[{type:'book',record:{title:'测试书',content:'实际的正文。'}}]});
  const [first,second]=await Promise.all([store.save({time,markdown}),store.save({time,markdown})]);
  assert.notEqual(first,second);
  await fs.writeFile(path.join(root,'快照保存','ignore.txt'),'不应发送');
  assert.deepEqual(new Set(await store.list()),new Set([first,second]));
  const prompt=snapshotPrompt('总结一下',[{name:first,text:await store.read(first)}]);
  assert.match(prompt,/总结一下\n\n以下是用户附带的快照/);
  assert.ok(prompt.includes(markdown));assert.match(prompt,/对象详情 · 1 项/);assert.match(prompt,/实际的正文/);
  assert.ok(!prompt.includes('不应发送'));assert.equal(snapshotPrompt('你好',[]),'你好');
  await assert.rejects(store.read('ignore.txt'));await assert.rejects(store.read('../x.md'));
});


test('快照使用可读的日期和选项标签', () => {
  const markdown = snapshotMarkdown({
    time: Date.UTC(2026, 10, 20), source: {}, entities: [],
    scope: {
      filters: [
        { key: 'from', label: 'i18n.startDate' },
        { key: 'status', label: 'Status', options: [['wanted', 'i18n.wantToWatch']] }
      ],
      state: { filters: { from: '2026-11-01', status: 'wanted' } }
    }
  });
  assert.match(markdown, /Start date：2026-11-01/);
  assert.match(markdown, /Status：Want to watch/i);
  assert.doesNotMatch(markdown, /i18n\./);
});
