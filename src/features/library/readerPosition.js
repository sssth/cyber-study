import { translate } from '../../i18n/index.js';
import { excerptAppearance } from './knowledgeStore.js';

export function indexChapters(blocks) {
  const chapters = [{ id: '', text: '正文' }];
  const chapterByBlock = new Map();
  const levels = blocks.filter((block) => block.type === 'heading').map((block) => block.level ?? 2);
  const chapterLevel = levels.length ? Math.min(...levels) : 2;
  let chapter = chapters[0];
  for (const block of blocks) {
    if (block.type === 'heading') {
      const entry = { id: block.id, text: block.text, level: block.level ?? 2 };
      if (entry.level === chapterLevel) {
        chapter = entry;
        chapters.push(chapter);
      }
    }
    chapterByBlock.set(block.id, chapter.id);
  }
  if (blocks.length && chapterByBlock.get(blocks[0].id)) chapters.shift();
  return { chapters, chapterByBlock };
}

export function chapterLabel(chapter) {
  return chapter?.id === '' ? translate("i18n.fullText") : chapter?.text;
}

export function chapterMarkdown(content, blocks, chapters, chapterId) {
  const index = chapters.findIndex(chapter => chapter.id === chapterId);
  if (index < 0) return '';
  const chapterStart = id => {
    const block = blocks.find(item => item.id === id);
    return block?.start > 0 ? content.lastIndexOf('\n', block.start - 1) + 1 : 0;
  };
  const start = chapterStart(chapterId);
  const end = chapters[index + 1] ? chapterStart(chapters[index + 1].id) : content.length;
  return content.slice(start, end).trim();
}

export function readerPosition(element, paged) {
  const bounds = element.getBoundingClientRect();
  for (const block of element.querySelectorAll('[data-block]')) {
    const visible = [...block.getClientRects()].some((rect) => paged
      ? rect.right > bounds.left + 2 && rect.left < bounds.right - 2
      : rect.bottom > bounds.top + 2 && rect.top < bounds.bottom - 2);
    if (visible) return block.dataset.block;
  }
  return null;
}

export function goToReaderBlock(element, block, paged) {
  const bounds = element.getBoundingClientRect();
  const rect = block.getClientRects()[0];
  if (!rect) return;
  if (paged) {
    const offset = element.scrollLeft + rect.left - bounds.left;
    element.scrollLeft = Math.floor(Math.max(0, offset + 1) / element.clientWidth) * element.clientWidth;
  } else {
    element.scrollTop += rect.top - bounds.top - 24;
  }
}

export function highlightRanges(blocks, groups, { maskLegacyUnderlines = false } = {}) {
  const byBlock = new Map();
  const byId = new Map(blocks.map((block) => [block.id, block]));
  const append = (blockId, range) => {
    if (!byBlock.has(blockId)) byBlock.set(blockId, []);
    byBlock.get(blockId).push(range);
  };
  for (const [key, [note]] of groups) {
    const appearance = excerptAppearance(note);
    if (appearance.excerptType === 'hidden' && !(maskLegacyUnderlines && note.markdownUnderline)) continue;
    if (note.ranges?.length) {
      for (const { blockId, start, end } of note.ranges) append(blockId, { key, start, end, ...appearance });
      continue;
    }
    for (const block of note.blockId ? [byId.get(note.blockId)] : blocks) {
      if (!block || !note.quote) continue;
      const start = block.text.indexOf(note.quote);
      if (start >= 0) append(block.id, { key, start, end: start + note.quote.length, ...appearance });
    }
  }
  return byBlock;
}

// Store a source-text position rather than a page number, which changes on filtering.
export function readingAnchor(element, paged) {
  const bounds=element.getBoundingClientRect();
  for(const token of element.querySelectorAll('[data-reader-offset]')){
    if(![...token.getClientRects()].some(r=>r.width>0&&r.height>0&&(paged?r.right>bounds.left+2&&r.left<bounds.right-2:r.bottom>bounds.top+2&&r.top<bounds.bottom-2)))continue;
    const walker=document.createTreeWalker(token,NodeFilter.SHOW_TEXT);let node;
    while((node=walker.nextNode())){
      if(node.parentElement.closest('[hidden]'))continue;
      const range=document.createRange();let low=0,high=node.length;
      while(low<high){const mid=Math.floor((low+high)/2);range.setStart(node,mid);range.setEnd(node,mid+1);const r=range.getBoundingClientRect();if(paged?r.right<=bounds.left+2:r.bottom<=bounds.top+2)low=mid+1;else high=mid;}
      if(low<node.length)return {blockId:token.closest('[data-block]').dataset.block,offset:Number(token.dataset.readerOffset)+low};
    }
  }
  const blockId=readerPosition(element,paged);return blockId?{blockId,offset:0}:null;
}

export function goToReadingAnchor(element, anchor, paged) {
  const tokens=[...element.querySelectorAll(`[data-block="${CSS.escape(anchor.blockId)}"] [data-reader-offset]`)];
  const token=tokens.find(t=>Number(t.dataset.readerOffset)<=anchor.offset&&Number(t.dataset.readerOffset)+t.textContent.length>anchor.offset&&t.getBoundingClientRect().width>0);
  if(!token){const block=element.querySelector(`[data-block="${CSS.escape(anchor.blockId)}"]`);if(block)goToReaderBlock(element,block,paged);return;}
  const walker=document.createTreeWalker(token,NodeFilter.SHOW_TEXT);const node=walker.nextNode();if(!node)return;
  const range=document.createRange(),offset=Math.min(node.length-1,Math.max(0,anchor.offset-Number(token.dataset.readerOffset)));
  range.setStart(node,offset);range.setEnd(node,offset+1);
  const rect=range.getBoundingClientRect(),bounds=element.getBoundingClientRect();
  if(paged)element.scrollLeft=Math.floor(Math.max(0,element.scrollLeft+rect.left-bounds.left+1)/element.clientWidth)*element.clientWidth;
  else element.scrollTop+=rect.top-bounds.top-24;
}
