import { Suspense, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { useSceneGLTF } from './useSceneGLTF.js';
import { Box3, Sphere } from 'three';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { defaultPackage } from '../packages/scenePackage.js';
import { resolveSceneFeature } from '../featureBindings.js';
import { SceneTextures, useThemeMaterials } from './ScenePresentation.jsx';
import { LoadingBoundary } from '../../ui/LoadingScreen.jsx';

function PreviewObject({ model, theme }) {
  const { scene } = useSceneGLTF(model.modelUrl);
  const object = useMemo(() => {
    const copy = clone(scene);
    copy.rotation.fromArray(model.rotation ?? [0, 0, 0]);
    const sphere = new Box3().setFromObject(copy).getBoundingSphere(new Sphere());
    const scale = 1 / Math.max(sphere.radius, 0.001);
    copy.scale.multiplyScalar(scale);
    copy.position.sub(sphere.center).multiplyScalar(scale);
    return copy;
  }, [model, scene]);
  useThemeMaterials(object, theme);
  return <primitive object={object} />;
}

export default function CareModelPreview({ feature, model, theme, label }) {
  const item = model ?? defaultPackage.models.find(candidate => {
    const id = resolveSceneFeature(candidate);
    return id === feature || (feature === 'pet' && id === 'cat');
  });
  if (!item) return <p>此场景包没有配置{label}模型。</p>;

  return <div className="care-model-preview" aria-label={`${label}的 3D 模型，可拖动旋转`}>
    <LoadingBoundary message="3D 模型加载失败。">
      <Canvas camera={{ position: [2.5, 1.7, 3.6], fov: 38 }} dpr={[1, 1.5]} frameloop="demand">
        <ambientLight intensity={1.3} />
        <hemisphereLight args={['#ffffff', '#877264', 1.6]} />
        <directionalLight position={[3, 5, 4]} intensity={2} />
        <Suspense fallback={null}>
          <SceneTextures scene={defaultPackage} theme={theme} materialsOnly>
            <PreviewObject model={item} theme={theme} />
          </SceneTextures>
        </Suspense>
        <OrbitControls enablePan={false} minDistance={3.5} maxDistance={8} />
      </Canvas>
    </LoadingBoundary>
  </div>;
}
