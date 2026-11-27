import { useState } from 'react';
import { translate as t } from '../i18n/index.js';
import { entityTags, saveEntityTags } from './tags.js';

export default function EntityTagsField({ type, item }) {
  const [failed,setFailed] = useState(false);
  if (!item?.id) return null;
  return <label className="entity-tags-field">{t('i18n.tags')}<input key={type + ':' + item.id} type="text"
    placeholder={t('i18n.entityTagSeparator')} defaultValue={entityTags(type,item).join('，')}
    onChange={event => {
      setFailed(!saveEntityTags(type,item.id,event.target.value));
    }} onBlur={() => window.dispatchEvent(new Event('cyber-entity-tags-changed'))}/>
    {failed && <small role="alert">{t('i18n.couldNotSaveLocalStorageMayBe')}</small>}
  </label>;
}
