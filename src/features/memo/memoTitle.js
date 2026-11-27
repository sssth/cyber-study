export function imageMemoTitle(item) {
  const date = new Date(item.createdAt || '');
  const pad = n => String(n).padStart(2,'0');
  const stamp = Number.isFinite(date.getTime())
    ? `${date.getFullYear()}年${date.getMonth()+1}月${date.getDate()}日 ${pad(date.getHours())}:${pad(date.getMinutes())}` : '';
  return ['图片便签', stamp, item.filename].filter(Boolean).join(' · ');
}
