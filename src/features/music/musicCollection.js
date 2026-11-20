// Import is additive: only explicit playlist removal may remove a saved membership.
export function mergeMusicPlaylist(tracks, provider, list, imported) {
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
        { id: playlistId, title: list.title, position: membership?.position ?? nextPosition++ },
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
