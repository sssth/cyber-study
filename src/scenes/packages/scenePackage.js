import sceneManifest from 'virtual:scene-manifest';

export const defaultPackage = {
  ...sceneManifest,
  assetUrl: file => `./${file.split('/').map(encodeURIComponent).join('/')}`,
  models: sceneManifest.models.map((model) => ({
    ...model,
    modelUrl: `./${model.file.split('/').map(encodeURIComponent).join('/')}`
  }))
};
