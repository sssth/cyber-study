import Furniture3DLayer from './three/Furniture3DLayer.jsx';
import { dispatchSceneFeature, resolveSceneFeature } from './featureBindings.js';
import { defaultPackage } from './packages/scenePackage.js';

export const hasOutdoorRain = Boolean(defaultPackage.outdoorRain);

const scene = {
  ...defaultPackage,
  models: defaultPackage.models.map((model) => {
    const feature = resolveSceneFeature(model);
    return { ...model, feature: feature === 'window' && !hasOutdoorRain ? null : feature };
  })
};

export default function StudyScene(props) {
  return (
    <div className="study-scene">
      <Furniture3DLayer
        scene={scene}
        liveGraphics={props.liveGraphics} onLiveGraphics={props.onLiveGraphics}
        quality={props.quality} graphicsTest={props.graphicsTest} onGraphicsResult={props.onGraphicsResult}
        shortcuts={props.shortcuts}
        lightsOn={props.lightsOn}
        rainOn={props.rainOn}
        onTheme={props.onTheme}
        inputActive={props.inputActive}
        onSceneSettled={props.onSceneSettled}
        onCare={props.onCare}
        onFeature={(id, model) => dispatchSceneFeature(id, props, model)}
      />
    </div>
  );
}
