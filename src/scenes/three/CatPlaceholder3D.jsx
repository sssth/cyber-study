import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';

// 没放正式 pet-cat.glb 时显示的低多边形占位猫。
// 这是为了先验证 3D 层位置、灯光、交互和打包链路。
function CatPlaceholder3D({ mood = 45 }) {
  const body = useRef();
  const tail = useRef();
  const happy = mood / 100;

  useFrame((state) => {
    const clock = state.clock.getElapsedTime();
    if (body.current) {
      body.current.position.y = -0.02 + Math.sin(clock * 1.5) * 0.012;
    }
    if (tail.current) {
      tail.current.rotation.y = Math.sin(clock * (1 + happy * 2)) * (0.2 + happy * 0.45);
    }
  });

  return (
    <group>
      <group ref={body}>
        <mesh castShadow position={[0, 0, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <capsuleGeometry args={[0.16, 0.3, 8, 16]} />
          <meshStandardMaterial color="#173b51" roughness={0.55} metalness={0.1} />
        </mesh>
        <mesh castShadow position={[-0.23, 0.09, 0]}>
          <sphereGeometry args={[0.12, 24, 24]} />
          <meshStandardMaterial color="#1b4560" roughness={0.5} metalness={0.1} />
        </mesh>
        <mesh position={[-0.29, 0.18, 0.05]} rotation={[0.3, 0, 0.3]}>
          <coneGeometry args={[0.04, 0.08, 4]} />
          <meshStandardMaterial color="#79f8ff" emissive="#00f0ff" emissiveIntensity={0.4} />
        </mesh>
        <mesh position={[-0.29, 0.18, -0.05]} rotation={[-0.3, 0, 0.3]}>
          <coneGeometry args={[0.04, 0.08, 4]} />
          <meshStandardMaterial color="#79f8ff" emissive="#00f0ff" emissiveIntensity={0.4} />
        </mesh>
        <group ref={tail} position={[0.24, 0, 0]}>
          <mesh rotation={[0, 0, Math.PI / 2]} position={[0.08, 0.02, 0]}>
            <capsuleGeometry args={[0.024, 0.16, 4, 12]} />
            <meshStandardMaterial color="#79f8ff" emissive="#00f0ff" emissiveIntensity={0.7} />
          </mesh>
        </group>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.15, 0]}>
          <circleGeometry args={[0.3, 32]} />
          <meshBasicMaterial color="#00f0ff" transparent opacity={0.08} />
        </mesh>
      </group>
    </group>
  );
}

export default CatPlaceholder3D;
