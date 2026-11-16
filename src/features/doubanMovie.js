export function doubanSubjectId(url) {
  if (!url || !['https:', 'http:'].includes(url.protocol) || url.host !== 'movie.douban.com'
      || url.username || url.password) return '';
  return url.pathname.match(/^\/subject\/(\d{1,20})\/?$/)?.[1] ?? '';
}

export function splitMovieRegions(value) {
  const entries = Array.isArray(value) ? value : [value];
  return [...new Set(entries.flatMap((entry) => typeof entry === 'string'
    ? entry.split(/[\/／,，、]+/).map((part) => part.trim()).filter(Boolean)
    : []))];
}

export function readDoubanMovie(html) {
  // Template contents stay inert. Only extracted text and a validated image URL leave the template.
  const template = document.createElement('template');
  template.innerHTML = html;
  const page = template.content;
  const content = (selector) => page.querySelector(selector)?.getAttribute('content')?.trim();
  const text = (selector) => page.querySelector(selector)?.textContent?.trim();
  let movie = {};
  for (const script of page.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const data = JSON.parse(script.textContent);
      const entries = Array.isArray(data) ? data : data?.['@graph'] ?? [data];
      const entry = entries.find((item) => [item?.['@type']].flat().some((type) => ['Movie', 'TVSeries', 'TVSeason'].includes(type)));
      if (entry) { movie = entry; break; }
    } catch {
      // Some pages have malformed structured data. The visible fields are still usable.
    }
  }

  const title = text('[property="v:itemreviewed"]') || text('#content h1 span:first-child')
    || movie.name || content('meta[property="og:title"]') || text('h1');
  if (typeof title !== 'string' || !title.trim()
      || (!page.querySelector('#info, #mainpic, [property="v:itemreviewed"], meta[property="og:type"][content="video.movie"]') && !movie.name)) return null;

  const score = String(text('[property="v:average"], .rating_self .rating_num') || movie.aggregateRating?.ratingValue || '').trim();
  const regionLabel = [...page.querySelectorAll('#info .pl')].find((node) =>
    /^制片国家\s*[\/／]\s*地区\s*[:：]?$/.test(node.textContent.trim()));
  let region = '';
  for (let node = regionLabel?.nextSibling; node && node.nodeName !== 'BR'; node = node.nextSibling) {
    region += node.textContent;
  }
  const genres = [...page.querySelectorAll('[property="v:genre"]')].map((node) => node.textContent.trim()).filter(Boolean);
  const tags = (genres.length ? genres : [movie.genre].flat())
    .filter((genre) => typeof genre === 'string' && genre.trim())
    .map((genre) => genre.trim());
  const result = { title: title.trim() };
  const image = [movie.image].flat()[0];
  try {
    const poster = new URL(content('meta[property="og:image"]') || page.querySelector('#mainpic img')?.getAttribute('src') || image?.url || image);
    if (['https:', 'http:'].includes(poster.protocol)) result.poster = poster.href;
  } catch {
    // The page may have no usable poster.
  }
  if (/^\d{1,2}(?:\.\d)?$/.test(score) && Number(score) <= 10) result.score = score;
  if (region.trim()) result.region = splitMovieRegions(region).join(' / ');
  result.genres = [...new Set(tags)].join('，');
  return result;
}
