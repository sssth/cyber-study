import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeMusicPlaylist } from '../src/data/musicCollection.js';

const list = { id: '1', title: '收藏' };
const song = sourceId => ({ provider: 'netease', sourceId, title: sourceId, cachedUrl: `study-audio://audio/${sourceId}.mp3` });

test('partial, empty and repeated imports preserve old songs, ordering and cache', () => {
  const original = mergeMusicPlaylist([], 'netease', list, [song('a'), song('b')]);
  const partial = mergeMusicPlaylist(original, 'netease', list, [{ ...song('b'), cachedUrl: undefined }, song('c')]);
  assert.deepEqual(partial.map(track => track.sourceId), ['a', 'b', 'c']);
  assert.equal(partial[1].cachedUrl, song('b').cachedUrl);
  assert.deepEqual(partial.map(track => track.playlists[0].position), [0, 1, 2]);
  assert.deepEqual(mergeMusicPlaylist(partial, 'netease', list, []), partial);
  assert.deepEqual(mergeMusicPlaylist(partial, 'netease', list, [song('c')]), partial);
  assert.equal(original.length, 2);
});

test('incremental imports preserve shared membership and separate platform IDs', () => {
  let tracks = mergeMusicPlaylist([], 'netease', list, [song('a')]);
  tracks = mergeMusicPlaylist(tracks, 'netease', { id: '2', title: '另一张' }, [song('a')]);
  tracks = mergeMusicPlaylist(tracks, 'netease', list, [{ ...song('a'), title: '更新标题', cacheState: 'ready' }]);
  tracks = mergeMusicPlaylist(tracks, 'qq', list, [{ ...song('a'), provider: 'qq' }]);
  assert.equal(tracks.length, 2);
  assert.deepEqual(tracks[0].playlists.map(entry => entry.id).sort(), ['netease:1', 'netease:2']);
  assert.equal(tracks[0].title, '更新标题');
  assert.equal(tracks[0].cacheState, undefined);
  assert.equal(tracks[1].id, 'qq:a');
});
