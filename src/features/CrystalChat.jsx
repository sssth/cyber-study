import { useState, useRef, useEffect } from 'react';
import { FeaturePanel } from './ui.jsx';
import {snapshotPrompt} from '../data/snapshotPrompt.js';
import './crystalChat.css';
import { replyPlayback } from './replyPlayback.js';

export default function CrystalChat({ open, onClose }) {
  const [settings, setSettings] = useState(null);
  const [messages, setMessages] = useState([]);
  const [partial, setPartial] = useState('');
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [files,setFiles]=useState([]),[attachments,setAttachments]=useState([]);
  const [libraryStatus,setLibraryStatus]=useState('');
  const library=window.cyberStudy?.snapshots;
  const dragType='application/x-study-snapshot';
  useEffect(()=>{
    if(!open || !library) return;
    let active=true,revision=0;
    const refresh=async()=>{
      const version=++revision;
      try {const names=await library.list();if(active && version===revision){setFiles(names);setLibraryStatus('');}}
      catch {if(active && version===revision)setLibraryStatus('无法读取快照文件夹');}
    };
    refresh();window.addEventListener('focus',refresh);window.addEventListener('snapshots-changed',refresh);
    return ()=>{active=false;window.removeEventListener('focus',refresh);window.removeEventListener('snapshots-changed',refresh);};
  },[open,library]);
  function attach(name){if(files.includes(name))setAttachments(items=>items.includes(name)?items:[...items,name]);}
  const log = useRef(null);
  const ai = window.cyberStudy?.ai;
  useEffect(() => {
    if (!open) return;
    let active = true;
    if (ai) ai.getSettings().then(value => { if (active) setSettings(value); })
      .catch(() => { if (active) setError('无法读取 ai-settings.json，请检查文件格式。'); });
    else setError('请在书房桌面应用中打开对话。');
    return () => { active = false; };
  }, [open, ai]);
  useEffect(() => {
    if (log.current) log.current.scrollTop = log.current.scrollHeight;
  }, [messages, partial, busy, open]);

  async function choose(value) {
    const [provider, model] = JSON.parse(value);
    setBusy(true);
    setError('');
    try { setSettings(await ai.selectModel({ provider, model })); }
    catch { setError('模型选择保存失败，请检查配置文件。'); }
    finally { setBusy(false); }
  }

  async function send(event) {
    event.preventDefault();
    if (busy || !settings?.current || !draft.trim()) return;
    setBusy(true);
    setError('');
    setAttachments([]);
    setDraft('');
    const playback = replyPlayback(setPartial);
    try {
      const documents=await Promise.all(attachments.map(async name=>({name,text:await library.read(name)})));
      const content=snapshotPrompt(draft.trim(),documents);
      const next=[...messages,{role:'user',content,display:[draft.trim(),...attachments.map(name=>'引用快照：'+name)].join('\n')}];
      setMessages(next);
      const reply = await ai.streamCurrent({ messages: next.map(({role,content})=>({role,content})) }, playback.append);
      await playback.finish(reply.content);
      setMessages([...next, reply]);
    } catch (err) {
      setMessages(messages);
      setDraft(draft);
      setAttachments(items => [...new Set([...attachments, ...items])]);
      setError(err.message.replace(/^.*?Error: /, ''));
    } finally { playback.stop(); setPartial(''); setBusy(false); }
  }

  if (!open) return null;
  const current = settings?.current;
  const provider = settings?.providers.find(p => p.id === current?.provider);
  return <FeaturePanel title="水晶对话" onClose={onClose}>
    <div className="crystal-layout">
      <aside className="crystal-library" aria-label="快照文件列表">
        {libraryStatus}
        {files.map(name=><button key={name} type="button" draggable onDragStart={event=>{event.dataTransfer.setData(dragType,name);event.dataTransfer.effectAllowed='copy';}} onClick={()=>attach(name)}>{name}</button>)}
      </aside>
    <div className="crystal-chat" onDragOver={event=>{if(event.dataTransfer.types.includes(dragType)){event.preventDefault();event.dataTransfer.dropEffect='copy';}}} onDrop={event=>{if(event.dataTransfer.types.includes(dragType)){event.preventDefault();attach(event.dataTransfer.getData(dragType));}}}>
        <div className="crystal-tools">
          <button type="button" disabled={busy || !messages.length} onClick={() => { setMessages([]); setError(''); }}>清空对话</button>
        </div>
      <div className="crystal-log" role="log" aria-label="聊天记录" ref={log}>
        {messages.map((m, i) => <p key={i} data-role={m.role} aria-label={m.role === 'user' ? '你' : 'AI'}>{m.display ?? m.content}</p>)}
        {partial ? <p data-role="assistant" aria-label="AI">{partial}</p> : busy && messages.at(-1)?.role === 'user' && <small>正在回复…</small>}
      </div>
      <form onSubmit={send}>
        {attachments.length>0 && <div className="crystal-attachments">{attachments.map(name=><button type="button" key={name} aria-label={'移除 '+name} onClick={()=>setAttachments(items=>items.filter(item=>item!==name))}>{name} ×</button>)}</div>}
        {(error || (provider && !provider.hasApiKey)) && <small role="status">{error || '请在 ai-settings.json 中填写 ' + provider.name + ' 的 API Key。'}</small>}
        <div className="crystal-composer">
        <select aria-label="对话模型" disabled={busy || !settings} value={current ? JSON.stringify([current.provider, current.model]) : ''} onChange={e => choose(e.target.value)}>
          {!current && <option value="">选择模型</option>}
          {settings?.providers.map(p => <optgroup key={p.id} label={p.name}>{p.models.map(model =>
            <option key={model} value={JSON.stringify([p.id, model])}>{model}</option>)}</optgroup>)}
        </select>
          <textarea rows="1" aria-label="消息" placeholder="输入消息…" value={draft} readOnly={busy} onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && e.keyCode !== 229) { e.preventDefault(); e.currentTarget.form.requestSubmit(); } }} />
          <button disabled={busy || !draft.trim() || !current}>发送</button></div>
      </form>
    </div></div>
  </FeaturePanel>;
}
