import { normalize, termsOf } from '../search/searchCore.js';

export function diarySearchRanges(text, query) {
  const starts = [], ends = [];
  let normalized = '', offset = 0;
  for (const character of text) {
    const part = normalize(character);
    for (let i = 0; i < part.length; i++) { starts.push(offset); ends.push(offset + character.length); }
    normalized += part;
    offset += character.length;
  }
  const matches = [];
  for (const term of new Set(termsOf(query))) {
    let from = 0, index;
    while (term && (index = normalized.indexOf(term, from)) !== -1) {
      matches.push([starts[index], ends[index + term.length - 1]]);
      from = index + term.length;
    }
  }
  const ranges = [];
  for (const match of matches.sort((a, b) => a[0] - b[0] || a[1] - b[1])) {
    const last = ranges.at(-1);
    if (last && match[0] < last[1]) last[1] = Math.max(last[1], match[1]);
    else ranges.push([...match]);
  }
  return ranges;
}
