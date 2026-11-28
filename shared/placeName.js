// Most specific recorded administrative name for a memory point.
export const placeName = point => point?.city || point?.region || point?.country || '';
