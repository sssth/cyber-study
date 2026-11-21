import { translate, translateError } from '../i18n/index.js';
import { useState, useRef, useEffect } from 'react';
import { FeaturePanel } from './ui.jsx';
import {snapshotPrompt} from '../data/snapshotPrompt.js';
import './crystalChat.css';
import { replyPlayback } from './replyPlayback.js';
import { defaultChatKeys, matchesShortcut } from '../data/shortcuts.js';

export default function CrystalChat({ open, onClose, shortcuts = defaultChatKeys }) {
  const [settings, setSettings] = useState(null);
  const [messages, setMessages] = useState([]);
  const [partial, setPartial] = useState('');
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [settingsError, setSettingsError] = useState('');
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
      catch {if(active && version===revision)setLibraryStatus("i18n.couldNotReadTheSnapshotsFolder");}
    };
    refresh();window.addEventListener('focus',refresh);window.addEventListener('snapshots-changed',refresh);
    return ()=>{active=false;window.removeEventListener('focus',refresh);window.removeEventListener('snapshots-changed',refresh);};
  },[open,library]);
  function attach(name){if(files.includes(name))setAttachments(items=>items.includes(name)?items:[...items,name]);}
  const log = useRef(null);
  const ai = window.cyberStudy?.ai;
  const settingsRevision = useRef(0);
  const current = settings?.current;
  const provider = settings?.providers.find(p => p.id === current?.provider);
  const canSend = !busy && provider?.hasApiKey && Boolean(draft.trim());
  useEffect(() => {
    if (!open) return;
    if (!ai) {
      setSettingsError("i18n.openTheDesktopAppToStartA");
      return;
    }
    async function refreshSettings() {
      const revision = ++settingsRevision.current;
      try {
        const value = await ai.getSettings();
        if (revision !== settingsRevision.current) return;
        setSettings(value);
        setSettingsError('');
      } catch {
        if (revision !== settingsRevision.current) return;
        setSettings(null);
        setSettingsError("i18n.couldNotReadAiSettingsJsonCheck");
      }
    }
    refreshSettings();
    window.addEventListener('focus', refreshSettings);
    return () => {
      settingsRevision.current++;
      window.removeEventListener('focus', refreshSettings);
    };
  }, [open, ai]);
  useEffect(() => {
    if (log.current) log.current.scrollTop = log.current.scrollHeight;
  }, [messages, partial, busy, open]);

  async function choose(value) {
    const [provider, model] = JSON.parse(value);
    setBusy(true);
    setError('');
    try {
      const value = await ai.selectModel({ provider, model });
      settingsRevision.current++;
      setSettings(value);
      setSettingsError('');
    }
    catch { setError("i18n.couldNotSaveTheSelectedModelCheck"); }
    finally { setBusy(false); }
  }

  async function send(event) {
    event.preventDefault();
    if (!canSend) return;
    setBusy(true);
    setError('');
    setAttachments([]);
    setDraft('');
    const playback = replyPlayback(setPartial);
    try {
      const documents=await Promise.all(attachments.map(async name=>({name,text:await library.read(name)})));
      const content=snapshotPrompt(draft.trim(),documents);
      const next=[...messages,{ role: 'user', content, text: draft.trim(), attachments }];
      setMessages(next);
      const reply = await ai.streamCurrent({ messages: next.map(({role,content})=>({role,content})) }, playback.append);
      await playback.finish(reply.content);
      setMessages([...next, reply]);
    } catch (err) {
      setMessages(messages);
      setDraft(draft);
      setAttachments(items => [...new Set([...attachments, ...items])]);
      setError(err.message);
    } finally { playback.stop(); setPartial(''); setBusy(false); }
  }

  async function revealSettings() {
    setError('');
    try { await ai.revealSettingsFile(); }
    catch { setError("i18n.couldNotShowAiSettingsFile"); }
  }

  function composerKeyDown(event) {
    if (event.nativeEvent.isComposing || event.keyCode === 229) return;
    const field = event.currentTarget;
    if (matchesShortcut(event, shortcuts.sendMessage)) {
      event.preventDefault();
      if (!event.repeat) field.form.requestSubmit();
    } else if (matchesShortcut(event, shortcuts.insertNewline)) {
      if (event.key === 'Enter' && !event.ctrlKey && !event.altKey && !event.metaKey) return;
      event.preventDefault();
      if (field.readOnly) return;
      field.setRangeText('\n', field.selectionStart, field.selectionEnd, 'end');
      setDraft(field.value);
    } else if (event.key === 'Enter') {
      event.preventDefault();
    }
  }

  if (!open) return null;
  const setupMessage = settingsError || (provider && !provider.hasApiKey
    ? translate("i18n.providerApiKey", provider.name) : '');
  return <FeaturePanel scopeId="crystal" title="i18n.aiChat" onClose={onClose}>
    <div className="crystal-layout">
      <aside className="crystal-library" aria-label={translate("i18n.snapshotFiles")}>
        {translate(libraryStatus)}
        {files.map(name=><button key={name} type="button" draggable onDragStart={event=>{event.dataTransfer.setData(dragType,name);event.dataTransfer.effectAllowed='copy';}} onClick={()=>attach(name)}>{name}</button>)}
      </aside>
    <div className="crystal-chat" onDragOver={event=>{if(event.dataTransfer.types.includes(dragType)){event.preventDefault();event.dataTransfer.dropEffect='copy';}}} onDrop={event=>{if(event.dataTransfer.types.includes(dragType)){event.preventDefault();attach(event.dataTransfer.getData(dragType));}}}>
        <div className="crystal-tools">
          <button type="button" disabled={busy || !messages.length} onClick={() => { setMessages([]); setError(''); }}>{translate("i18n.clearChat")}</button>
        </div>
      <div className="crystal-log" role="log" aria-label={translate("i18n.chatHistory")} ref={log}>
        {messages.map((m, i) => <p key={i} data-role={m.role} aria-label={m.role === 'user' ? translate("i18n.you") : 'AI'}>{m.text === undefined ? m.content : [m.text, ...m.attachments.map(name => translate("i18n.attachedSnapshot", name))].join("\n")}</p>)}
        {partial ? <p data-role="assistant" aria-label="AI">{partial}</p> : busy && messages.at(-1)?.role === 'user' && <small>{translate("i18n.replying")}</small>}
      </div>
      <form onSubmit={send}>
        {attachments.length>0 && <div className="crystal-attachments">{attachments.map(name=><button type="button" key={name} aria-label={translate("i18n.removeAttachment", name)} onClick={()=>setAttachments(items=>items.filter(item=>item!==name))}>{name} ×</button>)}</div>}
        {setupMessage && <div className="crystal-setup">
          <small id="crystal-setup-message" role="status">{translate(setupMessage)}</small>
          {ai?.revealSettingsFile && <button type="button" onClick={revealSettings}>{translate("i18n.showAiSettingsFile")}</button>}
        </div>}
        {error && <small role="status">{translateError(error)}</small>}
        <div className="crystal-composer">
        <select aria-label={translate("i18n.chatModel")} disabled={busy || !settings} value={current ? JSON.stringify([current.provider, current.model]) : ''} onChange={e => choose(e.target.value)}>
          {!current && <option value="">{translate("i18n.chooseAModel")}</option>}
          {settings?.providers.map(p => <optgroup key={p.id} label={p.name}>{p.models.map(model =>
            <option key={model} value={JSON.stringify([p.id, model])}>{model}</option>)}</optgroup>)}
        </select>
          <textarea rows="1" aria-label={translate("i18n.message")} placeholder={translate("i18n.typeAMessage")} value={draft} readOnly={busy} onChange={e => setDraft(e.target.value)}
          onKeyDown={composerKeyDown} />
          <button disabled={!canSend} aria-describedby={setupMessage ? "crystal-setup-message" : undefined}>{translate("i18n.send")}</button></div>
      </form>
    </div></div>
  </FeaturePanel>;
}
