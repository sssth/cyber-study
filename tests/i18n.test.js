import assert from 'node:assert/strict';
import test from 'node:test';
import chinese from '../electron/i18n/zh-CN.json' with { type: 'json' };
import english from '../electron/i18n/en.json' with { type: 'json' };
import native from '../electron/i18n/native.cjs';

test('Chinese and English provide the same messages and interpolation fields', () => {
  assert.deepEqual(Object.keys(english), Object.keys(chinese));
  const fields = value => [...value.matchAll(/\{\d+\}/g)].map(match => match[0]).sort();
  for (const [key, value] of Object.entries(chinese)) {
    assert.deepEqual(fields(english[key]), fields(value), key);
  }
});

test('language changes apply immediately and are restored on startup', async t => {
  const storage = new Map();
  const webContents = {};
  const globals = {
    localStorage: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value)
    },
    document: { documentElement: {} },
    cyberStudy: {
      setInterfaceLanguage: language => native.setWindowLanguage(webContents, language)
    }
  };
  for (const [key, value] of Object.entries(globals)) {
    const previous = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, value });
    t.after(() => {
      if (previous) Object.defineProperty(globalThis, key, previous);
      else delete globalThis[key];
    });
  }

  const messages = await import('../src/i18n/index.js');
  messages.updateDocumentLanguage();
  assert.equal(document.documentElement.lang, 'en');
  assert.equal(messages.translate('i18n.interfaceLanguage'), 'Language');
  assert.equal(native.nativeText(webContents, 'i18n.nativeBookFiles'), 'Book files');
  assert.equal(messages.translateError("Error invoking remote method 'ai:stream': Error: 模型回复中断，请重试。"),
    'The model reply was interrupted. Try again.');
  assert.equal(messages.translateError('无法连接到 Test Provider，请检查网络连接。'),
    'Could not connect to Test Provider. Check your internet connection.');

  messages.setLanguage('zh-CN');
  assert.equal(document.documentElement.lang, 'zh-CN');
  assert.equal(messages.translate('i18n.interfaceLanguage'), '语言');
  assert.equal(native.nativeText(webContents, 'i18n.nativeBookFiles'), '书籍文件');

  const reopened = await import('../src/i18n/index.js?reopened');
  assert.equal(reopened.translate('i18n.interfaceLanguage'), '语言');
  reopened.setLanguage('en');
  assert.equal(reopened.translate('i18n.openingPanel', '一篇文章'), 'Opening 一篇文章');
});
