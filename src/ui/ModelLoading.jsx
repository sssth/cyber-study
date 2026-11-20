import { translate } from '../i18n/index.js';
export default function ModelLoading() {
  return <div className="model-loading-indicator" role="status" aria-label={translate("i18n.loadingModel")}><span aria-hidden="true" /><small>{translate("i18n.loading")}</small></div>;
}
