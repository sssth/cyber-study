// Only text that can be applied verbatim to every selected item belongs here.
const fieldsByType = {
  book: ['title', 'author'],
  movie: ['title', 'region', 'genres', 'tags', 'review', 'url', 'douban'],
  music: ['title', 'artist', 'note'],
  playlist: ['title', 'description'],
  journey: ['title', 'tripNote'],
  memory_point: ['title', 'location', 'caption'],
  typing_work: ['title', 'sourceText'],
  annotation: ['annotation'],
  memo: ['text'],
  todo: ['text']
};
const labels = {
  title: 'name', region: 'countryOrRegion', url: 'link2', note: 'notes',
  tripNote: 'tripDescription', location: 'place', caption: 'description', text: 'content'
};
const multiline = new Set(['review', 'note', 'description', 'tripNote', 'caption', 'sourceText', 'annotation', 'text']);

export function sharedFields(items) {
  const lists = [...new Set(items.map(item => item.type))].map(type => fieldsByType[type] ?? []);
  const hasImageMemo = items.some(item => item.imageMemo);
  return (lists[0] ?? []).filter(key => lists.every(list => list.includes(key)) && !(hasImageMemo && key === 'text'))
    .map(key => ({ key, label: 'i18n.' + (labels[key] || key), multiline: multiline.has(key) }));
}
