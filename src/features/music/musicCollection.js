export function neteasePlaylistTracks(tracks, playlistId) {
  return tracks.flatMap(track => {
    const membership = track.playlists?.find(entry => entry.id === playlistId);
    return membership ? [{ track, position: membership.position ?? Infinity }] : [];
  }).sort((a, b) => a.position - b.position).map(entry => entry.track);
}

// Keep previously imported songs that are no longer on the platform after its current tracks.
export function alignNeteasePositions(tracks, playlistId, positions) {
  const ranks = new Map(positions);
  let next = positions.size;
  for (const track of neteasePlaylistTracks(tracks, playlistId)) {
    if (!ranks.has(track.id)) ranks.set(track.id, next++);
  }
  return tracks.map(track => {
    if (!track.playlists?.some(entry => entry.id === playlistId)) return track;
    return { ...track, playlists: track.playlists.map(entry => entry.id === playlistId
      ? { ...entry, position: ranks.get(track.id) } : entry) };
  });
}

// Import is additive: only explicit playlist removal may remove a saved membership.
export function mergeMusicPlaylist(tracks, provider, list, imported, positions) {
  const playlistId = `${provider}:${list.id}`;
  const merged = new Map(tracks.map(track => [track.id, track]));
  let nextPosition = tracks.reduce((next, track) => {
    const entry = track.playlists?.find(item => item.id === playlistId);
    return entry ? Math.max(next, (entry.position ?? 0) + 1) : next;
  }, 0);
  for (const item of imported) {
    const id = `${provider}:${item.sourceId}`;
    const previous = merged.get(id);
    const membership = previous?.playlists?.find(entry => entry.id === playlistId);
    const { cacheState, ...saved } = item;
    merged.set(id, {
      ...previous, ...saved, id, createdAt:previous ? previous.createdAt : new Date().toISOString(),
      cachedUrl: item.cachedUrl || previous?.cachedUrl,
      audioAssetId: item.cachedUrl || previous?.audioAssetId || previous?.cachedUrl || null,
      playlists: [
        ...(previous?.playlists ?? []).filter(entry => entry.id !== playlistId),
        { id: playlistId, title: list.title, position: positions?.get(id) ?? membership?.position ?? nextPosition++ },
      ],
    });
  }
  return [...merged.values()];
}

export function nextQueuedTrack(queue, currentIndex, mode, manual = false) {
  if (currentIndex < 0) return null;
  if (manual && currentIndex === queue.length - 1) return queue[0];
  if (mode === 'shuffle' && queue.length > 1) {
    const index = Math.floor(Math.random() * (queue.length - 1));
    return queue[index < currentIndex ? index : index + 1];
  }
  return queue[currentIndex + 1] ?? queue[0];
}

export function updatePlaylistMembers(tracks, playlist, selectedIds, originalIds) {
  const ranks = new Map(selectedIds.map((id, index) => [id, index]));
  const original = new Set(originalIds);
  return tracks.map(track => {
    const entries = track.playlists ?? [];
    const member = entries.find(entry => entry.id === playlist.id);
    if (!ranks.has(track.id)) {
      if (!member || !original.has(track.id)) return track;
      return { ...track, playlists: entries.filter(entry => entry.id !== playlist.id) };
    }
    const updated = { ...member, id: playlist.id, title: playlist.title, position: ranks.get(track.id) };
    return { ...track, playlists: member
      ? entries.map(entry => entry.id === playlist.id ? updated : entry)
      : [...entries, updated] };
  });
}

export function updateSongMemberships(tracks, trackId, values, playlists, selected, original) {
  const removed = new Set(original.filter(id => !selected.includes(id)));
  const added = selected.filter(id => !original.includes(id) && playlists.has(id));
  const nextPosition = new Map(added.map(id => [id, 0]));
  for (const track of tracks) for (const entry of track.playlists ?? []) {
    if (nextPosition.has(entry.id)) nextPosition.set(entry.id, Math.max(nextPosition.get(entry.id), (entry.position ?? 0) + 1));
  }
  return tracks.map(track => {
    if (track.id !== trackId) return track;
    const memberships = (track.playlists ?? []).filter(entry => !removed.has(entry.id));
    for (const id of added) {
      if (!memberships.some(entry => entry.id === id)) memberships.push({id, title:playlists.get(id).title, position:nextPosition.get(id)});
    }
    return {...track, ...values, playlists:memberships};
  });
}
