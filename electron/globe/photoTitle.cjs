function photoTitle(point) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(point.date || '');
  const day = match ? `${match[1]}年${Number(match[2])}月${Number(match[3])}日` : '';
  return [point.city || point.region || point.country,
    [day,point.time?.slice(0,5)].filter(Boolean).join(' '), point.filename].filter(Boolean).join(' · ');
}
module.exports = { photoTitle };
