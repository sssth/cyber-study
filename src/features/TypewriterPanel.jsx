import { useState } from 'react';
import { memoPosition } from './memoLayout.js';
import { FeaturePanel } from './ui.jsx';
import { createId, loadSpaceData, saveSpaceData } from '../data/spaceStorage.js';

const font = 'KaiTi, STKaiti, "Kaiti SC", serif';

const typewriterTexts = [
  { id: 'xinjing', title: '心经', text: '观自在菩萨，行深般若波罗蜜多时，照见五蕴皆空，度一切苦厄。' },
  { id: 'daodejing', title: '道德经', text: '上善若水。水善利万物而不争，处众人之所恶，故几于道。' },
  { id: 'lunyu', title: '论语', text: '学而时习之，不亦说乎？有朋自远方来，不亦乐乎？' },
  { id: 'zhouyi', title: '周易', text: '天行健，君子以自强不息。地势坤，君子以厚德载物。' }
];

function makePhoto(work, heading, paper) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const lines = Array.from(work.text.matchAll(/[\s\S]{1,16}/gu), (match) => match[0]);
  canvas.width = 1240;
  canvas.height = 230 + 92 * lines.length;
  ctx.fillStyle = paper;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#302419';
  ctx.textBaseline = 'middle';
  ctx.font = '48px ' + font;
  ctx.fillText(heading || work.title, 80, 90, 1080);
  ctx.font = '64px ' + font;
  lines.forEach((line, index) => ctx.fillText(line, 80, 190 + index * 92, 1080));
  return canvas.toDataURL('image/jpeg', 0.94);
}

export default function TypewriterPanel({ onClose }) {
  const [works, setWorks] = useState(() => loadSpaceData('typewriter', []));
  const [textId, setTextId] = useState(typewriterTexts[0].id);
  const [draftId, setDraftId] = useState(null);
  const [typed, setTyped] = useState('');
  const [message, setMessage] = useState('');
  const [work, setWork] = useState(null);
  const [heading, setHeading] = useState('');
  const [paper, setPaper] = useState('#f6e8ca');
  const selected = typewriterTexts.find((item) => item.id === textId);
  const characters = [...typed];
  const target = [...selected.text];
  const complete = typed === selected.text;

  const persist = (next, success) => {
    if (!saveSpaceData('typewriter', next)) {
      setMessage('保存失败，本地存储可能已满。');
      return false;
    }
    setWorks(next);
    setMessage(success);
    return true;
  };

  const save = () => {
    if (!typed) return;
    const id = draftId ?? createId('work');
    const record = { id, textId, title: selected.title, text: typed, complete, createdAt: new Date().toISOString() };
    if (persist([record, ...works.filter((item) => item.id !== id)], complete ? '作品已完成并保存。' : '草稿已保存。')) {
      setDraftId(complete ? null : id);
      if (complete) setTyped('');
    }
  };

  const deliver = (destination) => {
    const photo = makePhoto(work, heading, paper);
    if (destination === 'download') {
      const link = document.createElement('a');
      link.href = photo;
      link.download = work.title + '.jpg';
      link.click();
      return;
    }
    const items = loadSpaceData(destination, []);
    const item = destination === 'diary'
      ? { id: createId('diary'), text: heading || work.title, photo, date: new Date().toISOString(), mood: '抄写作品' }
      : { id: createId('image'), type: 'image', photo, ...memoPosition(items, 'image') };
    const saved = saveSpaceData(destination, [item, ...items]);
    setMessage(saved ? (destination === 'diary' ? '已保存到日记。' : '已添加到 Memo。') : '保存失败，本地存储可能已满。');
  };

  return (
    <FeaturePanel title="打字机" kicker="Slow Writing" onClose={onClose}>
      <div className="stack-form">
        <select aria-label="抄写篇目" value={textId} onChange={(event) => { setTextId(event.target.value); setTyped(''); setDraftId(null); }}>
          {typewriterTexts.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
        </select>
        <div className="calligraphy-text copying-sheet" aria-label="抄写字模">
          {target.map((char, index) => <span key={index} className={characters[index] === undefined ? 'template-char' : characters[index] === char ? '' : 'incorrect-char'}>{characters[index] ?? char}</span>)}
        </div>
        <input aria-label="抄写输入" value={typed} onChange={(event) => {
          if (event.nativeEvent.isComposing) { setTyped(event.target.value); return; }
          setTyped([...event.target.value].slice(0, target.length).join(''));
        }} onCompositionEnd={(event) => setTyped([...event.currentTarget.value].slice(0, target.length).join(''))}
          onPaste={(event) => event.preventDefault()} onDrop={(event) => event.preventDefault()}
          autoComplete="off" placeholder="输入原文，可用中文输入法连续输入" />
        <p className="card-meta">进度 {Math.min(characters.length, target.length)}/{target.length}</p>
        <button type="button" disabled={!typed} onClick={save}>{complete ? '保存完成作品' : '保存草稿'}</button>
        <p role="status">{message}</p>
      </div>
      {[false, true].map((finished) => (
        <section className="admin-list" key={String(finished)}>
          <h3>{finished ? '已完成作品库' : '未完成作品库'}</h3>
          {works.filter((item) => (item.complete !== false) === finished).map((item) => (
            <article className="admin-card" key={item.id}>
              <div><p>{item.title} · {new Date(item.createdAt).toLocaleDateString('zh-CN')}</p><p className="calligraphy-text">{item.text}</p></div>
              <div className="card-actions">
                <button type="button" onClick={() => {
                  if (finished) { setWork(item); setHeading(item.title); setMessage(''); }
                  else { setTextId(item.textId); setDraftId(item.id); setTyped(item.text); }
                }}>{finished ? '制作图片' : '继续抄写'}</button>
                <button type="button" onClick={() => {
                  if (!persist(works.filter((entry) => entry.id !== item.id), '作品已删除。')) return;
                  if (work?.id === item.id) setWork(null);
                  if (draftId === item.id) setDraftId(null);
                }}>删除</button>
              </div>
            </article>
          ))}
        </section>
      ))}
      {work && <section className="stack-form">
        <h3>作品制作</h3>
        <label>图片标题 <input value={heading} onChange={(event) => setHeading(event.target.value)} /></label>
        <label>纸色 <select value={paper} onChange={(event) => setPaper(event.target.value)}><option value="#f6e8ca">米黄</option><option value="#fbf8ef">暖白</option></select></label>
        <img className="preview-image" src={makePhoto(work, heading, paper)} alt="作品图片预览" />
        <div className="card-actions">
          <button type="button" onClick={() => deliver('download')}>下载 JPG</button>
          <button type="button" onClick={() => deliver('diary')}>保存到日记</button>
          <button type="button" onClick={() => deliver('memo')}>添加到 Memo</button>
          <button type="button" onClick={() => setWork(null)}>关闭预览</button>
        </div>
        <p role="status">{message}</p>
      </section>}
    </FeaturePanel>
  );
}
