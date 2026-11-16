export function parseInlineMarkdown(source, initialUnderline = false) {
  const tokens = /<\/?u>|\*\*([^*]+)\*\*|__([^_]+)__|`([^`]+)`|\[([^\]]+)\]\([^)]+\)/g;
  const parts = [];
  let cursor = 0;
  let underline = initialUnderline;
  for (const match of source.matchAll(tokens)) {
    if (cursor < match.index) parts.push({ text: source.slice(cursor, match.index), start: cursor, underline });
    const [token, strong, alternateStrong, code, link] = match;
    if (token === '<u>' || token === '</u>') {
      underline = token === '<u>';
    } else {
      const value = strong ?? alternateStrong ?? code ?? link;
      const innerStart = match.index + (code || link ? 1 : 2);
      const kind = code ? 'code' : link ? undefined : 'strong';
      const inner = code ? [{ text: value, start: 0, underline }] : parseInlineMarkdown(value, underline);
      parts.push(...inner.map((part) => ({ ...part, kind, start: innerStart + part.start })));
    }
    cursor = match.index + token.length;
  }
  if (cursor < source.length) parts.push({ text: source.slice(cursor), start: cursor, underline });
  return parts;
}

export function parseMarkdownContent(content) {
  const blocks = [];
  const sections = [];
  let fence = null;
  let offset = 0;
  for (const line of content.split(/(?<=\n)/)) {
    const start = offset + (line.length - line.trimStart().length);
    offset += line.length;
    const source = line.trim();
    const delimiter = source.match(/^(`{3,}|~{3,})/);
    if (delimiter && (!fence || delimiter[1][0] === fence[0] && delimiter[1].length >= fence.length)) {
      fence = fence ? null : delimiter[1];
      continue;
    }
    if (!source || !fence && /^(# |作者：|来源：|<!--.*-->$)/.test(source)) continue;
    const heading = !fence && source.match(/^#{2,6}\s+/);
    const list = !fence && source.match(/^(?:[-*+] |\d+\. |>{1,3} )/);
    const prefix = heading?.[0] ?? list?.[0] ?? '';
    const body = source.slice(prefix.length);
    const parts = fence ? [{ text: body, start: 0 }] : parseInlineMarkdown(body);
    const text = parts.map((part) => part.text).join('');
    const level = heading ? heading[0].trim().length : null;
    if (level) {
      while (sections.length && sections.at(-1).level >= level) sections.pop();
      sections.push({ level, text });
    }
    blocks.push({
      id: `block-${blocks.length}`, level, section: sections.map((item) => item.text).join(' › '), prefix: list?.[0] ?? '',
      type: heading || /^第[一二三四五六七八九十百千0-9]+[章节卷回]/.test(body) ? 'heading' : 'paragraph',
      text,
      parts, start: start + prefix.length, code: Boolean(fence)
    });
  }
  return blocks;
}

export function underlineMarkdown(content, block, start, end) {
  if (block.code) throw new Error('代码块内无法保存下划线。');
  let cursor = 0;
  const edits = [];
  for (const part of block.parts) {
    const from = Math.max(0, start - cursor);
    const to = Math.min(part.text.length, end - cursor);
    if (!part.underline && from < to) {
      const startOffset = block.start + part.start + from;
      const endOffset = block.start + part.start + to;
      if (part.kind === 'code') continue;
      edits.push([startOffset, endOffset]);
    }
    cursor += part.text.length;
  }
  for (const [from, to] of edits.reverse()) {
    content = content.slice(0, from) + '<u>' + content.slice(from, to) + '</u>' + content.slice(to);
  }
  return content;
}

export function formatProgress(progress) {
  const value = Math.min(1, Math.max(0, Number(progress) || 0));
  return `${Math.round(value * 100)}%`;
}
