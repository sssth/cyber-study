const vector = value => Array.isArray(value) && value.length === 3 && value.every(Number.isFinite);
const number = (value, min, max) => Number.isFinite(value) && value >= min && value <= max;
const color = value => typeof value === 'string' && /^#[\da-f]{6}$/i.test(value);
const id = value => typeof value === 'string' && /^[a-z\d][a-z\d-]*$/i.test(value);
const label = value => typeof value === 'string' && Boolean(value.trim());
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const bounds = value => vector(value?.min) && vector(value?.max) && value.max.every((x, i) => x > value.min[i]);
const pair = (value, min, max) => Array.isArray(value) && value.length === 2 && value.every(x => number(x, min, max));
const localFile = value => typeof value === 'string' && !/[:\\?#]/.test(value)
  && value.split('/').every(part => part && part !== '.' && part !== '..');
export const isSceneTexture = file => /\.(png|jpe?g|webp)$/i.test(file);
const isSceneAudio = file => /\.(mp3|ogg|wav|m4a|flac)$/i.test(file);

export const materialFields = ['roughness', 'metalness', 'emissiveIntensity', 'envMapIntensity', 'clearcoat', 'clearcoatRoughness'];

export function sceneAssets(scene) {
  const paths = new Set(scene.models.flatMap(model => [model.file, ...(model.previewFile ? [model.previewFile] : []), ...Object.values(model.qualityFiles ?? {})]));
  for (const model of scene.models) for (const level of model.lod?.levels ?? []) paths.add(level.file);
  for (const file of scene.assetDependencies ?? []) paths.add(file);
  for (const file of Object.values(scene.careSounds ?? {})) paths.add(file);
  for (const theme of Object.values(scene.appearance?.themes ?? {})) {
    if (theme.panorama?.file) paths.add(theme.panorama.file);
    for (const file of Object.values(theme.panorama?.regions ?? {})) paths.add(file);
    if (theme.panorama?.front) paths.add(theme.panorama.front.file);
    if (theme.panorama?.skyRepair) paths.add(theme.panorama.skyRepair);
    if (theme.panorama?.original) paths.add(theme.panorama.original);
    if (theme.audioLoop) paths.add(theme.audioLoop.file);
    if (theme.glows) paths.add(theme.glows.file);
    for (const material of Object.values(theme.materials ?? {})) {
      if (material.texture) paths.add(material.texture.file);
    }
  }
  return paths;
}

export function validatePresentation(data, modelIds) {
  const require = (condition, field) => { if (!condition) throw Error(`场景包的 ${field} 配置无效。`); };
  if (data.assetDependencies !== undefined) require(Array.isArray(data.assetDependencies) && data.assetDependencies.every(file => localFile(file) && /\.bin$/i.test(file)), 'assetDependencies');
  if (data.careSounds !== undefined) {
    require(object(data.careSounds) && Object.entries(data.careSounds).every(([key, file]) =>
      ['cat', 'plant'].includes(key) && localFile(file) && isSceneAudio(file)), 'careSounds');
  }
  if (data.camera.far !== undefined) require(number(data.camera.far, 10, 2000), 'camera.far');
  if (data.views !== undefined) {
    require(Array.isArray(data.views) && data.views.length >= 1 && data.views.length <= 9, 'views');
    const viewIds = new Set();
    for (const view of data.views) {
      require(id(view?.id) && !viewIds.has(view.id) && label(view.label) && vector(view.position)
        && vector(view.target) && view.target.some((x, i) => x !== view.position[i]) && number(view.fov, 30, 100), 'views');
      viewIds.add(view.id);
    }
  }
  if (data.hotspots !== undefined) {
    require(Array.isArray(data.hotspots) && data.hotspots.length <= 100, 'hotspots');
    const hotspotIds = new Set();
    for (const spot of data.hotspots) {
      require(id(spot?.id) && !hotspotIds.has(spot.id) && label(spot.label) && vector(spot.position)
        && id(spot.feature) && (spot.view === undefined || data.views?.some(view => view.id === spot.view)), 'hotspots');
      hotspotIds.add(spot.id);
    }
  }
  if (data.roam !== undefined) {
    const roam = data.roam;
    require(bounds(roam) && number(roam.speed, 0.1, 20) && number(roam.eyeHeight, roam.min[1], roam.max[1])
      && number(roam.transition, 0, 10), 'roam');
  }
  const rain = data.outdoorRain;
  if (rain) {
    if (rain.regions !== undefined) require(Array.isArray(rain.regions) && rain.regions.length > 0 && rain.regions.every(bounds), 'outdoorRain.regions');
    if (rain.count !== undefined) require(Number.isInteger(rain.count) && number(rain.count, 1, 10000), 'outdoorRain.count');
    if (rain.length !== undefined) require(pair(rain.length, 0.01, 10) && rain.length[1] >= rain.length[0], 'outdoorRain.length');
    if (rain.speed !== undefined) require(number(rain.speed, 0.1, 100), 'outdoorRain.speed');
    if (rain.opacity !== undefined) require(number(rain.opacity, 0, 1), 'outdoorRain.opacity');
    if (rain.color !== undefined) require(color(rain.color), 'outdoorRain.color');
  }
  const appearance = data.appearance;
  if (appearance === undefined) return;
  require(object(appearance) && object(appearance.themes), 'appearance.themes');
  const { themes, defaultTheme, nightTheme } = appearance;
  require(id(defaultTheme) && Object.hasOwn(themes, defaultTheme), 'appearance.defaultTheme');
  if (nightTheme !== undefined) require(id(nightTheme) && Object.hasOwn(themes, nightTheme) && nightTheme !== defaultTheme, 'appearance.nightTheme');
  for (const [name, theme] of Object.entries(themes)) {
    const path = `appearance.themes.${name}`;
    require(id(name) && object(theme) && label(theme.label) && color(theme.background)
      && color(theme.fog) && number(theme.fogDensity, 0, 1) && number(theme.exposure, 0.05, 10), path);
    if (theme.panorama !== undefined) {
      const panorama = theme.panorama;
      if (panorama?.regions !== undefined) {
        require(object(panorama.regions) && ['front', 'right', 'back', 'left', 'up', 'down'].every(face =>
          localFile(panorama.regions[face]) && isSceneTexture(panorama.regions[face]))
          && Object.keys(panorama.regions).length === 6 && panorama.file === undefined
          && number(panorama.tanHalfFov, 1, 2) && number(panorama.aspect, 0.5, 2)
          && panorama.tanHalfFov / panorama.aspect >= 1 && object(panorama.front), `${path}.panorama.regions`);
      } else require(localFile(panorama?.file) && isSceneTexture(panorama.file), `${path}.panorama`);
    }
    if (theme.panorama?.original !== undefined) require(localFile(theme.panorama.original) && isSceneTexture(theme.panorama.original), `${path}.panorama.original`);
    if (theme.panorama?.skyRepair !== undefined) require(object(theme.panorama.regions) && localFile(theme.panorama.skyRepair) && isSceneTexture(theme.panorama.skyRepair), `${path}.panorama.skyRepair`);
    if (theme.panorama?.outpaint !== undefined) require(typeof theme.panorama.outpaint === 'boolean', `${path}.panorama.outpaint`);
    if (theme.panorama?.front !== undefined) {
      const front = theme.panorama.front;
      require(localFile(front.file) && isSceneTexture(front.file) && number(front.tanHalfFov, 0.1, 10) && number(front.aspect, 0.1, 10) && number(front.blend, 0.001, 0.25), `${path}.panorama.front`);
    }
    if (theme.hidden !== undefined) require(Array.isArray(theme.hidden) && theme.hidden.every(value => modelIds.has(value)), `${path}.hidden`);
    if (theme.rain !== undefined) require(typeof theme.rain === 'boolean', `${path}.rain`);
    if (theme.mix !== undefined) require(object(theme.mix) && Object.entries(theme.mix).every(([key,value]) =>
      ['rain','hum','city'].includes(key) && number(value, 0, 1)), `${path}.mix`);
    if (theme.glows !== undefined) {
      const glows = theme.glows;
      require(localFile(glows?.file) && isSceneTexture(glows.file) && Array.isArray(glows.sprites)
        && glows.sprites.length <= 100 && glows.sprites.every(sprite =>
          vector(sprite?.position) && pair(sprite.size, 0.01, 100) && color(sprite.color)
          && number(sprite.opacity, 0, 1)), `${path}.glows`);
    }
    if (theme.audioLoop !== undefined) require(localFile(theme.audioLoop?.file) && isSceneAudio(theme.audioLoop.file)
      && number(theme.audioLoop.gain, 0, 1), `${path}.audioLoop`);
    if (theme.dimWithRoomLights !== undefined) require(number(theme.dimWithRoomLights, 0, 1), `${path}.dimWithRoomLights`);
    require(Array.isArray(theme.lights) && theme.lights.length <= 100, `${path}.lights`);
    for (const light of theme.lights) {
      require(['ambient','hemisphere','directional','point','spot'].includes(light?.type)
        && color(light.color) && number(light.intensity, 0, 10000) && vector(light.position)
        && (!['directional','spot'].includes(light.type) || vector(light.target))
        && (light.type !== 'hemisphere' || color(light.ground))
        && (light.distance === undefined || number(light.distance, 0, 2000))
        && (light.decay === undefined || number(light.decay, 0, 10))
        && (light.angle === undefined || number(light.angle, 0.01, Math.PI / 2))
        && (light.penumbra === undefined || number(light.penumbra, 0, 1)), `${path}.lights`);
      if (light.shadow !== undefined) {
        const s = light.shadow;
        require(['directional','spot','point'].includes(light.type) && s && [256,512,1024,2048,4096].includes(s.size)
          && number(s.near, 0.01, 2000) && number(s.far, s.near + 0.01, 2000)
          && number(s.bias, -1, 1) && number(s.normalBias, -1, 1)
          && (light.type !== 'directional' || (Array.isArray(s.bounds) && s.bounds.length === 4
            && s.bounds.every(Number.isFinite) && s.bounds[0] < s.bounds[1] && s.bounds[3] < s.bounds[2])), `${path}.lights.shadow`);
      }
    }
    if (theme.environment !== undefined) {
      const env = theme.environment;
      require(color(env?.background) && Array.isArray(env.panels) && env.panels.length <= 16 && env.panels.every(panel =>
        color(panel?.color) && number(panel.intensity, 0, 100) && pair(panel.size, 0.01, 1000)
        && vector(panel.position) && vector(panel.rotation)), `${path}.environment`);
    }
    if (theme.materials === undefined) continue;
    require(object(theme.materials), `${path}.materials`);
    for (const material of Object.values(theme.materials)) {
      require(object(material) && (material.color === undefined || color(material.color))
        && (material.toneMapped === undefined || typeof material.toneMapped === 'boolean')
        && (material.additive === undefined || typeof material.additive === 'boolean')
        && materialFields.every(field => material[field] === undefined || number(material[field], 0, 100))
        && (material.texture === undefined || (localFile(material.texture?.file) && isSceneTexture(material.texture.file)
          && pair(material.texture.repeat, 0.01, 1000))), `${path}.materials`);
    }
  }
}
