const catalogs = { 'zh-CN': require('./zh-CN.json'), en: require('./en.json') };
const windowLanguages = new WeakMap();

function setWindowLanguage(webContents, language) {
  if (Object.hasOwn(catalogs, language)) windowLanguages.set(webContents, language);
}

function nativeText(webContents, key, ...values) {
  const language = windowLanguages.get(webContents) ?? 'en';
  const template = catalogs[language][key] ?? key;
  return template.replace(/\{(\d+)\}/g, (placeholder, index) => values[index] ?? placeholder);
}

module.exports = { setWindowLanguage, nativeText };
