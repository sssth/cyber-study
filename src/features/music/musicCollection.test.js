import test from 'node:test';
import assert from 'node:assert/strict';
import { alignNeteasePositions, mergeMusicPlaylist, neteasePlaylistTracks } from './musicCollection.js';

test('NetEase uses each playlist’s platform order across cache updates and reimports', () => {
  const list = { id: 'likes', title: '喜欢' };
  const playlist = 'netease:likes';
  const song = sourceId => ({ sourceId, title: sourceId });
  let tracks = mergeMusicPlaylist([], 'netease', list, ['a', 'b', 'old'].map(song));
  tracks = mergeMusicPlaylist(tracks, 'netease', { id: 'other' }, ['a', 'b'].map(song));
  const ranks = new Map(['b', 'new', 'a'].map((id, index) => ['netease:' + id, index]));
  tracks = alignNeteasePositions(tracks, playlist, ranks);
  for (const id of ['a', 'new', 'b']) {
    tracks = mergeMusicPlaylist(tracks, 'netease', list, [song(id)], ranks);
  }
  const restored = JSON.parse(JSON.stringify(tracks));
  assert.deepEqual(neteasePlaylistTracks(restored, playlist).map(t => t.sourceId), ['b', 'new', 'a', 'old']);
  assert.deepEqual(neteasePlaylistTracks(restored, 'netease:other').map(t => t.sourceId), ['a', 'b']);
});
