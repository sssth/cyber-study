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
