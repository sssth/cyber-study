import React, { Suspense, useEffect, useMemo, useRef } from 'react';
import { Box3, MathUtils, Vector3 } from 'three';
import { useGLTF, useAnimations } from '@react-three/drei';
import CatPlaceholder3D from './CatPlaceholder3D.jsx';
import { pet3dConfig, defaultPetState } from './modelConfig.js';

class ModelFallbackBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error) {
    console.warn('宠物模型加载失败，已回退到占位模型。', error);
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function AnimatedPetGltf({ model, petState }) {
  const group = useRef();
  const { scene, animations } = useGLTF(model.modelUrl);
  const { actions, names } = useAnimations(animations, group);

  // 只读取包围盒并调整摆放比例/居中，不改模型材质。
  const modelTransform = useMemo(() => {
    scene.updateMatrixWorld(true);
    const box = new Box3().setFromObject(scene);
    const size = box.getSize(new Vector3());
    const center = box.getCenter(new Vector3());
    const scale = pet3dConfig.targetHeight / Math.max(size.y, 0.001);

    return {
      scale,
      position: [
        -center.x * scale,
        -center.y * scale,
        -center.z * scale
      ]
    };
  }, [scene]);

  useEffect(() => {
    if (!names.length) return;
    const preferred =
      (petState.state === 'happy' && names.find((name) => /happy|pet/i.test(name))) ||
      (petState.state === 'sleep' && names.find((name) => /sleep|nap/i.test(name))) ||
      names.find((name) => /idle|breathe/i.test(name)) ||
      names[0];

    Object.entries(actions).forEach(([name, action]) => {
      if (name === preferred) {
        action.reset().fadeIn(0.25).play();
        action.clampWhenFinished = false;
      } else {
        action.fadeOut(0.25);
      }
    });

    return () => actions[preferred]?.fadeOut(0.25);
  }, [actions, names, petState.state]);

  const orientationRadians = (model.orientationDegrees ?? [0, 0, 0]).map(
    (degrees) => MathUtils.degToRad(degrees)
  );

  return (
    <group
      ref={group}
      position={pet3dConfig.displayOffset}
      rotation={orientationRadians}
    >
      <group scale={modelTransform.scale} position={modelTransform.position}>
        <primitive object={scene} />
      </group>
    </group>
  );
}

function PetModel({ model, petState = defaultPetState }) {
  return (
    <ModelFallbackBoundary key={model.id} fallback={<CatPlaceholder3D mood={petState.mood} />}>
      <Suspense fallback={<CatPlaceholder3D mood={petState.mood} />}>
        <AnimatedPetGltf model={model} petState={petState} />
      </Suspense>
    </ModelFallbackBoundary>
  );
}

export default PetModel;
