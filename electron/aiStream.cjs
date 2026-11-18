const { Readable } = require('node:stream');
const { createInterface } = require('node:readline');

async function readReply(body, onText) {
  const stream = Readable.fromWeb(body);
  const lines = createInterface({ input: stream, crlfDelay: Infinity });
  let payload = [], text = '', finished = false;
  function consume() {
    const raw = payload.join('\n');
    payload = [];
    if (!raw) return false;
    if (raw.trim() === '[DONE]') return true;
    const chunk = JSON.parse(raw);
    if (chunk.error || chunk.type === 'error') throw Error('模型回复中断，请重试。');
    if (chunk.type === 'message_stop') return true;
    const choice = chunk.choices?.[0];
    if (choice?.finish_reason === 'error') throw Error('模型回复中断，请重试。');
    if (choice?.finish_reason) finished = true;
    const part = chunk.delta?.type === 'text_delta' ? chunk.delta.text : choice?.delta?.content;
    if (typeof part === 'string' && part.length) {
      text += part;
      onText(part);
    }
    return false;
  }
  try {
    for await (const line of lines) {
      if (line.startsWith('data:')) payload.push(line.slice(5).replace(/^ /, ''));
      if (!line && consume()) { finished = true; break; }
    }
    if (payload.length && consume()) finished = true;
    if (!finished) throw Error('模型回复中断，请重试。');
    if (!text.trim()) throw Error('模型没有返回可显示的文本。');
    return { role: 'assistant', content: text };
  } finally {
    lines.close();
    stream.destroy();
  }
}
module.exports = { readReply };
