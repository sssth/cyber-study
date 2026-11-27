import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { translate, useLanguage } from '../i18n/index.js';
import manuscript from '../../使用建议.md?raw';
import { parseUsageTips, usageTipAt } from './usageTips.js';

const prefix = 'cyber-study.usage-tips.';
function read(key) {
  try { return localStorage.getItem(prefix + key); } catch { return null; }
}
function write(key, value) {
  try { localStorage.setItem(prefix + key, String(value)); } catch { /* Keep session state. */ }
}

const tracked = '[data-tip-page], dialog, .edit-sidebar';
function frontPage(roomPage) {
  const modal = [...document.querySelectorAll('dialog:modal')].at(-1);
  const host = modal || document.fullscreenElement || document.body;
  if (host.querySelector('.edit-sidebar[open], .edit-sidebar:not(dialog)')) return {};
  const surface = modal || [...host.querySelectorAll('[data-tip-page]')].findLast(node =>
    !node.closest('[inert], [hidden]') && node.checkVisibility()) || host;
  if (!modal && surface.dataset.immersiveTools === 'hidden') return {};
  return { page: surface.dataset.tipPage || (!modal && roomPage), host };
}

export default function UsageTips({ enabled, paused, roomPage }) {
  const language = useLanguage();
  const [pages, setPages] = useState(null);
  const [surface, setSurface] = useState({});
  const [expanded, setExpanded] = useState(() => read('expanded') !== 'false');
  const [step, setStep] = useState(0);
  const lastPage = useRef(null);
  const progress = useRef(new Map());
  useEffect(() => {
    let active = true;
    const load = window.cyberStudy?.readUsageTips;
    Promise.resolve(load ? load() : manuscript).catch(() => manuscript).then(text => {
      if (active) setPages(parseUsageTips(text));
    });
    return () => { active = false; };
  }, []);

  useLayoutEffect(() => {
    if (!enabled || paused) return;
    const sync = () => {
      const next = frontPage(roomPage);
      setSurface(old => old.page === next.page && old.host === next.host ? old : next);
    };
    const observer = new MutationObserver(records => {
      if (records.some(record => record.type === 'attributes' ||
        [...record.addedNodes, ...record.removedNodes].some(node =>
          node.nodeType === 1 && (node.matches(tracked) || node.querySelector(tracked))))) sync();
    });
    observer.observe(document.body, { subtree: true, childList: true, attributes: true,
      attributeFilter: ['data-tip-page', 'data-immersive-tools', 'open', 'hidden', 'inert'] });
    document.addEventListener('fullscreenchange', sync);
    sync();
    return () => { observer.disconnect(); document.removeEventListener('fullscreenchange', sync); };
  }, [enabled, paused, roomPage]);

  const { page, host } = surface;
  function remember(key, value) {
    progress.current.set(key, value);
    write('page.' + key, value);
    setStep(value);
  }
  useLayoutEffect(() => {
    if (!expanded || !enabled || paused || !pages || !page || lastPage.current === page) return;
    lastPage.current = page;
    if (!usageTipAt(pages, page, 0)) return;
    const saved = progress.current.get(page) ?? Number(read('page.' + page) ?? -1);
    remember(page, Number.isSafeInteger(saved) && saved >= 0 ? saved + 1 : 0);
  }, [enabled, expanded, paused, page, pages]);

  const tip = pages && usageTipAt(pages, page, step);
  if (!enabled || paused || !tip || !host) return null;
  const canFlip = pages.get(page).length + (pages.get('global')?.length || 0) > 1;
  const toggleLabel = translate(expanded ? 'i18n.collapseUsageTips' : 'i18n.expandUsageTips');
  return createPortal(<aside className="usage-tip" data-expanded={expanded} aria-label={translate('i18n.usageTips')}>
    <header>
      {expanded && <strong>{translate('i18n.usageTips')}</strong>}
      {expanded && canFlip && <button type="button" className="usage-tip-next"
        onClick={() => remember(page, step + 1)}>{translate('i18n.nextTip')}</button>}
      <button type="button" className="usage-tip-toggle" aria-expanded={expanded} aria-label={toggleLabel}
        title={toggleLabel} onClick={() => {
          setExpanded(!expanded);
          write('expanded', !expanded);
        }}>{expanded ? '›' : '‹'}</button>
    </header>
    {expanded && <p aria-live="polite">{tip[language]}</p>}
  </aside>, host);
}
