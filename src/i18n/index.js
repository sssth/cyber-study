import { useSyncExternalStore } from 'react';
import chinese from '../../electron/i18n/zh-CN.json' with { type: 'json' };
import english from '../../electron/i18n/en.json' with { type: 'json' };

const languages = { 'zh-CN': chinese, en: english };
const storageKey = 'cyber-study-language';
const defaultLanguage = 'en';

function readLanguage() {
  try {
    const saved = globalThis.localStorage?.getItem(storageKey);
    if (Object.hasOwn(languages, saved)) return saved;
  } catch {
    // Storage may be unavailable in restricted browser sessions.
  }
  return defaultLanguage;
}

let language = readLanguage();
const listeners = new Set();

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getLanguage() {
  return language;
}

export function useLanguage() {
  return useSyncExternalStore(subscribe, getLanguage, () => defaultLanguage);
}

export function updateDocumentLanguage() {
  document.documentElement.lang = language;
  document.title = translate('i18n.appTitle');
  globalThis.cyberStudy?.setInterfaceLanguage?.(language);
}

export function setLanguage(next) {
  if (!Object.hasOwn(languages, next)) return;
  globalThis.localStorage.setItem(storageKey, next);
  if (language === next) return;
  language = next;
  updateDocumentLanguage();
  listeners.forEach(listener => listener());
}

export function translate(key, ...values) {
  const catalog = languages[language];
  const text = Object.hasOwn(catalog, key) ? catalog[key] : key;
  return values.length && typeof text === 'string'
    ? text.replace(/\{(\d+)\}/g, (placeholder, index) => values[index] ?? placeholder)
    : text;
}

export function formatDate(value, options) {
  return new Date(value).toLocaleDateString(language, options);
}

// The desktop bridge and older data helpers return readable Chinese diagnostics.
const messagesBySource = new Map(Object.entries(chinese).map(([key, source]) => [source, key]));
export function translateFixedText(source) {
  return translate(messagesBySource.get(source) ?? source);
}

const escapeRegExp = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const desktopErrorTemplates = [
  'i18n.providerConnection', 'i18n.providerRequestFailed',
  'i18n.thePdfConverterIsMissingRun', 'i18n.theAudioServerReturnedHttp',
  'i18n.theSpotifyPlaybackComponentReturnedAnError',
  'i18n.neteaseReturnedNoPlaybackLinkForThis'
].map(key => {
  const parts = chinese[key]?.split(/\{\d+\}/) ?? [];
  return [key, new RegExp('^' + parts.map(escapeRegExp).join('(.*?)') + '$')];
});

export function translateError(message) {
  if (!message || typeof message !== 'string') return message;
  const detail = message.replace(/^Error invoking remote method '[^']+': (?:Error: )?/, '');
  const key = messagesBySource.get(detail);
  if (key) return translate(key);
  if (language !== 'zh-CN') {
    for (const [template, pattern] of desktopErrorTemplates) {
      const match = detail.match(pattern);
      if (match) return translate(template, ...match.slice(1).map(translateError));
    }
  }
  return translate(detail);
}
