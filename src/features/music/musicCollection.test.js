import test from 'node:test';
import assert from 'node:assert/strict';
import { alignNeteasePositions, mergeMusicPlaylist, updatePlaylistMembers, updateSongMemberships, neteasePlaylistTracks } from './musicCollection.js';

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

test('editing membership preserves other playlists, cached files and concurrent imports', () => {
  const list = {id:'list',title:'New name'};
  const other = {id:'other',title:'Other list'};
  const tracks = ['remove','keep','add','arrived'].map(id => ({
    id, cachedUrl:id, playlists:id === 'add' ? [other] : [{id:'list',title:'Old name'},other]
  }));
  const result = updatePlaylistMembers(tracks,list,['add','keep'],['keep','remove']);
  assert.deepEqual(result.map(t=>t.cachedUrl), tracks.map(t=>t.cachedUrl));
  assert.ok(result.every(t=>t.playlists.includes(other)));
  assert.deepEqual(result[0].playlists,[other]);
  assert.deepEqual(neteasePlaylistTracks(result,'list').map(t=>t.id),['add','keep','arrived']);
  assert.equal(result[1].playlists[0].title,list.title);
});

test('song-side edits append once and preserve sibling order and untouched memberships', () => {
  const lists = new Map(['a','b','c'].map(id=>[id,{id,title:id}]));
  const songs = [{id:'one',playlists:[{id:'a',position:3},{id:'c',position:0}]},
    {id:'two',playlists:[{id:'b',position:4}]}];
  const save = tracks => updateSongMemberships(tracks,'one',{title:'One'},lists,['b'],['a']);
  const result = save(save(songs));
  assert.deepEqual(result[0].playlists,[{id:'c',position:0},{id:'b',title:'b',position:5}]);
  assert.equal(result[1],songs[1]);
  assert.deepEqual(neteasePlaylistTracks(result,'b').map(track=>track.id),['two','one']);
});
