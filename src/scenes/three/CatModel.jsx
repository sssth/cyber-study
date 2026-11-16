import React, { Suspense, useEffect, useMemo, useRef } from 'react';
import { Box3, Vector3 } from 'three';
import { useGLTF, useAnimations } from '@react-three/drei';
import CatPlaceholder3D from './CatPlaceholder3D.jsx';
import { cat3dConfig, defaultPetState } from './modelConfig.js';

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

function AnimatedCatGltf({ petState }) {
  const group = useRef();
  const { scene, animations } = useGLTF(cat3dConfig.modelUrl);
  const { actions, names } = useAnimations(animations, group);
  const modelTransform = useMemo(() => {
    // 只读取包围盒，不修改 GLTF 内部任何材质或节点。
    scene.updateMatrixWorld(true);
    const box = new Box3().setFromObject(scene);
    const size = box.getSize(new Vector3());
    const center = box.getCenter(new Vector3());
    const scale = cat3dConfig.targetHeight / Math.max(size.y, 0.001);

    return {
      scale,
      // 把模型自身包围盒中心移动到 3D 层中心。
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

  return (
    <group ref={group} position={cat3dConfig.displayOffset} rotation={[0, cat3dConfig.rotationY, 0]}>
      <group scale={modelTransform.scale} position={modelTransform.position}>
        <primitive object={scene} />
      </group>
    </group>
  );
}

function CatModel({ petState = defaultPetState }) {
  return (
    <ModelFallbackBoundary fallback={<CatPlaceholder3D mood={petState.mood} />}>
      <Suspense fallback={<CatPlaceholder3D mood={petState.mood} />}>
        <AnimatedCatGltf petState={petState} />
      </Suspense>
    </ModelFallbackBoundary>
  );
}

export default CatModel;
