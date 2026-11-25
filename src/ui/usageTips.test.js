import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseUsageTips, usageTipAt } from './usageTips.js';

const pages = parseUsageTips('# Text\n- ignored\n### Everywhere [global]\n- A || English\n- B\n### Movie [movie]\n- first\n- one\n- two\n- three\n## End\n- ignored');
function sequence(library, count) {
  return Array.from({ length: count }, (_, index) => usageTipAt(library, 'movie', index)?.en);
}
test('welcome once, then independent ordered cycles of local and global tips', () => {
  assert.deepEqual(sequence(pages, 12), ['first', 'one', 'two', 'English', 'three', 'one', 'B', 'two', 'three', 'English', 'one', 'two']);
});
test('editable and empty libraries', () => {
  const lib = new Map(pages);
  lib.set('movie', pages.get('movie').slice(0, 2));
  assert.deepEqual(sequence(lib, 5), ['first', 'one', 'English', 'one', 'B']);
  lib.set('movie', lib.get('movie').slice(0, 1));
  assert.deepEqual(sequence(lib, 4), ['first', 'English', 'B', 'English']);
  lib.set('movie', []);
  assert.deepEqual(sequence(lib, 3), ['English', 'B', 'English']);
  lib.delete('global');
  assert.deepEqual(sequence(lib, 1), [undefined]);
  lib.set('movie', pages.get('movie'));
  assert.deepEqual(sequence(lib, 5), ['first', 'one', 'two', 'three', 'one']);
  assert.equal(usageTipAt(lib, 'unlisted', 0), null);
});
test('page bullets can be moved, translated or written in Chinese only', () => {
  const catalog = parseUsageTips('### 测试 [test]\r\n- 修改后 || changed\r\n- 第二条');
  assert.deepEqual(catalog.get('test'), [
    { 'zh-CN': '修改后', en: 'changed' },
    { 'zh-CN': '第二条', en: '第二条' }
  ]);
});
