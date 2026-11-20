import { useState } from 'react';
import { setLanguage, translate, useLanguage } from '../i18n/index.js';

export default function LanguageSelect() {
  const language = useLanguage();
  const [saveFailed, setSaveFailed] = useState(false);

  function selectLanguage(event) {
    try {
      setLanguage(event.target.value);
      setSaveFailed(false);
    } catch {
      setSaveFailed(true);
    }
  }

  return (
    <>
      <div className="language-setting">
        <label htmlFor="interface-language">{translate('i18n.interfaceLanguage')}</label>
        <select id="interface-language" value={language} onChange={selectLanguage}>
          <option value="zh-CN" lang="zh-CN">{translate('i18n.simplifiedChinese')}</option>
          <option value="en" lang="en">{translate('i18n.english')}</option>
        </select>
      </div>
      {saveFailed && <p role="alert">{translate('i18n.languageSaveFailed')}</p>}
    </>
  );
}
