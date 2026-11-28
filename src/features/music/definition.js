export default {
  id: 'music', label: 'i18n.recordPlayer', description: 'i18n.openMusic',
  entities: {
    playlist: {
      label: 'i18n.playlist', create: 'i18n.playlistsAndTracks',
      read: ({ list }) => {
        const playlists = new Map(list('playlists').map(record => [record.id, record]));
        const names=new Map();
        for (const track of list('music')) {
          for (const playlist of track.playlists ?? []) {
            if(!track.deletedAt){
              if(!names.has(playlist.id))names.set(playlist.id,[]);
              names.get(playlist.id).push(track.title);
            }
            if (!playlists.has(playlist.id)) playlists.set(playlist.id, playlist);
          }
        }
        return [...playlists.values()].map(p=>({...p,trackNames:names.get(p.id)||[]}));
      },
      target: { filter: 'playlistId' },
      snapshot: 'text:歌单说明 provider:平台 trackNames:成员曲目（按歌单顺序）'
    },
    music: {
      label: 'i18n.track', read: ({ list }) => list('music'), search: ['artist'],
      parent: { type: 'playlist', kind: 'contains', id: record => record.playlists?.map(list => list.id) ?? [] },
      snapshot: 'artist:歌手 album:专辑 genre:风格 durationSeconds:时长（秒） provider:平台 text:用户备注'
    }
  }
};
