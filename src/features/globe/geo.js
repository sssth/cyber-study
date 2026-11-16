export function globePosition(latitude, longitude, radius = 1) {
  const lat = latitude * Math.PI / 180, lon = longitude * Math.PI / 180;
  return [radius * Math.cos(lat) * Math.cos(lon), radius * Math.sin(lat), -radius * Math.cos(lat) * Math.sin(lon)];
}
export function memoryPlaces(photos) {
  const places = new Map();
  for (const photo of photos) {
    if (photo.deletedAt || photo.locationStatus !== 'confirmed' || !Number.isFinite(photo.latitude) || !Number.isFinite(photo.longitude) || Math.abs(photo.latitude) > 90 || Math.abs(photo.longitude) > 180) continue;
    // Only group genuinely identical coordinates; nearby distinct places remain distinct.
    const longitude = photo.longitude === 180 ? -180 : photo.longitude;
    const key = `${photo.latitude},${longitude}`;
    if (!places.has(key)) places.set(key, { id: key, latitude: photo.latitude, longitude, name: photo.location || '未命名地点', photos: [] });
    places.get(key).photos.push(photo);
  }
  return [...places.values()].map(place => ({ ...place, photos: place.photos.sort((a, b) => String(b.date || '').localeCompare(String(a.date || ''))) }));
}
